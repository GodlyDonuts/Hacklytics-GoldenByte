# Databricks notebook source

# COMMAND ----------

# MAGIC %md
# MAGIC # 03 - Project-Level Anomaly Detection
# MAGIC Uses Isolation Forest to flag projects with abnormal budgets within their cluster.
# MAGIC
# MAGIC The HPC API does not populate `targetBeneficiaries` in project data, so anomaly
# MAGIC detection uses budget magnitude and per-cluster z-scores instead.
# MAGIC
# MAGIC **Reads:** `workspace.default.plans` (to get plan IDs), HPC API (project details)
# MAGIC **Writes:** `workspace.default.project_anomalies`

# COMMAND ----------

import requests
import pandas as pd
import numpy as np
import time
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

HPC_BASE = "https://api.hpc.tools/v1/public"

# COMMAND ----------

# MAGIC %md
# MAGIC ## 1. Fetch Project Data from HPC API
# MAGIC Each plan (HRP) contains multiple projects. We fetch project-level budget data.

# COMMAND ----------

# Get plan IDs from our ingested data
plan_rows = spark.table("workspace.default.plans").select("id", "year", "name").collect()
print(f"Fetching projects for {len(plan_rows)} plans...")

all_projects = []
for i, row in enumerate(plan_rows):
    plan_id = row["id"]
    print(f"  [{i+1}/{len(plan_rows)}] Plan {plan_id} ({row['name'][:50]})")

    try:
        resp = requests.get(f"{HPC_BASE}/project/plan/{plan_id}", timeout=30)
        if resp.ok:
            projects = resp.json().get("data", [])
            for p in projects:
                locations = p.get("locations", [])
                clusters = p.get("globalClusters", [])
                all_projects.append({
                    "projectCode": p.get("code", ""),
                    "projectName": (p.get("name", "") or "")[:200],
                    "planId": plan_id,
                    "planYear": row["year"],
                    "budget": p.get("currentRequestedFunds", 0) or 0,
                    "origBudget": p.get("origRequestedFunds", 0) or 0,
                    "cluster": clusters[0].get("name", "Unknown") if clusters else "Unknown",
                    "countryISO3": locations[0].get("iso3", "") if locations else "",
                    "countryName": locations[0].get("name", "") if locations else "",
                })
            print(f"    -> {len(projects)} projects")
        else:
            print(f"    -> HTTP {resp.status_code}")
    except Exception as e:
        print(f"    -> Error: {e}")

    time.sleep(0.3)

print(f"\nTotal projects collected: {len(all_projects)}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 2. Prepare Features and Filter Valid Projects

# COMMAND ----------

projects_pdf = pd.DataFrame(all_projects)

# API returns budget as strings -- coerce to numeric
projects_pdf["budget"] = pd.to_numeric(projects_pdf["budget"], errors="coerce").fillna(0)
projects_pdf["origBudget"] = pd.to_numeric(projects_pdf["origBudget"], errors="coerce").fillna(0)

# Filter to projects with a budget > 0
valid = projects_pdf[projects_pdf["budget"] > 0].copy()

# Compute budget revision ratio (how much the budget changed from original request)
valid["budget_revision_ratio"] = np.where(
    valid["origBudget"] > 0,
    valid["budget"] / valid["origBudget"],
    1.0
)

# Compute per-cluster z-score for budget
cluster_stats = valid.groupby("cluster")["budget"].agg(["mean", "std"]).reset_index()
cluster_stats.columns = ["cluster", "cluster_mean", "cluster_std"]
valid = valid.merge(cluster_stats, on="cluster", how="left")

valid["budget_zscore"] = np.where(
    valid["cluster_std"] > 0,
    (valid["budget"] - valid["cluster_mean"]) / valid["cluster_std"],
    0.0
)

print(f"Valid projects (budget > 0): {len(valid)} / {len(projects_pdf)}")
print(f"Unique clusters: {valid['cluster'].nunique()}")
print(f"\nBudget stats:")
print(valid["budget"].describe())

# COMMAND ----------

# MAGIC %md
# MAGIC ## 3. Isolation Forest Anomaly Detection
# MAGIC Uses budget magnitude, budget z-score within cluster, and budget revision ratio
# MAGIC to identify unusual projects.

# COMMAND ----------

feature_cols = ["budget", "budget_zscore", "budget_revision_ratio"]
features = valid[feature_cols].values

scaler = StandardScaler()
features_scaled = scaler.fit_transform(features)

model = IsolationForest(
    contamination=0.1,  # expect ~10% anomalies
    random_state=42,
    n_estimators=200
)

valid["anomaly_label"] = model.fit_predict(features_scaled)
# decision_function: lower = more anomalous; negate so higher = more anomalous
valid["anomaly_score"] = -model.decision_function(features_scaled)

# Normalize anomaly_score to 0-1 range
score_min = valid["anomaly_score"].min()
score_max = valid["anomaly_score"].max()
if score_max > score_min:
    valid["anomaly_score"] = (valid["anomaly_score"] - score_min) / (score_max - score_min)
else:
    valid["anomaly_score"] = 0.0

anomalies = valid[valid["anomaly_label"] == -1]
print(f"Anomalies detected: {len(anomalies)} / {len(valid)} ({len(anomalies)/len(valid)*100:.1f}%)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 4. Write Results

# COMMAND ----------

# Drop intermediate columns before writing to Delta
output_cols = [
    "projectCode", "projectName", "planId", "planYear", "budget", "origBudget",
    "cluster", "countryISO3", "countryName", "budget_revision_ratio",
    "budget_zscore", "anomaly_label", "anomaly_score"
]
output_pdf = valid[output_cols]

results_sdf = spark.createDataFrame(output_pdf)
results_sdf.write.format("delta").mode("overwrite").saveAsTable("workspace.default.project_anomalies")
print(f"Wrote {results_sdf.count()} rows to workspace.default.project_anomalies")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 5. Preview Top Anomalies

# COMMAND ----------

# Show the most anomalous projects
print("Top 20 anomalous projects:")
top_anomalies = valid.nlargest(20, "anomaly_score")[
    ["projectCode", "countryName", "cluster", "budget",
     "budget_zscore", "anomaly_score", "planYear"]
]
display(spark.createDataFrame(top_anomalies))
