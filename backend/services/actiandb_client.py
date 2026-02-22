"""Actian Vector DB client (Vultr).

Vector search against Actian/cortex index on Vultr. Use this when you want
the ask or benchmark flow to run against Actian instead of Databricks.

Env: VULTR_IP (required), optionally VULTR_USERNAME, VULTR_PASSWORD
(if your cortex/gRPC setup uses them; default client uses host:port only).
"""

import logging
import os

try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    SentenceTransformer = None

try:
    from cortex import AsyncCortexClient
except ImportError:
    AsyncCortexClient = None

logger = logging.getLogger(__name__)

# Default index name for Actian (e.g. "projects" or your index)
DEFAULT_ACTIAN_INDEX = "projects"

_embedding_model = None


def _get_actian_host() -> str:
    host = os.getenv("VULTR_IP", "").strip()
    if not host:
        raise ValueError("VULTR_IP is required for Actian Vector Search")
    if ":" not in host:
        host = f"{host}:50051"
    return host


async def vector_search_actian(
    query_text: str,
    index_name: str = DEFAULT_ACTIAN_INDEX,
    num_results: int = 5,
    columns: list[str] | None = None,
) -> list[dict]:
    """Run vector search against Actian Vector DB on Vultr.

    Embeds query_text locally with SentenceTransformer, then queries the
    cortex/Actian service at VULTR_IP:50051.

    Args:
        query_text: Natural language or text to search for.
        index_name: Actian index name (e.g. "projects").
        num_results: Max number of results (top_k).
        columns: Optional list of payload columns to return; if None, full payload.

    Returns:
        List of dicts, each with requested columns (or full payload) and "score".

    Raises:
        ValueError: If VULTR_IP is not set or cortex/sentence_transformers not installed.
    """
    if AsyncCortexClient is None:
        raise ValueError(
            "Actian Vector Search requires the cortex package. "
            "Install actian-vectorAI-db-beta or the cortex client."
        )
    if SentenceTransformer is None:
        raise ValueError(
            "Actian Vector Search requires sentence-transformers for local embeddings."
        )

    host = _get_actian_host()

    global _embedding_model
    if _embedding_model is None:
        _embedding_model = SentenceTransformer("all-mpnet-base-v2")

    query_vector = _embedding_model.encode(query_text, normalize_embeddings=True).tolist()

    async with AsyncCortexClient(host) as client:
        results = await client.search(index_name, query_vector, top_k=num_results)

        out_rows = []
        for r in results:
            payload = getattr(r, "payload", None) or {}
            score = getattr(r, "score", 0.0)
            if columns:
                row = {c: payload.get(c) for c in columns}
            else:
                row = dict(payload) if payload else {}
            row["score"] = score
            out_rows.append(row)

    return out_rows
