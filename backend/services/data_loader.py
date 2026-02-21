import logging

from .databricks_client import execute_sql
from .cache import warm_cache

logger = logging.getLogger(__name__)


async def load_all_data() -> dict:
    """Load data at startup: warm the in-memory cache for new endpoints
    and optionally load legacy tables for /api/countries.
    """
    # Connectivity check
    await execute_sql("SELECT 1")

    # Warm the in-memory cache (crisis_summary + project_embeddings)
    await warm_cache()

    # Legacy tables for /api/countries (optional, skip if missing)
    result = {}
    for table in ("plans", "funding", "humanitarian_needs", "population"):
        try:
            result[table] = await execute_sql(f"SELECT * FROM workspace.default.{table}")
        except Exception as e:
            logger.warning("Skipping legacy table %s: %s", table, e)
            result[table] = []
    return result
