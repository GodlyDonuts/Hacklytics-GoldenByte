# Crisis Topography Command Center — Implementation Plan

> **Datathon Timeline:** 36 hours
> **Challenge:** Inequality in Humanitarian Funding Allocation
> **Deliverable:** Interactive 3D globe mapping humanitarian funding mismatches, powered by ML-driven mismatch detection and voice-navigable UX.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Workstream A — Frontend: Globe & UI](#2-workstream-a--frontend-globe--ui)
3. [Workstream B — Backend: FastAPI & Data Integration](#3-workstream-b--backend-fastapi--data-integration)
4. [Workstream C — Databricks: Pipeline & ML](#4-workstream-c--databricks-pipeline--ml)
5. [Workstream D — AI Integration: ElevenLabs Voice Agent](#5-workstream-d--ai-integration-elevenlabs-voice-agent)
6. [Data Flow Diagram](#6-data-flow-diagram)
7. [API Reference Cheat Sheet](#7-api-reference-cheat-sheet)
8. [Databricks Free Edition Constraints](#8-databricks-free-edition-constraints)
9. [36-Hour Sprint Schedule](#9-36-hour-sprint-schedule)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│  Next.js 14 App Router + react-globe.gl (Three.js)          │
│  ElevenLabs React SDK (@elevenlabs/react)                   │
│  Choropleth layers · Heatmaps · Point markers               │
└──────────────────────┬──────────────────────────────────────┘
                       │ REST (JSON)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                     BACKEND (FastAPI)                        │
│  /api/countries · /api/mismatch · /api/compare              │
│  /api/projects · /api/ask                                   │
│  Pulls from HPC API + HDX HAPI at startup & caches          │
└──────────┬─────────────────────────────────┬────────────────┘
           │                                 │
           ▼                                 ▼
┌────────────────────┐          ┌─────────────────────────────┐
│   HPC Tools API    │          │       Databricks (Free)     │
│   HDX HAPI API     │          │  Delta Tables · ML Model    │
│   (Live data)      │          │  Vector Search · Notebooks  │
└────────────────────┘          └─────────────────────────────┘
```

**Tech Stack Summary**

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, react-globe.gl, Tailwind CSS, @elevenlabs/react |
| Backend | Python 3.11+, FastAPI, httpx, pandas |
| Data Platform | Databricks Free Edition (serverless, Python notebooks) |
| ML | scikit-learn (Isolation Forest / Z-score), Databricks ML Runtime |
| Vector Store | Databricks Vector Search (1 endpoint, Free Edition) |
| Voice AI | ElevenLabs Conversational AI (React SDK + agent) |
| External APIs | HPC Tools v1, HDX HAPI v2 |

---

## 2. Workstream A — Frontend: Globe & UI

**Owner:** Frontend developer(s)
**Depends on:** Workstream B endpoints being available (can mock initially)

### 2.1 Project Setup

```bash
npx create-next-app@latest frontend --app --typescript --tailwind --eslint
cd frontend
npm install react-globe.gl @elevenlabs/react d3-scale d3-scale-chromatic
```

The `react-globe.gl` library wraps Three.js and must be dynamically imported (no SSR):

```tsx
// frontend/src/components/Globe.tsx
'use client';

import dynamic from 'next/dynamic';
import { useRef, useEffect, useState, useCallback } from 'react';

const GlobeGL = dynamic(() => import('react-globe.gl'), { ssr: false });
```

### 2.2 Globe Component — Core Layers

The globe renders three visualization layers simultaneously. Each layer maps to a different data shape returned by the backend.

**Layer 1 — Choropleth Polygons (Severity)**

Color each country polygon by its HNO severity score. Uses `polygonsData` from globe.gl fed with GeoJSON features enriched with severity data.

```tsx
<GlobeGL
  ref={globeRef}
  globeImageUrl="//cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg"
  backgroundImageUrl="//cdn.jsdelivr.net/npm/three-globe/example/img/night-sky.png"
  polygonsData={countriesGeo}
  polygonCapColor={(feat) => severityColorScale(feat.properties.severity)}
  polygonSideColor={() => 'rgba(0, 100, 0, 0.15)'}
  polygonStrokeColor={() => '#111'}
  polygonAltitude={(feat) => feat === hoveredCountry ? 0.12 : 0.06}
  polygonLabel={(feat) => `
    <b>${feat.properties.ADMIN}</b><br/>
    Severity: ${feat.properties.severity}<br/>
    People in Need: ${feat.properties.peopleInNeed?.toLocaleString()}<br/>
    Funding Coverage: ${(feat.properties.fundingCoverage * 100).toFixed(1)}%
  `}
  onPolygonClick={handleCountryClick}
  onPolygonHover={setHoveredCountry}
/>
```

Color scale uses d3:

```tsx
import { scaleSequentialSqrt } from 'd3-scale';
import { interpolateYlOrRd } from 'd3-scale-chromatic';

const severityColorScale = scaleSequentialSqrt(interpolateYlOrRd).domain([0, 5]);
```

**Layer 2 — Heatmap (Funding Gap Intensity)**

Overlay a heatmap layer showing funding gap magnitude. Uses `heatmapsData` with `[lat, lng, weight]`.

```tsx
<GlobeGL
  heatmapsData={[{ data: fundingGapPoints }]}
  heatmapPointLat="lat"
  heatmapPointLng="lng"
  heatmapPointWeight="weight"
  heatmapBandwidth={3.5}
  heatmapColorSaturation={2.5}
  heatmapTopAltitude={0.4}
/>
```

Backend returns:
```json
[
  { "lat": 15.5, "lng": 32.5, "weight": 0.87, "country": "Sudan" },
  { "lat": 15.3, "lng": 44.2, "weight": 0.92, "country": "Yemen" }
]
```

**Layer 3 — Points (Individual Project Anomalies)**

Render flagged projects as points with radius proportional to anomaly score.

```tsx
<GlobeGL
  pointsData={anomalyProjects}
  pointLat="lat"
  pointLng="lng"
  pointAltitude={0.1}
  pointRadius={(d) => d.anomalyScore * 0.3}
  pointColor={(d) => d.anomalyScore > 0.7 ? '#ff4444' : '#ffaa00'}
  pointLabel={(d) => `
    <b>${d.projectCode}</b><br/>
    Budget: $${d.budget.toLocaleString()}<br/>
    Budget Z-Score: ${d.budgetZscore.toFixed(2)}<br/>
    Anomaly Score: ${d.anomalyScore.toFixed(2)}
  `}
/>
```

### 2.3 UI Layout

```
┌──────────────────────────────────────────────────┐
│  [Logo] Crisis Topography Command Center   [🎙️]  │
├───────┬──────────────────────────────────────────┤
│       │                                          │
│ SIDE  │                                          │
│ PANEL │            3D GLOBE                      │
│       │                                          │
│ Filter│                                          │
│ by:   │                                          │
│ □ Year│                                          │
│ □ Cris│                                          │
│ □ Clus│                                          │
│       │                                          │
│ ───── │                                          │
│ Stats │                                          │
│ Panel │                                          │
│       ├──────────────────────────────────────────┤
│       │  Country Detail Drawer (slides up)       │
│       │  - Severity breakdown                    │
│       │  - Funding vs Need bar chart             │
│       │  - Flagged projects table                │
└───────┴──────────────────────────────────────────┘
```

**Side Panel:** Country list + filters (year, crisis type, cluster). Clicking a country in the list rotates the globe to that country and opens the detail drawer.

**Detail Drawer:** Slides up from the bottom on country click. Shows severity breakdown, funding vs. requirements bar chart, and a table of flagged anomaly projects for that country.

**Voice Button (top-right):** Activates the ElevenLabs voice agent (see Workstream D).

### 2.4 State Management

Use React context for shared globe state. No external state library needed at this scale.

```tsx
// frontend/src/context/GlobeContext.tsx
interface GlobeState {
  selectedCountry: string | null;
  filters: { year: number; cluster: string | null };
  viewMode: 'severity' | 'funding-gap' | 'anomalies';
  layersVisible: { choropleth: boolean; heatmap: boolean; points: boolean };
}
```

### 2.5 API Calls from Frontend

All calls go to the FastAPI backend. Define a single fetcher:

```tsx
// frontend/src/lib/api.ts
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function fetchCountries(year?: number) {
  const params = year ? `?year=${year}` : '';
  const res = await fetch(`${API_BASE}/api/countries${params}`);
  return res.json();
}

export async function fetchMismatch(year?: number) {
  const params = year ? `?year=${year}` : '';
  const res = await fetch(`${API_BASE}/api/mismatch${params}`);
  return res.json();
}

export async function fetchCompare(countryA: string, countryB: string) {
  const res = await fetch(`${API_BASE}/api/compare?a=${countryA}&b=${countryB}`);
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
```

### 2.6 GeoJSON Source

Use Natural Earth 110m admin-0 countries GeoJSON (same source as globe.gl examples):

```
https://raw.githubusercontent.com/vasturiano/globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson
```

Download and place at `frontend/public/datasets/ne_110m_admin_0_countries.geojson`. The backend enriches this with severity/funding data keyed by ISO_A2 or ISO_A3 codes.

### 2.7 Frontend Deliverables Checklist

- [ ] Globe renders with choropleth severity coloring
- [ ] Heatmap overlay for funding gaps toggleable
- [ ] Point markers for anomaly projects toggleable
- [ ] Side panel with filters (year, cluster)
- [ ] Country click opens detail drawer with charts
- [ ] Globe auto-rotates to selected country
- [ ] Voice agent button wired to ElevenLabs (Workstream D)
- [ ] Responsive layout with Tailwind

---

## 3. Workstream B — Backend: FastAPI & Data Integration

**Owner:** Backend developer(s)
**Depends on:** Workstream C for ML results; can work independently for data ingestion

### 3.1 Project Setup

```bash
mkdir backend && cd backend
python -m venv venv
source venv/bin/activate
pip install fastapi uvicorn httpx pandas python-dotenv
```

```bash
# backend/requirements.txt
fastapi==0.115.0
uvicorn[standard]==0.30.0
httpx==0.27.0
pandas==2.2.0
python-dotenv==1.0.1
```

### 3.2 Application Entry Point

```python
# backend/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from .routers import countries, mismatch, compare, ask
from .services.data_loader import load_all_data

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.data = await load_all_data()
    yield

app = FastAPI(title="Crisis Topography API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(countries.router, prefix="/api")
app.include_router(mismatch.router, prefix="/api")
app.include_router(compare.router, prefix="/api")
app.include_router(ask.router, prefix="/api")
```

Run with: `uvicorn backend.main:app --reload --port 8000`

### 3.3 Data Loading Service — HPC Tools API

The HPC Tools API v1 is the primary source for plans, funding flows, and project data.

**Base URL:** `https://api.hpc.tools/v1/public`

**Key endpoints used:**

| Endpoint | Purpose | Example |
|---|---|---|
| `GET /plan/year/{year}` | All HRPs for a given year | `/plan/year/2024` |
| `GET /fts/flow?year={y}&groupby=Country` | Funding flows grouped by country | `/fts/flow?year=2024&groupby=Country` |
| `GET /project/plan/{planID}` | All projects under a specific HRP | `/project/plan/1190` |
| `GET /rpm/plan/year/{year}` | Plan metadata including requirements | `/rpm/plan/year/2024` |

```python
# backend/services/hpc_client.py
import httpx

HPC_BASE = "https://api.hpc.tools/v1/public"

async def fetch_plans_by_year(year: int) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(f"{HPC_BASE}/plan/year/{year}")
        resp.raise_for_status()
        return resp.json()

async def fetch_funding_flows(year: int, group_by: str = "Country") -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{HPC_BASE}/fts/flow",
            params={"year": year, "groupby": group_by}
        )
        resp.raise_for_status()
        return resp.json()

async def fetch_projects_for_plan(plan_id: int) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(f"{HPC_BASE}/project/plan/{plan_id}")
        resp.raise_for_status()
        return resp.json()

async def fetch_funding_by_country(country_iso3: str, year: int) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{HPC_BASE}/fts/flow",
            params={"countryISO3": country_iso3, "year": year}
        )
        resp.raise_for_status()
        return resp.json()
```

**HPC Flow Response Shape** (relevant fields):

```json
{
  "data": {
    "report3": {
      "fundingTotals": {
        "total": 1234567890
      }
    },
    "flows": [
      {
        "id": 123,
        "amountUSD": 5000000,
        "sourceObjects": [...],
        "destinationObjects": [
          { "type": "Plan", "id": 1190, "name": "Sudan 2024" },
          { "type": "GlobalCluster", "id": 7, "name": "Health" }
        ]
      }
    ]
  }
}
```

### 3.4 Data Loading Service — HDX HAPI

HDX HAPI provides standardized humanitarian indicators. Requires an `app_identifier`.

**Base URL:** `https://hapi.humdata.org/api/v2`

**Generating the app_identifier:**

```python
import base64
app_identifier = base64.b64encode(b"CrisisTopography:team@hacklytics.org").decode()
# Result: "Q3Jpc2lzVG9wb2dyYXBoeTp0ZWFtQGhhY2tseXRpY3Mub3Jn"
```

**Key endpoints used:**

| Endpoint | Purpose |
|---|---|
| `GET /affected-people/humanitarian-needs` | People in need, severity by country + admin1 |
| `GET /coordination-context/funding` | Funding data: funding_usd, requirements_usd, funding_pct by location |
| `GET /geography-infrastructure/baseline-population` | Population baselines |
| `GET /affected-people/idps` | Internally displaced persons |
| `GET /metadata/location` | Country list with ISO3 codes |

```python
# backend/services/hdx_client.py
import httpx
import base64

HDX_BASE = "https://hapi.humdata.org/api/v2"
APP_ID = base64.b64encode(b"CrisisTopography:team@hacklytics.org").decode()

async def fetch_humanitarian_needs(
    location_code: str | None = None,
    year: int | None = None,
    limit: int = 1000,
    offset: int = 0
) -> dict:
    params = {
        "app_identifier": APP_ID,
        "limit": limit,
        "offset": offset,
    }
    if location_code:
        params["location_code"] = location_code
    if year:
        params["reference_period_start"] = f"{year}-01-01"
        params["reference_period_end"] = f"{year}-12-31"

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{HDX_BASE}/affected-people/humanitarian-needs",
            params=params
        )
        resp.raise_for_status()
        return resp.json()

async def fetch_population(location_code: str | None = None) -> dict:
    params = {"app_identifier": APP_ID, "limit": 1000}
    if location_code:
        params["location_code"] = location_code
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{HDX_BASE}/geography-infrastructure/baseline-population",
            params=params
        )
        resp.raise_for_status()
        return resp.json()
```

**HDX HAPI Humanitarian Needs Response Shape:**

```json
{
  "data": [
    {
      "resource_hdx_id": "...",
      "location_code": "SDN",
      "location_name": "Sudan",
      "admin1_code": "SD01",
      "admin1_name": "Northern",
      "sector_code": "HEA",
      "sector_name": "Health",
      "population_status": "INN",
      "population": 1500000,
      "reference_period_start": "2024-01-01",
      "reference_period_end": "2024-12-31"
    }
  ]
}
```

### 3.5 Unified Data Loader

Combines both APIs into a single cached dataset on startup. Funding data comes from HDX HAPI `/coordination-context/funding` endpoint (not HPC FTS), providing `funding_usd`, `requirements_usd`, and `funding_pct` columns keyed by `location_code` (ISO3).

When Databricks tables are available, the loader reads directly from the `workspace.default.funding` Delta table. Otherwise, it falls back to live API calls.

```python
# backend/services/data_loader.py
import pandas as pd
from .hpc_client import fetch_plans_by_year
from .hdx_client import fetch_humanitarian_needs, fetch_population, fetch_funding

async def load_all_data(years: list[int] = [2023, 2024, 2025]) -> dict:
    all_plans = []
    all_funding = []
    all_needs = []

    for year in years:
        plans = await fetch_plans_by_year(year)
        all_plans.extend(plans.get("data", []))

        # Funding from HDX HAPI /coordination-context/funding
        funding = await fetch_funding(year=year)
        all_funding.extend(funding.get("data", []))

        needs = await fetch_humanitarian_needs(year=year)
        all_needs.extend(needs.get("data", []))

    population = await fetch_population()

    # Funding DF has: funding_usd, requirements_usd, funding_pct, location_code, location_name
    funding_df = pd.DataFrame(all_funding)

    # Join funding with humanitarian needs on location_code (ISO3)
    needs_df = pd.DataFrame(all_needs)

    return {
        "plans": pd.DataFrame(all_plans),
        "funding": funding_df,
        "needs": needs_df,
        "population": pd.DataFrame(population.get("data", [])),
    }
```

### 3.6 API Router Definitions

**GET `/api/countries?year=2024`**

Returns enriched country data for globe rendering.

```python
# backend/routers/countries.py
from fastapi import APIRouter, Request

router = APIRouter()

@router.get("/countries")
async def get_countries(request: Request, year: int = 2024):
    data = request.app.state.data
    needs_df = data["needs"]

    filtered = needs_df[
        needs_df["reference_period_start"].str.startswith(str(year))
    ]

    country_agg = filtered.groupby("location_code").agg({
        "population": "sum",
        "location_name": "first",
    }).reset_index()

    return {
        "year": year,
        "countries": country_agg.to_dict(orient="records")
    }
```

**GET `/api/mismatch?year=2024`**

Returns the mismatch scores — merges severity with funding coverage per country.

```python
# backend/routers/mismatch.py
from fastapi import APIRouter, Request

router = APIRouter()

@router.get("/mismatch")
async def get_mismatch(request: Request, year: int = 2024):
    # Mismatch data is computed by Databricks and cached
    # Falls back to on-the-fly calculation if Databricks result unavailable
    ...
    return {
        "year": year,
        "mismatches": [
            {
                "iso3": "SDN",
                "country": "Sudan",
                "severity": 4.2,
                "fundingRequested": 2800000000,
                "fundingReceived": 840000000,
                "coverageRatio": 0.30,
                "mismatchScore": 0.87,
                "peopleInNeed": 24800000,
                "fundingPerCapita": 33.87
            }
        ]
    }
```

**GET `/api/compare?a=SDN&b=UKR`**

Side-by-side comparison of two countries.

**POST `/api/ask`** `{ "question": "Why did Sudan receive less funding than Ukraine?" }`

Proxies to Databricks vector search + LLM for RAG-based answer. Returns text for ElevenLabs to speak.

### 3.7 Backend Directory Structure

```
backend/
├── main.py
├── requirements.txt
├── .env                    # DATABRICKS_HOST, DATABRICKS_TOKEN, ELEVENLABS_API_KEY
├── routers/
│   ├── countries.py
│   ├── mismatch.py
│   ├── compare.py
│   └── ask.py
└── services/
    ├── hpc_client.py       # HPC Tools API calls
    ├── hdx_client.py       # HDX HAPI API calls
    ├── data_loader.py      # Startup data ingestion
    ├── databricks_client.py# Databricks SQL + Vector Search
    └── mismatch_engine.py  # Fallback mismatch calculator
```

### 3.8 Backend Deliverables Checklist

- [ ] FastAPI app with CORS configured for Next.js
- [ ] HPC client fetching plans, flows, projects
- [ ] HDX HAPI client fetching humanitarian needs + population
- [ ] Startup data loader caching to `app.state`
- [ ] `/api/countries` endpoint returning enriched country data
- [ ] `/api/mismatch` endpoint returning mismatch scores
- [ ] `/api/compare` endpoint for country comparison
- [ ] `/api/ask` endpoint proxying to Databricks RAG
- [ ] Fallback mismatch engine for offline Databricks

---

## 4. Workstream C — Databricks: Pipeline & ML

**Owner:** Data/ML engineer(s)
**Depends on:** Raw data from HPC + HDX HAPI (can use backend client code or call APIs directly from notebooks)

### 4.1 Free Edition Constraints

| Resource | Limit |
|---|---|
| Compute | Serverless only, small cluster sizes |
| SQL Warehouse | 1 warehouse, 2X-Small max |
| Vector Search | 1 endpoint, 1 unit. No Direct Vector Access |
| Jobs | Max 5 concurrent tasks |
| Apps | 1 app, auto-stops after 24h |
| Languages | Python only (no R, no Scala) |
| GPU | None available |
| Outbound network | Limited to trusted domains |

**Implication:** All ML must use CPU-friendly algorithms (scikit-learn, not deep learning). Vector search is available but limited to 1 endpoint.

### 4.2 Notebook 1 — Data Ingestion

Create a Databricks notebook that pulls from HPC Tools API and HDX HAPI and writes to Delta tables in the `workspace.default` namespace.

**Data sources:**

| Data | Source | Endpoint |
|---|---|---|
| HRP Plans | HPC Tools API | `GET /plan/year/{year}` |
| Funding | HDX HAPI | `GET /coordination-context/funding` |
| Humanitarian Needs | HDX HAPI | `GET /affected-people/humanitarian-needs` |
| Population | HDX HAPI | `GET /geography-infrastructure/baseline-population` |
| Projects | HPC Tools API | `GET /project/plan/{planId}` |

All HDX HAPI calls use `reference_period_start_min=2020-01-01` date filtering and `limit=10000` page size for efficient pagination.

```python
# Notebook: 01_data_ingestion
import requests
import pandas as pd
import base64

HPC_BASE = "https://api.hpc.tools/v1/public"
HDX_BASE = "https://hapi.humdata.org/api/v2"
APP_ID = base64.b64encode(b"CrisisTopography:team@hacklytics.org").decode()

# --- Fetch HRP plans for years 2020-2026 ---
all_plans = []
for year in range(2020, 2027):
    resp = requests.get(f"{HPC_BASE}/plan/year/{year}")
    if resp.ok:
        all_plans.extend(resp.json().get("data", []))

plans_df = spark.createDataFrame(pd.DataFrame(all_plans))
plans_df.write.format("delta").mode("overwrite").saveAsTable("workspace.default.plans")

# --- Fetch funding data from HDX HAPI ---
# Uses /coordination-context/funding (NOT HPC FTS /fts/flow)
# Returns: funding_usd, requirements_usd, funding_pct, location_code, location_name
all_funding = []
offset = 0
while True:
    resp = requests.get(
        f"{HDX_BASE}/coordination-context/funding",
        params={
            "app_identifier": APP_ID,
            "limit": 10000,
            "offset": offset,
            "reference_period_start_min": "2020-01-01",
        }
    )
    data = resp.json().get("data", [])
    if not data:
        break
    all_funding.extend(data)
    offset += 10000

funding_df = spark.createDataFrame(pd.DataFrame(all_funding))
funding_df.write.format("delta").mode("overwrite").saveAsTable("workspace.default.funding")

# --- Fetch humanitarian needs from HDX HAPI ---
all_needs = []
offset = 0
while True:
    resp = requests.get(
        f"{HDX_BASE}/affected-people/humanitarian-needs",
        params={
            "app_identifier": APP_ID,
            "limit": 10000,
            "offset": offset,
            "reference_period_start_min": "2020-01-01",
        }
    )
    data = resp.json().get("data", [])
    if not data:
        break
    all_needs.extend(data)
    offset += 10000

needs_df = spark.createDataFrame(pd.DataFrame(all_needs))
needs_df.write.format("delta").mode("overwrite").saveAsTable("workspace.default.humanitarian_needs")

# --- Fetch population baselines ---
all_pop = []
offset = 0
while True:
    resp = requests.get(
        f"{HDX_BASE}/geography-infrastructure/baseline-population",
        params={
            "app_identifier": APP_ID,
            "limit": 10000,
            "offset": offset,
            "reference_period_start_min": "2020-01-01",
        }
    )
    data = resp.json().get("data", [])
    if not data:
        break
    all_pop.extend(data)
    offset += 10000

pop_df = spark.createDataFrame(pd.DataFrame(all_pop))
pop_df.write.format("delta").mode("overwrite").saveAsTable("workspace.default.population")
```

### 4.3 Notebook 2 — Mismatch Detection Engine

This is the core analytical model. It computes a **mismatch score** per country-year and flags **anomaly projects**.

```python
# Notebook: 02_mismatch_engine

from pyspark.sql import functions as F

# --- Load tables ---
needs = spark.table("workspace.default.humanitarian_needs")
funding = spark.table("workspace.default.funding")
plans = spark.table("workspace.default.plans")

# --- Country-Level Mismatch ---
# Aggregate severity: total people in need per country-year
severity = needs.groupBy("location_code", "location_name").agg(
    F.sum("population").alias("people_in_need"),
    F.count("*").alias("sector_count")
)

# Merge with funding data (from HDX HAPI /coordination-context/funding)
# funding contains: location_code, funding_usd, requirements_usd, funding_pct
country_mismatch = severity.join(
    funding,
    severity["location_code"] == funding["location_code"],
    "left"
)

# Compute mismatch score using funding_usd and requirements_usd
country_mismatch = country_mismatch.withColumn(
    "funding_per_capita",
    F.col("funding_usd") / F.col("people_in_need")
)

# Rank-based mismatch: high severity rank + low funding rank = high mismatch
from pyspark.sql.window import Window

w = Window.orderBy(F.desc("people_in_need"))
country_mismatch = country_mismatch.withColumn("severity_rank", F.rank().over(w))

w2 = Window.orderBy(F.desc("funding_per_capita"))
country_mismatch = country_mismatch.withColumn("funding_rank", F.rank().over(w2))

country_mismatch = country_mismatch.withColumn(
    "mismatch_score",
    (F.col("severity_rank") - F.col("funding_rank")) / F.lit(100)
)

country_mismatch.write.format("delta").mode("overwrite").saveAsTable("workspace.default.country_mismatch")
```

### 4.4 Notebook 3 — Project-Level Anomaly Detection

Flag projects with unusual budget patterns using Isolation Forest. Uses budget-based features only, as the HPC API returns `null` for `targetBeneficiaries` across all projects, making cost-per-person analysis infeasible.

**Features used for anomaly detection:**
- `budget` — current requested funds
- `budget_zscore` — how far the project's budget deviates from its cluster average
- `budget_revision_ratio` — ratio of current to original requested funds

```python
# Notebook: 03_project_anomalies

import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
import requests

HPC_BASE = "https://api.hpc.tools/v1/public"
plan_ids = spark.table("workspace.default.plans").select("id").collect()

all_projects = []
for row in plan_ids:
    resp = requests.get(f"{HPC_BASE}/project/plan/{row.id}")
    if resp.ok:
        projects = resp.json().get("data", [])
        for p in projects:
            budget = p.get("currentRequestedFunds", 0)
            original = p.get("originalRequirements", budget)
            all_projects.append({
                "projectCode": p.get("code"),
                "planId": row.id,
                "budget": float(budget) if budget else 0,
                "original_budget": float(original) if original else 0,
                "cluster": p.get("globalClusters", [{}])[0].get("name", "Unknown"),
                "countryISO3": p.get("locations", [{}])[0].get("iso3", ""),
            })

projects_pdf = pd.DataFrame(all_projects)
projects_pdf["budget"] = pd.to_numeric(projects_pdf["budget"], errors="coerce").fillna(0)
projects_pdf["original_budget"] = pd.to_numeric(projects_pdf["original_budget"], errors="coerce").fillna(0)
projects_pdf = projects_pdf[projects_pdf["budget"] > 0]

# Compute budget z-score per cluster
cluster_stats = projects_pdf.groupby("cluster")["budget"].agg(["mean", "std"]).reset_index()
cluster_stats.columns = ["cluster", "cluster_mean", "cluster_std"]
projects_pdf = projects_pdf.merge(cluster_stats, on="cluster", how="left")
projects_pdf["budget_zscore"] = (
    (projects_pdf["budget"] - projects_pdf["cluster_mean"]) / projects_pdf["cluster_std"].replace(0, 1)
)

# Budget revision ratio
projects_pdf["budget_revision_ratio"] = np.where(
    projects_pdf["original_budget"] > 0,
    projects_pdf["budget"] / projects_pdf["original_budget"],
    1.0
)

# Isolation Forest for anomaly detection (budget-only features)
features = projects_pdf[["budget", "budget_zscore", "budget_revision_ratio"]].values
scaler = StandardScaler()
features_scaled = scaler.fit_transform(features)

model = IsolationForest(contamination=0.1, random_state=42)
projects_pdf["anomaly_label"] = model.fit_predict(features_scaled)
projects_pdf["anomaly_score"] = -model.decision_function(features_scaled)

# anomaly_label: -1 = anomaly, 1 = normal
anomalies_sdf = spark.createDataFrame(projects_pdf)
anomalies_sdf.write.format("delta").mode("overwrite").saveAsTable("workspace.default.project_anomalies")
```

### 4.5 Notebook 4 — Vectorization for RAG

Vectorize country-level crisis summaries for semantic search. Uses Databricks Vector Search (1 free endpoint).

**Prerequisites:**
1. Install `databricks-vectorsearch` package (not included in default runtime)
2. Restart Python after installation so imports resolve
3. Enable Change Data Feed on the source Delta table (required for Delta Sync)

```python
# Notebook: 04_vectorize_for_rag

# Cell 1: Install dependencies
%pip install databricks-vectorsearch

# Cell 2: Restart Python (required after pip install in Databricks)
dbutils.library.restartPython()

# Cell 3: Create documents and vector index
import pandas as pd
from databricks.vector_search.client import VectorSearchClient

vsc = VectorSearchClient()

# Create the vector search endpoint (only 1 allowed on Free Edition)
vsc.create_endpoint(name="crisis-rag-endpoint")

# Prepare text documents: one per country-year with crisis summary
mismatch = spark.table("workspace.default.country_mismatch").toPandas()

documents = []
for _, row in mismatch.iterrows():
    funding_usd = float(row.get("funding_usd", 0) or 0)
    funding_per_capita = float(row.get("funding_per_capita", 0) or 0)
    coverage = float(row.get("funding_pct", 0) or 0)
    text = (
        f"Country: {row['location_name']} ({row['location_code']}). "
        f"People in need: {float(row['people_in_need']):,.0f}. "
        f"Total funding: ${funding_usd:,.0f}. "
        f"Funding per capita: ${funding_per_capita:.2f}. "
        f"Funding coverage: {coverage:.1f}%. "
        f"Mismatch score: {float(row['mismatch_score']):.3f}. "
        f"Severity rank: {int(row['severity_rank'])}. "
        f"Funding rank: {int(row['funding_rank'])}."
    )
    documents.append({
        "id": f"{row['location_code']}_{row.get('year', 2024)}",
        "text": text,
        "location_code": row["location_code"],
    })

docs_df = spark.createDataFrame(pd.DataFrame(documents))

# Enable Change Data Feed on the table (required for Delta Sync index)
docs_df.write.format("delta").mode("overwrite").saveAsTable("workspace.default.rag_documents")
spark.sql("ALTER TABLE workspace.default.rag_documents SET TBLPROPERTIES (delta.enableChangeDataFeed = true)")

# Create vector search index on the Delta table
# Uses Databricks-managed embeddings (no GPU needed, serverless)
vsc.create_delta_sync_index(
    endpoint_name="crisis-rag-endpoint",
    index_name="workspace.default.rag_index",
    source_table_name="workspace.default.rag_documents",
    pipeline_type="TRIGGERED",
    primary_key="id",
    embedding_source_column="text",
    embedding_model_endpoint_name="databricks-bge-large-en"
)
```

**Querying the vector index** (used by the `/api/ask` endpoint):

```python
# backend/services/databricks_client.py
import httpx
import os

DATABRICKS_HOST = os.getenv("DATABRICKS_HOST")
DATABRICKS_TOKEN = os.getenv("DATABRICKS_TOKEN")

async def vector_search(query: str, num_results: int = 5) -> list[dict]:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{DATABRICKS_HOST}/api/2.0/vector-search/indexes/workspace.default.rag_index/query",
            headers={"Authorization": f"Bearer {DATABRICKS_TOKEN}"},
            json={
                "query_text": query,
                "columns": ["id", "text", "location_code"],
                "num_results": num_results
            }
        )
        resp.raise_for_status()
        return resp.json().get("result", {}).get("data_array", [])
```

### 4.6 Notebook 5 — Benchmarking Comparable Projects

Group projects by cluster, compute budget percentile bands, and flag outliers. Benchmarks on budget (not cost-per-person, since beneficiary data is unavailable from the HPC API).

```python
# Notebook: 05_benchmarking

projects = spark.table("workspace.default.project_anomalies")

# Per-cluster budget statistics
from pyspark.sql import functions as F
from pyspark.sql.window import Window

cluster_stats = projects.groupBy("cluster").agg(
    F.avg("budget").alias("avg_budget"),
    F.stddev("budget").alias("std_budget"),
    F.percentile_approx("budget", 0.25).alias("p25"),
    F.percentile_approx("budget", 0.50).alias("median"),
    F.percentile_approx("budget", 0.75).alias("p75"),
    F.count("*").alias("project_count")
)

cluster_stats.write.format("delta").mode("overwrite").saveAsTable("workspace.default.cluster_benchmarks")

# Join back to compute cluster_budget_zscore per project
benchmarked = projects.join(cluster_stats, on="cluster", how="left")
benchmarked = benchmarked.withColumn(
    "cluster_budget_zscore",
    (F.col("budget") - F.col("avg_budget")) / F.when(F.col("std_budget") == 0, 1).otherwise(F.col("std_budget"))
)

benchmarked.write.format("delta").mode("overwrite").saveAsTable("workspace.default.project_benchmarked")
```

### 4.7 Databricks Deliverables Checklist

- [ ] Notebook 01: Ingest HPC + HDX HAPI data into Delta tables
- [ ] Notebook 02: Country-level mismatch score computation
- [ ] Notebook 03: Project-level anomaly detection (Isolation Forest)
- [ ] Notebook 04: Vectorize crisis summaries + create Vector Search index
- [ ] Notebook 05: Cluster benchmarking statistics
- [ ] Delta tables: `workspace.default.plans`, `workspace.default.funding`, `workspace.default.humanitarian_needs`, `workspace.default.population`, `workspace.default.country_mismatch`, `workspace.default.project_anomalies`, `workspace.default.rag_documents`, `workspace.default.cluster_benchmarks`, `workspace.default.project_benchmarked`

---

## 5. Workstream D — AI Integration: ElevenLabs Voice Agent

**Owner:** AI/UX integrator
**Depends on:** Workstream A (Globe component), Workstream B (`/api/ask` endpoint)

### 5.1 ElevenLabs Agent Setup

Create a Conversational AI agent in the ElevenLabs dashboard:

1. Go to **ElevenLabs Dashboard > Agents** (or ElevenAgents)
2. Create new agent with:
   - **Name:** Crisis Analyst
   - **Voice:** Pick a clear, professional voice
   - **System prompt:**
     ```
     You are a humanitarian crisis analyst assistant. You help users understand
     funding mismatches in global humanitarian crises. You have access to data
     about humanitarian needs, funding flows, and project-level budgets.
     When asked about a specific country or crisis, provide concise, data-backed
     answers about severity scores, funding gaps, and notable anomalies.
     Always cite specific numbers when available.
     ```
   - **Knowledge Base:** Upload the mismatch summary CSV from Databricks (export from `workspace.default.country_mismatch`)
   - **Tools:** Add a custom API tool pointing to your deployed `/api/ask` endpoint
3. Copy the **Agent ID** for frontend integration

### 5.2 React Integration

```bash
cd frontend
npm install @elevenlabs/react
```

```tsx
// frontend/src/components/VoiceAgent.tsx
'use client';

import { useConversation } from '@elevenlabs/react';
import { useCallback, useState } from 'react';
import { useGlobeContext } from '@/context/GlobeContext';

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID!;

export function VoiceAgent() {
  const [isActive, setIsActive] = useState(false);
  const { setSelectedCountry, setFilters } = useGlobeContext();

  const conversation = useConversation({
    clientTools: {
      navigateToCountry: ({ iso3 }: { iso3: string }) => {
        setSelectedCountry(iso3);
        return `Navigated to ${iso3}`;
      },
      filterByCrisis: ({ cluster }: { cluster: string }) => {
        setFilters(prev => ({ ...prev, cluster }));
        return `Filtered to ${cluster}`;
      },
      filterByYear: ({ year }: { year: number }) => {
        setFilters(prev => ({ ...prev, year }));
        return `Showing data for ${year}`;
      },
    },
    onMessage: (message) => {
      console.log('Agent:', message);
    },
    onError: (error) => {
      console.error('Voice agent error:', error);
    },
  });

  const handleToggle = useCallback(async () => {
    if (isActive) {
      await conversation.endSession();
      setIsActive(false);
    } else {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      await conversation.startSession({ agentId: AGENT_ID });
      setIsActive(true);
    }
  }, [isActive, conversation]);

  return (
    <button
      onClick={handleToggle}
      className={`fixed top-4 right-4 z-50 p-4 rounded-full shadow-lg transition-all ${
        isActive
          ? 'bg-red-500 hover:bg-red-600 animate-pulse'
          : 'bg-blue-600 hover:bg-blue-700'
      }`}
    >
      <MicIcon className="w-6 h-6 text-white" />
      <span className="sr-only">
        {isActive ? 'Stop voice agent' : 'Start voice agent'}
      </span>
    </button>
  );
}

function MicIcon({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19 11a7 7 0 01-14 0m7 7v4m-4 0h8m-4-18a3 3 0 00-3 3v4a3 3 0 006 0V7a3 3 0 00-3-3z"
      />
    </svg>
  );
}
```

### 5.3 Client Tools — Voice-Driven Globe Navigation

The ElevenLabs agent must be configured (in the dashboard) with three client-side tools so the voice agent can control the globe:

**Tool 1: `navigateToCountry`**

```json
{
  "name": "navigateToCountry",
  "description": "Navigate the globe to focus on a specific country. Use when the user mentions a country name.",
  "parameters": {
    "type": "object",
    "properties": {
      "iso3": {
        "type": "string",
        "description": "ISO 3166-1 alpha-3 country code (e.g., SDN for Sudan, UKR for Ukraine, YEM for Yemen)"
      }
    },
    "required": ["iso3"]
  }
}
```

**Tool 2: `filterByCrisis`**

```json
{
  "name": "filterByCrisis",
  "description": "Filter the globe visualization to show only a specific crisis sector/cluster.",
  "parameters": {
    "type": "object",
    "properties": {
      "cluster": {
        "type": "string",
        "enum": ["Health", "Food Security", "WASH", "Protection", "Shelter", "Education", "Nutrition", "Early Recovery"],
        "description": "The humanitarian cluster to filter by"
      }
    },
    "required": ["cluster"]
  }
}
```

**Tool 3: `filterByYear`**

```json
{
  "name": "filterByYear",
  "description": "Change the year of data displayed on the globe.",
  "parameters": {
    "type": "object",
    "properties": {
      "year": {
        "type": "integer",
        "description": "The year to display (2020-2025)"
      }
    },
    "required": ["year"]
  }
}
```

### 5.4 Backend RAG Handler for Voice Questions

When a user asks a question like *"Why did Sudan receive less funding than Ukraine?"*, the flow is:

```
User speaks → ElevenLabs Agent → calls /api/ask → 
  Backend queries Databricks Vector Search → 
  Retrieves relevant crisis summaries → 
  Sends context + question to Databricks Foundation Model → 
  Returns text answer → ElevenLabs speaks it
```

```python
# backend/routers/ask.py
from fastapi import APIRouter, Request
from pydantic import BaseModel
from ..services.databricks_client import vector_search, query_llm

router = APIRouter()

class AskRequest(BaseModel):
    question: str

@router.post("/ask")
async def ask_question(req: AskRequest, request: Request):
    context_docs = await vector_search(req.question, num_results=5)

    context_text = "\n\n".join([doc[1] for doc in context_docs])

    prompt = f"""You are a humanitarian crisis data analyst. Using the following data context,
answer the user's question concisely and with specific numbers.

CONTEXT:
{context_text}

QUESTION: {req.question}

ANSWER:"""

    answer = await query_llm(prompt)

    return {
        "question": req.question,
        "answer": answer,
        "sources": [doc[2] for doc in context_docs]
    }
```

```python
# backend/services/databricks_client.py (addition)

async def query_llm(prompt: str) -> str:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{DATABRICKS_HOST}/serving-endpoints/databricks-meta-llama-3-1-70b-instruct/invocations",
            headers={"Authorization": f"Bearer {DATABRICKS_TOKEN}"},
            json={
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 500
            }
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]
```

### 5.5 Example Voice Interactions

| User says | Agent action | Agent responds |
|---|---|---|
| "Show me Sudan" | Calls `navigateToCountry({ iso3: "SDN" })` | "Navigating to Sudan. Sudan has 24.8 million people in need with a mismatch score of 0.87." |
| "Compare Sudan and Ukraine" | Calls `/api/compare?a=SDN&b=UKR` | "Sudan has 24.8M people in need receiving $33.87 per capita. Ukraine has 14.6M people in need receiving $186.30 per capita — a 5.5x difference." |
| "Filter to Health sector" | Calls `filterByCrisis({ cluster: "Health" })` | "Now showing only Health sector data across all countries." |
| "Why is Yemen underfunded?" | Calls `/api/ask` | "Yemen ranks 3rd in severity but 28th in funding per capita. Its HRP has been consistently underfunded by 40-60%, primarily due to..." |

### 5.6 AI Integration Deliverables Checklist

- [ ] ElevenLabs agent created with system prompt + voice
- [ ] Three client tools configured (navigateToCountry, filterByCrisis, filterByYear)
- [ ] React `VoiceAgent` component integrated into layout
- [ ] `/api/ask` endpoint with Databricks Vector Search + LLM
- [ ] Voice-driven globe navigation working end-to-end
- [ ] Knowledge base uploaded with mismatch CSV

---

## 6. Data Flow Diagram

```
                    ┌──────────────┐     ┌──────────────┐
                    │  HPC Tools   │     │   HDX HAPI   │
                    │  API v1      │     │   API v2     │
                    └──────┬───────┘     └──────┬───────┘
                           │                    │
              ┌────────────┴────────────────────┴────────────┐
              │           DATABRICKS (Free Edition)          │
              │                                              │
              │  ┌─────────────┐  ┌────────────────────────┐ │
              │  │ Delta Tables│  │  ML: Isolation Forest  │ │
              │  │ plans       │  │  (project anomalies)   │ │
              │  │ flows       │  └────────────────────────┘ │
              │  │ needs       │                             │
              │  │ population  │  ┌────────────────────────┐ │
              │  └─────────────┘  │  Vector Search Index   │ │
              │                   │  (RAG documents)       │ │
              │  ┌─────────────┐  └────────────────────────┘ │
              │  │ Computed    │                             │
              │  │ mismatch    │  ┌────────────────────────┐ │
              │  │ anomalies   │  │  Foundation Model API  │ │
              │  │ benchmarks  │  │  (LLaMA 3.1 70B)      │ │
              │  └─────────────┘  └────────────────────────┘ │
              └──────────────────────┬───────────────────────┘
                                     │
                              ┌──────┴───────┐
                              │   FastAPI    │
                              │   Backend   │
                              └──────┬───────┘
                                     │
              ┌──────────────────────┴───────────────────────┐
              │              NEXT.JS FRONTEND                │
              │                                              │
              │  ┌─────────┐  ┌──────────┐  ┌────────────┐  │
              │  │Globe.gl │  │ Filters  │  │ ElevenLabs │  │
              │  │3D Globe │  │ & Panels │  │ Voice Agent│  │
              │  └─────────┘  └──────────┘  └────────────┘  │
              └──────────────────────────────────────────────┘
```

---

## 7. API Reference Cheat Sheet

### HPC Tools API v1

**Base:** `https://api.hpc.tools/v1/public`

| Call | URL |
|---|---|
| Plans by year | `GET /plan/year/2024` |
| Plans by country | `GET /plan/country/SDN` |
| Funding flows by year | `GET /fts/flow?year=2024&groupby=Country` |
| Funding flows by country | `GET /fts/flow?countryISO3=SDN&year=2024` |
| Projects in a plan | `GET /project/plan/{planId}` |
| Emergencies by year | `GET /emergency/year/2024` |
| All global clusters | `GET /global-cluster` |
| All locations | `GET /location` |

No authentication required. Rate-limited; use reasonable delays between bulk requests.

### HDX HAPI v2

**Base:** `https://hapi.humdata.org/api/v2`

All requests require `app_identifier` query param (base64 of `"AppName:email"`).

| Call | URL |
|---|---|
| Humanitarian needs | `GET /affected-people/humanitarian-needs?location_code=SDN&app_identifier=...` |
| Funding data | `GET /coordination-context/funding?app_identifier=...&reference_period_start_min=2020-01-01` |
| Baseline population | `GET /geography-infrastructure/baseline-population?app_identifier=...` |
| IDPs | `GET /affected-people/idps?app_identifier=...` |
| Refugees | `GET /affected-people/refugees-persons-of-concern?app_identifier=...` |
| Locations metadata | `GET /metadata/location?app_identifier=...` |

Generate app_identifier: `base64("AppName:email@domain.com")`

### ElevenLabs

**Package:** `@elevenlabs/react`
**Hook:** `useConversation()`
**Key methods:** `conversation.startSession({ agentId })`, `conversation.endSession()`
**Client tools:** Defined in hook config, invoked by the agent during conversation

### Databricks

**Vector Search:** `POST {host}/api/2.0/vector-search/indexes/{index}/query`
**Foundation Models:** `POST {host}/serving-endpoints/{model}/invocations`
**SQL:** `POST {host}/api/2.0/sql/statements` (for querying Delta tables)

---

## 8. Databricks Free Edition Constraints

These constraints shape architectural decisions throughout the project:

| Constraint | Impact | Mitigation |
|---|---|---|
| No GPU | Cannot use deep learning for embeddings | Use `databricks-bge-large-en` managed embedding endpoint (serverless) |
| 1 Vector Search endpoint | Single RAG index only | Combine all crisis summaries into one index with metadata filtering |
| Small cluster sizes | Limited data processing throughput | Pre-aggregate data; run notebooks sequentially, not in parallel |
| 5 concurrent job tasks | Cannot parallelize heavily | Chain notebooks in sequence |
| No R/Scala | Python only | All notebooks in PySpark + pandas |
| 1 SQL warehouse (2X-Small) | Limited query concurrency | Cache query results in FastAPI; minimize live SQL calls |
| 1 App (24h auto-stop) | Cannot host a persistent app | Host FastAPI externally; use Databricks only for data/ML |
| Fair usage quota | Compute may shut down for rest of day if exceeded | Run data ingestion early; cache aggressively |

---

## 9. 36-Hour Sprint Schedule

### Hours 0–4: Foundation

| Who | Task |
|---|---|
| **Frontend** | Scaffold Next.js app, install dependencies, render basic globe with GeoJSON countries |
| **Backend** | Scaffold FastAPI app, implement HPC + HDX clients, verify API calls return data |
| **Data/ML** | Set up Databricks workspace, run Notebook 01 (data ingestion) |
| **AI** | Create ElevenLabs agent in dashboard, configure system prompt and voice |

### Hours 4–10: Core Data Pipeline

| Who | Task |
|---|---|
| **Frontend** | Implement choropleth layer with mock severity data, build side panel with filters |
| **Backend** | Implement `/api/countries` and `/api/mismatch` endpoints with live data |
| **Data/ML** | Run Notebook 02 (mismatch engine) + Notebook 03 (anomaly detection) |
| **AI** | Define client tools in ElevenLabs dashboard, wire `VoiceAgent` component |

### Hours 10–18: Integration

| Who | Task |
|---|---|
| **Frontend** | Connect globe to live backend APIs, implement heatmap + points layers, build detail drawer |
| **Backend** | Implement `/api/compare`, integrate Databricks client for mismatch data |
| **Data/ML** | Run Notebook 04 (vectorization) + Notebook 05 (benchmarking), export mismatch CSV |
| **AI** | Implement `/api/ask` with RAG pipeline, test voice → answer flow end-to-end |

### Hours 18–28: Polish & Voice

| Who | Task |
|---|---|
| **Frontend** | Voice-driven navigation working, country click → detail drawer animation, responsive layout |
| **Backend** | Error handling, caching, performance optimization |
| **Data/ML** | Validate mismatch scores against real-world examples (Yemen, Sudan vs Ukraine) |
| **AI** | Upload knowledge base CSV, test all voice interaction scenarios from Section 5.5 |

### Hours 28–36: Demo Prep

| Who | Task |
|---|---|
| **All** | End-to-end testing, bug fixes |
| **Frontend** | Final UI polish, loading states, error boundaries |
| **Backend** | Deploy to cloud (or run locally for demo) |
| **Data/ML** | Prepare 2-3 compelling data stories for demo (Yemen, Sudan/Ukraine, Health outliers) |
| **AI** | Rehearse voice demo scenarios |
