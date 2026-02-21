"""Country data endpoints.

Serves humanitarian needs aggregated by country from startup-loaded data,
plus project anomalies and cluster benchmarks from Databricks queries.
"""

import logging

import pandas as pd
from fastapi import APIRouter, HTTPException, Query, Request

from ..services.mismatch_engine import get_cluster_benchmarks, get_project_anomalies

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/countries")
async def get_countries(request: Request, year: int = 2024):
    """Return humanitarian needs aggregated by country for a given year."""
    data = request.app.state.data
    needs_raw = data.get("humanitarian_needs", [])

    if not needs_raw:
        return {"year": year, "countries": []}

    needs_df = pd.DataFrame(needs_raw)

    ref_col = "reference_period_start"
    if ref_col in needs_df.columns:
        filtered = needs_df[
            needs_df[ref_col].astype(str).str.startswith(str(year), na=False)
        ]
    else:
        filtered = needs_df

    agg_cols = {}
    if "population" in filtered.columns:
        filtered["population"] = pd.to_numeric(filtered["population"], errors="coerce")
        agg_cols["population"] = "sum"
    if "location_name" in filtered.columns:
        agg_cols["location_name"] = "first"

    if not agg_cols:
        return {"year": year, "countries": []}

    country_agg = (
        filtered.groupby("location_code")
        .agg(agg_cols)
        .reset_index()
    )

    return {"year": year, "countries": country_agg.to_dict(orient="records")}


@router.get("/projects/anomalies")
async def list_project_anomalies(country: str | None = Query(default=None)):
    """Return projects flagged as anomalous by the Isolation Forest model.

    Optionally filter by ISO3 country code.
    """
    try:
        anomalies = await get_project_anomalies(country)
        return {"count": len(anomalies), "anomalies": anomalies}
    except TimeoutError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/clusters/benchmarks")
async def list_cluster_benchmarks():
    """Return per-cluster budget statistics from the benchmarking pipeline."""
    try:
        benchmarks = await get_cluster_benchmarks()
        return {"count": len(benchmarks), "benchmarks": benchmarks}
    except TimeoutError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
