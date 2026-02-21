from .databricks_client import execute_sql


async def load_all_data() -> dict:
    """Verify Databricks connectivity and load legacy tables for /api/countries."""
    await execute_sql("SELECT 1")
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
