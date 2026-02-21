"""Predefined SQL queries for the mismatch analysis engine.

All SQL is hardcoded (no user-supplied SQL). Country filtering uses
parameterized queries to prevent injection.
"""

from typing import Any

from .databricks_client import execute_sql


async def get_country_mismatch() -> list[dict[str, Any]]:
    """Get all countries ranked by mismatch score (descending)."""
    return await execute_sql(
        "SELECT * FROM workspace.default.country_mismatch ORDER BY mismatch_score DESC"
    )


async def get_country_detail(iso3: str) -> dict[str, Any] | None:
    """Get mismatch data for a single country by ISO3 code."""
    rows = await execute_sql(
        "SELECT * FROM workspace.default.country_mismatch WHERE location_code = :iso3",
        params=[{"name": "iso3", "value": iso3, "type": "STRING"}],
    )
    return rows[0] if rows else None


async def get_countries_enriched() -> list[dict[str, Any]]:
    """Get country data enriched for globe visualization.

    Returns mismatch scores with coordinates and severity levels
    needed for choropleth rendering.
    """
    return await execute_sql("""
        SELECT
            location_code,
            location_name,
            severity,
            funding_requested,
            funding_received,
            coverage_ratio,
            mismatch_score,
            people_in_need,
            funding_per_capita
        FROM workspace.default.country_mismatch
        ORDER BY mismatch_score DESC
    """)


async def get_project_anomalies(
    country: str | None = None,
) -> list[dict[str, Any]]:
    """Get projects flagged as anomalies by the Isolation Forest model.

    Args:
        country: Optional ISO3 country code to filter by.
    """
    if country:
        return await execute_sql(
            "SELECT * FROM workspace.default.project_anomalies "
            "WHERE location_code = :country ORDER BY anomaly_score DESC",
            params=[{"name": "country", "value": country, "type": "STRING"}],
        )
    return await execute_sql(
        "SELECT * FROM workspace.default.project_anomalies ORDER BY anomaly_score DESC"
    )


async def get_cluster_benchmarks() -> list[dict[str, Any]]:
    """Get per-cluster budget statistics from the benchmarking pipeline."""
    return await execute_sql(
        "SELECT * FROM workspace.default.cluster_benchmarks ORDER BY cluster_name"
    )


async def compare_countries(iso3_a: str, iso3_b: str) -> list[dict[str, Any]]:
    """Get side-by-side mismatch data for two countries.

    Args:
        iso3_a: First country ISO3 code.
        iso3_b: Second country ISO3 code.
    """
    return await execute_sql(
        "SELECT * FROM workspace.default.country_mismatch "
        "WHERE location_code IN (:a, :b)",
        params=[
            {"name": "a", "value": iso3_a, "type": "STRING"},
            {"name": "b", "value": iso3_b, "type": "STRING"},
        ],
    )
