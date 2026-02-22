# backend/services/databricks_client.py
import json
import logging
import os
import httpx
try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    SentenceTransformer = None

try:
    from cortex import AsyncCortexClient
except ImportError:
    AsyncCortexClient = None

# Default vector search index (from REFACTOR_PLAN)
DEFAULT_VECTOR_INDEX = "projects"

# Global model cache for fast sentence embeddings
_embedding_model = None

logger = logging.getLogger(__name__)


def _vector_search_demo(
    query_text: str,
    num_results: int = 5,
    columns: list[str] | None = None,
) -> list[dict]:
    """Return demo results when Actian cortex client is not installed."""
    default_columns = [
        "project_id", "project_code", "project_name", "iso3", "country_name",
        "cluster", "b2b_ratio", "cost_per_beneficiary",
    ]
    cols = columns or default_columns
    # First row: synthetic match for the user's query (benchmark uses it as query_project)
    q = (query_text or "Project").strip()[:80]
    query_row = {
        "project_id": "demo-query",
        "project_code": f"DEMO-{q.replace(' ', '-')[:20]}" if q else "DEMO-QUERY",
        "project_name": q or "Demo query project",
        "iso3": "XXX",
        "country_name": "Demo",
        "cluster": "Health",
        "b2b_ratio": 0.80,
        "cost_per_beneficiary": 1.25,
        "score": 1.0,
    }
    neighbors_demo = [
        {"project_id": "demo-1", "project_code": "CBPF-AFG-24-001", "project_name": "Health and nutrition response", "iso3": "AFG", "country_name": "Afghanistan", "cluster": "Health", "b2b_ratio": 0.82, "cost_per_beneficiary": 1.22, "score": 0.94},
        {"project_id": "demo-2", "project_code": "CBPF-SSY-24-002", "project_name": "Emergency food security", "iso3": "SSD", "country_name": "South Sudan", "cluster": "Food Security", "b2b_ratio": 0.78, "cost_per_beneficiary": 1.28, "score": 0.89},
        {"project_id": "demo-3", "project_code": "CBPF-YEM-24-003", "project_name": "WASH and shelter", "iso3": "YEM", "country_name": "Yemen", "cluster": "WASH", "b2b_ratio": 0.75, "cost_per_beneficiary": 1.33, "score": 0.85},
        {"project_id": "demo-4", "project_code": "CBPF-SOM-24-004", "project_name": "Protection and education", "iso3": "SOM", "country_name": "Somalia", "cluster": "Protection", "b2b_ratio": 0.71, "cost_per_beneficiary": 1.41, "score": 0.82},
        {"project_id": "demo-5", "project_code": "CBPF-UKR-24-005", "project_name": "Multi-sector response", "iso3": "UKR", "country_name": "Ukraine", "cluster": "Multi-Sector", "b2b_ratio": 0.68, "cost_per_beneficiary": 1.47, "score": 0.79},
    ]
    full_demo = [query_row] + neighbors_demo
    out = []
    for row in full_demo[: num_results + 1]:  # +1 so we get query + num_results neighbors
        if columns:
            out.append({c: row.get(c) for c in cols} | {"score": row.get("score", 0.8)})
        else:
            out.append(dict(row))
    return out

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
    *,
    return_demo_flag: bool = False,
) -> list[dict] | tuple[list[dict], bool]:
    """Query Actian Vector DB on Vultr by text. Returns list of result dicts.
    Falls back to demo results when cortex client is not installed.
    If return_demo_flag is True, returns (results, is_demo)."""
    use_demo = os.getenv("USE_VECTOR_DEMO", "").strip().lower() in ("1", "true", "yes")

    if AsyncCortexClient is None or use_demo:
        logger.info(
            "Vector search using demo data (cortex not installed or USE_VECTOR_DEMO=1). "
            "For live Actian Vector DB, install the actian-vectorAI-db-beta client and set VULTR_IP."
        )
        demo_results = _vector_search_demo(query_text, num_results=num_results, columns=columns)
        if return_demo_flag:
            return (demo_results, True)
        return demo_results

    if SentenceTransformer is None:
        raise RuntimeError("sentence-transformers package is not installed.")
    host = os.getenv("VULTR_IP", "155.138.211.74")
    if ":" not in host:
        host = f"{host}:50051"

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

    if return_demo_flag:
        return (out_rows, False)
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
