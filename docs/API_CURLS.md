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

### 1. GET `/api/countries`

Returns enriched country data for globe rendering (aggregated humanitarian needs by country).

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `year` | int | 2024 | Filter by reference year |

**Status:** ✅ Implemented

```bash
curl -X GET "http://localhost:8000/api/countries?year=2024"
```

With explicit year:

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
      "location_name": "Sudan"
    }
  ]
}
```

---

### 2. GET `/api/mismatch`

Returns mismatch scores (severity vs funding coverage per country).

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `year` | int | 2024 | Filter by year |

**Status:** ⚠️ Stub (returns mock data; Databricks integration pending)

```bash
curl -X GET "http://localhost:8000/api/mismatch?year=2024"
```

With explicit year:

```bash
curl -X GET "http://localhost:8000/api/mismatch?year=2023"
```

**Example response:**
```json
{
  "year": 2024,
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

---

### 3. GET `/api/compare`

Side-by-side comparison of two countries.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `a` | string | Yes | ISO3 code of first country (e.g. `SDN`) |
| `b` | string | Yes | ISO3 code of second country (e.g. `UKR`) |

**Status:** ❌ Not implemented (router empty)

```bash
curl -X GET "http://localhost:8000/api/compare?a=SDN&b=UKR"
```

---

### 4. POST `/api/ask`

RAG-based Q&A; proxies to Databricks vector search + LLM. Returns text for ElevenLabs to speak.

**Status:** ❌ Not implemented (router empty)

**Request body:**
```json
{
  "question": "Why did Sudan receive less funding than Ukraine?"
}
```

```bash
curl -X POST "http://localhost:8000/api/ask" \
  -H "Content-Type: application/json" \
  -d '{"question": "Why did Sudan receive less funding than Ukraine?"}'
```

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
| `/api/countries` | GET | ✅ Implemented |
| `/api/mismatch` | GET | ⚠️ Stub (mock data) |
| `/api/compare` | GET | ❌ Empty router |
| `/api/ask` | POST | ❌ Empty router |

---

## Notes

- **CORS:** Allowed origin is `http://localhost:3000` for frontend dev.
- **Data loading:** On startup, the app loads data from HPC Tools API and HDX HAPI (2023–2025). Startup may take a few seconds.
- **Empty routers:** If `compare` or `ask` routers are empty, the app may fail to start. Add minimal stubs if needed:
  - `compare`: `@router.get("/compare")` returning `{"a": ..., "b": ..., "comparison": []}`
  - `ask`: `@router.post("/ask")` returning `{"answer": "..."}`
