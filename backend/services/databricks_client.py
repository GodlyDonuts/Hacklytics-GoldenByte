# backend/services/databricks_client.py
import json
import os
import httpx
from sentence_transformers import SentenceTransformer
from cortex import AsyncCortexClient

# Default vector search index (from REFACTOR_PLAN)
DEFAULT_VECTOR_INDEX = "projects"

# Global model cache for fast sentence embeddings
_embedding_model = None

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
    """Query Actian Vector DB on Vultr by text. Returns list of result dicts."""
    host = os.getenv("VULTR_IP", "155.138.211.74")
    if ":" not in host:
        host = f"{host}:50051"
    
    global _embedding_model
    if _embedding_model is None:
        _embedding_model = SentenceTransformer('all-mpnet-base-v2')
        
    # Generate embeddings locally
    query_vector = _embedding_model.encode(query_text, normalize_embeddings=True).tolist()

    # Query the Vultr Actian Vector DB
    async with AsyncCortexClient(host) as client:
        results = await client.search(
            index_name,
            query_vector,
            top_k=num_results
        )
        
        out_rows = []
        for r in results:
            if not getattr(r, "id", None):
                continue
            # Async get returns a tuple: (vector, payload)
            try:
                vec, payload = await client.get(index_name, r.id)
            except Exception:
                payload = {}
            if payload is None:
                payload = {}

            if columns:
                row = {c: payload.get(c) for c in columns}
            else:
                row = payload.copy()
            row["score"] = getattr(r, "score", 0.0)
            out_rows.append(row)
            
    return out_rows


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
