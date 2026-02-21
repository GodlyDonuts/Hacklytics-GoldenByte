"""RAG-based question answering endpoint.

Uses Databricks Vector Search on project_embeddings to find relevant crisis context,
then queries the hosted LLM to generate an answer grounded in data.
"""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.databricks_client import query_llm, vector_search

logger = logging.getLogger(__name__)
router = APIRouter()


class AskRequest(BaseModel):
    question: str


class AskResponse(BaseModel):
    answer: str
    sources: list[dict]


@router.post("/ask", response_model=AskResponse)
async def ask_question(req: AskRequest):
    """Answer a humanitarian funding question using RAG.

    1. Vector search project_embeddings for relevant context
    2. Optionally query crisis_summary for country-level context
    3. Build grounded prompt with retrieved documents
    4. Query LLM for data-informed answer
    """
    try:
        # Retrieve relevant project/crisis context from project_embeddings
        docs = await vector_search(
            req.question,
            num_results=5,
            columns=[
                "project_id",
                "project_code",
                "project_name",
                "iso3",
                "country_name",
                "cluster",
                "b2b_ratio",
                "cost_per_beneficiary",
                "text_blob",
            ],
        )

        # Build context from retrieved documents (project_embeddings schema)
        context_parts = []
        for doc in docs:
            text = doc.get("text_blob") or doc.get("text") or ""
            country = doc.get("country_name") or doc.get("location_name") or "Unknown"
            iso3 = doc.get("iso3") or doc.get("location_code") or ""
            project = doc.get("project_name") or doc.get("project_code") or ""
            b2b = doc.get("b2b_ratio")
            b2b_str = f" (B2B: {b2b})" if b2b is not None else ""
            context_parts.append(f"[{country} ({iso3})] {project}{b2b_str}: {text}")

        context_block = "\n\n".join(context_parts)
        augmented_prompt = (
            f"Context from humanitarian crisis and project data:\n{context_block}\n\n"
            f"Question: {req.question}\n\n"
            "Answer based on the context above. Cite specific countries, projects, and numbers. "
            "When discussing B2B ratios, explain that higher = more beneficiaries per dollar = better efficiency."
        )

        answer = await query_llm(augmented_prompt)

        return AskResponse(
            answer=answer,
            sources=[
                {
                    "project_code": d.get("project_code", ""),
                    "iso3": d.get("iso3", ""),
                    "country_name": d.get("country_name", ""),
                }
                for d in docs
            ],
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except TimeoutError as e:
        raise HTTPException(503, str(e)) from e
    except RuntimeError as e:
        raise HTTPException(502, str(e)) from e
    except Exception as e:
        logger.exception("RAG pipeline error")
        raise HTTPException(500, f"RAG pipeline error: {e}") from e
