# Databricks notebook source

# COMMAND ----------

# MAGIC %md
# MAGIC # 01 - Data Ingestion
# MAGIC Pulls data from HPC Tools API v1 and HDX HAPI v2, writes to Delta tables.
# MAGIC
# MAGIC **Tables created:**
# MAGIC - `workspace.default.plans`
# MAGIC - `workspace.default.funding_flows`
# MAGIC - `workspace.default.humanitarian_needs`
# MAGIC - `workspace.default.population`

# COMMAND ----------

import requests
import pandas as pd
import base64
import time

HPC_BASE = "https://api.hpc.tools/v1/public"
HDX_BASE = "https://hapi.humdata.org/api/v2"
APP_ID = base64.b64encode(b"CrisisTopography:team@hacklytics.org").decode()

# COMMAND ----------

# MAGIC %md
# MAGIC ## 1. Ingest HRP Plans (2020-2026)

# COMMAND ----------

all_plans = []
for year in range(2020, 2027):
    print(f"Fetching plans for {year}...")
    resp = requests.get(f"{HPC_BASE}/plan/year/{year}", timeout=30)
    if resp.ok:
        plans = resp.json().get("data", [])
        for p in plans:
            all_plans.append({
                "id": p.get("id"),
                "planVersion": p.get("planVersion", {}).get("id"),
                "name": p.get("planVersion", {}).get("name", ""),
                "year": year,
                "revisedRequirements": p.get("revisedRequirements", 0),
                "totalFunding": p.get("totalFunding", 0),
                "categories": str(p.get("categories", [])),
            })
        print(f"  -> {len(plans)} plans found")
    else:
        print(f"  -> Failed: {resp.status_code}")
    time.sleep(0.5)

print(f"\nTotal plans collected: {len(all_plans)}")

# COMMAND ----------

plans_pdf = pd.DataFrame(all_plans)
plans_sdf = spark.createDataFrame(plans_pdf)
plans_sdf.write.format("delta").mode("overwrite").saveAsTable("workspace.default.plans")
print(f"Wrote {plans_sdf.count()} rows to workspace.default.plans")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 2. Ingest Funding Flows by Country (2020-2026)
# MAGIC
# MAGIC The HPC FTS flow API returns funding data under `data.report1.fundingTotals.objects`
# MAGIC when grouped by country. Each object has `name`, `id`, and `totalFunding`.

# COMMAND ----------

all_flows = []
for year in range(2020, 2027):
    print(f"Fetching funding flows for {year}...")
    resp = requests.get(
        f"{HPC_BASE}/fts/flow",
        params={"year": year, "groupby": "country"},
        timeout=30
    )
    if resp.ok:
        data = resp.json().get("data", {})
        # Funding data is in report1.fundingTotals.objects (not report3)
        report = data.get("report1", {})
        funding_totals = report.get("fundingTotals", {})
        objects = funding_totals.get("objects", [])
        for obj in objects:
            all_flows.append({
                "year": year,
                "country_name": obj.get("name", ""),
                "country_id": str(obj.get("id", "")),
                "totalFunding": obj.get("totalFunding", 0),
                "type": obj.get("type", ""),
                "direction": obj.get("direction", ""),
            })
        print(f"  -> {len(objects)} country-flow rows")
    else:
        print(f"  -> Failed: {resp.status_code}")
    time.sleep(0.5)

print(f"\nTotal flow rows collected: {len(all_flows)}")

# COMMAND ----------

if all_flows:
    flows_pdf = pd.DataFrame(all_flows)
    flows_sdf = spark.createDataFrame(flows_pdf)
    flows_sdf.write.format("delta").mode("overwrite").saveAsTable("workspace.default.funding_flows")
    print(f"Wrote {flows_sdf.count()} rows to workspace.default.funding_flows")
    display(flows_sdf.limit(10))
else:
    print("No flow data to write")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 3. Ingest Humanitarian Needs from HDX HAPI

# COMMAND ----------

all_needs = []
offset = 0
page_limit = 1000

while True:
    print(f"Fetching humanitarian needs (offset={offset})...")
    resp = requests.get(
        f"{HDX_BASE}/affected-people/humanitarian-needs",
        params={
            "app_identifier": APP_ID,
            "limit": page_limit,
            "offset": offset
        },
        timeout=60
    )
    if not resp.ok:
        print(f"  -> Failed: {resp.status_code}")
        break

    data = resp.json().get("data", [])
    if not data:
        print("  -> No more data, done.")
        break

    all_needs.extend(data)
    print(f"  -> Got {len(data)} records (total: {len(all_needs)})")
    offset += page_limit
    time.sleep(0.3)

print(f"\nTotal humanitarian needs records: {len(all_needs)}")

# COMMAND ----------

if all_needs:
    needs_pdf = pd.DataFrame(all_needs)
    needs_sdf = spark.createDataFrame(needs_pdf)
    needs_sdf.write.format("delta").mode("overwrite").saveAsTable("workspace.default.humanitarian_needs")
    print(f"Wrote {needs_sdf.count()} rows to workspace.default.humanitarian_needs")
else:
    print("No needs data to write")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 4. Ingest Population Baselines from HDX HAPI

# COMMAND ----------

all_pop = []
offset = 0

while True:
    print(f"Fetching population data (offset={offset})...")
    resp = requests.get(
        f"{HDX_BASE}/population-social/population",
        params={
            "app_identifier": APP_ID,
            "limit": 1000,
            "offset": offset
        },
        timeout=60
    )
    if not resp.ok:
        print(f"  -> Failed: {resp.status_code}")
        break

    data = resp.json().get("data", [])
    if not data:
        print("  -> No more data, done.")
        break

    all_pop.extend(data)
    print(f"  -> Got {len(data)} records (total: {len(all_pop)})")
    offset += 1000
    time.sleep(0.3)

print(f"\nTotal population records: {len(all_pop)}")

# COMMAND ----------

if all_pop:
    pop_pdf = pd.DataFrame(all_pop)
    pop_sdf = spark.createDataFrame(pop_pdf)
    pop_sdf.write.format("delta").mode("overwrite").saveAsTable("workspace.default.population")
    print(f"Wrote {pop_sdf.count()} rows to workspace.default.population")
else:
    print("No population data to write")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Summary
# MAGIC Run the cells below to verify all tables were created.

# COMMAND ----------

for table in ["plans", "funding_flows", "humanitarian_needs", "population"]:
    try:
        count = spark.table(f"workspace.default.{table}").count()
        print(f"workspace.default.{table}: {count} rows")
    except Exception as e:
        print(f"workspace.default.{table}: ERROR - {e}")
