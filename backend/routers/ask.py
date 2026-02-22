"""RAG-based question answering endpoint.

Two backends (pick one per request or deployment):
- Databricks: POST /ask — uses Databricks Vector Search + Databricks LLM.
- Actian:    POST /ask/actian — uses Actian Vector DB (Vultr) + Databricks LLM.
"""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.actiandb_client import vector_search_actian
from services.databricks_client import query_llm, vector_search_databricks

logger = logging.getLogger(__name__)
router = APIRouter()


class AskRequest(BaseModel):
    question: str


class AskResponse(BaseModel):
    answer: str
    sources: list[dict]


# Columns and index for Databricks RAG (rag_index / project_embeddings style)
_DATABRICKS_ASK_INDEX = "workspace.default.rag_index"
_DATABRICKS_ASK_COLUMNS = [
    "id",
    "text",
    "location_code",
    "country_name",
    "severity",
    "mismatch_score",
]


def _build_context_and_sources(docs: list[dict], text_key: str = "text") -> tuple[str, list[dict]]:
    """Build context block and sources list from retrieved docs. Works with both Databricks and Actian shapes."""
    context_parts = []
    sources = []
    for doc in docs:
        text = doc.get(text_key) or doc.get("content", "")
        country = doc.get("country_name", "Unknown")
        iso3 = doc.get("location_code", "") or doc.get("iso3", "")
        severity = doc.get("severity")
        mismatch = doc.get("mismatch_score")
        meta = []
        if severity is not None:
            meta.append(f"severity: {severity}")
        if mismatch is not None:
            meta.append(f"mismatch: {mismatch}")
        meta_str = f" ({', '.join(meta)})" if meta else ""
        context_parts.append(f"[{country} ({iso3})]{meta_str}: {text}")
        sources.append({
            "id": doc.get("id", "") or doc.get("project_id", ""),
            "location_code": iso3,
            "country_name": country,
        })
    return "\n\n".join(context_parts), sources


@router.post("/ask", response_model=AskResponse)
async def ask_question(req: AskRequest):
    """Answer a humanitarian funding question using RAG (Databricks backend).

    1. Vector search Databricks rag_index for relevant crisis context
    2. Build grounded prompt with retrieved documents
    3. Query Databricks LLM for data-informed answer
    """
    try:
        docs = await vector_search_databricks(
            req.question,
            index_name=_DATABRICKS_ASK_INDEX,
            num_results=5,
            columns=_DATABRICKS_ASK_COLUMNS,
        )
        context_block, sources = _build_context_and_sources(docs)
        augmented_prompt = (
            f"Context from humanitarian crisis and project data:\n{context_block}\n\n"
            f"Question: {req.question}\n\n"
            "Answer based on the context above. Cite specific countries and numbers. "
            "When discussing severity and mismatch scores, explain their implications for funding gaps."
        )
        answer = await query_llm(augmented_prompt)
        return AskResponse(answer=answer, sources=sources)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except TimeoutError as e:
        raise HTTPException(503, str(e)) from e
    except RuntimeError as e:
        raise HTTPException(502, str(e)) from e
    except Exception as e:
        logger.exception("RAG pipeline error (Databricks)")
        raise HTTPException(500, f"RAG pipeline error: {e}") from e


@router.post("/ask/actian", response_model=AskResponse)
async def ask_question_actian(req: AskRequest):
    """Answer a humanitarian funding question using RAG (Actian/Vultr backend).

    1. Vector search Actian index on Vultr for relevant crisis context
    2. Build grounded prompt with retrieved documents
    3. Query Databricks LLM for data-informed answer

    Requires VULTR_IP (and cortex + sentence_transformers installed).
    """
    try:
        # Use same column names as Databricks if your Actian index has them; else adjust to match your Actian schema
        docs = await vector_search_actian(
            req.question,
            index_name="projects",
            num_results=5,
            columns=_DATABRICKS_ASK_COLUMNS,
        )
        context_block, sources = _build_context_and_sources(docs)
        augmented_prompt = (
            f"Context from humanitarian crisis and project data:\n{context_block}\n\n"
            f"Question: {req.question}\n\n"
            "Answer based on the context above. Cite specific countries and numbers. "
            "When discussing severity and mismatch scores, explain their implications for funding gaps."
        )
        answer = await query_llm(augmented_prompt)
        return AskResponse(answer=answer, sources=sources)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except TimeoutError as e:
        raise HTTPException(503, str(e)) from e
    except RuntimeError as e:
        raise HTTPException(502, str(e)) from e
    except Exception as e:
        logger.exception("RAG pipeline error (Actian)")
        raise HTTPException(500, f"RAG pipeline error: {e}") from e
