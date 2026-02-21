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