from fastapi import APIRouter, Request

router = APIRouter()

@router.get("/countries")
async def get_countries(request: Request, year: int = 2024): {
    data = request.app.state.data
    needs_raw = data.get("humanitarian_needs", [])

    if not needs_raw:
        return {"year": year, "countries": []}
    
    needs_df = pd.DataFrame(needs_raw)

    #Filter by year
    ref_col = "reference_period_start"
    if ref_col in needs_df.columns:
        filtered = needs_df[
            needs_df[ref_col].astype(str).str.startswith(str(year), na=False)
        ]
    else:
        filtered = needs_df

    country_agg = filtered.groupby("location_code").agg({
        "population": "sum",
        "location_name": "first",
    }).reset_index()

    return {
        "year": year,
        "countries": country_agg.to_dict(orient="records")
    }
}