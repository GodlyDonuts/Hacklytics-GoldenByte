# backend/services/databricks_client.py
import os
import httpx

async def execute_sql(statement: str, warehouse_id: str | None = None) -> list[dict]:
    """Execute SQL and return rows as list of dicts."""
    host = os.getenv("DATABRICKS_HOST")
    token = os.getenv("DATABRICKS_TOKEN")
    wh_id = warehouse_id or os.getenv("WAREHOUSE_ID")
    
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{host.rstrip('/')}/api/2.0/sql/statements",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "statement": statement,
                "warehouse_id": wh_id,
                "wait_timeout": "30s",
                "format": "JSON_ARRAY",
                "disposition": "INLINE",
            },
        )
        resp.raise_for_status()
        data = resp.json()
    
    # Parse result: manifest has columns, result.data_array has rows
    if data.get("status", {}).get("state") == "FAILED":
        raise RuntimeError(data.get("status", {}).get("error", {}).get("message", "SQL failed"))
    
    manifest = data.get("manifest", {})
    columns = [c["name"] for c in manifest.get("schema", {}).get("columns", [])]
    rows = data.get("result", {}).get("data_array", [])
    
    return [dict(zip(columns, row)) for row in rows]