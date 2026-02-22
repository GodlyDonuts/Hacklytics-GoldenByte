import os
import tempfile
import asyncio
from fastapi import APIRouter, Request, Query, HTTPException
from fastapi.responses import FileResponse
import httpx
from markdown_pdf import MarkdownPdf, Section

from services.cache import get_crises

router = APIRouter()

@router.get("/report")
async def generate_report(request: Request, scope: str = Query("global"), iso3: str = Query(None)):
    print(f"DEBUG: generate_report called with scope={scope}, iso3={iso3}")
    """
    Generates a 2-page PDF report using Gemini based on the current context scale.
    scope: "global" or "country"
    iso3: Country iso3 string (if scope == "country")
    """
    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    if not openrouter_key:
        raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY not configured")

    # Access cached Databricks data via the cache service instead of app.state
    funding_data = get_crises(year=2024)
    if not funding_data:
        raise HTTPException(status_code=500, detail="Data not available in cache")
    
    prompt = ""
    # Structure the prompt based on the scope
    if scope == "country" and iso3:
        iso3_target = iso3.strip().upper()
        # Find country specific info to feed to the LLM
        country_info = [
            f for f in funding_data 
            if (f.get("iso3") or f.get("location_code") or "").strip().upper() == iso3_target
        ]
        
        country_name = iso3
        if country_info:
            country_name = country_info[0].get("country_name") or country_info[0].get("location_name") or iso3
        else:
            print(f"DEBUG: No data found for ISO3: {iso3_target}")
        
        funding_usd = sum(float(f.get("funding_usd") or 0) for f in country_info)
        gap_usd = sum(float(f.get("funding_gap_usd") or sum([float(f.get("requirements_usd") or 0) for f in country_info]) - funding_usd) for f in country_info)
        req_usd = funding_usd + gap_usd
        pct = (funding_usd / req_usd * 100) if req_usd > 0 else 0
        
        prompt = f"""
Act as a senior geopolitical analyst. Write a concise but authoritative one-page intelligence report on the humanitarian crisis in {country_name}.

Context Data:
- Total Funding Requested: ${req_usd:,.2f}
- Total Funding Received: ${funding_usd:,.2f}
- Funding Coverage: {pct:.1f}%

Begin your response with a single `#` H1 title. Use professional markdown formatting (headers, bullet lists, bold text). Keep the total output under 600 words.

Structure:
1. Executive Summary (2-3 sentences)
2. Crisis Overview
3. Financial Analysis
4. Key Risk Factors
5. Recommendations

Tone: urgent, data-driven.
"""

    else:
        # Global scope
        # Let's just find the top 5 most underfunded countries to give context to Gemini
        grouped = {}
        for f in funding_data:
            iso = f.get("iso3") or f.get("location_code")
            name = f.get("country_name") or f.get("location_name")
            if not iso or not name: continue
            if iso not in grouped:
                grouped[iso] = {"name": name, "req": 0, "fund": 0, "gap": 0}
            
            fund = float(f.get("funding_usd") or 0)
            gap = float(f.get("funding_gap_usd") or (float(f.get("requirements_usd") or 0) - fund))
            
            grouped[iso]["fund"] += fund
            grouped[iso]["gap"] += gap
            grouped[iso]["req"] += fund + gap
        
        # Calculate gaps
        gaps = []
        for iso, stats in grouped.items():
            if stats["gap"] > 0:
                gaps.append({"name": stats["name"], "gap": stats["gap"]})
        
        top_gaps = sorted(gaps, key=lambda x: x["gap"], reverse=True)[:5]
        top_gaps_str = "\n".join([f"- {g['name']}: ${g['gap']:,.2f} shortfall" for g in top_gaps])

        prompt = f"""
Act as a senior geopolitical analyst. Write a concise but authoritative one-page global intelligence report on worldwide humanitarian funding imbalances.

Context Data (Top 5 Largest Funding Gaps):
{top_gaps_str}

Begin your response with a single `#` H1 title. Use professional markdown formatting (headers, bullet lists, bold text). Keep the total output under 600 words.

Structure:
1. Executive Global Summary (2-3 sentences)
2. Macro-level Funding Deficits
3. Regional Deep Dives (focus on the top 5 nations above)
4. Systemic Anomalies
5. Recommendations

Tone: urgent, data-driven.
"""

    # Call OpenRouter API
    async def fetch_llm():
        print(f"DEBUG: Calling OpenRouter with prompt snippet: {prompt[:100]}...")
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

    markdown_content = await fetch_llm()

    # markdown_pdf requires the document to start with a level-1 heading (#).
    # If Gemini skips straight to ## or prose, prepend a title.
    first_line = markdown_content.lstrip().split('\n')[0]
    if not first_line.startswith('# '):
        if scope == "country" and iso3:
            title = f"# Humanitarian Intelligence Report: {iso3}\n\n"
        else:
            title = "# Global Humanitarian Intelligence Report\n\n"
        markdown_content = title + markdown_content

    # Generate the PDF
    def generate_pdf(md_text):
        pdf = MarkdownPdf(toc_level=2)
        pdf.add_section(Section(md_text))
        
        # Create a temp file
        fd, temp_path = tempfile.mkstemp(suffix=".pdf")
        os.close(fd) # Close file descriptor, MarkdownPdf handles opening
        pdf.save(temp_path)
        return temp_path

    pdf_path = await asyncio.to_thread(generate_pdf, markdown_content)

    return FileResponse(
        path=pdf_path, 
        filename=f"Report_{scope.capitalize()}.pdf", 
        media_type="application/pdf",
        background=None  # We accept it living in temp until OS clears it for simplicity
    )
