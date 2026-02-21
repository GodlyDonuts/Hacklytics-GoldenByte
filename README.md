# Crisis Topography Command Center

Interactive 3D globe mapping humanitarian funding mismatches — built for Hacklytics 2026.

## Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.11+
- API keys for: ElevenLabs, Databricks (Free Edition)

## Quick Start

### 1. Clone and configure environment

```bash
git clone <repo-url>
cd Hacklytics-GoldenByte
cp .env.example .env
```

Open `.env` and fill in your keys:

```
ELEVENLABS_API_KEY=your_key
NEXT_PUBLIC_ELEVENLABS_AGENT_ID=your_agent_id
DATABRICKS_HOST=https://your-workspace.cloud.databricks.com
DATABRICKS_TOKEN=your_token
```

### 2. Backend setup

```bash
cd backend
python -m venv venv
source venv/bin/activate      # macOS/Linux
# venv\Scripts\activate       # Windows
pip install -r requirements.txt
```

Copy the env file into the backend directory as well:

```bash
cp ../.env .env
```

Start the server:

```bash
uvicorn main:app --reload --port 8000
```

The API is now available at `http://localhost:8000`. Docs at `http://localhost:8000/docs`.

### 3. Frontend setup

Open a new terminal:

```bash
cd frontend
npm install
```

Create the frontend env file:

```bash
cp ../.env .env.local
```

Start the dev server:

```bash
npm run dev
```

The app is now available at `http://localhost:3000`.

## Project Structure

```
├── docs/
│   ├── PLAN.md           # Full implementation plan (start here)
│   └── REFERENCE.md      # Challenge description and datasets
├── backend/
│   ├── main.py           # FastAPI entry point
│   ├── requirements.txt  # Python dependencies
│   ├── routers/          # API route handlers
│   │   ├── countries.py
│   │   ├── mismatch.py
│   │   ├── compare.py
│   │   └── ask.py
│   └── services/         # Data clients and business logic
│       ├── hpc_client.py
│       ├── hdx_client.py
│       ├── data_loader.py
│       ├── databricks_client.py
│       └── mismatch_engine.py
├── frontend/             # Next.js 14 + react-globe.gl
│   ├── src/app/
│   └── package.json
└── .env.example          # Environment variable template
```

## Workstream Assignments

Read `docs/PLAN.md` for full details. Quick summary:

| Workstream | Focus | Start with |
|---|---|---|
| **A — Frontend** | Globe, UI, filters, detail drawer | Section 2 of PLAN.md |
| **B — Backend** | FastAPI, HPC/HDX API integration | Section 3 of PLAN.md |
| **C — Databricks** | Data pipeline, ML, vector search | Section 4 of PLAN.md |
| **D — AI/Voice** | ElevenLabs agent, RAG pipeline | Section 5 of PLAN.md |

## External APIs (no keys required)

- **HPC Tools API v1**: `https://api.hpc.tools/v1/public` — humanitarian plans, funding flows, projects
- **HDX HAPI v2**: `https://hapi.humdata.org/api/v2` — humanitarian needs, population (needs app_identifier, see PLAN.md)
