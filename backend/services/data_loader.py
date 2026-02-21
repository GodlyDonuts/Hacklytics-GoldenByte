import logging

from .databricks_client import execute_sql

logger = logging.getLogger(__name__)


async def load_all_data() -> dict:
    """Verify Databricks connectivity and load legacy tables for /api/countries.

    Tables that don't exist are silently skipped so the new endpoints
    (globe, benchmark, ask) can start without the old pipeline tables.
    """
    await execute_sql("SELECT 1")

    result = {}
    for table in ("plans", "funding", "humanitarian_needs", "population"):
        try:
            result[table] = await execute_sql(f"SELECT * FROM workspace.default.{table}")
        except Exception as e:
            logger.warning("Skipping legacy table %s: %s", table, e)
            result[table] = []
    return result
