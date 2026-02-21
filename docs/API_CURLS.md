# Crisis Topography API — cURL Testing Reference

> API calls and curl commands for testing the backend (Workstream B).  
> **Base URL:** `http://localhost:8000` (when running `uvicorn backend.main:app --reload --port 8000`)

---

## Quick Start

```bash
# Start the backend
cd backend
source venv/bin/activate
uvicorn backend.main:app --reload --port 8000
```

---

## API Endpoints

### 1. GET `/api/globe/crises`

Returns volcano data for the globe. Queries `crisis_summary` on demand.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `year` | int | 2024 | Filter by year (2022–2026) |

**Status:** ✅ Implemented

```bash
curl -X GET "http://localhost:8000/api/globe/crises?year=2024"
```

With explicit year:

```bash
curl -X GET "http://localhost:8000/api/globe/crises?year=2023"
```

**Example response:**
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

---

### 2. GET `/api/globe/b2b`

Returns project-level B2B breakdown when user clicks a volcano. Queries `project_embeddings`.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `iso3` | string | required | ISO3 country code (e.g. SDN, UKR) |
| `year` | int | 2024 | Filter by year (2022–2026) |

**Status:** ✅ Implemented

```bash
curl -X GET "http://localhost:8000/api/globe/b2b?iso3=SDN&year=2024"
```

```bash
curl -X GET "http://localhost:8000/api/globe/b2b?iso3=YEM&year=2023"
```

**Example response:**
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

---

### 3. POST `/api/benchmark`

Find similar projects via vector search and compare B2B ratios. Used by ElevenLabs for benchmarking.

**Status:** ✅ Implemented

**Request body:**
```json
{
  "project_code": "SDN-24/H/001",
  "num_neighbors": 5
}
```

```bash
curl -X POST "http://localhost:8000/api/benchmark" \
  -H "Content-Type: application/json" \
  -d '{"project_code": "SDN-24/H/001", "num_neighbors": 5}'
```

**Example response:**
```json
{
  "query_project": {
    "project_code": "SDN-24/H/001",
    "project_name": "Emergency Health Response",
    "cluster": "Health",
    "b2b_ratio": 0.05,
    "cost_per_beneficiary": 20.0
  },
  "neighbors": [
    {
      "project_code": "YEM-24/H/003",
      "project_name": "Yemen Health Cluster",
      "iso3": "YEM",
      "country_name": "Yemen",
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

---

### 4. POST `/api/ask`

RAG-based Q&A for the ElevenLabs agent. Vector search on `project_embeddings` + LLM.

**Status:** ✅ Implemented

**Request body:**
```json
{
  "question": "Which health crises lack HRP plans but have high severity?"
}
```

```bash
curl -X POST "http://localhost:8000/api/ask" \
  -H "Content-Type: application/json" \
  -d '{"question": "Which health crises lack HRP plans but have high severity?"}'
```

```bash
curl -X POST "http://localhost:8000/api/ask" \
  -H "Content-Type: application/json" \
  -d '{"question": "Why did Sudan receive less funding than Ukraine?"}'
```

**Example response:**
```json
{
  "answer": "Based on the data, Sudan's HRP received approximately 30% funding coverage...",
  "sources": [
    {
      "project_code": "SDN-24/H/001",
      "iso3": "SDN",
      "country_name": "Sudan"
    }
  ]
}
```

---

### 5. GET `/api/countries`

Legacy cross-reference dataset. Returns enriched country data from original tables (`plans`, `funding`, `humanitarian_needs`, `population`). Kept for backward compatibility and ElevenLabs agent context.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `year` | int | 2024 | Filter by reference year |

**Status:** ✅ Implemented (legacy)

```bash
curl -X GET "http://localhost:8000/api/countries?year=2024"
```

```bash
curl -X GET "http://localhost:8000/api/countries?year=2023"
```

**Example response:**
```json
{
  "year": 2024,
  "countries": [
    {
      "location_code": "SDN",
      "population": 24800000,
      "location_name": "Sudan",
      "people_in_need": 24800000,
      "funding_usd": 840000000,
      "requirements_usd": 2800000000,
      "coverage_ratio": 0.30,
      "funding_per_capita": 33.87
    }
  ]
}
```

---

## Deprecated / Removed

| Endpoint | Status |
|----------|--------|
| `GET /api/mismatch` | ❌ Removed — replaced by `/api/globe/crises` |
| `GET /api/compare` | ❌ Removed — use `/api/globe/b2b` + `/api/benchmark` for comparisons |

---

## Health / Docs

| Endpoint | Description |
|----------|-------------|
| `GET /docs` | Swagger UI |
| `GET /openapi.json` | OpenAPI schema |
| `GET /` | Root (if defined) |

```bash
curl -X GET "http://localhost:8000/docs"
curl -X GET "http://localhost:8000/openapi.json"
```

---

## Implementation Status Summary

| Endpoint | Method | Status |
|----------|--------|--------|
| `/api/globe/crises` | GET | ✅ Implemented |
| `/api/globe/b2b` | GET | ✅ Implemented |
| `/api/benchmark` | POST | ✅ Implemented |
| `/api/ask` | POST | ✅ Implemented |
| `/api/countries` | GET | ✅ Implemented (legacy) |
| `/api/mismatch` | GET | ❌ Removed |
| `/api/compare` | GET | ❌ Removed |

---

## Notes

- **CORS:** Allowed origin is `http://localhost:3000` for frontend dev.
- **Data loading:** On startup, the app verifies Databricks connectivity and loads legacy tables for `/api/countries`. Globe endpoints query `crisis_summary` and `project_embeddings` on demand.
- **Databricks tables:** New endpoints require `workspace.default.crisis_summary` and `workspace.default.project_embeddings` (and vector index `project_embeddings_index` for `/api/benchmark` and `/api/ask`). Run the Databricks notebooks from REFACTOR_PLAN.md to populate these tables.
