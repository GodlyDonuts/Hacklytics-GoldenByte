# Databricks notebook source
# MAGIC %md
# MAGIC # 04 - Vectorize Crisis Summaries for RAG
# MAGIC Creates text documents from mismatch data, stores them in a Delta table,
# MAGIC and sets up a Vector Search index for semantic querying.
# MAGIC
# MAGIC **Reads:** `workspace.default.country_mismatch`
# MAGIC **Writes:** `workspace.default.rag_documents`, Vector Search index

# COMMAND ----------

# MAGIC %pip install databricks-vectorsearch

# COMMAND ----------

dbutils.library.restartPython()

# COMMAND ----------

import pandas as pd
from databricks.vector_search.client import VectorSearchClient

# COMMAND ----------

# MAGIC %md
# MAGIC ## 1. Build Text Documents from Mismatch Data

# COMMAND ----------

mismatch = spark.table("workspace.default.country_mismatch").toPandas()
print(f"Building RAG documents for {len(mismatch)} countries...")

documents = []
for _, row in mismatch.iterrows():
    people = float(row.get("people_in_need", 0) or 0)
    funding = float(row.get("total_funding", 0) or 0)
    per_capita = float(row.get("funding_per_capita", 0) or 0)
    coverage = float(row.get("coverage_ratio", 0) or 0)
    severity = float(row.get("severity", 0) or 0)
    mismatch_score = float(row.get("mismatch_score", 0) or 0)

    text = (
        f"Country: {row['country']} (ISO3: {row['iso3']}). "
        f"People in need: {people:,.0f}. "
        f"Total funding received: ${funding:,.0f}. "
        f"Funding per capita: ${per_capita:.2f}. "
        f"Coverage ratio (funding/requirements): {coverage:.1%}. "
        f"Severity score: {severity:.1f}/5. "
        f"Mismatch score: {mismatch_score:.3f} "
        f"(positive = underfunded relative to need). "
        f"Severity rank: {row.get('severity_rank', 'N/A')}. "
        f"Funding rank: {row.get('funding_rank', 'N/A')}. "
        f"Number of humanitarian sectors active: {row.get('sector_count', 'N/A')}."
    )

    documents.append({
        "id": str(row["iso3"]),
        "text": text,
        "location_code": str(row["iso3"]),
        "country_name": str(row["country"]),
        "severity": float(severity),
        "mismatch_score": float(mismatch_score),
    })

print(f"Created {len(documents)} documents")
print(f"\nSample document:\n{documents[0]['text']}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 2. Write Documents to Delta Table

# COMMAND ----------

docs_pdf = pd.DataFrame(documents)
docs_sdf = spark.createDataFrame(docs_pdf)
docs_sdf.write.format("delta").mode("overwrite").saveAsTable("workspace.default.rag_documents")
print(f"Wrote {docs_sdf.count()} rows to workspace.default.rag_documents")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 3. Create Vector Search Endpoint and Index
# MAGIC Databricks Free Edition allows 1 Vector Search endpoint, 1 unit.
# MAGIC The index uses managed embeddings (databricks-bge-large-en) so no GPU needed.
# MAGIC
# MAGIC After creating the index, it takes a few minutes to sync and become queryable.

# COMMAND ----------

vsc = VectorSearchClient()
vsc.delete_index("crisis-rag-endpoint", "workspace.default.rag_index")
print("Deleted old index")

# COMMAND ----------

vsc = VectorSearchClient()

# Create the endpoint (skip if already exists)
try:
    vsc.create_endpoint(name="crisis-rag-endpoint")
    print("Created vector search endpoint: crisis-rag-endpoint")
except Exception as e:
    if "already exists" in str(e).lower():
        print("Endpoint crisis-rag-endpoint already exists, reusing.")
    else:
        print(f"Endpoint creation error: {e}")
        print("If on Free Edition, check that you don't already have an endpoint.")

# COMMAND ----------

# Enable Change Data Feed on the source table (required for Delta Sync index)
spark.sql("ALTER TABLE workspace.default.rag_documents SET TBLPROPERTIES (delta.enableChangeDataFeed = true)")
print("Enabled Change Data Feed on workspace.default.rag_documents")

# COMMAND ----------

# Create the Delta Sync index
try:
    vsc.create_delta_sync_index(
        endpoint_name="crisis-rag-endpoint",
        index_name="workspace.default.rag_index",
        source_table_name="workspace.default.rag_documents",
        pipeline_type="TRIGGERED",
        primary_key="id",
        embedding_source_column="text",
        embedding_model_endpoint_name="databricks-bge-large-en",
        columns_to_sync=["id", "text", "location_code", "country_name", "severity", "mismatch_score"]
    )
    print("Created vector search index: workspace.default.rag_index")
    print("Wait a few minutes for the index to sync before querying.")
except Exception as e:
    if "already exists" in str(e).lower():
        print("Index already exists. To recreate, delete it first.")
    else:
        print(f"Index creation error: {e}")
        print("\nIf the embedding model endpoint is not found, try one of:")
        print("  - databricks-bge-large-en")
        print("  - databricks-gte-large-en")
        print("  - system.ai.databricks-bge-large-en")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 4. Test the Vector Search Index
# MAGIC Run this cell after waiting a few minutes for the index to sync.

# COMMAND ----------

try:
    index = vsc.get_index("crisis-rag-endpoint", "workspace.default.rag_index")
    results = index.similarity_search(
        query_text="Which country has the worst funding gap?",
        columns=["id", "text", "country_name", "mismatch_score"],
        num_results=5
    )
    print("Vector search test results:")
    for r in results.get("result", {}).get("data_array", []):
        print(f"  {r}")
except Exception as e:
    print(f"Index may still be syncing. Error: {e}")
    print("Try running this cell again in a few minutes.")

# COMMAND ----------

vsc = VectorSearchClient(disable_notice=True)

# Check endpoint status
endpoint = vsc.get_endpoint("crisis-rag-endpoint")
print(f"Endpoint status: {endpoint}")
# Check index status
try:
    index = vsc.get_index("crisis-rag-endpoint", "workspace.default.rag_index")
    print(f"Index status: {index.describe()}")
except Exception as e:
    print(f"Index error: {e}")
