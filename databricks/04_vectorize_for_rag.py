# Databricks notebook source

# COMMAND ----------

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

import time
import pandas as pd
from databricks.vector_search.client import VectorSearchClient

ENDPOINT_NAME = "crisis-rag-endpoint"
INDEX_NAME = "workspace.default.rag_index"
SOURCE_TABLE = "workspace.default.rag_documents"

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
docs_sdf.write.format("delta").mode("overwrite").saveAsTable(SOURCE_TABLE)
print(f"Wrote {docs_sdf.count()} rows to {SOURCE_TABLE}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 3. Create Vector Search Endpoint and Index
# MAGIC Databricks Free Edition allows 1 Vector Search endpoint, 1 unit.
# MAGIC The index uses managed embeddings (databricks-bge-large-en) so no GPU needed.
# MAGIC
# MAGIC This cell is idempotent: it tears down any existing index/endpoint
# MAGIC before recreating them to avoid orphaned resource errors.

# COMMAND ----------

vsc = VectorSearchClient(disable_notice=True)

# --- Tear down existing index if present ---
try:
    vsc.get_index(ENDPOINT_NAME, INDEX_NAME)
    print(f"Deleting existing index {INDEX_NAME}...")
    vsc.delete_index(ENDPOINT_NAME, INDEX_NAME)
    print("Deleted. Waiting for cleanup...")
    time.sleep(10)
except Exception:
    print(f"No existing index {INDEX_NAME} found, skipping delete.")

# --- Tear down existing endpoint if present ---
try:
    endpoints = list(vsc.list_endpoints())
    for ep in endpoints:
        ep_name = ep.get("name", "") if isinstance(ep, dict) else getattr(ep, "name", "")
        if ep_name == ENDPOINT_NAME:
            print(f"Deleting existing endpoint {ENDPOINT_NAME}...")
            vsc.delete_endpoint(ENDPOINT_NAME)
            print("Deleted. Waiting for cleanup...")
            time.sleep(15)
            break
    else:
        print(f"No existing endpoint {ENDPOINT_NAME} found.")
except Exception as e:
    print(f"Could not list/delete endpoints: {e}")

# --- Create fresh endpoint ---
print(f"Creating endpoint {ENDPOINT_NAME}...")
try:
    vsc.create_endpoint(name=ENDPOINT_NAME)
    print("Endpoint creation initiated.")
except Exception as e:
    if "already exists" in str(e).lower():
        print("Endpoint already exists, reusing.")
    else:
        raise

# --- Wait for endpoint to come online ---
print("Waiting for endpoint to come online...")
for attempt in range(30):
    try:
        ep = vsc.get_endpoint(ENDPOINT_NAME)
        status = ep.get("endpoint_status", {}) if isinstance(ep, dict) else {}
        state = status.get("state", "UNKNOWN")
        print(f"  [{attempt+1}/30] Endpoint state: {state}")
        if state == "ONLINE":
            print("Endpoint is ONLINE.")
            break
    except Exception as e:
        print(f"  [{attempt+1}/30] Checking... ({e})")
    time.sleep(20)
else:
    print("WARNING: Endpoint did not reach ONLINE state within timeout. Proceeding anyway.")

# COMMAND ----------

# Enable Change Data Feed on the source table (required for Delta Sync index)
spark.sql(f"ALTER TABLE {SOURCE_TABLE} SET TBLPROPERTIES (delta.enableChangeDataFeed = true)")
print(f"Enabled Change Data Feed on {SOURCE_TABLE}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 4. Create Delta Sync Index

# COMMAND ----------

print(f"Creating index {INDEX_NAME}...")
vsc.create_delta_sync_index(
    endpoint_name=ENDPOINT_NAME,
    index_name=INDEX_NAME,
    source_table_name=SOURCE_TABLE,
    pipeline_type="TRIGGERED",
    primary_key="id",
    embedding_source_column="text",
    embedding_model_endpoint_name="databricks-bge-large-en",
    columns_to_sync=["id", "text", "location_code", "country_name", "severity", "mismatch_score"]
)
print(f"Index {INDEX_NAME} creation initiated.")

# --- Wait for index to sync ---
print("Waiting for index to sync...")
for attempt in range(30):
    try:
        idx = vsc.get_index(ENDPOINT_NAME, INDEX_NAME)
        idx_status = idx.describe()
        state = idx_status.get("status", {}).get("ready", False)
        detailed = idx_status.get("status", {}).get("detailed_state", "UNKNOWN")
        print(f"  [{attempt+1}/30] Index ready: {state}, state: {detailed}")
        if state:
            print("Index is ready.")
            break
    except Exception as e:
        print(f"  [{attempt+1}/30] Checking... ({e})")
    time.sleep(20)
else:
    print("WARNING: Index not ready within timeout. It may still be syncing.")
    print("Run the test cell below in a few minutes.")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 5. Test the Vector Search Index

# COMMAND ----------

try:
    index = vsc.get_index(ENDPOINT_NAME, INDEX_NAME)
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
