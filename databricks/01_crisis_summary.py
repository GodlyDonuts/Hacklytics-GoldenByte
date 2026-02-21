# Databricks notebook source

# COMMAND ----------

# MAGIC %md
# MAGIC # 01 - Crisis Summary (Refactored)
# MAGIC Builds `workspace.default.crisis_summary` — the single table that drives the globe.
# MAGIC
# MAGIC **Inputs:**
# MAGIC - ACAPS Inform Severity CSV (48 months, Jan 2022 – Dec 2026)
# MAGIC - HDX HAPI Funding (`/coordination-context/funding`)
# MAGIC - HDX HAPI Humanitarian Needs (`/affected-people/humanitarian-needs`)
# MAGIC - HPC Plans + Projects (for B2B ratio aggregates)
# MAGIC
# MAGIC **Output:** `workspace.default.crisis_summary`
# MAGIC — one row per crisis per country per year-month, max 8 crises per country per month.
# MAGIC
# MAGIC **Funding state classification:**
# MAGIC - `NO_HRP` — ACAPS flags a crisis but no HRP appeal exists
# MAGIC - `UNDERFUNDED` — HRP exists but coverage < 50%
# MAGIC - `INEFFICIENT` — HRP funded >= 50% but median B2B below global 25th percentile
# MAGIC - `ADEQUATE` — HRP funded >= 50% and B2B within normal range

# COMMAND ----------

import requests
import pandas as pd
import numpy as np
import base64
import time
import re

HPC_BASE = "https://api.hpc.tools/v1/public"
HDX_BASE = "https://hapi.humdata.org/api/v2"
APP_ID = base64.b64encode(b"CrisisTopography:pa636132@ucf.edu").decode()
YEARS = range(2022, 2027)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 1: Load ACAPS Severity Data (CSV)
# MAGIC The CSV has 48 months of crisis data. This is the spine of the table —
# MAGIC every row in the final output corresponds to one ACAPS crisis entry.

# COMMAND ----------

# In Databricks, the CSV must be uploaded to a DBFS path or Unity Catalog volume.
# Try multiple paths for flexibility.
import os

CSV_PATHS = [
    "/Volumes/workspace/default/hacks/acaps_crises_2022_2026.csv",  # Unity Catalog Volume
    "/Workspace/Users/{user}/acaps_crises_2022_2026.csv",           # Workspace file
    "/dbfs/FileStore/acaps_crises_2022_2026.csv",                   # DBFS FileStore
]

acaps_df = None
try:
    _nb_user = spark.conf.get("spark.databricks.notebook.userName")
except Exception:
    _nb_user = dbutils.notebook.entry_point.getDbutils().notebook().getContext().userName().get()

for path in CSV_PATHS:
    resolved = path.format(user=_nb_user)
    try:
        if resolved.startswith("/dbfs/") or resolved.startswith("/Volumes/"):
            acaps_df = pd.read_csv(resolved)
        else:
            acaps_df = pd.read_csv(resolved)
        print(f"Loaded ACAPS CSV from: {resolved}")
        break
    except Exception as e:
        print(f"  Not found at {resolved}: {e}")
        continue

if acaps_df is None:
    raise FileNotFoundError(
        "ACAPS CSV not found. Upload acaps_crises_2022_2026.csv to one of:\n"
        + "\n".join(f"  - {p}" for p in CSV_PATHS)
    )

print(f"ACAPS rows: {len(acaps_df)}")
print(f"Columns: {list(acaps_df.columns)}")
acaps_df.head()

# COMMAND ----------

# MAGIC %md
# MAGIC ### Normalize ACAPS columns
# MAGIC The CSV may have varying column names. We normalize to a consistent schema.

# COMMAND ----------

import json as _json

# Normalize column names to lowercase with underscores
acaps_df.columns = [c.strip().lower().replace(" ", "_") for c in acaps_df.columns]

print(f"Normalized columns: {list(acaps_df.columns)}")

# --- Parse JSON-array columns ---
# The ACAPS CSV encodes iso3 as '["AFG"]' and country as '["Afghanistan"]'.
# Extract the first element from each JSON array.

def parse_json_array_first(val):
    """Extract first element from a JSON array string like '["AFG"]'."""
    if pd.isna(val):
        return None
    s = str(val).strip()
    if s.startswith("["):
        try:
            arr = _json.loads(s)
            return arr[0] if arr else None
        except (ValueError, IndexError):
            pass
    return s

acaps_df["iso3"] = acaps_df["iso3"].apply(parse_json_array_first)
acaps_df["country"] = acaps_df["country"].apply(parse_json_array_first)

# --- Rename columns to our expected schema ---
COLUMN_MAP = {
    # Severity
    "inform_severity_index": "acaps_severity",
    "inform_severity_score": "acaps_severity",
    "severity": "acaps_severity",
    # Severity category (already classified by ACAPS)
    "inform_severity_category": "severity_class",
    # Country
    "country": "country_name",
    # People in need (ACAPS provides this as a score 0-5, not raw count)
    "people_in_need": "acaps_people_in_need_score",
}

for old, new in COLUMN_MAP.items():
    if old in acaps_df.columns and new not in acaps_df.columns:
        acaps_df = acaps_df.rename(columns={old: new})

# Validate required columns exist
required = ["iso3", "country_name", "crisis_name", "acaps_severity", "crisis_id"]
missing = [c for c in required if c not in acaps_df.columns]
if missing:
    print(f"WARNING: Missing columns after mapping: {missing}")
    print(f"Available: {list(acaps_df.columns)}")

# Ensure year/month columns exist
if "year" not in acaps_df.columns and "_internal_filter_date" in acaps_df.columns:
    acaps_df["_internal_filter_date"] = pd.to_datetime(acaps_df["_internal_filter_date"], errors="coerce")
    acaps_df["year"] = acaps_df["_internal_filter_date"].dt.year
    acaps_df["month"] = acaps_df["_internal_filter_date"].dt.month

acaps_df["year"] = pd.to_numeric(acaps_df["year"], errors="coerce").astype("Int64")
acaps_df["month"] = pd.to_numeric(acaps_df["month"], errors="coerce").astype("Int64")
acaps_df["acaps_severity"] = pd.to_numeric(acaps_df["acaps_severity"], errors="coerce")

# Filter to 2022-2026
acaps_df = acaps_df[acaps_df["year"].between(2022, 2026)].copy()

# Filter to country-level individual entries only.
# Exclude regional aggregates (multi-country rows) AND aggregated summaries
# ("Multiple crises in X" roll-ups that would double-count with individual entries).
before = len(acaps_df)
if "regional_or_country" in acaps_df.columns:
    acaps_df = acaps_df[acaps_df["regional_or_country"].str.strip().str.lower() == "country"].copy()
if "individual_aggregated" in acaps_df.columns:
    acaps_df = acaps_df[acaps_df["individual_aggregated"].str.strip() == "Individual"].copy()
print(f"Filtered to country-level individual crises: {before} -> {len(acaps_df)} rows")

# Use ACAPS severity_class if available, otherwise derive from score
if "severity_class" not in acaps_df.columns:
    def severity_class(score):
        if pd.isna(score):
            return "Unknown"
        if score < 1:
            return "Very Low"
        if score < 2:
            return "Low"
        if score < 3:
            return "Medium"
        if score < 4:
            return "High"
        return "Very High"
    acaps_df["severity_class"] = acaps_df["acaps_severity"].apply(severity_class)

# Drop rows with no severity score (4% null rate)
before = len(acaps_df)
acaps_df = acaps_df.dropna(subset=["acaps_severity"]).copy()
print(f"Dropped rows without severity: {before} -> {len(acaps_df)}")

# Uppercase ISO3
acaps_df["iso3"] = acaps_df["iso3"].str.strip().str.upper()

print(f"ACAPS data after normalization: {len(acaps_df)} rows")
print(f"Years: {sorted(acaps_df['year'].dropna().unique())}")
print(f"Countries: {acaps_df['iso3'].nunique()}")
print(f"Severity range: {acaps_df['acaps_severity'].min():.1f} - {acaps_df['acaps_severity'].max():.1f}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 2: Pull HRP Plans (for plan IDs needed in Step 5)

# COMMAND ----------

all_plans = []
for y in YEARS:
    print(f"Fetching plans for {y}...")
    try:
        resp = requests.get(f"{HPC_BASE}/plan/year/{y}", timeout=30)
        if resp.ok:
            for p in resp.json().get("data", []):
                # Extract country from plan locations or name
                locations = p.get("locations", [])
                iso3 = ""
                country = ""
                if locations:
                    loc = locations[0] if isinstance(locations[0], dict) else {}
                    iso3 = loc.get("iso3", "") or ""
                    country = loc.get("name", "") or ""

                if not iso3:
                    # Parse from plan name: "Country Name YYYY"
                    name = p.get("planVersion", {}).get("name", "") or ""
                    match = re.match(r"^(.+?)\s*\d{4}", name)
                    if match:
                        country = match.group(1).strip().rstrip(" -:")

                all_plans.append({
                    "plan_id": p["id"],
                    "year": y,
                    "iso3": iso3.upper(),
                    "country_name": country,
                    "name": p.get("planVersion", {}).get("name", ""),
                })
            print(f"  -> {len([x for x in all_plans if x['year'] == y])} plans")
    except Exception as e:
        print(f"  -> Error: {e}")
    time.sleep(0.5)

plans_df = pd.DataFrame(all_plans)
print(f"\nTotal plans: {len(plans_df)}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 3: Pull HDX HAPI Funding Data
# MAGIC Uses `/coordination-context/funding` — the replacement for the dead FTS flows endpoint.
# MAGIC Key field: `appeal_type` tells us whether an HRP exists.

# COMMAND ----------

all_funding = []
offset = 0
PAGE = 10000

while True:
    print(f"Fetching funding (offset={offset})...")
    try:
        resp = requests.get(
            f"{HDX_BASE}/coordination-context/funding",
            params={
                "app_identifier": APP_ID,
                "limit": PAGE,
                "offset": offset,
                "reference_period_start_min": "2022-01-01",
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
        all_funding.extend(data)
        print(f"  -> {len(data)} records (total: {len(all_funding)})")
        offset += PAGE
    except Exception as e:
        print(f"  -> Error: {e}")
        break
    time.sleep(0.3)

funding_df = pd.DataFrame(all_funding) if all_funding else pd.DataFrame()
print(f"\nTotal funding records: {len(funding_df)}")
if len(funding_df) > 0:
    print(f"Columns: {list(funding_df.columns)}")

# COMMAND ----------

# MAGIC %md
# MAGIC ### Process funding: extract year, identify HRP appeals, aggregate per country-year

# COMMAND ----------

if len(funding_df) > 0:
    # Extract year from reference_period_start
    funding_df["reference_period_start"] = pd.to_datetime(
        funding_df["reference_period_start"], errors="coerce"
    )
    funding_df["year"] = funding_df["reference_period_start"].dt.year.astype("Int64")

    # Filter to 2022-2026 and cap at current year
    current_year = min(pd.Timestamp.now().year, 2026)
    funding_df = funding_df[
        funding_df["year"].between(2022, current_year)
    ].copy()

    # Coerce numeric columns
    for col in ["funding_usd", "requirements_usd", "funding_pct"]:
        if col in funding_df.columns:
            funding_df[col] = pd.to_numeric(funding_df[col], errors="coerce")

    # Identify HRP appeals per country-year
    # appeal_type contains full names: "Humanitarian response plan",
    # "Humanitarian needs and response plan", etc.
    hrp_mask = funding_df["appeal_type"].str.lower().str.contains("humanitarian", na=False)

    hrp_agg = (
        funding_df[hrp_mask]
        .groupby(["location_code", "year"])
        .agg(
            appeal_code=("appeal_code", "first"),
            appeal_type=("appeal_type", "first"),
            requirements_usd=("requirements_usd", "sum"),
            funding_usd=("funding_usd", "sum"),
        )
        .reset_index()
    )
    hrp_agg["has_hrp"] = True
    hrp_agg["funding_coverage_pct"] = (
        hrp_agg["funding_usd"] / hrp_agg["requirements_usd"].replace(0, np.nan)
    )
    hrp_agg["funding_gap_usd"] = hrp_agg["requirements_usd"] - hrp_agg["funding_usd"]

    # Rename location_code -> iso3 for join
    hrp_agg = hrp_agg.rename(columns={"location_code": "iso3"})
    hrp_agg["iso3"] = hrp_agg["iso3"].str.strip().str.upper()

    print(f"HRP aggregates: {len(hrp_agg)} country-year rows")
    print(f"Years: {sorted(hrp_agg['year'].dropna().unique())}")
else:
    hrp_agg = pd.DataFrame(columns=[
        "iso3", "year", "appeal_code", "appeal_type",
        "requirements_usd", "funding_usd", "has_hrp",
        "funding_coverage_pct", "funding_gap_usd",
    ])

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 4: Pull Humanitarian Needs (people in need per country-year)

# COMMAND ----------

all_needs = []
offset = 0
PAGE = 10000

while True:
    print(f"Fetching humanitarian needs (offset={offset})...")
    try:
        resp = requests.get(
            f"{HDX_BASE}/affected-people/humanitarian-needs",
            params={
                "app_identifier": APP_ID,
                "limit": PAGE,
                "offset": offset,
                "reference_period_start_min": "2022-01-01",
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
        all_needs.extend(data)
        print(f"  -> {len(data)} records (total: {len(all_needs)})")
        offset += PAGE
    except Exception as e:
        print(f"  -> Error: {e}")
        break
    time.sleep(0.3)

needs_raw = pd.DataFrame(all_needs) if all_needs else pd.DataFrame()
print(f"\nTotal humanitarian needs records: {len(needs_raw)}")

# COMMAND ----------

# MAGIC %md
# MAGIC ### De-duplicate needs data
# MAGIC Select Intersectoral rows at the lowest admin level per country-year to avoid
# MAGIC triple-counting across sectors and admin levels (the bug we fixed earlier).

# COMMAND ----------

if len(needs_raw) > 0:
    needs_raw["reference_period_start"] = pd.to_datetime(
        needs_raw["reference_period_start"], errors="coerce"
    )
    needs_raw["year"] = needs_raw["reference_period_start"].dt.year.astype("Int64")
    needs_raw["population"] = pd.to_numeric(needs_raw["population"], errors="coerce")
    needs_raw["admin_level"] = pd.to_numeric(needs_raw.get("admin_level", 0), errors="coerce").fillna(0)

    # Filter to 2022-2026
    needs_raw = needs_raw[needs_raw["year"].between(2022, 2026)].copy()

    # Prefer Intersectoral (de-duplicated totals) at the lowest admin level
    if "sector_name" in needs_raw.columns:
        inter = needs_raw[
            needs_raw["sector_name"].str.contains("Intersector", case=False, na=False)
        ]
        if len(inter) > 0:
            needs_raw = inter

    # For each country-year, take the row with the lowest admin_level
    # (admin_level 0 = national, avoids double-counting provincial data)
    needs_raw = needs_raw.sort_values("admin_level")
    needs_agg = (
        needs_raw.groupby(["location_code", "year"])
        .agg(people_in_need=("population", "first"))
        .reset_index()
    )
    needs_agg = needs_agg.rename(columns={"location_code": "iso3"})
    needs_agg["iso3"] = needs_agg["iso3"].str.strip().str.upper()

    print(f"Needs aggregated: {len(needs_agg)} country-year rows")
else:
    needs_agg = pd.DataFrame(columns=["iso3", "year", "people_in_need"])

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 5: Compute B2B from Funding + Targeted Beneficiaries
# MAGIC The HPC project API does not expose beneficiary counts. Instead, derive
# MAGIC Budget-to-Beneficiary (B2B) ratios from HDX HAPI data:
# MAGIC - Numerator: `funding_usd` from Step 3 (HRP funding)
# MAGIC - Denominator: targeted population from humanitarian needs (population_status=TGT)

# COMMAND ----------

# Pull targeted beneficiaries (TGT) at national level from humanitarian needs
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
# MAGIC ### Aggregate targeted beneficiaries and compute B2B per country-year

# COMMAND ----------

if len(tgt_raw) > 0 and len(hrp_agg) > 0:
    tgt_raw["reference_period_start"] = pd.to_datetime(
        tgt_raw["reference_period_start"], errors="coerce"
    )
    tgt_raw["year"] = tgt_raw["reference_period_start"].dt.year.astype("Int64")
    tgt_raw["population"] = pd.to_numeric(tgt_raw["population"], errors="coerce")
    tgt_raw = tgt_raw[tgt_raw["year"].between(2022, 2026)].copy()

    # Use Intersectoral rows to get de-duplicated totals where available
    if "sector_name" in tgt_raw.columns:
        inter = tgt_raw[
            tgt_raw["sector_name"].str.contains("Intersector", case=False, na=False)
        ]
        if len(inter) > 0:
            tgt_raw = inter

    # Aggregate: total targeted population per country-year
    tgt_agg = (
        tgt_raw.groupby(["location_code", "year"])
        .agg(target_beneficiaries=("population", "sum"))
        .reset_index()
    )
    tgt_agg = tgt_agg.rename(columns={"location_code": "iso3"})
    tgt_agg["iso3"] = tgt_agg["iso3"].str.strip().str.upper()

    # Join with HRP funding to compute B2B
    b2b_agg = hrp_agg[["iso3", "year", "funding_usd"]].merge(
        tgt_agg[["iso3", "year", "target_beneficiaries"]],
        on=["iso3", "year"],
        how="inner",
    )

    # B2B = beneficiaries per dollar, cost per beneficiary = dollars per beneficiary
    b2b_agg = b2b_agg[
        (b2b_agg["funding_usd"] > 0) & (b2b_agg["target_beneficiaries"] > 0)
    ].copy()
    b2b_agg["avg_b2b_ratio"] = b2b_agg["target_beneficiaries"] / b2b_agg["funding_usd"]
    b2b_agg["median_b2b_ratio"] = b2b_agg["avg_b2b_ratio"]  # one value per country-year
    b2b_agg["project_count"] = 1  # placeholder -- derived from aggregate data

    # Global 25th percentile B2B -- used for INEFFICIENT classification
    global_b2b_p25 = b2b_agg["avg_b2b_ratio"].quantile(0.25)
    print(f"B2B computed: {len(b2b_agg)} country-year rows")
    print(f"Global B2B 25th percentile: {global_b2b_p25:.6f}")
else:
    b2b_agg = pd.DataFrame(columns=[
        "iso3", "year", "avg_b2b_ratio", "median_b2b_ratio", "project_count"
    ])
    global_b2b_p25 = 0
    print("Skipping B2B: no targeted beneficiary or funding data")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 6: Join Everything
# MAGIC Start with ACAPS as the spine. Left join funding, needs, and B2B data.

# COMMAND ----------

# Start with ACAPS spine
result = acaps_df[["iso3", "country_name", "year", "month",
                    "crisis_id", "crisis_name", "acaps_severity", "severity_class"]].copy()

# Left join HRP funding on iso3 + year
result = result.merge(
    hrp_agg[["iso3", "year", "has_hrp", "appeal_type", "appeal_code",
             "requirements_usd", "funding_usd", "funding_gap_usd", "funding_coverage_pct"]],
    on=["iso3", "year"],
    how="left",
)

# Left join needs on iso3 + year
result = result.merge(
    needs_agg[["iso3", "year", "people_in_need"]],
    on=["iso3", "year"],
    how="left",
)

# Left join B2B aggregates on iso3 + year
result = result.merge(
    b2b_agg[["iso3", "year", "avg_b2b_ratio", "median_b2b_ratio", "project_count"]],
    on=["iso3", "year"],
    how="left",
)

# Fill NaN defaults
result["has_hrp"] = result["has_hrp"].fillna(False)
result["project_count"] = result["project_count"].fillna(0).astype(int)

print(f"Joined result: {len(result)} rows")
print(f"Countries: {result['iso3'].nunique()}")
print(f"has_hrp distribution:\n{result['has_hrp'].value_counts()}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 7: Classify Funding State

# COMMAND ----------

def classify_funding_state(row):
    if not row["has_hrp"]:
        return "NO_HRP"
    coverage = row.get("funding_coverage_pct")
    if pd.isna(coverage) or coverage < 0.50:
        return "UNDERFUNDED"
    median_b2b = row.get("median_b2b_ratio")
    if pd.notna(median_b2b) and global_b2b_p25 > 0 and median_b2b < global_b2b_p25:
        return "INEFFICIENT"
    return "ADEQUATE"

result["funding_state"] = result.apply(classify_funding_state, axis=1)

print(f"Funding state distribution:\n{result['funding_state'].value_counts()}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 8: Add Lat/Lng, Year-Month, and Crisis Rank

# COMMAND ----------

# Country centroid lookup — covers all 106 countries in the ACAPS dataset
CENTROIDS = {
    "AFG": (33.9, 67.7), "AGO": (-11.2, 17.9), "ARM": (40.1, 45.0),
    "AZE": (40.1, 47.6), "BDI": (-3.4, 29.9), "BEN": (9.3, 2.3),
    "BFA": (12.4, -1.6), "BGD": (23.7, 90.4), "BGR": (42.7, 25.5),
    "BLR": (53.7, 27.9), "BOL": (-16.3, -63.6), "BRA": (-14.2, -51.9),
    "CAF": (6.6, 20.9), "CHL": (-35.7, -71.5), "CIV": (7.5, -5.5),
    "CMR": (7.4, 12.4), "COD": (-4.0, 21.8), "COG": (-0.2, 15.8),
    "COL": (4.6, -74.3), "CRI": (9.7, -83.8), "CUB": (21.5, -77.8),
    "CZE": (49.8, 15.5), "DJI": (11.6, 43.1), "DOM": (18.7, -70.2),
    "DZA": (28.0, 1.7), "ECU": (-1.8, -78.2), "EGY": (26.8, 30.8),
    "ERI": (15.2, 39.8), "ESP": (40.5, -3.7), "EST": (58.6, 25.0),
    "ETH": (9.1, 40.5), "GHA": (7.9, -1.0), "GMB": (13.4, -15.3),
    "GRC": (39.1, 21.8), "GTM": (15.8, -90.2), "HND": (15.2, -86.2),
    "HTI": (19.0, -72.4), "HUN": (47.2, 19.5), "IDN": (-0.8, 113.9),
    "IND": (20.6, 78.9), "IRN": (32.4, 53.7), "IRQ": (33.2, 43.7),
    "ITA": (41.9, 12.6), "JAM": (18.1, -77.3), "JOR": (30.6, 36.2),
    "KEN": (-0.02, 37.9), "KHM": (12.6, 105.0), "LAO": (19.9, 102.5),
    "LBN": (33.9, 35.9), "LBY": (26.3, 17.2), "LKA": (7.9, 80.8),
    "LSO": (-29.6, 28.2), "LTU": (55.2, 23.9), "LVA": (56.9, 24.1),
    "MAR": (31.8, -7.1), "MDA": (47.4, 28.4), "MDG": (-18.8, 46.9),
    "MEX": (23.6, -102.6), "MLI": (17.6, -4.0), "MMR": (21.9, 95.9),
    "MNG": (46.9, 103.8), "MOZ": (-18.7, 35.5), "MRT": (21.0, -10.9),
    "MWI": (-13.3, 34.3), "MYS": (4.2, 101.9), "NAM": (-22.6, 17.1),
    "NER": (17.6, 8.1), "NGA": (9.1, 8.7), "NIC": (12.9, -85.2),
    "NPL": (28.4, 84.1), "PAK": (30.4, 69.3), "PAN": (8.5, -80.8),
    "PER": (-9.2, -75.0), "PHL": (12.9, 121.8), "PNG": (-6.3, 143.9),
    "POL": (51.9, 19.1), "PRK": (40.3, 127.5), "PSE": (31.9, 35.2),
    "ROU": (45.9, 25.0), "RUS": (61.5, 105.3), "RWA": (-1.9, 29.9),
    "SDN": (15.5, 32.5), "SEN": (14.5, -14.5), "SLV": (13.8, -88.9),
    "SOM": (5.2, 46.2), "SSD": (6.9, 31.3), "SVK": (48.7, 19.7),
    "SWZ": (-26.5, 31.5), "SYR": (35.0, 38.5), "TCD": (15.5, 18.7),
    "TGO": (8.6, 1.2), "THA": (15.9, 100.9), "TLS": (-8.9, 125.7),
    "TON": (-21.2, -175.2), "TTO": (10.7, -61.2), "TUN": (33.9, 9.5),
    "TUR": (38.9, 35.2), "TZA": (-6.4, 34.9), "UGA": (1.4, 32.3),
    "UKR": (48.4, 31.2), "VEN": (6.4, -66.6), "VNM": (14.1, 108.3),
    "VUT": (-15.4, 166.9), "YEM": (15.3, 44.2), "ZMB": (-13.1, 27.8),
    "ZWE": (-19.0, 29.2),
}

result["lat"] = result["iso3"].map(lambda x: CENTROIDS.get(x, (0, 0))[0])
result["lng"] = result["iso3"].map(lambda x: CENTROIDS.get(x, (0, 0))[1])

# Year-month display string
result["year_month"] = result.apply(
    lambda r: f"{r['year']}-{int(r['month']):02d}" if pd.notna(r['month']) else str(r['year']),
    axis=1,
)

# Rank crises within each country-month by severity (1 = worst)
result["crisis_rank"] = (
    result.groupby(["iso3", "year", "month"])["acaps_severity"]
    .rank(method="first", ascending=False)
    .astype(int)
)

# Cap at 8 crises per country per month
result = result[result["crisis_rank"] <= 8].copy()

print(f"Final rows after rank filter: {len(result)}")
print(f"Max crisis_rank: {result['crisis_rank'].max()}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 9: Write to Delta Table

# COMMAND ----------

# Select and order final columns
output_columns = [
    "iso3", "country_name", "lat", "lng",
    "year", "month", "year_month",
    "crisis_id", "crisis_name", "acaps_severity", "severity_class",
    "has_hrp", "appeal_type", "appeal_code", "funding_state",
    "people_in_need", "requirements_usd", "funding_usd",
    "funding_gap_usd", "funding_coverage_pct",
    "avg_b2b_ratio", "median_b2b_ratio", "project_count",
    "crisis_rank",
]

# Only include columns that exist (some may be missing if API data was empty)
available = [c for c in output_columns if c in result.columns]
output_df = result[available]

# Convert to Spark DataFrame and write
crisis_sdf = spark.createDataFrame(output_df)
crisis_sdf.write.format("delta").mode("overwrite").saveAsTable("workspace.default.crisis_summary")

row_count = crisis_sdf.count()
print(f"Wrote {row_count} rows to workspace.default.crisis_summary")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Verification

# COMMAND ----------

cs = spark.table("workspace.default.crisis_summary").toPandas()
print(f"Total rows: {len(cs)}")
print(f"Countries: {cs['iso3'].nunique()}")
print(f"Year range: {cs['year'].min()} - {cs['year'].max()}")
print(f"\nFunding state distribution:")
print(cs["funding_state"].value_counts())
print(f"\nSeverity class distribution:")
print(cs["severity_class"].value_counts())
print(f"\nSample rows (top severity):")
display(
    spark.createDataFrame(
        cs.nlargest(10, "acaps_severity")[
            ["iso3", "country_name", "year_month", "crisis_name",
             "acaps_severity", "funding_state", "funding_coverage_pct", "project_count"]
        ]
    )
)
