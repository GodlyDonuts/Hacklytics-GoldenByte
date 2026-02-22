# backend/services/cache.py
"""In-memory cache for Databricks tables.

Both crisis_summary and project_embeddings are static (only change when
notebooks re-run), so we load them once at startup and serve from memory.
This eliminates per-request Databricks round-trips (~300-500ms warm,
~19s cold start).
"""

import logging
from collections import defaultdict

logger = logging.getLogger(__name__)

# Raw cached rows keyed by table name
_tables: dict[str, list[dict]] = {}

# Pre-built indexes for fast lookups
_crisis_by_year: dict[int, list[dict]] = {}
_crisis_by_year_month: dict[tuple[int, int], list[dict]] = {}
_projects_by_iso3_year: dict[tuple[str, int], list[dict]] = {}


async def warm_cache() -> None:
    """Load crisis_summary and project_embeddings into memory."""
    from .databricks_client import execute_sql

    for table in ("crisis_summary", "project_embeddings"):
        try:
            rows = await execute_sql(f"SELECT * FROM workspace.default.{table}")
            _tables[table] = rows
            logger.info("Cached %s: %d rows", table, len(rows))
        except Exception as e:
            logger.warning("Failed to cache %s: %s", table, e)
            _tables[table] = []

    _build_indexes()


def _build_indexes() -> None:
    """Build lookup indexes from cached rows for O(1) access."""
    _crisis_by_year.clear()
    _crisis_by_year_month.clear()
    _projects_by_iso3_year.clear()

    for row in _tables.get("crisis_summary", []):
        year = _safe_int(row.get("year"))
        month = _safe_int(row.get("month"))
        if year is not None:
            _crisis_by_year.setdefault(year, []).append(row)
            if month is not None:
                _crisis_by_year_month.setdefault((year, month), []).append(row)

    for row in _tables.get("project_embeddings", []):
        iso3 = (row.get("iso3") or "").strip().upper()
        year = _safe_int(row.get("year"))
        if iso3 and year is not None:
            _projects_by_iso3_year.setdefault((iso3, year), []).append(row)

    logger.info(
        "Indexes built: %d year keys, %d year-month keys, %d iso3-year keys",
        len(_crisis_by_year),
        len(_crisis_by_year_month),
        len(_projects_by_iso3_year),
    )


def get_crises(year: int, month: int | None = None) -> list[dict]:
    """Return crisis_summary rows for a year (optionally filtered by month)."""
    if month is not None:
        return _crisis_by_year_month.get((year, month), [])
    return _crisis_by_year.get(year, [])


def get_projects(iso3: str, year: int) -> list[dict]:
    """Return project_embeddings rows for a country-year."""
    return _projects_by_iso3_year.get((iso3.upper(), year), [])


def _safe_int(v) -> int | None:
    if v is None:
        return None
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None
