"""Databricks SQL Statement Execution API client.

Handles SQL queries against Delta tables via the Databricks REST API,
including polling for warehouse cold starts (30-60s on free tier),
vector search for RAG, and LLM endpoint access.
"""

import asyncio
import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# Module-level shared client (initialized lazily)
_client: httpx.AsyncClient | None = None

_MAX_POLLS = 20
_INITIAL_BACKOFF_S = 2.0
_MAX_BACKOFF_S = 10.0


def _get_config() -> tuple[str, str, str]:
    """Return (host, token, warehouse_id) from env vars."""
    host = os.getenv("DATABRICKS_HOST", "")
    token = os.getenv("DATABRICKS_TOKEN", "")
    warehouse_id = os.getenv("WAREHOUSE_ID", "")
    if not all([host, token, warehouse_id]):
        raise RuntimeError(
            "Missing required env vars: DATABRICKS_HOST, DATABRICKS_TOKEN, WAREHOUSE_ID"
        )
    return host.rstrip("/"), token, warehouse_id


def _get_client() -> httpx.AsyncClient:
    """Return or create the shared httpx client."""
    global _client
    if _client is None or _client.is_closed:
        _, token, _ = _get_config()
        _client = httpx.AsyncClient(
            headers={"Authorization": f"Bearer {token}"},
            timeout=httpx.Timeout(30.0, connect=10.0),
        )
    return _client


async def close_client() -> None:
    """Close the shared httpx client. Call on app shutdown."""
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
        _client = None


async def execute_sql(
    statement: str,
    params: list[dict[str, str]] | None = None,
) -> list[dict[str, Any]]:
    """Execute a SQL statement and return rows as list of dicts.

    Polls for completion when the warehouse is cold-starting (PENDING/RUNNING).
    Uses parameterized queries when params is provided to prevent SQL injection.

    Args:
        statement: SQL query string. Use :name for parameter placeholders.
        params: Optional list of {"name": ..., "value": ..., "type": ...} dicts.

    Returns:
        List of row dicts with column names as keys.

    Raises:
        RuntimeError: If the query fails.
        TimeoutError: If polling exceeds the maximum number of attempts.
    """
    host, _, warehouse_id = _get_config()
    client = _get_client()

    body: dict[str, Any] = {
        "statement": statement,
        "warehouse_id": warehouse_id,
        "wait_timeout": "10s",
        "format": "JSON_ARRAY",
        "disposition": "INLINE",
    }
    if params:
        body["parameters"] = params

    resp = await client.post(f"{host}/api/2.0/sql/statements", json=body)
    resp.raise_for_status()
    data = resp.json()

    # Poll if warehouse is cold-starting
    statement_id = data.get("statement_id")
    state = data.get("status", {}).get("state", "")
    backoff = _INITIAL_BACKOFF_S
    polls = 0

    while state in ("PENDING", "RUNNING") and polls < _MAX_POLLS:
        logger.info("Warehouse warming up (state=%s), polling in %.1fs...", state, backoff)
        await asyncio.sleep(backoff)
        backoff = min(backoff * 2, _MAX_BACKOFF_S)
        polls += 1

        poll_resp = await client.get(f"{host}/api/2.0/sql/statements/{statement_id}")
        poll_resp.raise_for_status()
        data = poll_resp.json()
        state = data.get("status", {}).get("state", "")

    if state in ("PENDING", "RUNNING"):
        raise TimeoutError(
            f"SQL warehouse did not become ready after {polls} polls (~90s). "
            "The warehouse may need manual activation in the Databricks UI."
        )

    if state == "FAILED":
        error_msg = data.get("status", {}).get("error", {}).get("message", "Unknown SQL error")
        raise RuntimeError(f"SQL execution failed: {error_msg}")

    # Parse columnar response into row dicts
    columns = [
        col["name"]
        for col in data.get("manifest", {}).get("schema", {}).get("columns", [])
    ]
    rows = data.get("result", {}).get("data_array", [])
    return [dict(zip(columns, row)) for row in rows]


async def vector_search(query: str, num_results: int = 5) -> list[dict[str, Any]]:
    """Search the RAG vector index for crisis summaries similar to the query.

    Args:
        query: Natural language search query.
        num_results: Number of results to return.

    Returns:
        List of matching documents with text and metadata.
    """
    host, _, _ = _get_config()
    client = _get_client()

    resp = await client.post(
        f"{host}/api/2.0/vector-search/indexes/workspace.default.rag_index/query",
        json={
            "query_text": query,
            "columns": ["text", "location_code", "location_name"],
            "num_results": num_results,
        },
    )
    resp.raise_for_status()
    data = resp.json()

    columns = data.get("manifest", {}).get("columns", [])
    col_names = [c["name"] for c in columns]
    rows = data.get("result", {}).get("data_array", [])
    return [dict(zip(col_names, row)) for row in rows]


async def query_llm(prompt: str) -> str:
    """Query the Databricks-hosted LLM for a response.

    Args:
        prompt: The user prompt to send to the model.

    Returns:
        The model's response text.
    """
    host, _, _ = _get_config()
    client = _get_client()

    resp = await client.post(
        f"{host}/serving-endpoints/databricks-meta-llama-3-1-70b-instruct/invocations",
        json={
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a humanitarian funding analyst. Answer questions about "
                        "crisis funding gaps, mismatch scores, and aid distribution using "
                        "the provided context. Be specific with numbers and country names."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            "max_tokens": 512,
        },
    )
    resp.raise_for_status()
    data = resp.json()
    return data.get("choices", [{}])[0].get("message", {}).get("content", "")


async def check_warehouse_status() -> dict[str, Any]:
    """Check the SQL warehouse status for health monitoring.

    Returns:
        Dict with warehouse state and cluster info.
    """
    host, _, warehouse_id = _get_config()
    client = _get_client()

    try:
        resp = await client.get(f"{host}/api/2.0/sql/warehouses/{warehouse_id}")
        resp.raise_for_status()
        data = resp.json()
        return {
            "warehouse_id": warehouse_id,
            "state": data.get("state", "UNKNOWN"),
            "name": data.get("name", ""),
            "cluster_size": data.get("cluster_size", ""),
        }
    except httpx.HTTPError as e:
        return {
            "warehouse_id": warehouse_id,
            "state": "ERROR",
            "error": str(e),
        }
