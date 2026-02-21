import asyncio
import pandas as pd
from fastapi import Request

from databricks_client import execute_sql

async def load_all_data(years: list[int] = [2023, 2024, 2025]) -> dict: {
    plans = execute_sql("SELECT * FROM workspace.default.plans")
    funding_flows = execute_sql("SELECT * FROM workspace.default.funding_flows")
    humanitarian_needs = execute_sql("SELECT * FROM workspace.default.humanitarian_needs")
    population = execute_sql("SELECT * FROM workspace.default.population")
    return {
        "plans": plans,
        "funding_flows": funding_flows,
        "humanitarian_needs": humanitarian_needs,
        "population": population,
    }
}
