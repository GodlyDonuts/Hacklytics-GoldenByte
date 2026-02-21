from .databricks_client import execute_sql

async def load_all_data() -> dict:
    plans = await execute_sql("SELECT * FROM workspace.default.plans")
    funding = await execute_sql("SELECT * FROM workspace.default.funding")
    humanitarian_needs = await execute_sql("SELECT * FROM workspace.default.humanitarian_needs")
    population = await execute_sql("SELECT * FROM workspace.default.population")
    return {
        "plans": plans,
        "funding": funding,
        "humanitarian_needs": humanitarian_needs,
        "population": population,
    }
