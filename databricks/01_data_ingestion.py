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
# MAGIC ## 1. Ingest HRP Plans (2020-2025)

# COMMAND ----------

all_plans = []
for year in range(2020, 2026):
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
# MAGIC ## 2. Ingest Funding Flows by Country (2020-2025)

# COMMAND ----------

all_flows = []
for year in range(2020, 2026):
    print(f"Fetching funding flows for {year}...")
    resp = requests.get(
        f"{HPC_BASE}/fts/flow",
        params={"year": year, "groupby": "country"},
        timeout=30
    )
    if resp.ok:
        data = resp.json().get("data", {})
        report3 = data.get("report3", {})
        rows = report3.get("rows", [])
        for row in rows:
            row["year"] = year
            all_flows.append(row)
        print(f"  -> {len(rows)} country-flow rows")
    else:
        print(f"  -> Failed: {resp.status_code}")
    time.sleep(0.5)

print(f"\nTotal flow rows collected: {len(all_flows)}")

# COMMAND ----------

if all_flows:
    # Flatten nested structures if present
    flows_records = []
    for f in all_flows:
        record = {
            "year": f.get("year"),
            "totalFunding": f.get("totalFunding", 0),
            "totalRequirements": 0,
            "country_name": "",
            "country_iso3": "",
        }
        # Extract destination country info from directionalInfo or top-level
        if "directionalInfo" in f:
            for direction in f["directionalInfo"]:
                if "country" in direction:
                    record["country_name"] = direction["country"].get("name", "")
                    record["country_iso3"] = direction["country"].get("iso3", "")
        elif "name" in f:
            record["country_name"] = f.get("name", "")
            record["country_iso3"] = f.get("id", "")
            record["totalFunding"] = f.get("totalFunding", 0)
            record["totalRequirements"] = f.get("totalRequirements", 0)

        flows_records.append(record)

    flows_pdf = pd.DataFrame(flows_records)
    flows_sdf = spark.createDataFrame(flows_pdf)
    flows_sdf.write.format("delta").mode("overwrite").saveAsTable("workspace.default.funding_flows")
    print(f"Wrote {flows_sdf.count()} rows to workspace.default.funding_flows")
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
