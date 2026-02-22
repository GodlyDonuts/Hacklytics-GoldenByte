# Crisis Topography — Backend

FastAPI backend powering the Crisis Topography Command Center. Connects to Databricks Delta tables for humanitarian crisis data, exposes REST endpoints for the globe frontend, and integrates Gemini AI for PDF report generation.

---

## Quick Start

```bash
python -m venv venv
source venv/bin/activate        # macOS/Linux
pip install -r requirements.txt
```

Copy `.env` into this directory (or ensure it exists):

```bash
cp ../.env .env
```

Start the server:

```bash
uvicorn main:app --reload --port 8000
```

API docs available at `http://localhost:8000/docs`.

---

## Environment Variables

| Variable | Description |
|---|---|
| `DATABRICKS_HOST` | Databricks workspace URL (e.g. `https://dbc-xxx.cloud.databricks.com/`) |
| `DATABRICKS_TOKEN` | Databricks personal access token |
| `WAREHOUSE_ID` | Databricks SQL Warehouse ID |
| `GEMINI_KEY` | Google Gemini API key (for PDF report generation) |
| `ELEVENLABS_API_KEY` | ElevenLabs API key (optional, for voice agent) |
| `VULTR_IP` | (Optional) Actian Vector DB host (legacy). Used only if Databricks Vector Search is not configured. |
| `USE_VECTOR_DEMO` | Set to `1`, `true`, or `yes` to always return synthetic vector search results (no Databricks or Actian). |

### Vector Search (Databricks)

When `DATABRICKS_HOST` and `DATABRICKS_TOKEN` are set, `vector_search` uses **Databricks Vector Search** (no Actian/Vultr). You need:

1. **Create a Vector Search index** in your workspace (e.g. in the Vector Search UI or via SDK):
   - **Index type**: Delta Sync Index (recommended) or Direct Vector Access.
   - **Full name**: Use the three-level name, e.g. `workspace.default.rag_index` or `main.default.rag_index` (catalog.schema.index_name).
   - **Source table**: A Delta table with a vector column and any metadata columns you want to return (e.g. `id`, `text`, `location_code`, `country_name`, `severity`, `mismatch_score` for the ask router).
   - **Embedding endpoint**: Configure an embedding model (e.g. Databricks Foundation Model API) so that `query_text` is embedded server-side. If you skip this, you must use `query_vector` with pre-computed embeddings instead of `query_text`.

2. **Permissions**: Your token must have **SELECT** on the index, **USE SCHEMA** on the schema, and **USE CATALOG** on the catalog.

3. **Routers**: The ask router uses `index_name="workspace.default.rag_index"`. Create an index with that full name (or change the value in `routers/ask.py` to match your index). The benchmark router uses a project embeddings index (see `routers/benchmark.py`).

If the REST path for your workspace differs, see [Databricks Vector Search API — Query index](https://docs.databricks.com/api/workspace/vectorsearchindexes/queryindex).

---

## Architecture

```
backend/
├── main.py                     # FastAPI entry point, CORS, lifespan, router mounting
├── requirements.txt            # Python dependencies
├── .env                        # Environment variables (not committed)
├── routers/
│   ├── globe.py                # Globe volcano data + B2B drill-down
│   ├── countries.py            # Enriched country-level aggregations
│   ├── benchmark.py            # Vector search project benchmarking
│   ├── ask.py                  # RAG-based Q&A (vector search + LLM)
│   └── report.py               # Gemini-powered PDF report generation
└── services/
    ├── data_loader.py           # Startup loader — queries Databricks tables into memory
    └── databricks_client.py     # Databricks SQL, Vector Search, and LLM clients
```

---

## Startup Lifecycle

On server boot (`lifespan` in `main.py`), the app:

1. Loads `.env` via `python-dotenv`
2. Calls `load_all_data()` which queries four Databricks Delta tables:
   - `workspace.default.plans` — HRP plan metadata
   - `workspace.default.funding` — Funding flows (received vs. requested)
   - `workspace.default.humanitarian_needs` — People in need by sector
   - `workspace.default.population` — Baseline population data
3. Caches all results in `app.state.data` as `list[dict]` for fast access by routers

All numeric values arrive as **strings** from Databricks `JSON_ARRAY` format and must be coerced with `pd.to_numeric()` before aggregation.

---

## API Endpoints

### Globe Router — `GET /api/globe/crises`

Returns crisis data grouped by country for rendering "volcano" markers on the 3D globe.

| Param | Type | Default | Description |
|---|---|---|---|
| `year` | int | 2024 | Filter year (2022–2026) |
| `month` | int (optional) | — | Filter to specific month |

Queries `workspace.default.crisis_summary` on demand. Returns countries with nested crisis arrays containing severity, funding gap, B2B ratio, and project counts.

### Globe Router — `GET /api/globe/b2b`

Returns project-level B2B (Budget-to-Beneficiary) breakdown when a user clicks a country volcano.

| Param | Type | Description |
|---|---|---|
| `iso3` | string | ISO3 country code (required) |
| `year` | int | Filter year (2022–2026) |

Queries `workspace.default.project_embeddings` for per-project cost efficiency analysis.

### Countries Router — `GET /api/countries`

Returns enriched country data aggregated from humanitarian needs and funding tables (cached at startup).

| Param | Type | Default | Description |
|---|---|---|---|
| `year` | int | 2024 | Filter by reference period |

Returns: `people_in_need`, `funding_usd`, `requirements_usd`, `coverage_ratio`, `funding_per_capita` per country.

### Benchmark Router — `POST /api/benchmark`

Finds similar humanitarian projects using Databricks Vector Search and compares B2B ratios.

```json
{ "project_code": "SOM-23/1234", "num_neighbors": 5 }
```

Returns the query project, nearest neighbors with B2B deltas, and a generated insight string.

### Ask Router — `POST /api/ask`

RAG-based question answering. Retrieves relevant project context via Vector Search, builds an augmented prompt, and queries the Databricks-hosted LLM (Meta Llama 3.1 70B).

```json
{ "question": "Which countries have the worst funding gaps?" }
```

Returns an `answer` with cited `sources`.

### Report Router — `GET /api/report`

Generates a professional two-page PDF report using Google Gemini AI.

| Param | Type | Default | Description |
|---|---|---|---|
| `scope` | string | `"global"` | `"global"` or `"country"` |
| `iso3` | string (optional) | — | Required if scope is `"country"` |

- **Global scope**: Identifies the top 5 most underfunded countries and generates a macro-level analysis
- **Country scope**: Deep-dives into a specific country's crisis, funding gap, and recommendations
- Uses `gemini-3-flash-preview` with `thinking_level="high"` for detailed reasoning
- Returns a downloadable `application/pdf` file

---

## Databricks Integration

### SQL Execution (`execute_sql`)
Executes arbitrary SQL against Databricks via the SQL Statement API using `EXTERNAL_LINKS` disposition. Handles pagination of presigned URL chunks.

### Vector Search (`vector_search`)
Queries the `workspace.default.project_embeddings_index` Vector Search index by natural language text. Used by the benchmark and ask endpoints.

### LLM (`query_llm`)
Calls the Databricks Foundation Model serving endpoint (`databricks-meta-llama-3-1-70b-instruct`) for grounded answers in the RAG pipeline.

---

## Dependencies

| Package | Purpose |
|---|---|
| `fastapi` | Web framework |
| `uvicorn` | ASGI server |
| `httpx` | Async HTTP client (Databricks API) |
| `pandas` | Data aggregation and numeric coercion |
| `python-dotenv` | `.env` file loading |
| `google-genai` | Gemini AI for report generation |
| `markdown-pdf` | Markdown → PDF conversion |
| `sentence-transformers` | Embeddings for vector search (benchmark/ask) |
| `cortex` | **Optional.** Actian Vector DB client for `/api/benchmark` and vector search. Not on PyPI. |

### Optional: Actian Vector DB (Benchmark / Ask)

The **benchmark** and **ask** endpoints use the Actian Vector DB on Vultr. They require:

1. **`sentence-transformers`** — install with: `pip install sentence-transformers`
2. **`cortex`** — Actian’s beta Python client. It is not on PyPI. You need the **actiancortex** (or actian-vectorAI-db-beta) SDK `.whl` from Actian, then install it locally, for example:
   ```bash
   pip install /path/to/actiancortex-*.whl
   ```
   If you don’t have the `.whl`, the app still runs; `POST /api/benchmark` and vector-backed ask will return 502 with a message that the cortex package is not installed.

---
