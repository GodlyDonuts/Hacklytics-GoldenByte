import os
import asyncio
from cortex import AsyncCortexClient

ACTIAN_HOST = "localhost:50051"
COLLECTION_NAME = "projects"

async def main():
    try:
        async with AsyncCortexClient(ACTIAN_HOST) as client:
            await client.upsert(
                COLLECTION_NAME,
                id=99999,
                vector=[0.1]*768,
                payload={"country_name": "Test Country", "project_name": "Test Project", "cluster": "Test Cluster"}
            )
            print("Upserted test vector.")
            
            res = await client.search(COLLECTION_NAME, [0.1]*768, top_k=1)
            for r in res:
                print(r.id, getattr(r, 'payload', 'NO PAYLOAD ATTR'))
    except Exception as e:
        print(f"Error querying Actian Cortex DB: {e}")

if __name__ == "__main__":
    asyncio.run(main())
