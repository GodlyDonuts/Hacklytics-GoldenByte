# backend/services/databricks_client.py
import json
import os
import httpx

# Default vector search index (from REFACTOR_PLAN)
DEFAULT_VECTOR_INDEX = "workspace.default.project_embeddings_index"


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
    index_name: str = DEFAULT_VECTOR_INDEX,
    num_results: int = 5,
    columns: list[str] | None = None,
) -> list[dict]:
    """Query a Databricks Vector Search index by text. Returns list of result dicts."""
    host = os.getenv("DATABRICKS_HOST")
    token = os.getenv("DATABRICKS_TOKEN")
    if not host or not token:
        raise ValueError("DATABRICKS_HOST and DATABRICKS_TOKEN required for vector search")

    # Default columns for project_embeddings (REFACTOR_PLAN schema)
    if columns is None:
        columns = [
            "project_id",
            "project_code",
            "project_name",
            "iso3",
            "country_name",
            "cluster",
            "b2b_ratio",
            "cost_per_beneficiary",
            "text_blob",
        ]

    url = f"{host.rstrip('/')}/api/2.0/vector-search/indexes/{index_name}/query"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {
        "query_text": query_text,
        "columns": columns,
        "num_results": num_results,
    }

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()

    # Response shape: {"result": {"data_array": [[...], ...], "columns": [...]}}
    result = data.get("result", {})
    cols = result.get("columns", columns)
    rows = result.get("data_array", [])
    return [dict(zip(cols, row)) for row in rows]


async def query_llm(
    prompt: str,
    model: str = "databricks-meta-llama-3-1-70b-instruct",
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
