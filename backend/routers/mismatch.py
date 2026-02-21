"""Mismatch score endpoints.

Serves country-level funding mismatch data computed by the Databricks
mismatch engine (notebook 02).
"""

from fastapi import APIRouter, HTTPException

from ..services.mismatch_engine import get_countries_enriched, get_country_detail

router = APIRouter()


@router.get("/mismatch")
async def get_mismatch():
    """Return all countries with mismatch scores for globe visualization."""
    try:
        countries = await get_countries_enriched()
        return {"count": len(countries), "mismatches": countries}
    except TimeoutError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/mismatch/{iso3}")
async def get_mismatch_detail(iso3: str):
    """Return detailed mismatch data for a single country."""
    try:
        detail = await get_country_detail(iso3.upper())
    except TimeoutError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    if not detail:
        raise HTTPException(status_code=404, detail=f"Country '{iso3}' not found")
    return detail
