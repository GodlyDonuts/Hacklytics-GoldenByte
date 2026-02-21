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
