"""Crisis Topography API -- FastAPI backend.

Serves humanitarian funding mismatch data from Databricks Delta tables
to the Next.js frontend globe visualization.
"""

import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import ask, compare, countries, mismatch
from .services.data_loader import load_all_data
from .services.databricks_client import check_warehouse_status, close_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load data on startup, clean up client on shutdown."""
    logger.info("Starting Crisis Topography API...")
    app.state.data = await load_all_data()
    logger.info("Data loaded successfully")
    yield
    logger.info("Shutting down, closing Databricks client...")
    await close_client()


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


@app.get("/api/health")
async def health():
    """Health check with warehouse status."""
    warehouse = await check_warehouse_status()
    has_data = hasattr(app.state, "data") and bool(app.state.data)
    return {
        "status": "ok" if has_data else "starting",
        "data_loaded": has_data,
        "warehouse": warehouse,
    }
