"""Load base data from Databricks Delta tables at startup.

Fetches humanitarian needs, population, plans, and funding data
into memory for fast country-level aggregation queries.
"""

import logging

from .databricks_client import execute_sql

logger = logging.getLogger(__name__)


async def load_all_data() -> dict:
    """Load base reference data from Delta tables.

    Returns:
        Dict with keys: plans, funding, humanitarian_needs, population.
    """
    logger.info("Loading base data from Databricks Delta tables...")

    plans = await execute_sql("SELECT * FROM workspace.default.plans")
    funding = await execute_sql("SELECT * FROM workspace.default.funding")
    humanitarian_needs = await execute_sql(
        "SELECT * FROM workspace.default.humanitarian_needs"
    )
    population = await execute_sql("SELECT * FROM workspace.default.population")

    logger.info(
        "Loaded %d plans, %d funding records, %d needs, %d population rows",
        len(plans), len(funding), len(humanitarian_needs), len(population),
    )

    return {
        "plans": plans,
        "funding": funding,
        "humanitarian_needs": humanitarian_needs,
        "population": population,
    }
