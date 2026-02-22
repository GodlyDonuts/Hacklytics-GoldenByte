import asyncio
from cortex import AsyncCortexClient

async def main():
    async with AsyncCortexClient('155.138.211.74:50051') as c:
        # get one document to see its payload schema
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer('all-mpnet-base-v2')
        vec = model.encode("Afghanistan health clinic").tolist()
        res = await c.search("projects", vec, top_k=1)
        if res:
            print("Payload keys:", res[0].payload.keys())
            print("Payload:", res[0].payload)

asyncio.run(main())
