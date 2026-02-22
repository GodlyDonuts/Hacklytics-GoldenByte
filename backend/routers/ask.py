"""RAG-based question answering endpoint.

Uses Databricks Vector Search on the rag_documents index to find relevant crisis context,
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

    1. Vector search rag_documents index for relevant crisis context
    2. Build grounded prompt with retrieved documents
    3. Query LLM for data-informed answer
    """
    try:
        docs = await vector_search(
            req.question,
            index_name="workspace.default.rag_index",
            num_results=5,
            columns=[
                "id",
                "text",
                "location_code",
                "country_name",
                "severity",
                "mismatch_score",
            ],
        )

        context_parts = []
        for doc in docs:
            text = doc.get("text", "")
            country = doc.get("country_name", "Unknown")
            iso3 = doc.get("location_code", "")
            severity = doc.get("severity")
            mismatch = doc.get("mismatch_score")
            meta = []
            if severity is not None:
                meta.append(f"severity: {severity}")
            if mismatch is not None:
                meta.append(f"mismatch: {mismatch}")
            meta_str = f" ({', '.join(meta)})" if meta else ""
            context_parts.append(f"[{country} ({iso3})]{meta_str}: {text}")

        context_block = "\n\n".join(context_parts)
        augmented_prompt = (
            f"Context from humanitarian crisis and project data:\n{context_block}\n\n"
            f"Question: {req.question}\n\n"
            "Answer based on the context above. Cite specific countries and numbers. "
            "When discussing severity and mismatch scores, explain their implications for funding gaps."
        )

        answer = await query_llm(augmented_prompt)

        return AskResponse(
            answer=answer,
            sources=[
                {
                    "id": d.get("id", ""),
                    "location_code": d.get("location_code", ""),
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
