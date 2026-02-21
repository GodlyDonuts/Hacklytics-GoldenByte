# Crisis Topography — Refactor Implementation Plan

> **Scope:** Replace flat table reads with 2 purpose-built Databricks tables, volcano-based globe visualization with B2B ratio lines, project-level HPC data ingestion, Gemini-powered vector embeddings for benchmarking, and ElevenLabs-driven crisis comparison.

---

## Table of Contents

1. [Current State vs. Target State](#1-current-state-vs-target-state)
2. [Architecture Overview (Post-Refactor)](#2-architecture-overview-post-refactor)
3. [Databricks Implementation](#3-databricks-implementation)
4. [Backend Implementation](#4-backend-implementation)
5. [Frontend Implementation](#5-frontend-implementation)
6. [ElevenLabs Implementation](#6-elevenlabs-implementation)
7. [Data Contracts & Schemas](#7-data-contracts--schemas)
8. [Migration Checklist](#8-migration-checklist)

---

## 1. Current State vs. Target State

### What Exists Now

| Component | Status |
|---|---|
| Databricks tables | 4 flat tables (`plans`, `funding`, `humanitarian_needs`, `population`) in `workspace.default.*`. No severity scores, no project-level data, no B2B ratios. |
| Backend `/api/countries` | Reads all 4 tables at startup into `app.state.data`, aggregates needs + funding per country, returns `people_in_need`, `funding_usd`, `coverage_ratio`, `funding_per_capita`. |
| Backend `/api/mismatch` | Stub returning hardcoded Sudan mock data. |
| Backend `/api/compare`, `/api/ask` | Empty files, routers commented out in `main.py`. |
| Frontend | Bare Next.js template. `react-globe.gl`, `d3-scale`, `@elevenlabs/react` installed but zero components built. No API calls, no globe, no state management. |
| Project-level data | Not ingested. No HPC project endpoint calls. No B2B ratios anywhere. |
| ACAPS severity | Not ingested. |
| ElevenLabs | Agent ID env var placeholder exists. No integration code. |

### What We're Building

| Component | Target |
|---|---|
| Databricks | **2 tables.** `crisis_summary` (drives the globe) and `project_embeddings` (drives benchmarking + drill-down + ElevenLabs). Built directly from API ingest — no intermediate layers. Data range: **2022–2026 only**. |
| Backend | On-demand SQL queries to `crisis_summary` and `project_embeddings`. Vector search proxy for ElevenLabs. Legacy `/api/countries` kept as cross-reference for the agent. |
| Frontend Globe | Severity-index volcanoes (max 8 crises per country, bar height = severity). B2B ratio lines attached within each volcano bar. On-demand queries to Databricks via backend proxy. |
| ElevenLabs Agent | Queries `project_embeddings` vector index to find overlooked crises by nearest-neighbor B2B comparison. Stretch: proposes reallocation suggestions. |

---

## 2. Architecture Overview (Post-Refactor)

```
┌──────────────────────────────────────────────────────────────────┐
│                          FRONTEND                                │
│  Next.js · react-globe.gl (volcano bars + B2B lines)             │
│  ElevenLabs React SDK (voice-driven benchmarking)                │
│                                                                  │
│  API calls:                                                      │
│    GET  /api/globe/crises?year=2024&month=2  → volcano data      │
│    GET  /api/globe/b2b?iso3=SDN&year=2024   → project drill-down │
│    POST /api/benchmark                       → embedding search  │
│    POST /api/ask                             → RAG Q&A           │
│    GET  /api/countries?year=2024             → legacy cross-ref  │
└──────────────────────────┬───────────────────────────────────────┘
                           │ REST (JSON)
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                     BACKEND (FastAPI)                             │
│                                                                  │
│  /api/globe/crises    → SQL query to crisis_summary              │
│  /api/globe/b2b       → SQL query to project_embeddings          │
│  /api/benchmark       → Vector search on project_embeddings      │
│  /api/ask             → Vector search + LLM (Gemini / LLaMA)     │
│  /api/countries       → Legacy cross-reference dataset (kept)    │
│                                                                  │
│  SQL queries → databricks_client.execute_sql()                   │
│  Vector queries → databricks_client.vector_search()              │
└──────────┬───────────────────────────────────────────┬───────────┘
           │                                           │
           ▼                                           ▼
┌─────────────────────────┐   ┌────────────────────────────────────┐
│   External APIs         │   │        DATABRICKS                  │
│   (ingested by notebooks│   │                                    │
│    directly into final  │   │  ┌──────────────────────────────┐  │
│    tables)              │   │  │  crisis_summary              │  │
│                         │   │  │  One row per crisis per       │  │
│  • HPC /plan/year/YYYY  │   │  │  country per year-month.    │  │
│  • HPC /project/plan/ID │   │  │  per country. Drives globe.  │  │
│  • HPC /fts/flow        │   │  └──────────────────────────────┘  │
│  • HDX HAPI /hum-needs  │   │                                    │
│  • HDX HAPI /population │   │  ┌──────────────────────────────┐  │
│  • ACAPS severity API   │   │  │  project_embeddings          │  │
│                         │   │  │  One row per HRP project.     │  │
│  Years: 2022–2026       │   │  │  B2B ratios + text blob +    │  │
│                         │   │  │  embedding vector. Drives     │  │
└─────────────────────────┘   │  │  drill-down + benchmarking.  │  │
                              │  └──────────────────────────────┘  │
                              │                                    │
                              │  Vector Search Index               │
                              │    project_embeddings_index         │
                              └────────────────────────────────────┘
```

---

## 3. Databricks Implementation

### 3.1 Final Tables — No Intermediate Layers

Two notebooks. Each pulls raw data from APIs, cleans/joins/computes in-memory, and writes the finished table. No Bronze, no Silver — just the end product.

### 3.2 API Sources & Year Filtering

All API calls are scoped to **2022–2026**.

> **FTS Flows is dead.** The old HPC endpoint (`/v1/public/fts/flow`) stops at Dec 2017. The replacement is the **HDX HAPI Funding endpoint** (`/api/v2/coordination-context/funding`), which is backed by the same OCHA FTS data but exposed through HDX HAPI with current data, proper filtering, and a `has_hrp` flag built in. This is also the dataset behind [Global Requirements and Funding Data on HDX](https://data.humdata.org/dataset/global-requirements-and-funding-data).

| Source | Endpoint | Filter Strategy |
|---|---|---|
| HPC Plans | `/v1/public/plan/year/{y}` | Loop y = 2022..2026 |
| HPC Projects | `/v1/public/project/plan/{planId}` | Derived from plans within 2022–2026 |
| **HDX HAPI Funding** | `GET /api/v2/coordination-context/funding` | `start_date=2022-01-01&end_date=2026-12-31`, paginate with `limit=10000&offset=N` |
| HDX Humanitarian Needs | `/v2/affected-people/humanitarian-needs` | Filter `reference_period_start` >= 2022-01-01 |
| HDX Population | `/v2/geography-infrastructure/baseline-population` | Take latest available |
| **ACAPS Severity** | `GET /api/v1/inform-severity-index/{Month}{Year}/` | **Month-based** — one API call per month (e.g. `Feb2026`, `Jan2024`) |

#### ACAPS Inform Severity Index API — Detail

**Base URL:** `https://api.acaps.org`

The ACAPS API is **month-based**. Each call returns all crises for a specific month. This enables a simpler, less cluttered globe view when displaying one month at a time.

**Authentication:** Token-based. Obtain a token first, then include it in subsequent requests.

1. **Obtain token:**
   ```
   POST /api/v1/token-auth/
   Content-Type: application/x-www-form-urlencoded

   username=<email>   # Your ACAPS account email
   password=<pwd>    # Your ACAPS account password
   ```

2. **Fetch crises for a month:**
   ```
   GET /api/v1/inform-severity-index/{Month}{Year}/
   Accept: application/json
   Authorization: Token <your_token>
   X-CSRFToken: <csrf_token>
   ```

   **Month format:** 3-letter month + 4-digit year, e.g. `Jan2024`, `Feb2026`, `Dec2022`.

**Primary data source for Databricks:** A pre-generated CSV containing all crises from Jan 2022–Dec 2026 (48 months) is provided for ingestion. This avoids 48 API calls during notebook runs.

**Primary data source — CSV:** A pre-generated CSV (`acaps_crises_2022_2026.csv`) contains all crises from Jan 2022–Dec 2026 (48 months). The Databricks notebook reads this CSV to avoid 48 API calls. Expected columns: `iso3`, `country_name`, `crisis_id`, `crisis_name`, `severity` (or `acaps_severity`), `year`, `month`, plus any ACAPS-specific fields. Split by month in the source; Databricks ingests and joins with funding/needs.

**Stretch goal — Scheduled monthly refresh:** A job (e.g. Databricks Job or cron) runs on the 1st of each month to pull the previous month's crises via `GET /api/v1/inform-severity-index/{PrevMonth}{PrevYear}/` and append to `crisis_summary`. Requires `ACAPS_USERNAME`, `ACAPS_PASSWORD` in environment; obtain token via `POST /api/v1/token-auth/` before each API call.

#### HDX HAPI Funding Endpoint — Detail

**Endpoint:** `GET https://hapi.humdata.org/api/v2/coordination-context/funding`

**Key columns returned:**

| Column | Type | Why It Matters |
|---|---|---|
| `location_code` | STRING | ISO3 country code (join key) |
| `location_name` | STRING | Country name |
| `appeal_code` | STRING | Unique FTS appeal identifier |
| `appeal_name` | STRING | Appeal display name |
| `appeal_type` | STRING | **Critical** — `"HRP"`, `"Flash"`, `"Regional"`, `"Other"`, etc. This tells you what kind of response exists. |
| `requirements_usd` | DECIMAL | How much was requested |
| `funding_usd` | DECIMAL | How much was actually received |
| `funding_pct` | FLOAT | Pre-computed `funding_usd / requirements_usd` |
| `reference_period_start` | DATETIME | Start of appeal period (used for year filtering) |
| `reference_period_end` | DATETIME | End of appeal period |

**Key query parameters for filtering:**

| Param | Use |
|---|---|
| `start_date` / `end_date` | Restrict to 2022–2026 |
| `has_hrp=true` | Only return countries WITH an HRP |
| `has_hrp=false` | Only return countries WITHOUT an HRP (for invisible crisis detection) |
| `location_code` | Filter to specific country |
| `appeal_type` | Filter by appeal type (HRP, Flash, etc.) |

**Important caveat from docs:** *"The present version of the API currently captures only funding associated with an appeal."* Crises with zero formal appeals are genuinely invisible — no funding row exists at all. This is actually useful: if ACAPS flags a crisis but there's no funding row, that's an invisible crisis.

### 3.3 Three Crisis Funding States

This is the core analytical model the Databricks notebooks must produce. Every crisis in `crisis_summary` is classified into one of three states:

| State | Label | Detection Logic | Globe Signal |
|---|---|---|---|
| **Invisible** | `NO_HRP` | ACAPS severity exists for this country-year, but no matching funding row with `appeal_type = "HRP"` exists in HDX HAPI. No coordinated response. | Volcano bar with **no B2B line** (no projects to measure). Bar is outlined/dashed to visually distinguish. |
| **Underfunded** | `UNDERFUNDED` | HRP exists (`appeal_type = "HRP"`), but `funding_coverage_pct < 0.50` (less than 50% of requirements met). The gap is large. | Volcano bar with **red B2B line** positioned low. |
| **Inefficient** | `INEFFICIENT` | HRP exists and is reasonably funded (`funding_coverage_pct >= 0.50`), but the median B2B ratio across projects is below the global 25th percentile — money flows in but doesn't reach proportionate beneficiaries. | Volcano bar with **orange B2B line** — funded but poorly allocated. |

A fourth implicit state is "Adequately Funded" where HRP exists, coverage > 50%, and B2B ratios are within normal range — these get a **green B2B line**.

The classification is stored as `funding_state` in the `crisis_summary` table.

### 3.4 Table 1: `crisis_summary`

**Drives the globe volcanoes.** One row per crisis per country per **year-month**, capped at 8 crises per country per month. Month granularity enables a simpler, less cluttered globe view when displaying one month at a time.

**Notebook: `01_crisis_summary.py`**

This single notebook ingests from a CSV (or ACAPS API), joins with funding/needs/projects, classifies each crisis into a funding state, and writes the final table.

#### Schema

| Column | Type | Description |
|---|---|---|
| `iso3` | STRING | ISO3 country code |
| `country_name` | STRING | Display name |
| `lat` | FLOAT | Country centroid latitude |
| `lng` | FLOAT | Country centroid longitude |
| `year` | INT | 2022–2026 |
| `month` | INT | 1–12 (January = 1) |
| `year_month` | STRING | `YYYY-MM` for display (e.g. `2024-02`) |
| `crisis_id` | STRING | ACAPS crisis identifier |
| `crisis_name` | STRING | Crisis display name |
| `acaps_severity` | FLOAT | Severity score (0–5), drives volcano bar height |
| `severity_class` | STRING | `Very Low` / `Low` / `Medium` / `High` / `Very High` |
| `has_hrp` | BOOLEAN | Whether an HRP appeal exists for this country-year |
| `appeal_type` | STRING | From HDX HAPI: `"HRP"`, `"Flash"`, `"Regional"`, `"Other"`, or `NULL` if no appeal |
| `appeal_code` | STRING | FTS appeal identifier (NULL if no appeal) |
| `funding_state` | STRING | **`NO_HRP`** / **`UNDERFUNDED`** / **`INEFFICIENT`** / **`ADEQUATE`** (see Section 3.3) |
| `people_in_need` | BIGINT | PIN for this country-year |
| `requirements_usd` | DECIMAL | Total funding requested (NULL if no appeal) |
| `funding_usd` | DECIMAL | Total funding received (NULL if no appeal) |
| `funding_gap_usd` | DECIMAL | `requirements_usd - funding_usd` |
| `funding_coverage_pct` | FLOAT | `funding_usd / requirements_usd` (NULL if no appeal) |
| `avg_b2b_ratio` | FLOAT | Average B2B ratio across projects (NULL if no projects) |
| `median_b2b_ratio` | FLOAT | Median B2B ratio (NULL if no projects) |
| `project_count` | INT | Number of HRP projects (0 if none) |
| `crisis_rank` | INT | Rank within country by severity (1 = worst), **capped at 8** |

#### Notebook Logic

```python
# 01_crisis_summary.py — Ingest + Build in One Shot

import requests
import pandas as pd
import numpy as np
import base64

HPC_BASE = "https://api.hpc.tools/v1/public"
HDX_BASE = "https://hapi.humdata.org/api/v2"
ACAPS_URL = "https://api.acaps.org/api/v1/inform-severity-index/"
APP_ID = base64.b64encode(b"CrisisTopography:team@hacklytics.com").decode()
YEARS = range(2022, 2027)

# ── Step 1: Load ACAPS severity (the spine) ──
# PRIMARY: Load from CSV (48 months Jan2022–Dec2026) to avoid 48 API calls.
# CSV columns: iso3, country_name, crisis_id, crisis_name, severity, year, month, etc.
# STRETCH: Loop over 48 months and call GET /api/v1/inform-severity-index/{Month}{Year}/
#   with token auth (POST /api/v1/token-auth/ first for username/password).
#
acaps_df = pd.read_csv("acaps_crises_2022_2026.csv")  # or build from API
# Ensure year, month columns. Derive severity_class from score thresholds:
#   0–1 = Very Low, 1–2 = Low, 2–3 = Medium, 3–4 = High, 4–5 = Very High

# ── Step 2: Pull HRP plans (for plan IDs needed in Step 5) ──
all_plans = []
for y in YEARS:
    resp = requests.get(f"{HPC_BASE}/plan/year/{y}")
    if resp.ok:
        for p in resp.json().get("data", []):
            all_plans.append({
                "plan_id": p["id"],
                "year": y,
                "iso3": ...,  # extract from plan locations
                "country_name": ...,
            })
plans_df = pd.DataFrame(all_plans)

# ── Step 3: Pull HDX HAPI Funding (replaces dead FTS flows endpoint) ──
# This is the OCHA FTS requirements & funding data served through HDX HAPI.
# Key: appeal_type tells us if an HRP exists. has_hrp is also a filter param.
all_funding = []
offset = 0
while True:
    resp = requests.get(
        f"{HDX_BASE}/coordination-context/funding",
        params={
            "app_identifier": APP_ID,
            "start_date": "2022-01-01",
            "end_date": "2026-12-31",
            "limit": 10000,
            "offset": offset,
        },
    )
    data = resp.json().get("data", [])
    if not data:
        break
    all_funding.extend(data)
    offset += len(data)

funding_df = pd.DataFrame(all_funding)
# Columns: location_code, location_name, appeal_code, appeal_name,
#           appeal_type, requirements_usd, funding_usd, funding_pct,
#           reference_period_start, reference_period_end
#
# Extract year from reference_period_start
funding_df["year"] = pd.to_datetime(funding_df["reference_period_start"]).dt.year

# Determine has_hrp: True if any row for this location+year has appeal_type == "HRP"
hrp_flags = (
    funding_df[funding_df["appeal_type"] == "HRP"]
    .groupby(["location_code", "year"])
    .agg(
        has_hrp=("appeal_type", lambda x: True),
        appeal_code=("appeal_code", "first"),
        appeal_type=("appeal_type", "first"),
        requirements_usd=("requirements_usd", "sum"),
        funding_usd=("funding_usd", "sum"),
    )
    .reset_index()
)
hrp_flags["funding_coverage_pct"] = (
    hrp_flags["funding_usd"] / hrp_flags["requirements_usd"].replace(0, np.nan)
)
hrp_flags["funding_gap_usd"] = hrp_flags["requirements_usd"] - hrp_flags["funding_usd"]

# ── Step 4: Pull humanitarian needs ──
all_needs = []
offset = 0
while True:
    resp = requests.get(
        f"{HDX_BASE}/affected-people/humanitarian-needs",
        params={"app_identifier": APP_ID, "limit": 10000, "offset": offset},
    )
    data = resp.json().get("data", [])
    if not data:
        break
    all_needs.extend(data)
    offset += len(data)

needs_df = pd.DataFrame(all_needs)
# Filter to 2022–2026, aggregate people_in_need (population column) by country-year

# ── Step 5: Pull project data for B2B aggregates ──
plan_ids = plans_df["plan_id"].unique()
all_projects = []
for pid in plan_ids:
    resp = requests.get(f"{HPC_BASE}/project/plan/{pid}")
    if resp.ok:
        for p in resp.json().get("data", []):
            funds = p.get("currentRequestedFunds", 0) or 0
            beneficiaries = p.get("targetBeneficiaries", 0) or 0
            if funds > 0 and beneficiaries > 0:
                all_projects.append({
                    "plan_id": pid,
                    "iso3": (p.get("locations") or [{}])[0].get("iso3", ""),
                    "year": plans_df.loc[plans_df["plan_id"] == pid, "year"].iloc[0],
                    "requested_funds": funds,
                    "target_beneficiaries": beneficiaries,
                })
projects_df = pd.DataFrame(all_projects)
projects_df["b2b_ratio"] = projects_df["target_beneficiaries"] / projects_df["requested_funds"]

# Aggregate B2B stats per country-year
b2b_agg = projects_df.groupby(["iso3", "year"]).agg(
    avg_b2b_ratio=("b2b_ratio", "mean"),
    median_b2b_ratio=("b2b_ratio", "median"),
    project_count=("b2b_ratio", "count"),
).reset_index()

# Global 25th percentile B2B — used for INEFFICIENT classification
global_b2b_p25 = projects_df["b2b_ratio"].quantile(0.25)

# ── Step 6: Join everything ──
# Start with acaps_df as the spine (one row per crisis per country-year-month)
# Left join hrp_flags on iso3 + year (funding is year-level) → has_hrp, appeal_type, appeal_code,
#   requirements_usd, funding_usd, funding_gap_usd, funding_coverage_pct
# Left join needs_agg on iso3 + year → people_in_need
# Left join b2b_agg on iso3 + year → avg_b2b_ratio, median_b2b_ratio, project_count
# Fill has_hrp NaN → False, project_count NaN → 0

# ── Step 7: Classify funding_state ──
# For each row:
#   if has_hrp is False (or NULL):
#       funding_state = "NO_HRP"
#   elif funding_coverage_pct < 0.50:
#       funding_state = "UNDERFUNDED"
#   elif median_b2b_ratio < global_b2b_p25:
#       funding_state = "INEFFICIENT"
#   else:
#       funding_state = "ADEQUATE"

# ── Step 8: Add lat/lng from static centroid lookup ──
# Add year_month = f"{year}-{month:02d}" for display
# Rank crises within each country-month by acaps_severity DESC
# Filter to crisis_rank <= 8 per country per month

# ── Step 9: Write ──
crisis_summary_sdf = spark.createDataFrame(final_df)
crisis_summary_sdf.write.format("delta").mode("overwrite") \
    .saveAsTable("workspace.default.crisis_summary")
```

#### Country Centroid Lookup

Include a static dict or CSV with lat/lng for ~60 crisis-affected countries. Example:

```python
CENTROIDS = {
    "SDN": (15.5, 32.5),
    "YEM": (15.3, 44.2),
    "UKR": (48.4, 31.2),
    "SOM": (5.2, 46.2),
    "AFG": (33.9, 67.7),
    "SYR": (35.0, 38.5),
    "ETH": (9.1, 40.5),
    "COD": (-4.0, 21.8),
    "MMR": (21.9, 95.9),
    "BGD": (23.7, 90.4),
    # ... etc
}
```

### 3.4 Table 2: `project_embeddings`

**Drives everything project-level:** globe B2B drill-down, ElevenLabs benchmarking, and vector search. One row per HRP project.

**Notebook: `02_project_embeddings.py`**

#### Schema

| Column | Type | Description |
|---|---|---|
| `project_id` | STRING | `{project_code}_{year}` (primary key) |
| `project_code` | STRING | HPC project code |
| `project_name` | STRING | Display name |
| `iso3` | STRING | Country code |
| `country_name` | STRING | Country display name |
| `year` | INT | 2022–2026 |
| `cluster` | STRING | Primary humanitarian cluster |
| `sector` | STRING | Sector if available |
| `requested_funds` | DECIMAL | Budget (currentRequestedFunds) |
| `target_beneficiaries` | BIGINT | People targeted |
| `b2b_ratio` | FLOAT | `target_beneficiaries / requested_funds` |
| `cost_per_beneficiary` | FLOAT | `requested_funds / target_beneficiaries` |
| `b2b_percentile` | FLOAT | Percentile rank within cluster (0–1) |
| `is_outlier` | BOOLEAN | Below 10th or above 90th percentile within cluster |
| `cluster_median_b2b` | FLOAT | Median B2B for this cluster (for delta comparison) |
| `description` | STRING | Project description |
| `objectives` | STRING | Project objectives |
| `text_blob` | STRING | Concatenation: `project_name \| cluster \| sector \| description \| country_name \| year` |
| `embedding` | ARRAY\<FLOAT\> | Vector embedding of `text_blob` |

#### Notebook Logic

```python
# 02_project_embeddings.py — Ingest + Compute + Embed in One Shot

import requests
import pandas as pd
import numpy as np

HPC_BASE = "https://api.hpc.tools/v1/public"
YEARS = range(2022, 2027)

# ── Step 1: Pull all plans to get plan IDs ──
all_plans = []
for y in YEARS:
    resp = requests.get(f"{HPC_BASE}/plan/year/{y}")
    if resp.ok:
        for p in resp.json().get("data", []):
            all_plans.append({"plan_id": p["id"], "year": y,
                              "iso3": ..., "country_name": ...})
plans_df = pd.DataFrame(all_plans)

# ── Step 2: Pull project-level data for every plan ──
all_projects = []
for _, plan in plans_df.iterrows():
    resp = requests.get(f"{HPC_BASE}/project/plan/{plan['plan_id']}")
    if resp.ok:
        for p in resp.json().get("data", []):
            all_projects.append({
                "project_code": p.get("code"),
                "project_name": p.get("name", ""),
                "plan_id": plan["plan_id"],
                "iso3": p.get("locations", [{}])[0].get("iso3", plan["iso3"]),
                "country_name": plan["country_name"],
                "year": plan["year"],
                "cluster": (p.get("globalClusters") or [{}])[0].get("name", "Unknown"),
                "sector": (p.get("sectors") or [{}])[0].get("name", ""),
                "requested_funds": p.get("currentRequestedFunds", 0),
                "target_beneficiaries": p.get("targetBeneficiaries", 0),
                "description": p.get("description", ""),
                "objectives": p.get("objectives", ""),
            })

projects_df = pd.DataFrame(all_projects)

# ── Step 3: Filter to valid projects ──
projects_df = projects_df[
    (projects_df["requested_funds"] > 0) &
    (projects_df["target_beneficiaries"] > 0)
]

# ── Step 4: Compute B2B ratios ──
projects_df["b2b_ratio"] = projects_df["target_beneficiaries"] / projects_df["requested_funds"]
projects_df["cost_per_beneficiary"] = projects_df["requested_funds"] / projects_df["target_beneficiaries"]

# ── Step 5: Compute per-cluster percentiles + outlier flags ──
for cluster in projects_df["cluster"].unique():
    mask = projects_df["cluster"] == cluster
    values = projects_df.loc[mask, "b2b_ratio"]
    projects_df.loc[mask, "b2b_percentile"] = values.rank(pct=True)
    projects_df.loc[mask, "cluster_median_b2b"] = values.median()

projects_df["is_outlier"] = (projects_df["b2b_percentile"] < 0.10) | (projects_df["b2b_percentile"] > 0.90)

# ── Step 6: Build text blob for embedding ──
projects_df["text_blob"] = (
    projects_df["project_name"] + " | " +
    projects_df["cluster"] + " | " +
    projects_df["sector"] + " | " +
    projects_df["description"] + " | " +
    projects_df["country_name"] + " | " +
    projects_df["year"].astype(str)
)

# ── Step 7: Generate embeddings ──
# Option A: Databricks managed embeddings (let Vector Search handle it)
# Option B: Call Gemini embedding API in batches
#
# If using Databricks managed embeddings, skip this step and set
# embedding_source_column="text_blob" when creating the index.
#
# If using Gemini directly:
# import google.generativeai as genai
# genai.configure(api_key=GEMINI_API_KEY)
# model = genai.GenerativeModel("models/text-embedding-004")
# embeddings = []
# for batch in chunked(projects_df["text_blob"].tolist(), 100):
#     result = genai.embed_content(model="models/text-embedding-004",
#                                   content=batch)
#     embeddings.extend(result["embedding"])
# projects_df["embedding"] = embeddings

# ── Step 8: Create project_id and write ──
projects_df["project_id"] = projects_df["project_code"] + "_" + projects_df["year"].astype(str)

sdf = spark.createDataFrame(projects_df)
sdf.write.format("delta").mode("overwrite").saveAsTable("workspace.default.project_embeddings")

# ── Step 9: Create Vector Search Index ──
from databricks.vector_search.client import VectorSearchClient

vsc = VectorSearchClient()

# Create endpoint if it doesn't exist (1 allowed on Free Edition)
try:
    vsc.create_endpoint(name="crisis-rag-endpoint")
except:
    pass  # Already exists

vsc.create_delta_sync_index(
    endpoint_name="crisis-rag-endpoint",
    index_name="workspace.default.project_embeddings_index",
    source_table_name="workspace.default.project_embeddings",
    pipeline_type="TRIGGERED",
    primary_key="project_id",
    embedding_source_column="text_blob",
    embedding_model_endpoint_name="databricks-bge-large-en"
)
```

### 3.5 Notebook Execution Order

```
01_crisis_summary.py     02_project_embeddings.py
       ↓                          ↓
  crisis_summary            project_embeddings
  (globe volcanoes)         (drill-down + benchmarking + RAG)
                                   ↓
                          Vector Search Index
                          (project_embeddings_index)
```

These two notebooks are independent — they can run in parallel. Both pull from the same APIs, so there's some redundancy in HPC plan/project fetching. If that bothers you, extract a shared helper function, but for a hackathon it doesn't matter.

### 3.6 Databricks Table Naming

Using the existing `workspace.default.*` catalog:

| Table | Full Name |
|---|---|
| Crisis summary | `workspace.default.crisis_summary` |
| Project embeddings | `workspace.default.project_embeddings` |
| Vector index | `workspace.default.project_embeddings_index` |

The old tables (`plans`, `funding`, `humanitarian_needs`, `population`) remain untouched. They still power the legacy `/api/countries` endpoint and serve as cross-reference context for the ElevenLabs agent.

> **Note:** The existing `workspace.default.funding` table already comes from the HDX HAPI funding endpoint — its columns (`location_code`, `appeal_code`, `appeal_name`, `funding_usd`, `requirements_usd`, `funding_pct`) match exactly. However, it was ingested without `appeal_type`, without the `has_hrp` distinction, and without the three-state classification. The new `crisis_summary` table replaces it for all globe-facing queries.

---

## 4. Backend Implementation

### 4.1 New Router: `/api/globe/crises`

**Purpose:** Serve volcano data for the globe. Queries `crisis_summary` on demand. **Month-based** for a simpler, less cluttered view.

```
GET /api/globe/crises?year=2024&month=2
```

| Param | Type | Description |
|-------|------|-------------|
| `year` | int | 2022–2026 |
| `month` | int | 1–12 (optional; if omitted, returns all months for the year) |

Response:
```json
{
  "year": 2024,
  "month": 2,
  "year_month": "2024-02",
  "countries": [
    {
      "iso3": "SDN",
      "country_name": "Sudan",
      "lat": 15.5,
      "lng": 32.5,
      "crises": [
        {
          "crisis_id": "SDN-001",
          "crisis_name": "Armed Conflict",
          "acaps_severity": 4.8,
          "severity_class": "Very High",
          "has_hrp": true,
          "appeal_type": "HRP",
          "funding_state": "UNDERFUNDED",
          "people_in_need": 24800000,
          "funding_gap_usd": 1960000000,
          "funding_coverage_pct": 0.30,
          "avg_b2b_ratio": 0.0042,
          "median_b2b_ratio": 0.0038,
          "project_count": 156,
          "crisis_rank": 1
        }
      ]
    }
  ]
}
```

Implementation: Direct SQL via `databricks_client.execute_sql()`:
```sql
SELECT * FROM workspace.default.crisis_summary
WHERE year = :year AND (:month IS NULL OR month = :month)
ORDER BY iso3, crisis_rank
```

When `month` is provided, filter to that month. When omitted, return all 12 months for the year. Group rows by `iso3` in Python before returning.

### 4.2 New Router: `/api/globe/b2b`

**Purpose:** Serve project-level B2B breakdown when user clicks a volcano. Queries `project_embeddings` (which has all the project-level data).

```
GET /api/globe/b2b?iso3=SDN&year=2024
```

Response:
```json
{
  "iso3": "SDN",
  "year": 2024,
  "projects": [
    {
      "project_code": "SDN-24/H/001",
      "project_name": "Emergency Health Response",
      "cluster": "Health",
      "requested_funds": 5000000,
      "target_beneficiaries": 250000,
      "b2b_ratio": 0.05,
      "cost_per_beneficiary": 20.0,
      "b2b_percentile": 0.72,
      "is_outlier": false,
      "cluster_median_b2b": 0.04
    }
  ],
  "summary": {
    "avg_b2b": 0.042,
    "median_b2b": 0.038,
    "total_projects": 156,
    "outlier_count": 14
  }
}
```

Implementation:
```sql
SELECT project_code, project_name, cluster, requested_funds,
       target_beneficiaries, b2b_ratio, cost_per_beneficiary,
       b2b_percentile, is_outlier, cluster_median_b2b
FROM workspace.default.project_embeddings
WHERE iso3 = :iso3 AND year = :year
ORDER BY b2b_ratio DESC
```

### 4.3 New Router: `/api/benchmark`

**Purpose:** Given a project, find nearest neighbors in embedding space and compare B2B ratios. This is what ElevenLabs calls for benchmarking.

```
POST /api/benchmark
{
  "project_code": "SDN-24/H/001",
  "num_neighbors": 5
}
```

Response:
```json
{
  "query_project": {
    "project_code": "SDN-24/H/001",
    "cluster": "Health",
    "b2b_ratio": 0.05,
    "cost_per_beneficiary": 20.0
  },
  "neighbors": [
    {
      "project_code": "YEM-24/H/003",
      "iso3": "YEM",
      "cluster": "Health",
      "b2b_ratio": 0.08,
      "cost_per_beneficiary": 12.5,
      "b2b_delta": 0.03,
      "similarity_score": 0.94
    }
  ],
  "insight": "This project serves 37.5% fewer beneficiaries per dollar compared to similar Health projects in comparable crises."
}
```

Implementation:
1. Look up the query project in `project_embeddings` to get its `text_blob` and B2B metadata.
2. Call `databricks_client.vector_search()` with the `text_blob` to find nearest neighbors.
3. The vector search returns neighbor `project_id`s with similarity scores.
4. Fetch neighbor B2B ratios from the same `project_embeddings` table.
5. Compute deltas and return.

### 4.4 Implemented Router: `/api/ask`

**Purpose:** RAG-based Q&A for the ElevenLabs agent. Searches `project_embeddings` for context, then sends to LLM.

```
POST /api/ask
{ "question": "Which health crises lack HRP plans but have high severity?" }
```

Implementation:
1. Vector search against `project_embeddings_index` with the question text.
2. Retrieve matching projects with their metadata.
3. Optionally also query `crisis_summary` for country-level context.
4. Assemble context + question, send to LLM (Databricks Foundation Model or Gemini).
5. Return answer text (ElevenLabs speaks it).

### 4.5 Legacy Router: `/api/countries` (Kept)

The existing `/api/countries` endpoint stays as-is. It continues reading from the original 4 tables (`plans`, `funding`, `humanitarian_needs`, `population`). These tables remain in Databricks untouched. This endpoint provides backward compatibility and serves as cross-reference context the ElevenLabs agent can use to compare crises that did NOT receive HRP plans.

### 4.6 Deprecated: `/api/mismatch`

The stub mismatch endpoint is replaced by `/api/globe/crises`. Remove the mismatch router.

### 4.7 New Service: `databricks_client.py` Additions

Add `vector_search()`:
```python
async def vector_search(query_text: str, index_name: str, num_results: int = 5) -> list[dict]:
    """Query a Databricks Vector Search index."""
    host = os.getenv("DATABRICKS_HOST")
    token = os.getenv("DATABRICKS_TOKEN")

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{host}/api/2.0/vector-search/indexes/{index_name}/query",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "query_text": query_text,
                "columns": ["project_id", "project_code", "iso3", "cluster",
                             "b2b_ratio", "cost_per_beneficiary", "text_blob"],
                "num_results": num_results,
            },
        )
        resp.raise_for_status()
        return resp.json().get("result", {}).get("data_array", [])
```

Add `query_llm()`:
```python
async def query_llm(prompt: str, model: str = "databricks-meta-llama-3-1-70b-instruct") -> str:
    """Call a Databricks Foundation Model serving endpoint."""
    host = os.getenv("DATABRICKS_HOST")
    token = os.getenv("DATABRICKS_TOKEN")

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{host}/serving-endpoints/{model}/invocations",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 500,
            },
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]
```

### 4.8 Startup Change: No More Bulk Load

**Before:** `data_loader.py` runs 4 `SELECT *` queries at startup and caches everything in `app.state.data`.

**After:** Remove the bulk startup load. Globe endpoints query Databricks on demand. The only startup action is a health-check ping to verify connectivity.

```python
# backend/services/data_loader.py (refactored)
from .databricks_client import execute_sql

async def load_all_data() -> dict:
    """Verify Databricks is reachable. Load legacy tables for /api/countries."""
    await execute_sql("SELECT 1")
    # Still load legacy tables for the /api/countries endpoint
    plans = await execute_sql("SELECT * FROM workspace.default.plans")
    funding = await execute_sql("SELECT * FROM workspace.default.funding")
    humanitarian_needs = await execute_sql("SELECT * FROM workspace.default.humanitarian_needs")
    population = await execute_sql("SELECT * FROM workspace.default.population")
    return {
        "plans": plans,
        "funding": funding,
        "humanitarian_needs": humanitarian_needs,
        "population": population,
    }
```

The new globe endpoints (`/api/globe/crises`, `/api/globe/b2b`) query `crisis_summary` and `project_embeddings` on demand — they do NOT use `app.state.data`.

### 4.9 Updated Backend Directory Structure

```
backend/
├── main.py                          # Updated lifespan, new routers
├── requirements.txt                 # Unchanged (or add google-generativeai)
├── .env                             # DATABRICKS_HOST, DATABRICKS_TOKEN, WAREHOUSE_ID, ELEVENLABS_API_KEY, ACAPS_USERNAME, ACAPS_PASSWORD (stretch)
├── routers/
│   ├── globe.py                     # NEW — GET /crises, GET /b2b
│   ├── benchmark.py                 # NEW — POST /benchmark
│   ├── ask.py                       # IMPLEMENTED — POST /ask (RAG)
│   └── countries.py                 # KEPT — GET /countries (legacy)
└── services/
    ├── databricks_client.py         # UPDATED — add vector_search(), query_llm()
    └── data_loader.py               # UPDATED — still loads legacy tables
```

Files to remove: `mismatch.py`, `mismatch_engine.py`, `compare.py`.

### 4.10 Updated `main.py`

```python
from .routers import globe, benchmark, ask, countries

app.include_router(globe.router, prefix="/api/globe")
app.include_router(benchmark.router, prefix="/api")
app.include_router(ask.router, prefix="/api")
app.include_router(countries.router, prefix="/api")  # legacy
```

---

## 5. Frontend Implementation

### 5.1 Globe Visualization: Severity Volcanoes

The globe uses `react-globe.gl`'s **`customLayerData`** to render 3D volcano bar clusters at each country's centroid.

**Volcano Concept:**

Each country renders a cluster of up to 8 vertical bars at its lat/lng. Each bar = one crisis.

```
         ▐█▌             ← Crisis 1: severity 4.8 (tallest)
     ▐█▌ ▐█▌             ← Crisis 2: severity 3.5
     ▐█▌ ▐█▌ ▐█▌         ← Crisis 3: severity 2.1
     ▐█▌ ▐█▌ ▐█▌
     ───────────          ← Country surface
      (SDN) Sudan
```

- Bar height = `acaps_severity` (0–5 scale, mapped to altitude 0–0.5)
- Bar color = severity class (green → yellow → orange → red → dark red)
- Bar count = number of crises (max 8, filtered by `crisis_rank <= 8`)

**B2B Ratio Lines within Volcanoes:**

Each bar has a horizontal line showing the avg B2B ratio for that crisis relative to a global baseline:

```
     ▐█▌
     ▐█━━━━▌   ← B2B line at 72nd percentile (green = efficient)
     ▐█▌
     ▐█▌
     ▐━▌       ← B2B line at 15th percentile (red = inefficient)
     ▐█▌
```

- Line Y-position within bar = `avg_b2b_ratio` mapped as percentile of bar height
- Line color: green if above median, red if below

**Implementation with `customThreeObject`:**

```tsx
import * as THREE from 'three';

const FUNDING_STATE_COLORS = {
  NO_HRP:       null,     // no line rendered
  UNDERFUNDED:  0xff0000, // red
  INEFFICIENT:  0xff8800, // orange
  ADEQUATE:     0x00cc00, // green
};

<GlobeGL
  customLayerData={volcanoData}
  customThreeObject={(d) => {
    const group = new THREE.Group();
    d.crises.forEach((crisis, i) => {
      const barHeight = crisis.acaps_severity * 0.1;
      const geometry = new THREE.BoxGeometry(0.3, barHeight, 0.3);

      // NO_HRP crises get a wireframe bar to visually distinguish "invisible" crises
      const isInvisible = crisis.funding_state === 'NO_HRP';
      const material = new THREE.MeshLambertMaterial({
        color: severityColor(crisis.acaps_severity),
        transparent: true,
        opacity: isInvisible ? 0.3 : 0.85,
        wireframe: isInvisible,
      });
      const bar = new THREE.Mesh(geometry, material);
      bar.position.x = i * 0.4 - (d.crises.length * 0.2);
      bar.position.y = barHeight / 2;
      group.add(bar);

      // B2B ratio line — only rendered if funding state is not NO_HRP
      const lineColor = FUNDING_STATE_COLORS[crisis.funding_state];
      if (lineColor !== null && crisis.avg_b2b_ratio != null) {
        const b2bY = (crisis.avg_b2b_ratio_percentile ?? 0.5) * barHeight;
        const lineGeo = new THREE.BoxGeometry(0.35, 0.02, 0.35);
        const lineMat = new THREE.MeshBasicMaterial({ color: lineColor });
        const line = new THREE.Mesh(lineGeo, lineMat);
        line.position.x = bar.position.x;
        line.position.y = b2bY;
        group.add(line);
      }
    });
    return group;
  }}
  customThreeObjectUpdate={(obj, d) => {
    Object.assign(obj.position, globeRef.current.getCoords(d.lat, d.lng, 0.01));
  }}
/>
```

**Visual mapping summary:**

| `funding_state` | Bar Style | B2B Line | Line Color |
|---|---|---|---|
| `NO_HRP` | Wireframe, 30% opacity | None | — |
| `UNDERFUNDED` | Solid, 85% opacity | Shown | Red |
| `INEFFICIENT` | Solid, 85% opacity | Shown | Orange |
| `ADEQUATE` | Solid, 85% opacity | Shown | Green |

### 5.2 API Layer

```tsx
// frontend/src/lib/api.ts
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function fetchGlobeCrises(year: number, month?: number) {
  const params = new URLSearchParams({ year: String(year) });
  if (month != null) params.set("month", String(month));
  const res = await fetch(`${API_BASE}/api/globe/crises?${params}`);
  return res.json();
}

export async function fetchGlobeB2B(iso3: string, year: number) {
  const res = await fetch(`${API_BASE}/api/globe/b2b?iso3=${iso3}&year=${year}`);
  return res.json();
}

export async function fetchBenchmark(projectCode: string, numNeighbors = 5) {
  const res = await fetch(`${API_BASE}/api/benchmark`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_code: projectCode, num_neighbors: numNeighbors }),
  });
  return res.json();
}

export async function fetchAsk(question: string) {
  const res = await fetch(`${API_BASE}/api/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  return res.json();
}

// Legacy — kept for cross-reference agent context
export async function fetchCountries(year: number) {
  const res = await fetch(`${API_BASE}/api/countries?year=${year}`);
  return res.json();
}
```

### 5.3 Component Structure

```
frontend/src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                     # Main page: globe + panels
│   └── globals.css
├── components/
│   ├── Globe.tsx                    # Globe with volcano + B2B layers
│   ├── VolcanoTooltip.tsx           # Hover tooltip for volcano bars
│   ├── CountryDrawer.tsx            # Slide-up detail panel on click
│   ├── B2BChart.tsx                 # Bar chart of B2B ratios per project
│   ├── SidePanel.tsx                # Filters (year, cluster) + country list
│   ├── VoiceAgent.tsx               # ElevenLabs integration
│   └── MonthYearSelector.tsx         # Year (2022–2026) + month (1–12) filter
├── context/
│   └── GlobeContext.tsx             # Shared state
├── lib/
│   └── api.ts                       # API fetcher functions
└── types/
    └── crisis.ts                    # TypeScript interfaces
```

### 5.4 State Management

```tsx
// frontend/src/context/GlobeContext.tsx
interface GlobeState {
  selectedCountry: string | null;
  selectedCrisis: CrisisSummary | null;
  year: number;                      // 2022–2026
  month: number | null;              // 1–12 or null for full year
  viewMode: 'volcanoes' | 'b2b-detail';
  volcanoData: CountryVolcano[];     // from /api/globe/crises
  b2bData: ProjectB2B[] | null;      // from /api/globe/b2b (on click)
}
```

### 5.5 User Interaction Flow

```
1. Page loads → fetch /api/globe/crises?year=2024&month=2
2. Globe renders volcano clusters for all countries (one month at a time for simpler view)
3. User changes year or month → re-fetch /api/globe/crises?year=YYYY&month=M
4. User hovers volcano bar → tooltip shows crisis name, severity, B2B ratio
5. User clicks volcano bar → fetch /api/globe/b2b?iso3=XXX&year=YYYY
6. CountryDrawer slides up with B2B breakdown chart
7. User clicks outlier project → fetch /api/benchmark with project_code
8. Drawer shows similar projects + B2B delta analysis
9. User can ask ElevenLabs agent about the comparison
```

### 5.6 TypeScript Interfaces

```tsx
// frontend/src/types/crisis.ts
type FundingState = 'NO_HRP' | 'UNDERFUNDED' | 'INEFFICIENT' | 'ADEQUATE';

interface CrisisSummary {
  crisis_id: string;
  crisis_name: string;
  acaps_severity: number;
  severity_class: string;
  has_hrp: boolean;
  appeal_type: string | null;
  funding_state: FundingState;
  people_in_need: number;
  funding_gap_usd: number | null;
  funding_coverage_pct: number | null;
  avg_b2b_ratio: number | null;
  median_b2b_ratio: number | null;
  project_count: number;
  crisis_rank: number;
}

interface CountryVolcano {
  iso3: string;
  country_name: string;
  lat: number;
  lng: number;
  crises: CrisisSummary[];
}

interface ProjectB2B {
  project_code: string;
  project_name: string;
  cluster: string;
  requested_funds: number;
  target_beneficiaries: number;
  b2b_ratio: number;
  cost_per_beneficiary: number;
  b2b_percentile: number;
  is_outlier: boolean;
  cluster_median_b2b: number;
}

interface BenchmarkResult {
  query_project: ProjectB2B;
  neighbors: (ProjectB2B & { b2b_delta: number; similarity_score: number })[];
  insight: string;
}
```

---

## 6. ElevenLabs Implementation

### 6.1 Agent Configuration

**System Prompt:**
```
You are a humanitarian crisis analyst assistant for the Crisis Topography Command Center.
You help users understand:
1. Crisis severity across countries (volcano visualization data)
2. Beneficiary-to-budget ratios — which projects serve the most people per dollar
3. Overlooked crises — countries with high severity but no HRP plan
4. Benchmarking — comparing similar projects across countries to find inefficiencies

When a user asks about a country, use navigateToCountry to focus the globe.
When a user asks to compare projects or find overlooked crises, use the benchmarkProject tool.
Always cite specific numbers. When discussing B2B ratios, explain whether a higher or lower ratio
indicates better or worse efficiency (higher = more beneficiaries per dollar = better).
```

### 6.2 Client Tools

**Tool 1: `navigateToCountry`** — Rotates globe to a country.

```json
{
  "name": "navigateToCountry",
  "description": "Navigate the globe to focus on a specific country.",
  "parameters": {
    "type": "object",
    "properties": {
      "iso3": {
        "type": "string",
        "description": "ISO 3166-1 alpha-3 country code (e.g., SDN, UKR, YEM)"
      }
    },
    "required": ["iso3"]
  }
}
```

**Tool 2: `filterByMonthYear`** — Changes displayed year and month (2022–2026, 1–12).

```json
{
  "name": "filterByMonthYear",
  "description": "Change the year and month of data displayed on the globe.",
  "parameters": {
    "type": "object",
    "properties": {
      "year": {
        "type": "integer",
        "description": "The year to display (2022-2026)"
      },
      "month": {
        "type": "integer",
        "description": "The month to display (1-12, January=1)"
      }
    },
    "required": ["year", "month"]
  }
}
```

**Tool 3: `benchmarkProject`** — Finds similar projects and compares B2B ratios.

```json
{
  "name": "benchmarkProject",
  "description": "Find similar humanitarian projects and compare their beneficiary-to-budget ratios. Use when the user asks about project efficiency, overlooked crises, or wants to compare funding allocation.",
  "parameters": {
    "type": "object",
    "properties": {
      "project_code": {
        "type": "string",
        "description": "The project code to benchmark (e.g., SDN-24/H/001)"
      },
      "num_neighbors": {
        "type": "integer",
        "description": "Number of similar projects to find (default 5)"
      }
    },
    "required": ["project_code"]
  }
}
```

Implementation in `VoiceAgent.tsx`:
```tsx
clientTools: {
  navigateToCountry: ({ iso3 }) => {
    setSelectedCountry(iso3);
    return `Navigated to ${iso3}`;
  },
  filterByMonthYear: ({ year, month }) => {
    setYear(year);
    setMonth(month);
    return `Showing data for ${year}-${String(month).padStart(2, '0')}`;
  },
  benchmarkProject: async ({ project_code, num_neighbors }) => {
    const result = await fetchBenchmark(project_code, num_neighbors || 5);
    return JSON.stringify(result);
  },
}
```

### 6.3 Server Tool: `/api/ask`

Configure in ElevenLabs dashboard as a server-side tool:

```json
{
  "name": "askCrisisData",
  "description": "Ask a question about humanitarian crisis data, funding gaps, or overlooked crises. Returns a data-backed answer.",
  "api": {
    "url": "https://your-backend-url.com/api/ask",
    "method": "POST",
    "headers": { "Content-Type": "application/json" }
  },
  "parameters": {
    "type": "object",
    "properties": {
      "question": { "type": "string" }
    },
    "required": ["question"]
  }
}
```

### 6.4 Benchmarking Query Flow

```
User: "Are there health projects in East Africa that are underfunded
       compared to similar projects in other regions?"

ElevenLabs Agent:
  1. Calls askCrisisData with the question
  2. Backend:
     a. Vector search on project_embeddings for "health East Africa"
     b. Returns matching projects with B2B ratios
     c. LLM synthesizes: "Health projects in Somalia (B2B: 0.02)
        serve 60% fewer beneficiaries per dollar than similar
        projects in Bangladesh (B2B: 0.05). The Somalia HRP is
        only 28% funded vs Bangladesh at 61%."
  3. Agent speaks the answer
  4. Agent calls navigateToCountry({ iso3: "SOM" }) to show Somalia
```

### 6.5 Stretch Goal: Reallocation Suggestions

If the LLM finds significant B2B deltas, it can propose actionable recommendations:

```
Agent: "Based on benchmarking, the Somalia health response could serve
an additional 150,000 beneficiaries if funded at the same rate as
comparable projects in Bangladesh. I recommend:
1. Increasing CBPF allocation to Somalia Health cluster by $12M
2. Reviewing the 3 flagged outlier projects with cost-per-beneficiary
   above $200 (cluster median is $45)
3. Creating an HRP for South Sudan's nutrition crisis, which currently
   has no response plan despite severity score of 4.2."
```

Implemented by adding a follow-up LLM call in `/api/ask` that includes benchmark results as context and a prompt requesting actionable suggestions.

---

## 7. Data Contracts & Schemas

### 7.1 Globe ↔ Backend Contract

The frontend expects exactly this shape from `/api/globe/crises`:

```json
{
  "year": 2024,
  "month": 2,
  "year_month": "2024-02",
  "countries": [
    {
      "iso3": "string (ISO3)",
      "country_name": "string",
      "lat": "number",
      "lng": "number",
      "crises": [
        {
          "crisis_id": "string",
          "crisis_name": "string",
          "acaps_severity": "number (0-5)",
          "severity_class": "string",
          "has_hrp": "boolean",
          "appeal_type": "string | null ('HRP', 'Flash', 'Regional', 'Other')",
          "funding_state": "string ('NO_HRP' | 'UNDERFUNDED' | 'INEFFICIENT' | 'ADEQUATE')",
          "people_in_need": "number",
          "funding_gap_usd": "number | null",
          "funding_coverage_pct": "number (0-1) | null",
          "avg_b2b_ratio": "number | null",
          "median_b2b_ratio": "number | null",
          "project_count": "number",
          "crisis_rank": "number (1-8)"
        }
      ]
    }
  ]
}
```

### 7.2 Databricks Table Summary

| Table | Rows | Purpose | Queried By |
|---|---|---|---|
| `workspace.default.crisis_summary` | ~2,400–4,800 (crises × year-months) | Globe volcanoes + B2B summary lines | `/api/globe/crises` |
| `workspace.default.project_embeddings` | ~5,000–15,000 (projects × years) | Drill-down, benchmarking, RAG | `/api/globe/b2b`, `/api/benchmark`, `/api/ask` |
| `workspace.default.plans` | (legacy, unchanged) | Cross-reference for agent | `/api/countries` |
| `workspace.default.funding` | (legacy, unchanged) | Cross-reference for agent | `/api/countries` |
| `workspace.default.humanitarian_needs` | (legacy, unchanged) | Cross-reference for agent | `/api/countries` |
| `workspace.default.population` | (legacy, unchanged) | Cross-reference for agent | `/api/countries` |

---

## 8. Migration Checklist

### Phase 1: Databricks

- [ ] Generate or obtain CSV `acaps_crises_2022_2026.csv` with 48 months of ACAPS crisis data (Jan 2022–Dec 2026)
- [ ] Notebook `01_crisis_summary.py` — load ACAPS from CSV + HPC plans + HDX funding/needs + project B2B aggregates → write `crisis_summary` with `year`, `month`, `year_month`
- [ ] Verify `crisis_summary` has ACAPS severity scores, HRP flags, funding gaps, B2B averages, and month granularity
- [ ] Verify max 8 crises per country per month (crisis_rank filter)
- [ ] Notebook `02_project_embeddings.py` — pull HPC projects → compute B2B ratios + percentiles + outlier flags → build text blobs → write `project_embeddings`
- [ ] Create Vector Search index on `project_embeddings`
- [ ] Verify vector search returns meaningful nearest neighbors

### Phase 2: Backend Refactor

- [ ] Add `vector_search()` and `query_llm()` to `databricks_client.py`
- [ ] Create `routers/globe.py` with `GET /crises` and `GET /b2b`
- [ ] Create `routers/benchmark.py` with `POST /benchmark`
- [ ] Implement `routers/ask.py` with RAG pipeline
- [ ] Update `main.py` to register new routers, remove mismatch
- [ ] Keep `data_loader.py` loading legacy tables for `/api/countries`
- [ ] Remove `mismatch.py`, `mismatch_engine.py`, `compare.py`

### Phase 3: Frontend Build

- [ ] Create `lib/api.ts` with all API fetchers
- [ ] Create `types/crisis.ts` with TypeScript interfaces
- [ ] Create `context/GlobeContext.tsx` with state management
- [ ] Build `Globe.tsx` with volcano bars using `customThreeObject`
- [ ] Build B2B ratio lines within volcano bars
- [ ] Build `VolcanoTooltip.tsx` for hover interactions
- [ ] Build `CountryDrawer.tsx` with B2B breakdown chart
- [ ] Build `SidePanel.tsx` with year (2022–2026) + month (1–12) selector and filters
- [ ] Wire up click → `/api/globe/b2b` → drawer flow

### Phase 4: ElevenLabs Integration

- [ ] Update agent system prompt in ElevenLabs dashboard
- [ ] Add `benchmarkProject` client tool
- [ ] Add `askCrisisData` server tool pointing to `/api/ask`
- [ ] Build `VoiceAgent.tsx` component with all client tools
- [ ] Test voice → benchmark → globe navigation flow
- [ ] (Stretch) Add reallocation suggestion prompt engineering

### Phase 5: End-to-End Validation

- [ ] Query `crisis_summary` from frontend with `year` + `month`, verify volcano rendering
- [ ] Click country → verify B2B detail loads from `project_embeddings`
- [ ] Run benchmark query → verify nearest neighbors + B2B deltas
- [ ] Ask ElevenLabs "Which crises lack HRP plans?" → verify RAG answer
- [ ] Verify year + month filter (2022–2026, 1–12) works for `/api/globe/crises`
- [ ] Verify max 8 crises per country per month on globe
- [ ] Test with known cases: Sudan, Yemen, Ukraine, Bangladesh

### Phase 6: Stretch — Scheduled ACAPS Refresh

- [ ] Create job to run on 1st of each month
- [ ] Obtain ACAPS token via `POST /api/v1/token-auth/` with `ACAPS_USERNAME`, `ACAPS_PASSWORD`
- [ ] Call `GET /api/v1/inform-severity-index/{PrevMonth}{PrevYear}/` for previous month
- [ ] Append/upsert new rows into `crisis_summary`

