import pandas as pd
from .hpc_client import fetch_plans_by_year, fetch_funding_flows
from .hdx_client import fetch_humanitarian_needs, fetch_population

async def load_all_data(years: list[int] = [2023, 2024, 2025]) -> dict:
    all_plans = []
    all_flows = []
    all_needs = []

    for year in years:
        plans = await fetch_plans_by_year(year)
        all_plans.extend(plans.get("data", []))

        flows = await fetch_funding_flows(year)
        all_flows.append(flows)

        needs = await fetch_humanitarian_needs(year=year)
        all_needs.extend(needs.get("data", []))

    population = await fetch_population()

    return {
        "plans": pd.DataFrame(all_plans),
        "flows_raw": all_flows,
        "needs": pd.DataFrame(all_needs),
        "population": pd.DataFrame(population.get("data", [])),
    }