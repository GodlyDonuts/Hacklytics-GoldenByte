import os
import asyncio
from sentence_transformers import SentenceTransformer
from cortex import AsyncCortexClient

# Configuration for Actian VectorAI
ACTIAN_HOST = "localhost:50051"
COLLECTION_NAME = "projects"
EMBEDDING_MODEL_NAME = "sentence-transformers/all-mpnet-base-v2"

async def main():
    print(f"Loading embedding model: {EMBEDDING_MODEL_NAME}")
    model = SentenceTransformer(EMBEDDING_MODEL_NAME)
    
    test_query = "humanitarian food assistance in Yemen"
    print(f"Querying for: '{test_query}'")
    query_vector = model.encode(test_query, normalize_embeddings=True).tolist()
    
    print(f"Connecting to Actian VectorAI Db at {ACTIAN_HOST}")
    try:
        async with AsyncCortexClient(ACTIAN_HOST) as client:
            results = await client.search(
                COLLECTION_NAME,
                query_vector,
                top_k=3,
                with_payload=True
            )
            
            print("\nTop 3 Results:")
            for i, r in enumerate(results):
                payload = r.payload or {}
                print(f"[{i+1}] ID: {r.id}, Score: {r.score:.4f}")
                print(f"   Country: {payload.get('country_name')}")
                print(f"   Project: {payload.get('project_name')}")
                print(f"   Cluster: {payload.get('cluster')}")
                print("-" * 50)
            
    except Exception as e:
        print(f"Error querying Actian Cortex DB: {e}")

if __name__ == "__main__":
    asyncio.run(main())
