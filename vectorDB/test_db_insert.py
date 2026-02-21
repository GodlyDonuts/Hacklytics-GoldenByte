import os
import asyncio
from cortex import AsyncCortexClient

ACTIAN_HOST = "localhost:50051"
COLLECTION_NAME = "projects"

async def main():
    print(f"Connecting to Actian VectorAI Db at {ACTIAN_HOST}")
    try:
        async with AsyncCortexClient(ACTIAN_HOST) as client:
            res = await client.search(COLLECTION_NAME, [0.1]*768, top_k=1)
            for r in res:
                print(r.id, getattr(r, 'payload', 'NO PAYLOAD ATTR'))
    except Exception as e:
        print(f"Error querying Actian Cortex DB: {e}")

if __name__ == "__main__":
    asyncio.run(main())
