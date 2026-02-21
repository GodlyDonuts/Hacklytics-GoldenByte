# Databricks notebook source

# COMMAND ----------

# MAGIC %md
# MAGIC # 02 - Project Embeddings (Refactored)
# MAGIC Builds `workspace.default.project_embeddings` — the table that drives
# MAGIC globe B2B drill-down, benchmarking, and RAG vector search.
# MAGIC
# MAGIC **Inputs:**
# MAGIC - HPC Plans API (to get plan IDs for 2022-2026)
# MAGIC - HPC Projects API (per-plan project details with budgets and beneficiaries)
# MAGIC
# MAGIC **Output:** `workspace.default.project_embeddings`
# MAGIC — one row per HRP project with B2B ratios, percentile ranks, outlier flags, and text blobs.
# MAGIC
# MAGIC Also creates Vector Search index `workspace.default.project_embeddings_index` on text_blob.

# COMMAND ----------

# MAGIC %pip install databricks-vectorsearch scikit-learn

# COMMAND ----------

dbutils.library.restartPython()

# COMMAND ----------

import requests
import pandas as pd
import numpy as np
import re
import time
import os
import base64

# Suppress VectorSearchClient notices
os.environ["DATABRICKS_VECTOR_SEARCH_DISABLE_NOTICE"] = "true"

HPC_BASE = "https://api.hpc.tools/v1/public"
HDX_BASE = "https://hapi.humdata.org/api/v2"
APP_ID = base64.b64encode(b"CrisisTopography:pa636132@ucf.edu").decode()
YEARS = range(2022, 2027)

# Vector search resource names
VS_ENDPOINT = "crisis-rag-endpoint"
VS_INDEX = "workspace.default.project_embeddings_index"
VS_SOURCE_TABLE = "workspace.default.project_embeddings"

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 1: Pull All Plans (2022-2026)

# COMMAND ----------

all_plans = []
for y in YEARS:
    print(f"Fetching plans for {y}...")
    try:
        resp = requests.get(f"{HPC_BASE}/plan/year/{y}", timeout=30)
        if resp.ok:
            for p in resp.json().get("data", []):
                locations = p.get("locations", [])
                iso3 = ""
                country = ""
                if locations:
                    loc = locations[0] if isinstance(locations[0], dict) else {}
                    iso3 = loc.get("iso3", "") or ""
                    country = loc.get("name", "") or ""

                if not iso3:
                    name = p.get("planVersion", {}).get("name", "") or ""
                    match = re.match(r"^(.+?)\s*\d{4}", name)
                    if match:
                        country = match.group(1).strip().rstrip(" -:")

                all_plans.append({
                    "plan_id": p["id"],
                    "year": y,
                    "iso3": iso3.upper(),
                    "country_name": country,
                })
            print(f"  -> {len([x for x in all_plans if x['year'] == y])} plans")
    except Exception as e:
        print(f"  -> Error: {e}")
    time.sleep(0.5)

plans_df = pd.DataFrame(all_plans)
print(f"\nTotal plans: {len(plans_df)}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 2: Pull Project-Level Data for Every Plan

# COMMAND ----------

from concurrent.futures import ThreadPoolExecutor, as_completed

all_projects = []
plan_rows = plans_df.to_dict("records")

def _fetch_plan_projects(plan):
    """Fetch all projects for a single plan. Returns list of project dicts."""
    pid = plan["plan_id"]
    results = []
    try:
        resp = requests.get(f"{HPC_BASE}/project/plan/{pid}", timeout=30)
        if resp.ok:
            for p in resp.json().get("data", []):
                code = p.get("code", "") or ""
                iso3_from_code = ""
                if len(code) >= 4 and code[1:4].isalpha():
                    iso3_from_code = code[1:4].upper()

                iso3 = iso3_from_code or plan["iso3"]

                clusters = p.get("globalClusters", [])
                sectors = p.get("sectors", [])

                cur_funds = float(p.get("currentRequestedFunds", 0) or 0)
                orig_funds = float(p.get("origRequestedFunds", 0) or 0)

                results.append({
                    "project_code": code,
                    "project_name": (p.get("name", "") or "")[:300],
                    "plan_id": pid,
                    "iso3": iso3,
                    "country_name": plan["country_name"],
                    "year": plan["year"],
                    "cluster": clusters[0].get("name", "Unknown") if clusters else "Unknown",
                    "sector": sectors[0].get("name", "") if sectors else "",
                    "requested_funds": cur_funds,
                    "orig_requested_funds": orig_funds,
                    "description": (p.get("description", "") or "")[:500],
                    "objectives": (p.get("objectives", "") or "")[:500],
                })
    except Exception:
        pass
    return results

# Fetch projects concurrently (10 threads keeps us polite to the API)
with ThreadPoolExecutor(max_workers=10) as executor:
    futures = {executor.submit(_fetch_plan_projects, plan): plan for plan in plan_rows}
    done = 0
    for future in as_completed(futures):
        done += 1
        projects = future.result()
        all_projects.extend(projects)
        if done % 50 == 0 or done == len(plan_rows):
            print(f"  [{done}/{len(plan_rows)}] plans fetched, {len(all_projects)} projects so far")

print(f"Total projects collected: {len(all_projects)}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 3: Pull Targeted Beneficiaries from HDX HAPI
# MAGIC The HPC project API does not expose per-project beneficiary counts.
# MAGIC Pull country-level targeted beneficiaries (TGT) and allocate to each project
# MAGIC proportionally based on its share of the country-year budget.

# COMMAND ----------

all_tgt = []
offset = 0
PAGE = 10000

while True:
    print(f"Fetching targeted beneficiaries (offset={offset})...")
    try:
        resp = requests.get(
            f"{HDX_BASE}/affected-people/humanitarian-needs",
            params={
                "app_identifier": APP_ID,
                "limit": PAGE,
                "offset": offset,
                "reference_period_start_min": "2022-01-01",
                "population_status": "TGT",
                "admin_level": 0,
            },
            timeout=60,
        )
        if not resp.ok:
            print(f"  -> HTTP {resp.status_code}")
            break
        data = resp.json().get("data", [])
        if not data:
            print("  -> Done.")
            break
        all_tgt.extend(data)
        print(f"  -> {len(data)} records (total: {len(all_tgt)})")
        offset += PAGE
    except Exception as e:
        print(f"  -> Error: {e}")
        break
    time.sleep(0.3)

tgt_raw = pd.DataFrame(all_tgt) if all_tgt else pd.DataFrame()
print(f"\nTotal TGT records: {len(tgt_raw)}")

# COMMAND ----------

# MAGIC %md
# MAGIC ### Aggregate TGT to country-year and allocate to projects

# COMMAND ----------

projects_df = pd.DataFrame(all_projects)
projects_df["requested_funds"] = pd.to_numeric(projects_df["requested_funds"], errors="coerce").fillna(0)

# Filter to projects with budget
projects_df = projects_df[projects_df["requested_funds"] > 0].copy()
projects_df["year"] = projects_df["year"].astype(int)
projects_df["iso3"] = projects_df["iso3"].str.strip().str.upper()
print(f"Projects with budget > 0: {len(projects_df)}")
print(f"Project ISO3 samples: {sorted(projects_df['iso3'].unique())[:20]}")
print(f"Project year dtype: {projects_df['year'].dtype}")

# --- Sector-level TGT allocation ---
# Map HDX HAPI sector names to HPC global cluster names so we can join
# sector-level beneficiary data to projects by their humanitarian cluster.
SECTOR_TO_CLUSTER = {
    "Health": "Health",
    "Food Security": "Food Security",
    "Food Security & Livelihoods": "Food Security",
    "Water Sanitation Hygiene": "Water Sanitation Hygiene",
    "Water, Sanitation and Hygiene": "Water Sanitation Hygiene",
    "WASH": "Water Sanitation Hygiene",
    "Protection": "Protection",
    "Shelter/NFI": "Emergency Shelter and NFI",
    "Shelter and Non-Food Items": "Emergency Shelter and NFI",
    "Emergency Shelter and NFI": "Emergency Shelter and NFI",
    "Nutrition": "Nutrition",
    "Education": "Education",
    "Camp Coordination / Management": "Camp Coordination and Camp Management",
    "Camp Coordination and Camp Management": "Camp Coordination and Camp Management",
    "Early Recovery": "Early Recovery",
    "Logistics": "Logistics",
    "Emergency Telecommunications": "Emergency Telecommunications",
    "Multi-Sector": "Multi-Sector",
    "Coordination": "Coordination and Common Services",
    "Coordination and Common Services": "Coordination and Common Services",
}

if len(tgt_raw) > 0:
    tgt_raw["reference_period_start"] = pd.to_datetime(
        tgt_raw["reference_period_start"], errors="coerce"
    )
    tgt_raw["year"] = tgt_raw["reference_period_start"].dt.year.astype("Int64")
    tgt_raw["population"] = pd.to_numeric(tgt_raw["population"], errors="coerce")
    tgt_raw = tgt_raw[tgt_raw["year"].between(2022, 2026)].copy()

    # Split into sector-level rows and Intersectoral (country-level fallback)
    has_sector = "sector_name" in tgt_raw.columns
    if has_sector:
        inter_mask = tgt_raw["sector_name"].str.contains("Intersector", case=False, na=False)
        sector_tgt = tgt_raw[~inter_mask].copy()
        inter_tgt = tgt_raw[inter_mask].copy()
    else:
        sector_tgt = pd.DataFrame()
        inter_tgt = tgt_raw.copy()

    # --- Sector-level aggregation ---
    if len(sector_tgt) > 0:
        sector_tgt["cluster"] = sector_tgt["sector_name"].map(SECTOR_TO_CLUSTER)
        sector_tgt = sector_tgt.dropna(subset=["cluster"])
        sector_agg = (
            sector_tgt.groupby(["location_code", "year", "cluster"])
            .agg(sector_tgt=("population", "sum"))
            .reset_index()
        )
        sector_agg = sector_agg.rename(columns={"location_code": "iso3"})
        sector_agg["iso3"] = sector_agg["iso3"].str.strip().str.upper()
        sector_agg["year"] = sector_agg["year"].astype(int)
        print(f"Sector-level TGT: {len(sector_agg)} iso3-year-cluster rows")
    else:
        sector_agg = pd.DataFrame(columns=["iso3", "year", "cluster", "sector_tgt"])

    # --- Country-level fallback from Intersectoral ---
    if len(inter_tgt) > 0:
        country_tgt = (
            inter_tgt.groupby(["location_code", "year"])
            .agg(country_tgt=("population", "sum"))
            .reset_index()
        )
        country_tgt = country_tgt.rename(columns={"location_code": "iso3"})
        country_tgt["iso3"] = country_tgt["iso3"].str.strip().str.upper()
        country_tgt["year"] = country_tgt["year"].astype(int)
    else:
        country_tgt = pd.DataFrame(columns=["iso3", "year", "country_tgt"])

    print(f"Country-level TGT fallback: {len(country_tgt)} country-year rows")
else:
    sector_agg = pd.DataFrame(columns=["iso3", "year", "cluster", "sector_tgt"])
    country_tgt = pd.DataFrame(columns=["iso3", "year", "country_tgt"])
    print("No TGT data available")

# --- Budget share computation per sector within each country-year ---
# Each project's share of its cluster's budget in the same country-year
cluster_budget = (
    projects_df.groupby(["iso3", "year", "cluster"])["requested_funds"]
    .sum()
    .reset_index()
    .rename(columns={"requested_funds": "cluster_year_budget"})
)
projects_df = projects_df.merge(cluster_budget, on=["iso3", "year", "cluster"], how="left")
projects_df["cluster_budget_share"] = (
    projects_df["requested_funds"] / projects_df["cluster_year_budget"]
)

# Country-level budget share (fallback for unmatched sectors)
country_yr_budget = (
    projects_df.groupby(["iso3", "year"])["requested_funds"]
    .sum()
    .reset_index()
    .rename(columns={"requested_funds": "country_year_budget"})
)
projects_df = projects_df.merge(country_yr_budget, on=["iso3", "year"], how="left")
projects_df["budget_share"] = projects_df["requested_funds"] / projects_df["country_year_budget"]

# --- Join sector TGT to projects by (iso3, year, cluster) ---
projects_df = projects_df.merge(sector_agg, on=["iso3", "year", "cluster"], how="left")
projects_df = projects_df.merge(country_tgt, on=["iso3", "year"], how="left")

# Allocate: prefer sector-level, fall back to country-level
projects_df["target_beneficiaries"] = np.where(
    projects_df["sector_tgt"].notna() & (projects_df["sector_tgt"] > 0),
    (projects_df["sector_tgt"] * projects_df["cluster_budget_share"]).round(0),
    (projects_df["country_tgt"].fillna(0) * projects_df["budget_share"]).round(0),
)

# Budget revision ratio: how much was the budget revised from original request
projects_df["budget_revision_ratio"] = np.where(
    projects_df["orig_requested_funds"] > 0,
    projects_df["requested_funds"] / projects_df["orig_requested_funds"],
    1.0,
)

# Keep projects that received beneficiary allocation
valid = projects_df[projects_df["target_beneficiaries"] > 0].copy()
sector_matched = valid["sector_tgt"].notna().sum()
print(f"Projects with allocated beneficiaries: {len(valid)} / {len(projects_df)}")
print(f"  Sector-matched: {sector_matched}, Country-fallback: {len(valid) - sector_matched}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 4: Compute B2B Ratios and Cost Per Beneficiary

# COMMAND ----------

valid["b2b_ratio"] = valid["target_beneficiaries"] / valid["requested_funds"]
valid["cost_per_beneficiary"] = valid["requested_funds"] / valid["target_beneficiaries"]

# Budget z-score within each cluster (how unusual is this project's budget?)
cluster_stats = valid.groupby("cluster")["requested_funds"].agg(["mean", "std"]).reset_index()
cluster_stats.columns = ["cluster", "cluster_mean_budget", "cluster_std_budget"]
valid = valid.merge(cluster_stats, on="cluster", how="left")
valid["budget_zscore"] = np.where(
    valid["cluster_std_budget"] > 0,
    (valid["requested_funds"] - valid["cluster_mean_budget"]) / valid["cluster_std_budget"],
    0.0,
)
valid = valid.drop(columns=["cluster_mean_budget", "cluster_std_budget"])

print(f"B2B ratio stats:")
print(valid["b2b_ratio"].describe())
print(f"\nCost per beneficiary stats:")
print(valid["cost_per_beneficiary"].describe())

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 5: Per-Cluster Percentiles and Outlier Flags

# COMMAND ----------

# Compute per-cluster B2B percentile and median
cluster_medians = valid.groupby("cluster")["b2b_ratio"].median().reset_index()
cluster_medians.columns = ["cluster", "cluster_median_b2b"]

valid = valid.merge(cluster_medians, on="cluster", how="left")

# Percentile rank within cluster
valid["b2b_percentile"] = valid.groupby("cluster")["b2b_ratio"].rank(pct=True)

# Outlier: below 10th or above 90th percentile within cluster
valid["is_outlier"] = (valid["b2b_percentile"] < 0.10) | (valid["b2b_percentile"] > 0.90)

print(f"Percentile outlier projects: {valid['is_outlier'].sum()} / {len(valid)} "
      f"({valid['is_outlier'].mean()*100:.1f}%)")
print(f"Unique clusters: {valid['cluster'].nunique()}")

# --- IsolationForest anomaly detection ---
# Uses B2B-aware features to flag genuinely unusual projects
from sklearn.ensemble import IsolationForest

anomaly_features = ["b2b_ratio", "cost_per_beneficiary", "budget_zscore", "budget_revision_ratio"]
X = valid[anomaly_features].copy()
X = X.fillna(0).replace([np.inf, -np.inf], 0)

iso_forest = IsolationForest(
    n_estimators=200,
    contamination=0.10,
    random_state=42,
)
iso_forest.fit(X)

# decision_function returns negative scores for anomalies; normalize to 0-1
raw_scores = iso_forest.decision_function(X)
valid["anomaly_score"] = 1 - (raw_scores - raw_scores.min()) / (raw_scores.max() - raw_scores.min() + 1e-10)

# Update is_outlier to combine percentile and IsolationForest signals
iso_labels = iso_forest.predict(X)  # -1 = anomaly, 1 = normal
valid["is_outlier"] = valid["is_outlier"] | (iso_labels == -1)

print(f"IsolationForest anomalies: {(iso_labels == -1).sum()} / {len(valid)} "
      f"({(iso_labels == -1).mean()*100:.1f}%)")
print(f"Combined outliers: {valid['is_outlier'].sum()} / {len(valid)} "
      f"({valid['is_outlier'].mean()*100:.1f}%)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 6: Build Text Blobs for Embedding

# COMMAND ----------

# Build a rich text representation for each project (used by Vector Search)
valid["text_blob"] = (
    valid["project_name"].fillna("") + " | " +
    valid["cluster"].fillna("") + " | " +
    valid["sector"].fillna("") + " | " +
    valid["description"].fillna("") + " | " +
    valid["country_name"].fillna("") + " | " +
    valid["year"].astype(str) + " | " +
    "Budget: $" + valid["requested_funds"].apply(lambda x: f"{x:,.0f}") + " | " +
    "Beneficiaries: " + valid["target_beneficiaries"].apply(lambda x: f"{x:,.0f}") + " | " +
    "B2B ratio: " + valid["b2b_ratio"].apply(lambda x: f"{x:.4f}") + " | " +
    "Cost per person: $" + valid["cost_per_beneficiary"].apply(lambda x: f"{x:.2f}")
)

# Truncate to avoid excessively long text
valid["text_blob"] = valid["text_blob"].str[:2000]

print(f"Sample text_blob:\n{valid.iloc[0]['text_blob'][:300]}...")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 7: Create Primary Key and Write Delta Table

# COMMAND ----------

# Create unique project_id
valid["project_id"] = valid["project_code"] + "_" + valid["year"].astype(str)

# De-duplicate on project_id (same project code can appear in multiple plans)
valid = valid.drop_duplicates(subset="project_id", keep="first")

# Select output columns
output_columns = [
    "project_id", "project_code", "project_name",
    "iso3", "country_name", "year",
    "cluster", "sector",
    "requested_funds", "orig_requested_funds", "target_beneficiaries",
    "b2b_ratio", "cost_per_beneficiary",
    "budget_zscore", "budget_revision_ratio", "anomaly_score",
    "b2b_percentile", "is_outlier", "cluster_median_b2b",
    "description", "objectives", "text_blob",
]

output_df = valid[[c for c in output_columns if c in valid.columns]]

# Write to Delta
embeddings_sdf = spark.createDataFrame(output_df)
embeddings_sdf.write.format("delta").mode("overwrite").option("overwriteSchema", "true").saveAsTable(VS_SOURCE_TABLE)

row_count = embeddings_sdf.count()
print(f"Wrote {row_count} rows to {VS_SOURCE_TABLE}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 8: Enable Change Data Feed (required for Vector Search Delta Sync)

# COMMAND ----------

spark.sql(f"ALTER TABLE {VS_SOURCE_TABLE} SET TBLPROPERTIES (delta.enableChangeDataFeed = true)")
print(f"Enabled Change Data Feed on {VS_SOURCE_TABLE}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 9: Create Vector Search Index
# MAGIC Idempotent: tears down existing index/endpoint before recreating.
# MAGIC Uses Databricks managed embeddings (databricks-bge-large-en) — no GPU needed.

# COMMAND ----------

from databricks.vector_search.client import VectorSearchClient
import time as _time

vsc = VectorSearchClient()

# --- Teardown existing resources ---
# Delete existing index first (index depends on endpoint)
try:
    vsc.delete_index(VS_ENDPOINT, VS_INDEX)
    print(f"Deleted existing index: {VS_INDEX}")
    _time.sleep(5)
except Exception as e:
    if "not found" not in str(e).lower() and "does not exist" not in str(e).lower():
        print(f"Index delete note: {e}")

# Create endpoint (skip if exists)
try:
    vsc.create_endpoint(name=VS_ENDPOINT)
    print(f"Created endpoint: {VS_ENDPOINT}")
except Exception as e:
    if "already exists" in str(e).lower():
        print(f"Endpoint {VS_ENDPOINT} already exists, reusing.")
    else:
        print(f"Endpoint error: {e}")

# COMMAND ----------

# MAGIC %md
# MAGIC ### Wait for endpoint to come online

# COMMAND ----------

# Poll endpoint status until ONLINE
for attempt in range(30):
    try:
        ep = vsc.get_endpoint(VS_ENDPOINT)
        state = ep.get("endpoint_status", {}).get("state", "UNKNOWN")
        print(f"  Endpoint state: {state} (attempt {attempt+1}/30)")
        if state == "ONLINE":
            break
    except Exception as e:
        print(f"  Endpoint check error: {e}")
    _time.sleep(20)
else:
    print("WARNING: Endpoint did not reach ONLINE state within 10 minutes")

# COMMAND ----------

# MAGIC %md
# MAGIC ### Create Delta Sync index

# COMMAND ----------

# Columns to sync to the vector index (all the metadata the backend needs)
SYNC_COLUMNS = [
    "project_id", "project_code", "project_name",
    "iso3", "country_name", "cluster",
    "b2b_ratio", "cost_per_beneficiary", "anomaly_score", "text_blob",
]

try:
    vsc.create_delta_sync_index(
        endpoint_name=VS_ENDPOINT,
        index_name=VS_INDEX,
        source_table_name=VS_SOURCE_TABLE,
        pipeline_type="TRIGGERED",
        primary_key="project_id",
        embedding_source_column="text_blob",
        embedding_model_endpoint_name="databricks-bge-large-en",
        columns_to_sync=SYNC_COLUMNS,
    )
    print(f"Created vector search index: {VS_INDEX}")
except Exception as e:
    if "already exists" in str(e).lower():
        print(f"Index {VS_INDEX} already exists.")
    else:
        print(f"Index creation error: {e}")
        print("Try: databricks-gte-large-en or system.ai.databricks-bge-large-en")

# COMMAND ----------

# MAGIC %md
# MAGIC ### Wait for index to sync

# COMMAND ----------

# Poll index status
for attempt in range(30):
    try:
        idx = vsc.get_index(VS_ENDPOINT, VS_INDEX)
        status = idx.describe()
        state = status.get("status", {}).get("detailed_state", "UNKNOWN")
        ready = status.get("status", {}).get("ready", False)
        print(f"  Index state: {state}, ready: {ready} (attempt {attempt+1}/30)")
        if ready:
            print("Index is ready.")
            break
    except Exception as e:
        print(f"  Index check error: {e}")
    _time.sleep(20)
else:
    print("WARNING: Index did not reach ready state within 10 minutes")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 10: Test Vector Search

# COMMAND ----------

try:
    index = vsc.get_index(VS_ENDPOINT, VS_INDEX)
    results = index.similarity_search(
        query_text="Health projects in East Africa with high cost per beneficiary",
        columns=["project_id", "project_code", "iso3", "cluster", "b2b_ratio", "cost_per_beneficiary"],
        num_results=5,
    )
    print("Vector search test results:")
    for r in results.get("result", {}).get("data_array", []):
        print(f"  {r}")
except Exception as e:
    print(f"Vector search test error (index may still be syncing): {e}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Verification

# COMMAND ----------

pe = spark.table(VS_SOURCE_TABLE).toPandas()
print(f"Total rows: {len(pe)}")
print(f"Countries: {pe['iso3'].nunique()}")
print(f"Year range: {pe['year'].min()} - {pe['year'].max()}")
print(f"Clusters: {pe['cluster'].nunique()}")
print(f"\nOutlier distribution:")
print(pe["is_outlier"].value_counts())
print(f"\nB2B ratio stats:")
print(pe["b2b_ratio"].describe())
print(f"\nTop 10 highest cost per beneficiary:")
display(
    spark.createDataFrame(
        pe.nlargest(10, "cost_per_beneficiary")[
            ["project_code", "iso3", "cluster", "requested_funds",
             "target_beneficiaries", "cost_per_beneficiary", "b2b_ratio", "is_outlier"]
        ]
    )
)
