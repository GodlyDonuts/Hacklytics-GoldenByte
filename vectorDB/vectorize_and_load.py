import os
import asyncio
import json
import httpx
from dotenv import load_dotenv
load_dotenv("/root/.env")
from sentence_transformers import SentenceTransformer
from cortex import AsyncCortexClient, DistanceMetric

# Configuration for Databricks
DATABRICKS_HOST = os.getenv("DATABRICKS_HOST")
DATABRICKS_TOKEN = os.getenv("DATABRICKS_TOKEN")
WAREHOUSE_ID = os.getenv("WAREHOUSE_ID")
TABLE_NAME = "workspace.default.project_embeddings"

# Configuration for Actian VectorAI
ACTIAN_HOST = "localhost:50051"
COLLECTION_NAME = "projects"
EMBEDDING_MODEL_NAME = "sentence-transformers/all-mpnet-base-v2"
DIMENSION = 768

async def execute_sql(statement: str) -> list[dict]:
    """Execute SQL via EXTERNAL_LINKS disposition and return rows as list of dicts."""
    url = f"{DATABRICKS_HOST.rstrip('/')}/api/2.0/sql/statements"
    headers = {"Authorization": f"Bearer {DATABRICKS_TOKEN}", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            url,
            headers=headers,
            json={
                "statement": statement,
                "warehouse_id": WAREHOUSE_ID,
                "wait_timeout": "50s",
                "format": "JSON_ARRAY",
                "disposition": "EXTERNAL_LINKS",
            },
        )
        resp.raise_for_status()
        data = resp.json()

    print(f"Databricks Status: {data.get('status', {}).get('state')}")
    if data.get("status", {}).get("state") == "FAILED":
        raise RuntimeError(data.get("status", {}).get("error", {}).get("message", "SQL failed"))
    
    # Check if pending, Databricks wait_timeout might have exited early if warehouse is starting
    if data.get("status", {}).get("state") in ["PENDING", "RUNNING"]:
        print("Query is still running. Waiting for completion...")
        statement_id = data.get("statement_id")
        while True:
            await asyncio.sleep(5)
            poll_resp = await client.get(f"{url}/{statement_id}", headers=headers)
            poll_resp.raise_for_status()
            data = poll_resp.json()
            state = data.get("status", {}).get("state")
            print(f"Polling Status: {state}")
            if state in ["SUCCEEDED", "CANCELED", "FAILED", "CLOSED"]:
                break
        
        if data.get("status", {}).get("state") == "FAILED":
             raise RuntimeError(data.get("status", {}).get("error", {}).get("message", "SQL failed"))

    manifest = data.get("manifest", {})
    columns = [c["name"] for c in manifest.get("schema", {}).get("columns", [])]
    external_links = data.get("result", {}).get("external_links", [])

    if not external_links:
        print("Warning: No external links in Databricks response. Returning empty list.")
        return []

    rows: list[list] = []
    async with httpx.AsyncClient(timeout=120) as fetch_client:
        for link_info in external_links:
            ext_url = link_info.get("external_link")
            if not ext_url:
                continue
            chunk_resp = await fetch_client.get(ext_url)
            chunk_resp.raise_for_status()
            chunk_data = json.loads(chunk_resp.text)
            chunk_rows = chunk_data if isinstance(chunk_data, list) else chunk_data.get("data_array", [])
            rows.extend(chunk_rows)

    return [dict(zip(columns, row)) for row in rows]

async def main():
    print("1. Fetching data from Databricks...")
    rows = await execute_sql(f"SELECT * FROM {TABLE_NAME}")
    print(f"Successfully fetched {len(rows)} rows.")
    
    if not rows:
        print("No data fetched. Exiting.")
        return
        
    print(f"2. Loading embedding model: {EMBEDDING_MODEL_NAME}")
    model = SentenceTransformer(EMBEDDING_MODEL_NAME)
    
    batch_size = 100
    
    print(f"3. Connecting to Actian VectorAI Db at {ACTIAN_HOST}")
    try:
        async with AsyncCortexClient(ACTIAN_HOST) as client:
            # We recreate the collection for a fresh start
            print(f"Ensuring collection '{COLLECTION_NAME}' exists...")
            try:
                await client.delete_collection(COLLECTION_NAME)
            except Exception:
                pass
                
            await client.create_collection(
                name=COLLECTION_NAME,
                dimension=DIMENSION,
            ) # Note: distance_metric argument might be different or unsupported in beta async client. 
              # The sync example had distance_metric=DistanceMetric.COSINE. We'll stick to default if it fails.
              # wait, let's look at the example: `await client.create_collection("demo", 128)`. No distance_metric shown in async.
              
            print("4. Starting vectorization and uploading...")
            
            for i in range(0, len(rows), batch_size):
                batch = rows[i:i+batch_size]
                
                texts = [str(row.get("text_blob", "")) for row in batch]
                # Fallback if text_blob is missing
                for j, text in enumerate(texts):
                    if not text.strip():
                        # Create a composite text blob
                        r = batch[j]
                        texts[j] = f"{r.get('country_name', '')} {r.get('project_name', '')} {r.get('cluster', '')}"
                
                # Compute embeddings using sentence-transformer
                embeddings = model.encode(texts, normalize_embeddings=True)
                
                # Prepare payload
                ids = [i + j for j in range(len(batch))]
                vectors = [emb.tolist() for emb in embeddings]
                payloads = batch # send the whole row as payload
                
                print(f"  Uploading batch {i} to {i+len(batch)}...")
                for j in range(len(batch)):
                    # Note: We use upsert for each one since I didn't see `batch_upsert` in async example, 
                    # but maybe it exists. To be safe we will iterate or submit concurrently.
                    await client.upsert(
                        COLLECTION_NAME,
                        id=ids[j],
                        vector=vectors[j],
                        payload=payloads[j]
                    )
            print("Finished successfully.")
    except Exception as e:
        print(f"Error communicating with Actian Cortex DB: {e}")

if __name__ == "__main__":
    asyncio.run(main())
