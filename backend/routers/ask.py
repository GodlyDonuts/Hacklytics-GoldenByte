"""RAG-based question answering endpoint.

Uses Databricks Vector Search to find relevant crisis context,
then queries the hosted LLM to generate an answer grounded in data.
"""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services.databricks_client import query_llm, vector_search

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

    1. Vector search the crisis summary index for relevant context
    2. Build a grounded prompt with the retrieved documents
    3. Query the LLM for a data-informed answer
    """
    try:
        # Retrieve relevant crisis context
        docs = await vector_search(req.question, num_results=5)

        # Build context-augmented prompt
        context_parts = []
        for doc in docs:
            text = doc.get("text", "")
            location = doc.get("location_name", "Unknown")
            context_parts.append(f"[{location}] {text}")

        context_block = "\n\n".join(context_parts)
        augmented_prompt = (
            f"Context from humanitarian crisis data:\n{context_block}\n\n"
            f"Question: {req.question}\n\n"
            "Answer based on the context above. Cite specific countries and numbers."
        )

        answer = await query_llm(augmented_prompt)

        return AskResponse(
            answer=answer,
            sources=[
                {"location_code": d.get("location_code", ""), "location_name": d.get("location_name", "")}
                for d in docs
            ],
        )
    except TimeoutError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        logger.exception("RAG pipeline error")
        raise HTTPException(status_code=500, detail=f"RAG pipeline error: {e}")
