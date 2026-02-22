"""Predictive Insights API — analyzes anomalies via Gemini and returns risks."""

import logging
import os
import asyncio

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx

from ..services.databricks_client import execute_sql

logger = logging.getLogger(__name__)
router = APIRouter()

class PredictiveRisk(BaseModel):
    iso3: str
    country_name: str
    risk_level: str
    risk_title: str
    risk_description: str
    confidence_score: float
    factors: list[str]

class PredictiveResponse(BaseModel):
    risks: list[PredictiveRisk]

@router.get("/predictive/risks", response_model=PredictiveResponse)
async def get_predictive_risks():
    """Fetch top anomalies from Actian VectorDB and let Gemini predict risks."""
    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    if not openrouter_key:
        raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY not configured")

    try:
        # Get projects with high anomaly/oversight scores
        anomalies = await execute_sql(
            """SELECT project_code, project_name, iso3, country_name, cluster, 
               requested_funds, b2b_ratio, anomaly_score
               FROM workspace.default.project_embeddings
               WHERE anomaly_score > 0.8
               ORDER BY anomaly_score DESC
               LIMIT 20"""
        )
    except RuntimeError as e:
        raise HTTPException(502, f"Databricks error: {e}") from e

    if not anomalies:
        return PredictiveResponse(risks=[])

    # Group anomalies by country to pass to Gemini
    country_anomalies = {}
    for r in anomalies:
        iso3 = r.get("iso3")
        if not iso3:
            continue
        if iso3 not in country_anomalies:
            country_anomalies[iso3] = {"country_name": r.get("country_name"), "projects": []}
        country_anomalies[iso3]["projects"].append(r)

    # Build prompt for Gemini
    context_str = ""
    for iso3, data in country_anomalies.items():
        context_str += f"\nCountry: {data['country_name']} ({iso3})\nAnomalous Projects:\n"
        for p in data["projects"][:3]:  # Top 3 anomalous projects per country
            context_str += f"- {p.get('project_name')} (Cluster: {p.get('cluster')}), Funds: ${p.get('requested_funds')}, B2B Ratio: {p.get('b2b_ratio')}, Anomaly Score: {p.get('anomaly_score')}\n"

    prompt = f"""
You are an expert predictive geopolitical AI. Analyze these highly anomalous humanitarian funding projects and predict future safety risks (e.g., mass migration, starvation, civil unrest) if these anomalies correspond to corruption or extreme desperation.

Context (Actian VectorDB Anomalies):
{context_str}

Output a strictly formatted JSON array of risks, one per country. 
The JSON must correspond to this schema:
[
  {{
    "iso3": "string",
    "country_name": "string",
    "risk_level": "High" or "Critical" or "Moderate",
    "risk_title": "string (Short title of the predicted risk)",
    "risk_description": "string (1-2 sentences explaining the risk based on the anomalies)",
    "confidence_score": "float (0.0 to 1.0)",
    "factors": ["string", "string"] (list of 2-3 contributing factors referencing the data)
  }}
]
DO NOT wrap the response in ```json ``` markdown. Output raw JSON only.
"""

    async def fetch_llm():
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {openrouter_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "qwen/qwen3.5-397b-a17b",
                    "messages": [{"role": "user", "content": prompt}]
                }
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]

    try:
        json_text = await fetch_llm()
        json_text = json_text.strip()
        if json_text.startswith("```json"):
            json_text = json_text[7:-3].strip()
        elif json_text.startswith("```"):
            json_text = json_text[3:-3].strip()
            
        import json
        risks_data = json.loads(json_text)
        
        risks = []
        for r in risks_data:
            risks.append(PredictiveRisk(**r))
            
        return PredictiveResponse(risks=risks)
        
    except Exception as e:
        logger.exception("Failed to generate predictive risks via Gemini")
        raise HTTPException(500, f"Predictive generation failed: {e}") from e
