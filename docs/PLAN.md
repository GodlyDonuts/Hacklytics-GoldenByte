# Haxlytics — 36-Hour Datathon Implementation Plan

## Project: Humanitarian Funding Mismatch Globe

> Are the world's worst humanitarian crises receiving proportional funding?

A 3D interactive globe that visualizes the gap between humanitarian crisis severity and actual pooled fund coverage, powered by ML-driven mismatch detection and an ElevenLabs voice agent that explains funding inequalities in natural language.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js)                        │
│  ┌────────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │  globe.gl       │  │  Filter UI   │  │  ElevenLabs Voice    │ │
│  │  (Three.js)     │  │  (Sidebar)   │  │  Agent Widget        │ │
│  └───────┬────────┘  └──────┬───────┘  └──────────┬───────────┘ │
│          │                  │                     │              │
└──────────┼──────────────────┼─────────────────────┼──────────────┘
           │                  │                     │
           ▼                  ▼                     ▼
┌──────────────────────────────────────────────────────────────────┐
│                      BACKEND (FastAPI)                            │
│  ┌─────────────┐  ┌────────────────┐  ┌───────────────────────┐ │
│  │ /globe-data  │  │ /mismatches    │  │ /voice-context        │ │
│  │ /countries   │  │ /benchmarks    │  │ (ElevenLabs webhook)  │ │
│  └──────┬──────┘  └───────┬────────┘  └───────────┬───────────┘ │
│         │                 │                       │              │
└─────────┼─────────────────┼───────────────────────┼──────────────┘
          │                 │                       │
          ▼                 ▼                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                    DATA LAYER                                    │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────┐  │
│  │  PostgreSQL   │  │   Databricks     │  │   External APIs   │  │
│  │  (Vultr VM)   │  │   (ML + ETL)     │  │   (HPC/HDX/CBPF) │  │
│  └──────────────┘  └──────────────────┘  └───────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Infrastructure (Vultr — $1,000 Credits)

| Resource | Spec | Purpose | Est. Cost/hr |
|---|---|---|---|
| **GPU Instance** | 1x A100 (80GB VRAM) | Databricks runtime, ML training | ~$2.50/hr |
| **App Server** | 4 vCPU / 16GB RAM | FastAPI + PostgreSQL | ~$0.12/hr |
| **Frontend** | Vercel Free Tier or same VM | Next.js deployment | $0 |

Provision the GPU instance first for Databricks. Run FastAPI and Postgres on the app server. Deploy Next.js to Vercel (free tier) pointed at the FastAPI server.

---

# WORKSTREAM 1: Backend — FastAPI + Data Integration

**Owner:** Backend Engineer(s)
**Priority:** Start immediately — frontend and AI both depend on this.

---

## 1.1 Project Scaffold

```bash
mkdir backend && cd backend
python -m venv venv && source venv/bin/activate
pip install fastapi uvicorn httpx pandas sqlalchemy psycopg2-binary python-dotenv pydantic
```

**File structure:**

```
backend/
├── main.py
├── .env
├── requirements.txt
├── app/
│   ├── __init__.py
│   ├── config.py
│   ├── models.py          # SQLAlchemy ORM
│   ├── schemas.py          # Pydantic response models
│   ├── database.py         # DB session
│   ├── routers/
│   │   ├── globe.py        # Globe data endpoints
│   │   ├── mismatches.py   # Mismatch detection endpoints
│   │   └── voice.py        # ElevenLabs context endpoint
│   └── services/
│       ├── hpc_client.py   # HPC Tools API client
│       ├── hdx_client.py   # HDX HAPI client
│       ├── cbpf_client.py  # CBPF API client
│       ├── ingestion.py    # Data pipeline orchestrator
│       └── databricks.py   # Databricks query client
```

## 1.2 External API Clients — Exact Endpoints

### HPC Tools API (FTS v1)

Base URL: `https://api.hpc.tools/v1`

| Endpoint | Method | Purpose | Key Params |
|---|---|---|---|
| `/public/plan/year/{year}` | GET | All HRPs for a year | `year`: 1999–2026 |
| `/public/plan/country/{iso3}` | GET | Plans by country | `iso3`: 3-letter ISO |
| `/public/plan/id/{id}` | GET | Single plan detail | `id`: plan integer ID |
| `/public/project/plan/{planID}` | GET | Projects within a plan | `planID`: integer |
| `/public/fts/flow` | GET | Funding flows | See boundary/filter params below |
| `/public/emergency/country/{iso3}` | GET | Emergencies by country | `iso3` |
| `/public/global-cluster` | GET | All cluster definitions | — |
| `/public/location` | GET | All locations | — |

**Funding flow query for a country-year:**

```
GET /v1/public/fts/flow?countryISO3=SDN&year=2025&groupby=GlobalCluster
```

Returns incoming/outgoing/internal flows grouped by cluster with totals.

**All plans for 2026:**

```
GET /v1/public/plan/year/2026
```

Returns array of plan objects with `id`, `planVersion.name`, `locations`, `categories`, `years`.

**Projects in a plan:**

```
GET /v1/public/project/plan/1514
```

Returns project-level data: `code`, `name`, `projectVersion.objective`, `organizations`, `locations`, `globalClusters`, `governingEntities`.

**Implementation — `hpc_client.py`:**

```python
import httpx
from app.config import settings

BASE = "https://api.hpc.tools/v1/public"

async def fetch_plans_by_year(year: int) -> list[dict]:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{BASE}/plan/year/{year}")
        r.raise_for_status()
        return r.json()["data"]

async def fetch_funding_flows(iso3: str, year: int, groupby: str = "GlobalCluster") -> dict:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{BASE}/fts/flow", params={
            "countryISO3": iso3,
            "year": year,
            "groupby": groupby,
        })
        r.raise_for_status()
        return r.json()["data"]

async def fetch_projects_for_plan(plan_id: int) -> list[dict]:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{BASE}/project/plan/{plan_id}")
        r.raise_for_status()
        return r.json()["data"]
```

---

### HDX HAPI (v2)

Base URL: `https://hapi.humdata.org/api/v2`

**Authentication:** Every request requires an `app_identifier` query param (base64-encoded `appname:email`).

Generate it once:

```
GET /api/v2/encode_app_identifier?application=haxlytics&email=team@haxlytics.dev
```

| Endpoint | Purpose | Key Params |
|---|---|---|
| `/affected-people/humanitarian-needs` | People in need by country/admin/sector | `location_code`, `admin1_code`, `sector_code` |
| `/affected-people/idps` | Internally displaced persons | `location_code` |
| `/affected-people/refugees-persons-of-concern` | Refugee counts | `location_code` |
| `/coordination-context/funding` | Funding by country | `location_code` |
| `/coordination-context/conflict-events` | Conflict event counts | `location_code` |
| `/coordination-context/national-risk` | Risk scores | `location_code` |
| `/food-security-nutrition-poverty/food-security` | IPC phase data | `location_code`, `ipc_phase`, `ipc_type` |
| `/geography-infrastructure/baseline-population` | Population data | `location_code`, `admin1_code` |
| `/metadata/location` | Country list with ISO codes | `has_hrp=true` |

All endpoints support `limit`, `offset`, `output_format` (JSON/csv).

**Implementation — `hdx_client.py`:**

```python
import httpx
from base64 import b64encode
from app.config import settings

BASE = "https://hapi.humdata.org/api/v2"

def _app_id() -> str:
    raw = f"{settings.HDX_APP_NAME}:{settings.HDX_EMAIL}"
    return b64encode(raw.encode()).decode()

async def fetch_humanitarian_needs(iso3: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{BASE}/affected-people/humanitarian-needs", params={
            "location_code": iso3,
            "app_identifier": _app_id(),
            "limit": 10000,
            "output_format": "json",
        })
        r.raise_for_status()
        return r.json()["data"]

async def fetch_funding(iso3: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{BASE}/coordination-context/funding", params={
            "location_code": iso3,
            "app_identifier": _app_id(),
            "limit": 10000,
        })
        r.raise_for_status()
        return r.json()["data"]

async def fetch_national_risk(iso3: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{BASE}/coordination-context/national-risk", params={
            "location_code": iso3,
            "app_identifier": _app_id(),
            "limit": 10000,
        })
        r.raise_for_status()
        return r.json()["data"]

async def fetch_population(iso3: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{BASE}/geography-infrastructure/baseline-population", params={
            "location_code": iso3,
            "app_identifier": _app_id(),
            "limit": 10000,
        })
        r.raise_for_status()
        return r.json()["data"]
```

---

### CBPF API (vo3)

Base URL: `https://cbpfapi.unocha.org/vo3`

| Endpoint | Purpose | Key Params |
|---|---|---|
| `/odata/PoolFundProjectSummary` | Approved project budgets + beneficiaries | `ShowAllPooledFunds=1`, `AllocationYears`, `FundTypeId=1` |
| `/odata/PoolFundProjectDetail` | Detailed project breakdown | Same as above |
| `/odata/PoolFundProjectSummaryWithLocationAndCluster` | Projects with cluster + geo | Same as above |
| `/odata/PoolFundMaster` | Master list of all CBPFs | — |
| `/odata/NarrativeReportClusterwiseBeneficiary` | Reported beneficiary data by cluster | `poolfundAbbrv` |

**Implementation — `cbpf_client.py`:**

```python
import httpx

BASE = "https://cbpfapi.unocha.org/vo3/odata"

async def fetch_project_summaries(years: str = "2020_2026") -> list[dict]:
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.get(f"{BASE}/PoolFundProjectSummary", params={
            "ShowAllPooledFunds": 1,
            "AllocationYears": years,
            "FundTypeId": 1,
            "$format": "json",
        })
        r.raise_for_status()
        return r.json().get("value", [])

async def fetch_projects_with_clusters(fund_abbrev: str, year: int) -> list[dict]:
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.get(f"{BASE}/PoolFundProjectSummaryWithLocationAndCluster", params={
            "poolfundAbbrv": f"{fund_abbrev}{str(year)[-2:]}",
            "$format": "json",
        })
        r.raise_for_status()
        return r.json().get("value", [])
```

---

## 1.3 Database Schema (PostgreSQL)

```sql
CREATE TABLE countries (
    iso3          CHAR(3) PRIMARY KEY,
    name          TEXT NOT NULL,
    lat           FLOAT,
    lng           FLOAT,
    population    BIGINT
);

CREATE TABLE severity_scores (
    id            SERIAL PRIMARY KEY,
    iso3          CHAR(3) REFERENCES countries(iso3),
    year          INT,
    people_in_need BIGINT,
    people_targeted BIGINT,
    severity_score FLOAT,       -- normalized 0-1
    risk_class     TEXT,         -- from national-risk endpoint
    source        TEXT,          -- 'hno' | 'hdx_hapi'
    fetched_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE funding_records (
    id             SERIAL PRIMARY KEY,
    iso3           CHAR(3) REFERENCES countries(iso3),
    year           INT,
    requirements   FLOAT,       -- USD requested
    funding        FLOAT,       -- USD received
    pct_funded     FLOAT,       -- funding / requirements
    funding_per_capita FLOAT,   -- funding / people_in_need
    source         TEXT,
    fetched_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE projects (
    id             SERIAL PRIMARY KEY,
    project_code   TEXT UNIQUE,
    iso3           CHAR(3) REFERENCES countries(iso3),
    plan_id        INT,
    cluster        TEXT,         -- e.g. 'Health', 'WASH', 'Food Security'
    budget         FLOAT,
    beneficiaries  INT,
    cost_per_beneficiary FLOAT,  -- budget / beneficiaries
    year           INT,
    organization   TEXT,
    source         TEXT          -- 'cbpf' | 'hpc'
);

CREATE TABLE mismatch_scores (
    id             SERIAL PRIMARY KEY,
    iso3           CHAR(3) REFERENCES countries(iso3),
    year           INT,
    severity_norm  FLOAT,        -- 0-1 normalized severity
    funding_norm   FLOAT,        -- 0-1 normalized funding coverage
    mismatch_score FLOAT,        -- severity_norm - funding_norm
    mismatch_type  TEXT,         -- 'underfunded' | 'overfunded' | 'aligned'
    computed_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_severity_iso3_year ON severity_scores(iso3, year);
CREATE INDEX idx_funding_iso3_year ON funding_records(iso3, year);
CREATE INDEX idx_projects_iso3 ON projects(iso3);
CREATE INDEX idx_mismatch_iso3 ON mismatch_scores(iso3, year);
```

---

## 1.4 Data Ingestion Pipeline

Run on startup and via a `/admin/ingest` endpoint for manual refresh.

**`services/ingestion.py` — Orchestrator:**

```python
async def run_full_ingestion():
    locations = await hdx_client.fetch_locations(has_hrp=True)

    for loc in locations:
        iso3 = loc["code"]
        # 1. Upsert country
        await upsert_country(iso3, loc["name"], loc["lat"], loc["lon"])

        # 2. Severity data (HDX HAPI humanitarian needs)
        needs = await hdx_client.fetch_humanitarian_needs(iso3)
        await upsert_severity(iso3, needs)

        # 3. Funding data (HDX HAPI funding + HPC FTS flows)
        funding = await hdx_client.fetch_funding(iso3)
        flows = await hpc_client.fetch_funding_flows(iso3, 2026)
        await upsert_funding(iso3, funding, flows)

        # 4. CBPF project-level data
        projects = await cbpf_client.fetch_project_summaries()
        await upsert_projects(iso3, projects)

    # 5. Compute mismatch scores
    await compute_mismatch_scores()
```

**Mismatch score computation:**

```python
async def compute_mismatch_scores():
    """
    severity_norm  = people_in_need / max(people_in_need across all countries)
    funding_norm   = pct_funded / max(pct_funded across all countries)
    mismatch_score = severity_norm - funding_norm

    Positive = underfunded relative to severity
    Negative = overfunded relative to severity
    """
    # Executed as a SQL query for speed
    query = """
    INSERT INTO mismatch_scores (iso3, year, severity_norm, funding_norm, mismatch_score, mismatch_type)
    SELECT
        s.iso3,
        s.year,
        s.people_in_need::float / NULLIF(max_pin.v, 0)   AS severity_norm,
        f.pct_funded / NULLIF(max_pct.v, 0)               AS funding_norm,
        (s.people_in_need::float / NULLIF(max_pin.v, 0))
          - (f.pct_funded / NULLIF(max_pct.v, 0))         AS mismatch_score,
        CASE
            WHEN (s.people_in_need::float / NULLIF(max_pin.v, 0))
               - (f.pct_funded / NULLIF(max_pct.v, 0)) > 0.2 THEN 'underfunded'
            WHEN (s.people_in_need::float / NULLIF(max_pin.v, 0))
               - (f.pct_funded / NULLIF(max_pct.v, 0)) < -0.2 THEN 'overfunded'
            ELSE 'aligned'
        END AS mismatch_type
    FROM severity_scores s
    JOIN funding_records f ON s.iso3 = f.iso3 AND s.year = f.year
    CROSS JOIN (SELECT MAX(people_in_need)::float AS v FROM severity_scores) max_pin
    CROSS JOIN (SELECT MAX(pct_funded) AS v FROM funding_records) max_pct
    ON CONFLICT (iso3, year) DO UPDATE SET
        severity_norm = EXCLUDED.severity_norm,
        funding_norm = EXCLUDED.funding_norm,
        mismatch_score = EXCLUDED.mismatch_score,
        mismatch_type = EXCLUDED.mismatch_type,
        computed_at = now();
    """
    await database.execute(query)
```

---

## 1.5 FastAPI Endpoints

### Globe Data

```
GET /api/globe-data?year=2026
```

Returns all countries with their severity, funding, and mismatch data for the globe visualization.

**Response shape:**

```json
[
  {
    "iso3": "SDN",
    "name": "Sudan",
    "lat": 15.5,
    "lng": 32.5,
    "people_in_need": 33700000,
    "people_targeted": 20400000,
    "requirements": 2870000000,
    "funding": 373100000,
    "pct_funded": 13.0,
    "funding_per_capita": 11.07,
    "severity_norm": 1.0,
    "funding_norm": 0.35,
    "mismatch_score": 0.65,
    "mismatch_type": "underfunded"
  }
]
```

### Mismatch Details

```
GET /api/mismatches?year=2026&type=underfunded&sort=mismatch_score&order=desc
```

Returns ranked list of mismatch countries.

### Country Detail

```
GET /api/countries/{iso3}?year=2026
```

Returns full detail for a single country: severity breakdown, funding by cluster, project-level data, and benchmark comparisons.

**Response shape:**

```json
{
  "country": { "iso3": "SDN", "name": "Sudan", "lat": 15.5, "lng": 32.5 },
  "severity": { "people_in_need": 33700000, "severity_score": 0.95 },
  "funding": { "requirements": 2870000000, "funding": 373100000, "pct_funded": 13.0 },
  "mismatch": { "score": 0.65, "type": "underfunded" },
  "clusters": [
    { "cluster": "Health", "budget": 45000000, "beneficiaries": 900000, "cost_per_beneficiary": 50.0 },
    { "cluster": "Food Security", "budget": 120000000, "beneficiaries": 5000000, "cost_per_beneficiary": 24.0 }
  ],
  "benchmarks": [
    {
      "iso3": "YEM", "name": "Yemen", "cluster": "Health",
      "budget": 50000000, "beneficiaries": 1100000, "cost_per_beneficiary": 45.45
    }
  ],
  "flagged_projects": [
    { "project_code": "SDN-24-H-001", "cluster": "Health", "budget": 5000000,
      "beneficiaries": 500, "cost_per_beneficiary": 10000, "flag": "abnormally_high" }
  ]
}
```

### Benchmarking

```
GET /api/benchmarks?cluster=Health&year=2026
```

Returns projects grouped by cluster with cost-per-beneficiary stats (mean, median, stddev, outliers).

### Voice Context (for ElevenLabs)

```
POST /api/voice-context
```

Accepts a natural-language question, queries the DB for relevant data, and returns a structured context payload that the ElevenLabs agent uses to formulate its spoken answer.

**Request:**

```json
{ "question": "Why did Sudan receive less funding than Ukraine?" }
```

**Response:**

```json
{
  "context": "Sudan has 33.7M people in need with $373M funded (13%). Ukraine has 10.8M people in need with $310M funded (13.5%). Despite Sudan having 3x the population in need, it received only 20% more total funding. Per-capita funding: Sudan $11.07, Ukraine $75.63.",
  "countries": ["SDN", "UKR"],
  "data_points": { ... }
}
```

---

## 1.6 Backend Task Checklist

| # | Task | Est. Time | Depends On |
|---|---|---|---|
| B1 | Scaffold FastAPI project + DB connection | 1h | — |
| B2 | Implement HPC client (`hpc_client.py`) | 1.5h | — |
| B3 | Implement HDX HAPI client (`hdx_client.py`) | 1.5h | — |
| B4 | Implement CBPF client (`cbpf_client.py`) | 1h | — |
| B5 | Create PostgreSQL schema + migrations | 1h | B1 |
| B6 | Build ingestion pipeline | 2h | B2, B3, B4, B5 |
| B7 | `/api/globe-data` endpoint | 1h | B6 |
| B8 | `/api/countries/{iso3}` endpoint | 1.5h | B6 |
| B9 | `/api/mismatches` + `/api/benchmarks` endpoints | 1.5h | B6 |
| B10 | `/api/voice-context` endpoint | 1.5h | B6 |
| B11 | CORS config + deploy to Vultr | 1h | B7–B10 |

**Total: ~14h**

---

# WORKSTREAM 2: Frontend — Next.js + globe.gl

**Owner:** Frontend Engineer(s)
**Priority:** Can begin scaffold immediately; globe data integration blocked on B7.

---

## 2.1 Project Scaffold

```bash
npx create-next-app@latest frontend --typescript --tailwind --app --src-dir
cd frontend
npm install globe.gl three @types/three
npm install @tanstack/react-query axios
npm install framer-motion
```

**File structure:**

```
frontend/src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx              # Main globe page
│   └── globals.css
├── components/
│   ├── Globe/
│   │   ├── GlobeView.tsx     # globe.gl wrapper
│   │   ├── GlobeControls.tsx # zoom, rotate, auto-spin
│   │   └── layers/
│   │       ├── HeatmapLayer.tsx
│   │       ├── PointsLayer.tsx
│   │       └── ArcsLayer.tsx
│   ├── Sidebar/
│   │   ├── FilterPanel.tsx   # Year, cluster, mismatch type
│   │   ├── CountryDetail.tsx # Selected country info
│   │   └── BenchmarkPanel.tsx
│   ├── Voice/
│   │   └── VoiceAgent.tsx    # ElevenLabs widget
│   └── ui/
│       ├── Tooltip.tsx
│       └── Legend.tsx
├── hooks/
│   ├── useGlobeData.ts       # React Query fetch
│   ├── useCountryDetail.ts
│   └── useMismatches.ts
├── lib/
│   ├── api.ts                # Axios instance
│   └── types.ts              # TypeScript interfaces
└── store/
    └── useAppStore.ts        # Zustand for globe state
```

---

## 2.2 Globe Implementation

Use [globe.gl](https://github.com/vasturiano/globe.gl) which wraps Three.js with a declarative API for 3D globe rendering.

**`GlobeView.tsx` — Core Component:**

```tsx
"use client";

import { useEffect, useRef } from "react";
import Globe, { GlobeInstance } from "globe.gl";
import { useGlobeData } from "@/hooks/useGlobeData";
import { useAppStore } from "@/store/useAppStore";

export default function GlobeView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const { data, isLoading } = useGlobeData();
  const { selectedCountry, setSelectedCountry, viewMode } = useAppStore();

  useEffect(() => {
    if (!containerRef.current) return;

    const globe = Globe()(containerRef.current)
      .globeImageUrl("//unpkg.com/three-globe/example/img/earth-night.jpg")
      .backgroundImageUrl("//unpkg.com/three-globe/example/img/night-sky.png")
      .width(containerRef.current.clientWidth)
      .height(containerRef.current.clientHeight);

    globeRef.current = globe;

    return () => { globe._destructor?.(); };
  }, []);

  useEffect(() => {
    if (!globeRef.current || !data) return;
    const globe = globeRef.current;

    if (viewMode === "heatmap") {
      globe
        .hexBinPointsData(data)
        .hexBinPointLat((d: any) => d.lat)
        .hexBinPointLng((d: any) => d.lng)
        .hexBinPointWeight((d: any) => d.mismatch_score)
        .hexAltitude((d: any) => d.sumWeight * 0.01)
        .hexBinResolution(3)
        .hexTopColor((d: any) => mismatchColor(d.sumWeight / d.points.length))
        .hexSideColor((d: any) => mismatchColor(d.sumWeight / d.points.length));
    }

    if (viewMode === "points") {
      globe
        .pointsData(data)
        .pointLat((d: any) => d.lat)
        .pointLng((d: any) => d.lng)
        .pointAltitude((d: any) => d.mismatch_score * 0.3)
        .pointRadius((d: any) => Math.sqrt(d.people_in_need) * 0.00001)
        .pointColor((d: any) => mismatchColor(d.mismatch_score))
        .onPointClick((point: any) => setSelectedCountry(point.iso3));
    }
  }, [data, viewMode]);

  return <div ref={containerRef} className="w-full h-screen" />;
}

function mismatchColor(score: number): string {
  if (score > 0.5) return "rgba(220, 38, 38, 0.9)";   // deep red — severely underfunded
  if (score > 0.2) return "rgba(249, 115, 22, 0.8)";   // orange — underfunded
  if (score > -0.2) return "rgba(234, 179, 8, 0.7)";   // yellow — aligned
  return "rgba(34, 197, 94, 0.7)";                       // green — well-funded
}
```

---

## 2.3 Visualization Modes

### Mode 1: Mismatch Heatmap

Hex-bin aggregation on the globe surface. Height = severity. Color = mismatch direction.

- **Red tall columns** = high severity + low funding (worst mismatches)
- **Green short columns** = low severity + adequate funding
- Uses `globe.hexBinPointsData()`

### Mode 2: Crisis Points

Individual points per country. Radius = population in need. Height = mismatch score.

- Clickable — opens country detail sidebar
- Uses `globe.pointsData()`

### Mode 3: Funding Flow Arcs

Arcs from donor regions to recipient countries. Width = funding amount.

- Uses `globe.arcsData()`
- Source coordinates: major donor country centroids
- Destination: crisis country centroids
- Color: green (well-funded) to red (underfunded)

### Mode 4: Choropleth Polygons

Country polygons colored by mismatch score.

- Uses `globe.polygonsData()` with GeoJSON country boundaries
- Source: Natural Earth GeoJSON (`ne_110m_admin_0_countries.geojson`)
- Color scale: green → yellow → red based on `mismatch_score`

---

## 2.4 Sidebar UI

```
┌─────────────────────────────────┐
│  HAXLYTICS                      │
│  ─────────────────────────────  │
│  Year: [2024] [2025] [2026]     │
│  View: [Heatmap] [Points] [Arc] │
│  Filter: [All] [Underfunded]    │
│           [Overfunded] [Aligned]│
│  Cluster: [All ▾]               │
│  ─────────────────────────────  │
│  🔴 Sudan          mismatch 0.65│
│  🔴 Yemen          mismatch 0.58│
│  🟠 Haiti          mismatch 0.42│
│  🟡 Colombia       mismatch 0.15│
│  🟢 Ukraine        mismatch 0.02│
│  ─────────────────────────────  │
│  SELECTED: Sudan                │
│  People in need: 33.7M          │
│  Funded: 13.0% ($373M / $2.87B)│
│  Funding/capita: $11.07         │
│  ─────────────────────────────  │
│  Cluster Breakdown:             │
│  Health     $50/person          │
│  Food Sec   $24/person          │
│  WASH       $18/person          │
│  ─────────────────────────────  │
│  ⚠ Flagged Projects:            │
│  SDN-24-H-001 $10,000/person   │
│  ─────────────────────────────  │
│  Benchmarks (vs similar crises):│
│  Yemen Health: $45/person       │
│  Somalia Health: $38/person     │
│  ─────────────────────────────  │
│  🎙 Ask a question...            │
└─────────────────────────────────┘
```

---

## 2.5 Data Fetching Hooks

```typescript
// lib/api.ts
import axios from "axios";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api",
});

// hooks/useGlobeData.ts
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useGlobeData(year = 2026) {
  return useQuery({
    queryKey: ["globe-data", year],
    queryFn: () => api.get(`/globe-data?year=${year}`).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
}

// hooks/useCountryDetail.ts
export function useCountryDetail(iso3: string | null, year = 2026) {
  return useQuery({
    queryKey: ["country", iso3, year],
    queryFn: () => api.get(`/countries/${iso3}?year=${year}`).then((r) => r.data),
    enabled: !!iso3,
  });
}
```

---

## 2.6 Frontend Task Checklist

| # | Task | Est. Time | Depends On |
|---|---|---|---|
| F1 | Scaffold Next.js + install deps | 0.5h | — |
| F2 | Globe component with static data | 2h | F1 |
| F3 | Heatmap layer | 1.5h | F2 |
| F4 | Points layer with click handler | 1.5h | F2 |
| F5 | Choropleth polygon layer | 1.5h | F2 |
| F6 | Arc layer (funding flows) | 1h | F2 |
| F7 | Sidebar: filters (year, view, cluster) | 1.5h | F1 |
| F8 | Sidebar: country detail panel | 1.5h | F7, B8 |
| F9 | Sidebar: benchmark comparison panel | 1h | F8, B9 |
| F10 | Connect to live API (hooks + React Query) | 1.5h | B7 |
| F11 | Color legend + tooltip overlays | 1h | F3 |
| F12 | ElevenLabs voice widget integration | 2h | A1 |
| F13 | Responsive layout + polish | 1.5h | F7–F11 |

**Total: ~17h**

---

# WORKSTREAM 3: Databricks — ML + Mismatch Detection Engine

**Owner:** Data/ML Engineer
**Priority:** Can begin in parallel once raw data is available (after B6).

---

## 3.1 Databricks Setup

Use the **Databricks Free Edition** (replaces Community Edition). Sign up at `databricks.com/signup/free-edition`.

Alternatively, deploy a Databricks workspace on the Vultr GPU instance if the free tier is too limited:

```bash
# On Vultr GPU instance — run Spark standalone for local development
pip install pyspark databricks-connect pandas scikit-learn
```

---

## 3.2 Data Pipeline (ETL in Databricks)

### Step 1: Ingest Raw Data

Pull from the same APIs as the backend, but into Spark DataFrames for large-scale processing.

```python
import requests
import pandas as pd
from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("haxlytics").getOrCreate()

def ingest_hpc_plans(years: range) -> pd.DataFrame:
    all_plans = []
    for year in years:
        r = requests.get(f"https://api.hpc.tools/v1/public/plan/year/{year}")
        plans = r.json()["data"]
        for p in plans:
            all_plans.append({
                "plan_id": p["id"],
                "year": year,
                "name": p.get("planVersion", {}).get("name", ""),
                "iso3": p["locations"][0]["iso3"] if p.get("locations") else None,
                "requirements": p.get("requirements", {}).get("revisedRequirements"),
                "funding": p.get("funding", {}).get("totalFunding"),
            })
    return pd.DataFrame(all_plans)

plans_pdf = ingest_hpc_plans(range(2015, 2027))
plans_df = spark.createDataFrame(plans_pdf)
plans_df.write.mode("overwrite").saveAsTable("haxlytics.plans")
```

### Step 2: Build Feature Table

```python
from pyspark.sql import functions as F

features_df = (
    spark.table("haxlytics.plans")
    .join(spark.table("haxlytics.severity"), ["iso3", "year"])
    .join(spark.table("haxlytics.cbpf_projects"), ["iso3", "year"], "left")
    .withColumn("funding_gap", F.col("requirements") - F.col("funding"))
    .withColumn("pct_funded", F.col("funding") / F.col("requirements"))
    .withColumn("funding_per_capita", F.col("funding") / F.col("people_in_need"))
    .withColumn("severity_norm", F.col("people_in_need") / F.lit(max_pin))
    .withColumn("funding_norm", F.col("pct_funded") / F.lit(max_pct))
    .withColumn("mismatch_score", F.col("severity_norm") - F.col("funding_norm"))
)

features_df.write.mode("overwrite").saveAsTable("haxlytics.features")
```

---

## 3.3 ML Models

### Model 1: Mismatch Anomaly Detector

Flags countries where funding is statistically misaligned with severity.

```python
from sklearn.ensemble import IsolationForest
import pandas as pd

features_pdf = spark.table("haxlytics.features").toPandas()

X = features_pdf[["severity_norm", "funding_norm", "funding_per_capita", "pct_funded"]].fillna(0)

model = IsolationForest(contamination=0.15, random_state=42)
features_pdf["anomaly"] = model.fit_predict(X)
features_pdf["is_mismatch_anomaly"] = features_pdf["anomaly"] == -1
```

### Model 2: Cost-per-Beneficiary Outlier Detection (Project Level)

Flags projects with abnormal beneficiary-to-budget ratios within the same cluster.

```python
from scipy import stats

projects_pdf = spark.table("haxlytics.cbpf_projects").toPandas()
projects_pdf["cost_per_beneficiary"] = projects_pdf["budget"] / projects_pdf["beneficiaries"].replace(0, pd.NA)

def flag_outliers(group):
    if len(group) < 5:
        group["z_score"] = 0
    else:
        group["z_score"] = stats.zscore(group["cost_per_beneficiary"].fillna(0))
    group["is_outlier"] = group["z_score"].abs() > 2
    return group

flagged = projects_pdf.groupby("cluster", group_keys=False).apply(flag_outliers)
```

### Model 3: Funding Prediction (Why do some crises get less?)

A regression model that predicts expected funding given severity indicators, then compares prediction vs actual to quantify "underfunding".

```python
from sklearn.ensemble import GradientBoostedRegressor
from sklearn.model_selection import train_test_split

feature_cols = [
    "people_in_need", "severity_score", "population",
    "conflict_events", "idps", "refugees"
]

X = features_pdf[feature_cols].fillna(0)
y = features_pdf["funding"].fillna(0)

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

model = GradientBoostedRegressor(n_estimators=200, max_depth=5, random_state=42)
model.fit(X_train, y_train)

features_pdf["predicted_funding"] = model.predict(X)
features_pdf["funding_deficit"] = features_pdf["predicted_funding"] - features_pdf["funding"]
```

Feature importance from this model directly answers: "What factors predict funding?" — and the deficit column answers: "Who is getting less than they should?"

---

## 3.4 Databricks → Backend Integration

Export model outputs back to PostgreSQL for the API to serve:

```python
import psycopg2

conn = psycopg2.connect(
    host=VULTR_DB_HOST, dbname="haxlytics",
    user="haxlytics", password=DB_PASSWORD
)

# Write mismatch anomalies
mismatch_df = features_pdf[["iso3", "year", "severity_norm", "funding_norm",
                             "mismatch_score", "is_mismatch_anomaly",
                             "predicted_funding", "funding_deficit"]]
mismatch_df.to_sql("ml_mismatch_results", conn, if_exists="replace", index=False)

# Write flagged projects
flagged[["project_code", "iso3", "cluster", "budget", "beneficiaries",
         "cost_per_beneficiary", "z_score", "is_outlier"]].to_sql(
    "ml_flagged_projects", conn, if_exists="replace", index=False
)
```

---

## 3.5 Databricks Task Checklist

| # | Task | Est. Time | Depends On |
|---|---|---|---|
| D1 | Set up Databricks workspace / Spark env | 1h | — |
| D2 | Ingest HPC plans (1999–2026) into tables | 2h | D1 |
| D3 | Ingest HDX HAPI + CBPF data | 2h | D1 |
| D4 | Build feature table (join + engineer) | 1.5h | D2, D3 |
| D5 | Isolation Forest mismatch detector | 1.5h | D4 |
| D6 | Cost-per-beneficiary outlier flagging | 1h | D4 |
| D7 | Funding prediction regression model | 2h | D4 |
| D8 | Export results to PostgreSQL | 1h | D5, D6, D7 |
| D9 | Feature importance analysis + narrative | 1h | D7 |

**Total: ~13h**

---

# WORKSTREAM 4: AI + Voice Integration — ElevenLabs

**Owner:** AI/Frontend Engineer
**Priority:** Scaffold early (A1-A2), full integration after B10 and F12.

---

## 4.1 ElevenLabs Setup

1. Create an ElevenLabs account at `elevenlabs.io`
2. Navigate to **Conversational AI → Agents** in the dashboard
3. Create a new agent with the following config:

**Agent Configuration:**

| Setting | Value |
|---|---|
| Name | Haxlytics Crisis Analyst |
| Voice | Rachel (or any clear, authoritative voice) |
| Language | English |
| LLM | GPT-4o (default) or Claude |
| First Message | "Hello, I'm your crisis funding analyst. Ask me about any country's humanitarian situation or funding gaps." |

**System Prompt for the Agent:**

```
You are a humanitarian funding analyst for the Haxlytics platform. You have access to
real-time data about humanitarian crises, funding allocations, and mismatch scores from
OCHA, HDX HAPI, and CBPF databases.

When a user asks about a country or comparison:
1. Call the get_country_context tool with the relevant ISO3 codes
2. Present the data conversationally: severity, funding %, per-capita funding
3. Highlight mismatches and anomalies
4. Suggest reasons based on the data (media visibility, geopolitics, access constraints)
5. Reference benchmark comparisons when relevant

Always cite specific numbers. Be empathetic but data-driven.
```

---

## 4.2 Agent Tool Definition (Server-Side)

Register a custom tool in the ElevenLabs agent dashboard that calls back to your FastAPI server.

**Tool: `get_country_context`**

```json
{
  "name": "get_country_context",
  "description": "Retrieve humanitarian crisis and funding data for one or more countries",
  "parameters": {
    "type": "object",
    "properties": {
      "question": {
        "type": "string",
        "description": "The user's question about humanitarian funding"
      },
      "countries": {
        "type": "array",
        "items": { "type": "string" },
        "description": "ISO3 codes of countries mentioned (e.g. ['SDN', 'UKR'])"
      }
    },
    "required": ["question"]
  }
}
```

**Webhook URL:** `https://your-vultr-server.com/api/voice-context`

When the agent's LLM decides to call this tool, ElevenLabs sends a POST to your FastAPI `/api/voice-context` endpoint. Your backend queries the DB, formats context, and returns it. The LLM then uses that context to generate a spoken answer.

---

## 4.3 Frontend Voice Widget

Install the ElevenLabs React SDK:

```bash
npm install @11labs/react
```

**`Voice/VoiceAgent.tsx`:**

```tsx
"use client";

import { useConversation } from "@11labs/react";
import { useCallback, useState } from "react";
import { useAppStore } from "@/store/useAppStore";

export default function VoiceAgent() {
  const [isActive, setIsActive] = useState(false);
  const { setSelectedCountry, setHighlightedCountries } = useAppStore();

  const conversation = useConversation({
    onMessage: (message) => {
      // Parse agent responses for country references to highlight on globe
      const isoPattern = /\b([A-Z]{3})\b/g;
      const matches = message.message.match(isoPattern);
      if (matches) setHighlightedCountries(matches);
    },
    onError: (error) => console.error("Voice error:", error),
  });

  const startConversation = useCallback(async () => {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    await conversation.startSession({
      agentId: process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID!,
    });
    setIsActive(true);
  }, [conversation]);

  const stopConversation = useCallback(async () => {
    await conversation.endSession();
    setIsActive(false);
  }, [conversation]);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <button
        onClick={isActive ? stopConversation : startConversation}
        className={`w-16 h-16 rounded-full flex items-center justify-center shadow-xl
          transition-all duration-300 ${
            isActive
              ? "bg-red-500 animate-pulse"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
      >
        <MicIcon className="w-8 h-8 text-white" />
      </button>
      {isActive && (
        <div className="absolute bottom-20 right-0 bg-gray-900/90 text-white
          rounded-xl p-4 w-72 backdrop-blur-sm">
          <p className="text-sm text-gray-300">
            {conversation.isSpeaking ? "Speaking..." : "Listening..."}
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Try: &quot;Why did Sudan receive less funding than Ukraine?&quot;
          </p>
        </div>
      )}
    </div>
  );
}
```

---

## 4.4 Voice-Driven Globe Navigation

When the user asks about a country via voice, the agent's response triggers globe navigation:

```tsx
// In GlobeView.tsx — respond to voice-selected countries
const { highlightedCountries } = useAppStore();

useEffect(() => {
  if (!globeRef.current || highlightedCountries.length === 0) return;

  const target = data?.find((d) => d.iso3 === highlightedCountries[0]);
  if (target) {
    globeRef.current.pointOfView(
      { lat: target.lat, lng: target.lng, altitude: 1.5 },
      1000 // animation duration ms
    );
    setSelectedCountry(target.iso3);
  }
}, [highlightedCountries]);
```

**Voice command → action mapping:**

| Voice Input | Parsed Action |
|---|---|
| "Show me Sudan" | `pointOfView` to Sudan, open detail panel |
| "Compare Sudan and Ukraine" | Highlight both, show comparison panel |
| "Which countries are most underfunded?" | Filter to `mismatch_type=underfunded`, zoom out |
| "Show health cluster funding" | Set cluster filter to Health, refresh globe |
| "Why is Yemen underfunded?" | Agent calls `/voice-context`, speaks answer |

---

## 4.5 AI Task Checklist

| # | Task | Est. Time | Depends On |
|---|---|---|---|
| A1 | Create ElevenLabs agent + configure prompt | 1h | — |
| A2 | Register `get_country_context` tool in agent | 0.5h | A1 |
| A3 | Implement `/api/voice-context` FastAPI endpoint | 1.5h | B6 |
| A4 | Build voice widget React component | 1.5h | F1 |
| A5 | Wire voice events to globe navigation | 1.5h | F2, A4 |
| A6 | Implement comparison mode (2-country view) | 1.5h | A5, F8 |
| A7 | Test end-to-end voice flow | 1h | A3, A5 |
| A8 | Prompt tuning + edge case handling | 1h | A7 |

**Total: ~9.5h**

---

# Timeline — 36 Hours

## Phase 1: Foundation (Hours 0–8)

| Hour | Backend | Frontend | Data/ML | AI |
|---|---|---|---|---|
| 0–1 | B1: Scaffold FastAPI | F1: Scaffold Next.js | D1: Databricks setup | A1: ElevenLabs agent |
| 1–3 | B2+B3+B4: API clients | F2: Globe + static data | D2: Ingest HPC plans | A2: Register tool |
| 3–5 | B5: DB schema | F3: Heatmap layer | D3: Ingest HDX + CBPF | — |
| 5–8 | B6: Ingestion pipeline | F4: Points layer | D4: Feature table | A4: Voice widget |

## Phase 2: Integration (Hours 8–20)

| Hour | Backend | Frontend | Data/ML | AI |
|---|---|---|---|---|
| 8–10 | B7: `/globe-data` endpoint | F5: Choropleth layer | D5: Isolation Forest | A3: Voice context EP |
| 10–12 | B8: `/countries/{iso3}` | F7: Sidebar filters | D6: Cost outlier model | A5: Voice → globe |
| 12–15 | B9: Mismatches + benchmarks | F8: Country detail panel | D7: Funding predictor | A6: Comparison mode |
| 15–18 | B10: Voice context EP | F10: Live API hookup | D8: Export to Postgres | — |
| 18–20 | B11: Deploy + CORS | F6: Arc layer | D9: Feature importance | A7: E2E test |

## Phase 3: Polish (Hours 20–36)

| Hour | All Hands |
|---|---|
| 20–24 | F9: Benchmark panel, F11: Legend + tooltips, F13: Responsive polish |
| 24–28 | A8: Prompt tuning, bug fixes, edge cases |
| 28–32 | Full integration testing, demo rehearsal |
| 32–36 | Presentation prep, final deployment, buffer |

---

# Appendix A: Environment Variables

```env
# Backend (.env)
DATABASE_URL=postgresql://haxlytics:password@localhost:5432/haxlytics
HDX_APP_NAME=haxlytics
HDX_EMAIL=team@haxlytics.dev
ELEVENLABS_API_KEY=sk-...
ELEVENLABS_AGENT_ID=agent_...

# Frontend (.env.local)
NEXT_PUBLIC_API_URL=https://your-vultr-server.com/api
NEXT_PUBLIC_ELEVENLABS_AGENT_ID=agent_...
```

# Appendix B: Key API Quick Reference

| API | Base URL | Auth | Rate Limit |
|---|---|---|---|
| HPC Tools v1 | `https://api.hpc.tools/v1/public` | None (open) | Hourly cap; email `ocha-hpc@un.org` for higher limits |
| HDX HAPI v2 | `https://hapi.humdata.org/api/v2` | `app_identifier` param (base64 of `app:email`) | 10,000 rows default |
| CBPF vo3 | `https://cbpfapi.unocha.org/vo3/odata` | None (open) | — |
| FTS (alt) | `https://fts.unocha.org/api/v2` | None | — |

# Appendix C: GeoJSON Source

Country boundaries for choropleth:

```
https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson
```

Centroid coordinates for each ISO3 country are available from the HDX HAPI `/metadata/location` endpoint.
