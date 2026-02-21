# Crisis Topography — Refactor Implementation Plan

> **Scope:** Transition from flat table reads to a Bronze/Silver/Gold medallion pipeline, volcano-based globe visualization with B2B ratio lines, project-level HPC data ingestion, Gemini-powered vector embeddings for benchmarking, and ElevenLabs-driven crisis comparison.

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
| Databricks tables | 4 flat tables (`plans`, `funding`, `humanitarian_needs`, `population`) in `workspace.default.*`. No medallion layers, no severity scores, no project-level data. |
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
| Databricks | Bronze → Silver → Gold medallion. ACAPS severity, HPC project data, FTS funding, HRP plans. B2B ratios at project level. Gemini embeddings for benchmarking. Data range: **2022–2026 only**. |
| Backend | On-demand SQL queries to Gold tables (`crisis_summary`, `project_b2b`). Vector search proxy for ElevenLabs. Existing `plans`/`funding`/`needs`/`population` data preserved as cross-reference corpus for RAG. |
| Frontend Globe | Severity-index volcanoes (max 8 crises per country, bar height = severity). B2B ratio lines attached within each volcano bar. Direct SQL queries to Databricks Gold tables via backend proxy. |
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
│    GET  /api/globe/crises?year=2024          → volcano data      │
│    GET  /api/globe/b2b?iso3=SDN&year=2024   → B2B ratios        │
│    POST /api/benchmark                       → embedding search  │
│    POST /api/ask                             → RAG Q&A           │
│    GET  /api/countries?year=2024             → legacy cross-ref  │
└──────────────────────────┬───────────────────────────────────────┘
                           │ REST (JSON)
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                     BACKEND (FastAPI)                             │
│                                                                  │
│  /api/globe/crises    → SQL query to gold.crisis_summary         │
│  /api/globe/b2b       → SQL query to gold.project_b2b            │
│  /api/benchmark       → Vector search on project_embeddings      │
│  /api/ask             → Vector search + LLM (Gemini / LLaMA)     │
│  /api/countries       → Legacy: cross-reference dataset (kept)   │
│                                                                  │
│  All queries go through databricks_client.execute_sql()          │
│  Vector queries go through databricks_client.vector_search()     │
└──────────┬───────────────────────────────────┬───────────────────┘
           │                                   │
           ▼                                   ▼
┌─────────────────────────┐   ┌────────────────────────────────────┐
│   External APIs         │   │        DATABRICKS                  │
│   (ingested into Bronze)│   │                                    │
│                         │   │  BRONZE (raw, append-only)         │
│  • HPC /plan/year/YYYY  │   │    bronze.plans                    │
│  • HPC /project/plan/ID │   │    bronze.projects                 │
│  • HPC /fts/flow        │   │    bronze.fts_flows                │
│  • HDX HAPI /hum-needs  │   │    bronze.humanitarian_needs       │
│  • HDX HAPI /population │   │    bronze.population               │
│  • ACAPS severity API   │   │    bronze.acaps_severity            │
│                         │   │                                    │
│  Years: 2022–2026       │   │  SILVER (cleaned, ISO3-keyed)      │
│                         │   │    silver.crisis_spine              │
└─────────────────────────┘   │    silver.projects_enriched         │
                              │                                    │
                              │  GOLD (query-ready)                │
                              │    gold.crisis_summary  ← globe    │
                              │    gold.project_b2b     ← globe    │
                              │    gold.project_embeddings ← RAG   │
                              │    gold.cross_reference    ← agent │
                              │                                    │
                              │  Vector Search Index                │
                              │    project_embeddings_index         │
                              └────────────────────────────────────┘
```

---

## 3. Databricks Implementation

### 3.1 Medallion Layer Design

#### Bronze — Raw Ingest

All Bronze tables are **append-only** with an `_ingested_at` timestamp column. No transformations. Schema matches the source API response exactly, plus metadata.

| Table | Source | Ingest Method |
|---|---|---|
| `bronze.plans` | `HPC /v1/public/plan/year/{y}` for y in 2022..2026 | One JSON blob per plan, flattened to columns |
| `bronze.projects` | `HPC /v1/public/project/plan/{planId}` for each plan | **NEW** — one row per project per plan. Fields: `code`, `name`, `currentRequestedFunds`, `targetBeneficiaries`, `globalClusters`, `locations`, `objectives`, `description` |
| `bronze.fts_flows` | `HPC /v1/public/fts/flow?year={y}&groupby=Country` | Funding flows per country per year |
| `bronze.humanitarian_needs` | `HDX HAPI /v2/affected-people/humanitarian-needs` | Paginated, all records 2022–2026 |
| `bronze.population` | `HDX HAPI /v2/geography-infrastructure/baseline-population` | Baseline population per country |
| `bronze.acaps_severity` | `ACAPS Severity Index API` | **NEW** — crisis severity ratings per country. Fields: `iso3`, `crisis_name`, `overall_severity`, `severity_score`, `date` |

**Notebook: `01_bronze_ingest.py`**

Key additions to current ingestion:
- Filter all API calls to years **2022–2026** only.
- Add project-level data pull (loop through all plan IDs, fetch `/project/plan/{id}`).
- Add ACAPS severity index pull.
- Append `_ingested_at = current_timestamp()` to every row.
- Write mode: `append` (not overwrite). Bronze is immutable.

```python
# Pseudo-structure for project ingest (the critical new piece)
plan_ids = spark.table("bronze.plans").select("id").distinct().collect()

all_projects = []
for row in plan_ids:
    resp = requests.get(f"{HPC_BASE}/project/plan/{row.id}")
    if resp.ok:
        for p in resp.json().get("data", []):
            all_projects.append({
                "plan_id": row.id,
                "project_code": p.get("code"),
                "project_name": p.get("name", ""),
                "requested_funds": p.get("currentRequestedFunds", 0),
                "target_beneficiaries": p.get("targetBeneficiaries", 0),
                "clusters": [c.get("name") for c in p.get("globalClusters", [])],
                "locations": p.get("locations", []),
                "description": p.get("description", ""),
                "objectives": p.get("objectives", ""),
                "_ingested_at": datetime.utcnow().isoformat(),
            })
```

```python
# ACAPS severity ingest
ACAPS_URL = "https://api.acaps.org/api/v1/inform-severity-index/"
resp = requests.get(ACAPS_URL, params={"format": "json", "limit": 2000})
acaps_data = resp.json().get("results", [])
# Filter to 2022-2026, write to bronze.acaps_severity
```

#### Silver — Cleaned & Joined

Silver performs cleaning, standardization, and joining into a crisis-centric spine. All tables are keyed by **ISO3 country code**.

**Table: `silver.crisis_spine`**

One row per **crisis per country per year**. This is the master dimension table.

| Column | Type | Source |
|---|---|---|
| `iso3` | STRING | Standardized from all sources |
| `country_name` | STRING | Canonical name |
| `year` | INT | 2022–2026 |
| `crisis_id` | STRING | ACAPS crisis identifier (or synthetic) |
| `crisis_name` | STRING | From ACAPS |
| `acaps_severity` | FLOAT | ACAPS overall severity score (0–5 scale) |
| `severity_class` | STRING | Derived: `Very Low`, `Low`, `Medium`, `High`, `Very High` |
| `has_hrp` | BOOLEAN | **HRP existence flag** — `TRUE` if a matching HRP plan exists for this country-year |
| `people_in_need` | BIGINT | From humanitarian_needs, summed for the country-year |
| `people_targeted` | BIGINT | From HRP plan if available |
| `requirements_usd` | DECIMAL | FTS total requested |
| `funding_usd` | DECIMAL | FTS total received |
| `funding_gap_usd` | DECIMAL | `requirements_usd - funding_usd` |
| `funding_coverage_pct` | FLOAT | `funding_usd / requirements_usd` |

**Notebook: `02_silver_crisis_spine.py`**

```python
# Join logic:
# 1. Start with ACAPS severity as the spine (one row per crisis per country)
# 2. Left join HRP plans on iso3 + year → set has_hrp flag
# 3. Left join humanitarian_needs aggregated to country-year
# 4. Left join FTS funding flows on iso3 + year
# 5. Compute funding_gap_usd = requirements - funding
# 6. Compute funding_coverage_pct = funding / requirements
```

**Table: `silver.projects_enriched`**

One row per **project** with cleaned fields and the B2B ratio pre-computed.

| Column | Type | Source |
|---|---|---|
| `project_code` | STRING | HPC project code |
| `project_name` | STRING | HPC |
| `plan_id` | INT | HPC plan ID |
| `iso3` | STRING | Derived from project locations |
| `country_name` | STRING | Canonical |
| `year` | INT | From associated plan |
| `cluster` | STRING | Primary global cluster |
| `sector` | STRING | Sector if available |
| `requested_funds` | DECIMAL | `currentRequestedFunds` |
| `target_beneficiaries` | BIGINT | `targetBeneficiaries` |
| `b2b_ratio` | FLOAT | **Beneficiary-to-Budget ratio** = `target_beneficiaries / requested_funds`. Higher = more people served per dollar. |
| `cost_per_beneficiary` | FLOAT | Inverse: `requested_funds / target_beneficiaries` |
| `description` | STRING | Project description text |
| `objectives` | STRING | Project objectives text |

**Notebook: `03_silver_projects.py`**

```python
# Clean projects from bronze
# 1. Explode locations to get iso3 per project
# 2. Join plan metadata to get year
# 3. Filter: requested_funds > 0 AND target_beneficiaries > 0
# 4. Compute b2b_ratio = target_beneficiaries / requested_funds
# 5. Compute cost_per_beneficiary = requested_funds / target_beneficiaries
# 6. Extract primary cluster name
```

#### Gold — Query-Ready Tables

**Table: `gold.crisis_summary`** — Drives the globe volcanoes.

One row per **crisis per country per year/month**. Globe queries this directly.

| Column | Type | Description |
|---|---|---|
| `iso3` | STRING | Country code |
| `country_name` | STRING | Display name |
| `lat` | FLOAT | Country centroid latitude |
| `lng` | FLOAT | Country centroid longitude |
| `year` | INT | Year |
| `crisis_id` | STRING | Crisis identifier |
| `crisis_name` | STRING | Crisis display name |
| `acaps_severity` | FLOAT | Severity score (0–5), drives volcano bar height |
| `severity_class` | STRING | Category label |
| `has_hrp` | BOOLEAN | Whether an HRP exists |
| `people_in_need` | BIGINT | PIN for this crisis |
| `funding_gap_usd` | DECIMAL | Unmet funding |
| `funding_coverage_pct` | FLOAT | % funded |
| `avg_b2b_ratio` | FLOAT | Average B2B ratio across projects in this crisis |
| `median_b2b_ratio` | FLOAT | Median B2B ratio |
| `project_count` | INT | Number of HRP projects |
| `crisis_rank` | INT | Rank within country (1 = worst), **capped at 8** |

**Notebook: `04_gold_crisis_summary.py`**

```python
# 1. Start from silver.crisis_spine
# 2. Join aggregated project B2B stats from silver.projects_enriched
#    (avg, median b2b_ratio grouped by iso3+year+crisis_id)
# 3. Add country centroid lat/lng from static lookup
# 4. Rank crises within each country by acaps_severity DESC
# 5. Filter to crisis_rank <= 8 (max 8 per country for globe)
# 6. Write to gold.crisis_summary
```

**Table: `gold.project_b2b`** — B2B ratio detail for globe drill-down.

| Column | Type | Description |
|---|---|---|
| `iso3` | STRING | Country code |
| `year` | INT | Year |
| `project_code` | STRING | Project identifier |
| `project_name` | STRING | Display name |
| `cluster` | STRING | Humanitarian cluster |
| `requested_funds` | DECIMAL | Budget |
| `target_beneficiaries` | BIGINT | People targeted |
| `b2b_ratio` | FLOAT | Beneficiaries per dollar |
| `cost_per_beneficiary` | FLOAT | Dollars per beneficiary |
| `b2b_percentile` | FLOAT | Percentile rank within cluster (0–1) |
| `is_outlier` | BOOLEAN | Below 10th or above 90th percentile |
| `cluster_median_b2b` | FLOAT | For comparison |

**Notebook: `05_gold_project_b2b.py`**

```python
# 1. Read silver.projects_enriched
# 2. Compute per-cluster percentiles for b2b_ratio
# 3. Flag outliers (below p10 or above p90)
# 4. Attach cluster-level median for delta comparison
# 5. Write to gold.project_b2b
```

**Table: `gold.project_embeddings`** — Powers benchmarking via vector search.

| Column | Type | Description |
|---|---|---|
| `project_id` | STRING | `{project_code}_{year}` |
| `iso3` | STRING | Country |
| `year` | INT | Year |
| `cluster` | STRING | Cluster |
| `b2b_ratio` | FLOAT | For comparison |
| `cost_per_beneficiary` | FLOAT | For comparison |
| `text_blob` | STRING | Concatenation of: project name + cluster + sector + description + country + year |
| `embedding` | ARRAY<FLOAT> | Gemini embedding vector |

**Notebook: `06_gold_embeddings.py`**

```python
# 1. Read silver.projects_enriched
# 2. Construct text_blob per project:
#    f"{project_name} | {cluster} | {sector} | {description} | {country_name} | {year}"
# 3. Call Gemini embedding API (or Databricks managed embedding endpoint)
#    for each text_blob in batches
# 4. Store embedding vector alongside project metadata
# 5. Write to gold.project_embeddings
# 6. Create/update Databricks Vector Search index on this table
```

Vector Search Index configuration:
```python
vsc.create_delta_sync_index(
    endpoint_name="crisis-rag-endpoint",
    index_name="gold.project_embeddings_index",
    source_table_name="gold.project_embeddings",
    pipeline_type="TRIGGERED",
    primary_key="project_id",
    embedding_source_column="text_blob",
    embedding_model_endpoint_name="databricks-bge-large-en"
    # OR use pre-computed Gemini embeddings with embedding_vector_column="embedding"
)
```

**Table: `gold.cross_reference`** — Preserved legacy data for agent RAG context.

| Column | Type | Description |
|---|---|---|
| `doc_id` | STRING | `{iso3}_{year}` |
| `iso3` | STRING | Country |
| `year` | INT | Year |
| `text` | STRING | Natural language summary of plans, funding, needs, population for this country-year |

This table is built from the original 4 tables (plans, funding, humanitarian_needs, population) and serves as the cross-reference dataset the ElevenLabs agent uses to compare crises that did NOT receive HRP plans against those that did.

**Notebook: `07_gold_cross_reference.py`**

```python
# 1. Join plans + funding + humanitarian_needs + population by iso3 + year
# 2. For each country-year, generate a text summary:
#    "Country: {name} ({iso3}), Year: {year}.
#     HRP Plan: {plan_name or 'No HRP plan'}.
#     People in need: {pin}. Population: {pop}.
#     Funding requested: ${req}. Funding received: ${rcv}. Gap: ${gap}.
#     Coverage: {pct}%. Funding per capita: ${fpc}."
# 3. Write to gold.cross_reference
# 4. Can optionally add to the same vector search index
```

### 3.2 Notebook Execution Order

```
01_bronze_ingest.py
    ↓
02_silver_crisis_spine.py
    ↓
03_silver_projects.py
    ↓ (parallel from here)
04_gold_crisis_summary.py    05_gold_project_b2b.py
    ↓                            ↓
06_gold_embeddings.py
    ↓
07_gold_cross_reference.py
```

### 3.3 API Sources & Year Filtering

| Source | Endpoint | Year Filter Strategy |
|---|---|---|
| HPC Plans | `/v1/public/plan/year/{y}` | Loop y = 2022..2026 |
| HPC Projects | `/v1/public/project/plan/{planId}` | Derived from plans within 2022–2026 |
| HPC FTS Flows | `/v1/public/fts/flow?year={y}` | Query param `year=2022..2026` |
| HDX Humanitarian Needs | `/v2/affected-people/humanitarian-needs` | Filter `reference_period_start` >= 2022-01-01 |
| HDX Population | `/v2/geography-infrastructure/baseline-population` | Take latest available |
| ACAPS Severity | ACAPS Inform Severity Index API | Filter response by date >= 2022-01-01 |

---

## 4. Backend Implementation

### 4.1 New Router: `/api/globe/crises`

**Purpose:** Serve volcano data for the globe. Queries `gold.crisis_summary` on demand (no startup cache).

```
GET /api/globe/crises?year=2024
```

Response:
```json
{
  "year": 2024,
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
          "people_in_need": 24800000,
          "funding_gap_usd": 1960000000,
          "funding_coverage_pct": 0.30,
          "avg_b2b_ratio": 0.0042,
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
SELECT * FROM gold.crisis_summary
WHERE year = :year
ORDER BY iso3, crisis_rank
```

Then group rows by `iso3` in Python before returning.

### 4.2 New Router: `/api/globe/b2b`

**Purpose:** Serve B2B ratio breakdown for a specific country, used when user clicks a volcano.

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
SELECT * FROM gold.project_b2b
WHERE iso3 = :iso3 AND year = :year
ORDER BY b2b_ratio DESC
```

### 4.3 New Router: `/api/benchmark`

**Purpose:** Given a project (or country-crisis), find nearest neighbors in embedding space and compare B2B ratios. This is what ElevenLabs calls for benchmarking.

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
1. Look up the query project in `gold.project_b2b` to get its metadata.
2. Call `databricks_client.vector_search()` with the project's `text_blob` to find nearest neighbors.
3. Fetch neighbor B2B ratios from `gold.project_b2b`.
4. Compute deltas and return.

### 4.4 Updated Router: `/api/ask`

**Purpose:** RAG-based Q&A for the ElevenLabs agent. Searches both `project_embeddings` and `cross_reference` for context.

```
POST /api/ask
{ "question": "Which health crises lack HRP plans but have high severity?" }
```

Implementation:
1. Vector search against `gold.project_embeddings_index` with the question.
2. Optionally also query `gold.cross_reference` for country-level context.
3. Assemble context, send to LLM (Databricks Foundation Model or Gemini).
4. Return answer text (ElevenLabs speaks it).

### 4.5 Legacy Router: `/api/countries` (Kept)

The existing `/api/countries` endpoint stays as-is. It continues reading from the original 4 tables (now persisted in `gold.cross_reference` or still accessible from Bronze). This provides backward compatibility and serves as the cross-reference dataset the ElevenLabs agent can use.

### 4.6 Deprecated: `/api/mismatch`

The stub mismatch endpoint is replaced by `/api/globe/crises` which provides severity + B2B data in a globe-ready format. The mismatch router should be removed or redirected.

### 4.7 New Service: `databricks_client.py` Additions

Add `vector_search()` function:
```python
async def vector_search(query_text: str, index_name: str, num_results: int = 5) -> list[dict]:
    """Query a Databricks Vector Search index."""
    ...
```

Add `query_llm()` function:
```python
async def query_llm(prompt: str, model: str = "databricks-meta-llama-3-1-70b-instruct") -> str:
    """Call a Databricks Foundation Model serving endpoint."""
    ...
```

### 4.8 Startup Change: No More Bulk Load

**Before:** `data_loader.py` runs 4 `SELECT *` queries at startup and caches everything in `app.state.data`.

**After:** Remove the bulk startup load. Globe endpoints query Gold tables on demand (they are small and fast via SQL warehouse). The only startup action is a health-check ping to verify Databricks connectivity.

```python
# backend/services/data_loader.py (refactored)
async def startup_check() -> None:
    """Verify Databricks is reachable. No bulk data load."""
    await execute_sql("SELECT 1")
```

The `/api/countries` legacy endpoint can either:
- Query on demand: `SELECT * FROM gold.cross_reference WHERE year = :year`
- Or keep the old bulk-load behavior behind a feature flag

### 4.9 Updated Backend Directory Structure

```
backend/
├── main.py                          # Updated lifespan, new routers
├── requirements.txt                 # Add google-generativeai if using Gemini directly
├── .env                             # DATABRICKS_HOST, DATABRICKS_TOKEN, WAREHOUSE_ID, ELEVENLABS_API_KEY
├── routers/
│   ├── globe.py                     # NEW — GET /api/globe/crises, GET /api/globe/b2b
│   ├── benchmark.py                 # NEW — POST /api/benchmark
│   ├── ask.py                       # IMPLEMENTED — POST /api/ask (RAG)
│   ├── countries.py                 # KEPT — GET /api/countries (legacy cross-ref)
│   ├── compare.py                   # REMOVED or merged into benchmark
│   └── mismatch.py                  # REMOVED — replaced by /api/globe/crises
└── services/
    ├── databricks_client.py         # UPDATED — add vector_search(), query_llm()
    ├── data_loader.py               # UPDATED — startup_check() only, no bulk load
    └── mismatch_engine.py           # REMOVED — logic now in Databricks Gold
```

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

The globe uses `react-globe.gl`'s **`customLayerData`** (or `htmlElementsData`) to render 3D volcano bar clusters at each country's centroid.

**Volcano Concept:**

Each country with crises renders a cluster of up to 8 vertical bars ("volcano") at the country's lat/lng. Each bar represents one crisis:

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

Each volcano bar has a horizontal line marker indicating the average B2B ratio for that crisis relative to a global baseline:

```
     ▐█▌
     ▐█━━━━▌   ← B2B line at 72nd percentile (high ratio = good)
     ▐█▌
     ▐█▌
     ▐━▌       ← B2B line at 15th percentile (low ratio = bad, red)
     ▐█▌
```

- Line position within bar = `avg_b2b_ratio` percentile mapped to bar height
- Line color: green if above median, red if below → instant visual signal of efficiency

**Implementation approach using `customThreeObject`:**

```tsx
import * as THREE from 'three';

<GlobeGL
  customLayerData={volcanoData}
  customThreeObject={(d) => {
    const group = new THREE.Group();
    d.crises.forEach((crisis, i) => {
      const barHeight = crisis.acaps_severity * 0.1;
      const geometry = new THREE.BoxGeometry(0.3, barHeight, 0.3);
      const material = new THREE.MeshLambertMaterial({
        color: severityColor(crisis.acaps_severity),
        transparent: true,
        opacity: 0.85,
      });
      const bar = new THREE.Mesh(geometry, material);
      bar.position.x = i * 0.4 - (d.crises.length * 0.2);
      bar.position.y = barHeight / 2;
      group.add(bar);

      // B2B ratio line within the bar
      const b2bY = crisis.avg_b2b_ratio_percentile * barHeight;
      const lineGeo = new THREE.BoxGeometry(0.35, 0.02, 0.35);
      const lineMat = new THREE.MeshBasicMaterial({
        color: crisis.avg_b2b_ratio_percentile > 0.5 ? 0x00ff00 : 0xff0000,
      });
      const line = new THREE.Mesh(lineGeo, lineMat);
      line.position.x = bar.position.x;
      line.position.y = b2bY;
      group.add(line);
    });
    return group;
  }}
  customThreeObjectUpdate={(obj, d) => {
    Object.assign(obj.position, globeRef.current.getCoords(d.lat, d.lng, 0.01));
  }}
/>
```

### 5.2 API Layer

```tsx
// frontend/src/lib/api.ts
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function fetchGlobeCrises(year: number) {
  const res = await fetch(`${API_BASE}/api/globe/crises?year=${year}`);
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
│   └── YearSelector.tsx             # Year filter (2022–2026)
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
  viewMode: 'volcanoes' | 'b2b-detail';
  volcanoData: CountryVolcano[];     // from /api/globe/crises
  b2bData: ProjectB2B[] | null;      // from /api/globe/b2b (on click)
}
```

### 5.5 User Interaction Flow

```
1. Page loads → fetch /api/globe/crises?year=2024
2. Globe renders volcano clusters for all countries
3. User changes year → re-fetch /api/globe/crises?year=YYYY
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
interface CrisisSummary {
  crisis_id: string;
  crisis_name: string;
  acaps_severity: number;
  severity_class: string;
  has_hrp: boolean;
  people_in_need: number;
  funding_gap_usd: number;
  funding_coverage_pct: number;
  avg_b2b_ratio: number;
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

Update the ElevenLabs agent with new capabilities:

**System Prompt (updated):**
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

### 6.2 Client Tools (Updated)

**Tool 1: `navigateToCountry`** — Same as before.

**Tool 2: `filterByYear`** — Updated range to 2022–2026.

**Tool 3: `benchmarkProject`** — NEW

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
  navigateToCountry: ({ iso3 }) => { ... },
  filterByYear: ({ year }) => { ... },
  benchmarkProject: async ({ project_code, num_neighbors }) => {
    const result = await fetchBenchmark(project_code, num_neighbors || 5);
    return JSON.stringify(result);
  },
}
```

### 6.3 Server Tool: `/api/ask`

The ElevenLabs agent dashboard should have a server-side tool configured to call `/api/ask`:

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

### 6.4 Benchmarking Query Flow (The Core Use Case)

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

If the LLM finds significant B2B deltas:
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

This is implemented by adding a follow-up LLM call in `/api/ask` that includes the benchmark results as context and a prompt instructing the model to generate actionable suggestions.

---

## 7. Data Contracts & Schemas

### 7.1 Globe ↔ Backend Contract

The frontend expects exactly this shape from `/api/globe/crises`:

```json
{
  "year": 2024,
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
          "people_in_need": "number",
          "funding_gap_usd": "number",
          "funding_coverage_pct": "number (0-1)",
          "avg_b2b_ratio": "number",
          "median_b2b_ratio": "number",
          "project_count": "number",
          "crisis_rank": "number (1-8)"
        }
      ]
    }
  ]
}
```

### 7.2 Databricks Table Naming Convention

All new tables use a three-tier catalog:

| Layer | Prefix | Example |
|---|---|---|
| Bronze | `bronze.` | `bronze.projects` |
| Silver | `silver.` | `silver.crisis_spine` |
| Gold | `gold.` | `gold.crisis_summary` |

If using `workspace.default.*` (single catalog), prefix table names:
- `workspace.default.bronze_projects`
- `workspace.default.silver_crisis_spine`
- `workspace.default.gold_crisis_summary`

---

## 8. Migration Checklist

### Phase 1: Databricks Pipeline

- [ ] Notebook `01_bronze_ingest.py` — ingest all 6 sources for 2022–2026
- [ ] Verify `bronze.projects` has project-level data with `currentRequestedFunds` + `targetBeneficiaries`
- [ ] Verify `bronze.acaps_severity` has severity scores per country-crisis
- [ ] Notebook `02_silver_crisis_spine.py` — crisis spine with ACAPS severity + HRP flag + funding gap
- [ ] Notebook `03_silver_projects.py` — project-level B2B ratios computed
- [ ] Notebook `04_gold_crisis_summary.py` — max 8 crises per country, B2B aggregates attached
- [ ] Notebook `05_gold_project_b2b.py` — per-project percentile ranks + outlier flags
- [ ] Notebook `06_gold_embeddings.py` — Gemini embeddings + Vector Search index created
- [ ] Notebook `07_gold_cross_reference.py` — legacy data preserved as RAG documents

### Phase 2: Backend Refactor

- [ ] Add `vector_search()` and `query_llm()` to `databricks_client.py`
- [ ] Create `routers/globe.py` with `GET /crises` and `GET /b2b`
- [ ] Create `routers/benchmark.py` with `POST /benchmark`
- [ ] Implement `routers/ask.py` with RAG pipeline
- [ ] Update `data_loader.py` to `startup_check()` (remove bulk load)
- [ ] Update `main.py` to register new routers, remove mismatch
- [ ] Keep `routers/countries.py` as legacy cross-reference endpoint
- [ ] Remove `mismatch.py`, `mismatch_engine.py`, `compare.py`

### Phase 3: Frontend Build

- [ ] Create `lib/api.ts` with all API fetchers
- [ ] Create `types/crisis.ts` with TypeScript interfaces
- [ ] Create `context/GlobeContext.tsx` with state management
- [ ] Build `Globe.tsx` with volcano bars using `customThreeObject`
- [ ] Build B2B ratio lines within volcano bars
- [ ] Build `VolcanoTooltip.tsx` for hover interactions
- [ ] Build `CountryDrawer.tsx` with B2B breakdown chart
- [ ] Build `SidePanel.tsx` with year selector (2022–2026) and filters
- [ ] Build `YearSelector.tsx` component
- [ ] Wire up click → `/api/globe/b2b` → drawer flow

### Phase 4: ElevenLabs Integration

- [ ] Update agent system prompt in ElevenLabs dashboard
- [ ] Add `benchmarkProject` client tool
- [ ] Add `askCrisisData` server tool pointing to `/api/ask`
- [ ] Build `VoiceAgent.tsx` component with all client tools
- [ ] Test voice → benchmark → globe navigation flow
- [ ] (Stretch) Add reallocation suggestion prompt engineering

### Phase 5: End-to-End Validation

- [ ] Query `gold.crisis_summary` from frontend, verify volcano rendering
- [ ] Click country → verify B2B detail loads
- [ ] Run benchmark query → verify nearest neighbors + B2B deltas
- [ ] Ask ElevenLabs "Which crises lack HRP plans?" → verify RAG answer
- [ ] Verify year filter (2022–2026) works across all endpoints
- [ ] Verify max 8 crises per country on globe
- [ ] Test with known cases: Sudan, Yemen, Ukraine, Bangladesh
