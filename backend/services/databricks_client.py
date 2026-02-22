# backend/services/databricks_client.py
"""Databricks-only client: Vector Search, SQL, and LLM.

For Actian/Vultr vector search, use services.actiandb_client instead.
"""
import json
import logging
import os
import httpx

# Default vector search index (from REFACTOR_PLAN)
DEFAULT_VECTOR_INDEX = "projects"

logger = logging.getLogger(__name__)


async def vector_search_databricks(
    query_text: str,
    index_name: str,
    num_results: int = 5,
    columns: list[str] | None = None,
    query_type: str = "ann",
) -> list[dict]:
    """Query Databricks Vector Search index via REST API.

    Requires in Databricks:
    - A Vector Search index (e.g. Delta Sync Index) with full name matching index_name
      (e.g. workspace.default.rag_index or catalog.schema.rag_index).
    - The index must have an embedding endpoint configured if you use query_text;
      otherwise use query_vector with pre-computed embeddings.

    Env: DATABRICKS_HOST, DATABRICKS_TOKEN (same as execute_sql / query_llm).
    """
    host = os.getenv("DATABRICKS_HOST")
    token = os.getenv("DATABRICKS_TOKEN")
    if not host or not token:
        raise ValueError("DATABRICKS_HOST and DATABRICKS_TOKEN required for Databricks Vector Search")

    # API: POST /api/2.0/vector-search/indexes/{index_name}/query (index_name in path, not body)
    # See https://docs.databricks.com/api/workspace/vectorsearchindexes/queryindex
    url = f"{host.rstrip('/')}/api/2.0/vector-search/indexes/{index_name}/query"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    # columns is required; query_type must be ANN | HYBRID | FULL_TEXT
    body = {
        "query_text": query_text,
        "num_results": num_results,
        "query_type": (query_type or "ann").upper() if query_type else "ANN",
        "columns": columns if columns is not None else [],
    }

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(url, headers=headers, json=body)
        if resp.status_code == 400:
            err = resp.text
            try:
                err_json = resp.json()
                err = err_json.get("error", err_json.get("message", err))
            except Exception:
                pass
            raise ValueError(f"Databricks Vector Search 400: {err}")
        if resp.status_code == 404:
            raise ValueError(
                f"Databricks Vector Search index not found: {index_name}. "
                "Create the index in Databricks (Vector Search UI or SDK) and use its full name (catalog.schema.index_name)."
            )
        resp.raise_for_status()
        data = resp.json()

    # Response shape: see docs.databricks.com/api/workspace/vectorsearchindexes/queryindex
    # Typically result.rows (list of objects) or result with data_array + manifest schema
    result = data.get("result") or data.get("results")
    if result is None:
        return []

    rows = result.get("rows")
    if rows is not None:
        # List of row objects; ensure score is included if returned
        out = []
        for r in rows:
            if isinstance(r, dict):
                out.append(dict(r))
            else:
                out.append({"score": 0.0, "row": r})
        return out

    data_array = result.get("data_array")
    manifest = data.get("manifest") or result.get("manifest")
    if data_array is not None:
        # Official response: manifest.columns = [ {"name": "id"}, ... ], result.data_array = [ [row], ... ]
        col_names = None
        if manifest is not None:
            cols = manifest.get("columns") or manifest.get("schema", {}).get("columns") or []
            col_names = [c.get("name") for c in cols if c.get("name")]
        if col_names and len(col_names) > 0:
            return [dict(zip(col_names, row)) for row in data_array]
        # No manifest or empty columns; return rows with generic keys
        return [dict(zip([f"col_{i}" for i in range(len(row))], row)) for row in data_array]

    return []



async def execute_sql(statement: str, warehouse_id: str | None = None) -> list[dict]:
    """Execute SQL via EXTERNAL_LINKS disposition and return rows as list of dicts."""
    host = os.getenv("DATABRICKS_HOST")
    token = os.getenv("DATABRICKS_TOKEN")
    wh_id = warehouse_id or os.getenv("WAREHOUSE_ID")

    missing = []
    if not host:
        missing.append("DATABRICKS_HOST")
    if not token:
        missing.append("DATABRICKS_TOKEN")
    if not wh_id:
        missing.append("WAREHOUSE_ID")
    if missing:
        raise ValueError(f"Missing required env vars: {', '.join(missing)}. Check backend/.env and ensure python-dotenv loads it.")

    url = f"{host.rstrip('/')}/api/2.0/sql/statements"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            url,
            headers=headers,
            json={
                "statement": statement,
                "warehouse_id": wh_id,
                "wait_timeout": "30s",
                "format": "JSON_ARRAY",
                "disposition": "EXTERNAL_LINKS",
            },
        )
        if resp.status_code == 400:
            err_body = resp.text
            try:
                err_json = resp.json()
                err_body = err_json.get("error", err_json.get("message", str(err_json)))
            except Exception:
                pass
            raise RuntimeError(f"Databricks API 400 Bad Request: {err_body}")
        resp.raise_for_status()
        data = resp.json()

    if data.get("status", {}).get("state") == "FAILED":
        raise RuntimeError(data.get("status", {}).get("error", {}).get("message", "SQL failed"))

    manifest = data.get("manifest", {})
    columns = [c["name"] for c in manifest.get("schema", {}).get("columns", [])]
    external_links = data.get("result", {}).get("external_links", [])

    if not external_links:
        raise RuntimeError("No external links in Databricks response.")

    rows: list[list] = []

    # Fetch from presigned URLs. Per Databricks docs: "You must not set an Authorization
    # header in the download requests" — presigned URLs have credentials embedded.
    async with httpx.AsyncClient(timeout=120) as fetch_client:
        for link_info in external_links:
            ext_url = link_info.get("external_link")
            if not ext_url:
                continue
            chunk_resp = await fetch_client.get(ext_url)
            if chunk_resp.status_code >= 400:
                raise RuntimeError(
                    f"Databricks external link fetch {chunk_resp.status_code}: {chunk_resp.text[:500]}"
                )
            chunk_data = json.loads(chunk_resp.text)
            chunk_rows = chunk_data if isinstance(chunk_data, list) else chunk_data.get("data_array", [])
            rows.extend(chunk_rows)

    return [dict(zip(columns, row)) for row in rows]


async def vector_search(
    query_text: str,
    index_name: str | None = None,
    num_results: int = 5,
    columns: list[str] | None = None,
    *,
    return_demo_flag: bool = False,
    query_type: str = "ann",
) -> list[dict] | tuple[list[dict], bool]:
    """Query Databricks Vector Search only.

    Requires DATABRICKS_HOST and DATABRICKS_TOKEN. Uses index_name if provided,
    else env DATABRICKS_VECTOR_INDEX or default workspace.default.project_embeddings_index.

    For Actian/Vultr vector search use services.actiandb_client.vector_search_actian instead.
    """
    name = index_name or os.getenv("DATABRICKS_VECTOR_INDEX", "workspace.default.project_embeddings_index")
    out = await vector_search_databricks(
        query_text,
        index_name=name,
        num_results=num_results,
        columns=columns or [],
        query_type=query_type,
    )
    if return_demo_flag:
        return (out, False)
    return out


async def query_llm(
    prompt: str,
    model: str = "databricks-meta-llama-3-3-70b-instruct",
) -> str:
    """Call a Databricks Foundation Model serving endpoint."""
    host = os.getenv("DATABRICKS_HOST")
    token = os.getenv("DATABRICKS_TOKEN")
    if not host or not token:
        raise ValueError("DATABRICKS_HOST and DATABRICKS_TOKEN required for LLM")

    url = f"{host.rstrip('/')}/serving-endpoints/{model}/invocations"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 500,
    }

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        out = resp.json()

    # Chat completion format: {"choices": [{"message": {"content": "..."}}]}
    choices = out.get("choices", [])
    if not choices:
        raise RuntimeError("LLM returned no choices")
    return choices[0].get("message", {}).get("content", "")
