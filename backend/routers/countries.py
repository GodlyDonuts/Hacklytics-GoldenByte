from fastapi import APIRouter, Request
import pandas as pd

router = APIRouter()


def _first_col(df: pd.DataFrame, candidates: list[str]) -> str | None:
    for c in candidates:
        if c in df.columns:
            return c
    return None


@router.get("/countries")
async def get_countries(request: Request, year: int = 2024):
    data = getattr(request.app.state, "data", None) or {}
    needs_raw = data.get("humanitarian_needs", [])
    flows_raw = data.get("funding", [])

    if not needs_raw:
        return {"year": year, "countries": []}

    needs_df = pd.DataFrame(needs_raw)

    # Filter by year via reference_period_start
    ref_col = "reference_period_start"
    if ref_col in needs_df.columns:
        needs_df = needs_df[
            needs_df[ref_col].astype(str).str.startswith(str(year), na=False)
        ]

    # Aggregate needs to country level
    pop_col = _first_col(needs_df, ["population", "people_in_need"])
    agg_dict: dict = {"location_name": "first"}
    if pop_col:
        # Databricks JSON_ARRAY serialises all values as strings — coerce before summing
        needs_df[pop_col] = pd.to_numeric(needs_df[pop_col], errors="coerce")
        agg_dict[pop_col] = "sum"

    country_agg = needs_df.groupby("location_code", as_index=False).agg(agg_dict)
    if pop_col and pop_col != "people_in_need":
        country_agg = country_agg.rename(columns={pop_col: "people_in_need"})

    # Merge funding flows
    if flows_raw:
        flows_df = pd.DataFrame(flows_raw)

        # Filter flows by year
        yr_col = _first_col(flows_df, ["year", "Year", "fiscal_year"])
        if yr_col:
            flows_df = flows_df[flows_df[yr_col].astype(str) == str(year)]

        country_col = _first_col(flows_df, ["location_code", "countryISO3", "iso3"])
        received_col = _first_col(flows_df, ["funding_usd", "totalFunding", "amountUSD"])
        requested_col = _first_col(flows_df, ["requirements_usd", "totalRequirements", "requirements"])

        if country_col and (received_col or requested_col):
            # Databricks JSON_ARRAY serialises all values as strings — coerce before summing
            if received_col:
                flows_df[received_col] = pd.to_numeric(flows_df[received_col], errors="coerce")
            if requested_col:
                flows_df[requested_col] = pd.to_numeric(flows_df[requested_col], errors="coerce")

            agg_cols: dict = {}
            if received_col:
                agg_cols[received_col] = "sum"
            if requested_col:
                agg_cols[requested_col] = "sum"
            # Pass-through scalar fields — take first value per country group
            for passthrough in ("funding_pct", "appeal_code", "appeal_name"):
                if passthrough in flows_df.columns:
                    agg_cols[passthrough] = "first"

            flows_agg = flows_df.groupby(country_col, as_index=False).agg(agg_cols)
            flows_agg = flows_agg.rename(columns={
                country_col: "location_code",
                **(  {received_col:  "funding_usd"}      if received_col  else {}),
                **({requested_col: "requirements_usd"} if requested_col else {}),
            })
            country_agg = country_agg.merge(flows_agg, on="location_code", how="left")

    # Derived fields
    if "funding_usd" in country_agg.columns and "requirements_usd" in country_agg.columns:
        req = pd.to_numeric(country_agg["requirements_usd"], errors="coerce")
        rcv = pd.to_numeric(country_agg["funding_usd"], errors="coerce")
        country_agg["coverage_ratio"] = (rcv / req.replace(0, pd.NA)).clip(upper=1.0).fillna(0)

    if "funding_usd" in country_agg.columns and "people_in_need" in country_agg.columns:
        pin = pd.to_numeric(country_agg["people_in_need"], errors="coerce")
        rcv = pd.to_numeric(country_agg["funding_usd"], errors="coerce")
        country_agg["funding_per_capita"] = (rcv / pin.replace(0, pd.NA)).fillna(0)

    # NaN → None for clean JSON serialisation
    country_agg = country_agg.where(pd.notna(country_agg), other=None)

    return {
        "year": year,
        "countries": country_agg.to_dict(orient="records"),
    }
