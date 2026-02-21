"""Country comparison endpoint.

Returns side-by-side mismatch data for two countries, enabling
the comparison view in the frontend.
"""

from fastapi import APIRouter, HTTPException, Query

from ..services.mismatch_engine import compare_countries

router = APIRouter()


@router.get("/compare")
async def compare(
    a: str = Query(..., description="First country ISO3 code"),
    b: str = Query(..., description="Second country ISO3 code"),
):
    """Compare mismatch data for two countries side-by-side."""
    try:
        results = await compare_countries(a.upper(), b.upper())
    except TimeoutError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    if len(results) < 2:
        missing = {a.upper(), b.upper()} - {r.get("location_code") for r in results}
        raise HTTPException(
            status_code=404,
            detail=f"Country not found: {', '.join(missing)}",
        )

    # Return in consistent order matching the query params
    ordered = sorted(results, key=lambda r: r.get("location_code") == b.upper())
    return {"country_a": ordered[0], "country_b": ordered[1]}
