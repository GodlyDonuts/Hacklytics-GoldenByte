"""Globe API — volcano data and B2B drill-down.

Serves crisis_summary for globe volcanoes and project_embeddings for B2B breakdown.
"""

from collections import defaultdict

from fastapi import APIRouter, HTTPException, Query

from ..services.databricks_client import execute_sql

router = APIRouter()

VALID_YEARS = range(2022, 2027)


def _validate_year(year: int) -> int:
    if year not in VALID_YEARS:
        raise HTTPException(400, f"year must be 2022–2026, got {year}")
    return year


def _validate_iso3(iso3: str) -> str:
    s = (iso3 or "").strip().upper()
    if len(s) != 3 or not s.isalpha():
        raise HTTPException(400, f"iso3 must be 3-letter country code, got {iso3!r}")
    return s


@router.get("/crises")
async def get_globe_crises(year: int = Query(2024, ge=2022, le=2026)):
    """Volcano data for the globe. Queries crisis_summary on demand."""
    year = _validate_year(year)
    try:
        rows = await execute_sql(
            f"SELECT * FROM workspace.default.crisis_summary WHERE year = {year} ORDER BY iso3, crisis_rank"
        )
    except RuntimeError as e:
        raise HTTPException(502, f"Databricks error: {e}") from e

    # Group by country (iso3)
    by_country: dict[str, list] = defaultdict(list)
    for r in rows:
        iso3 = r.get("iso3") or r.get("location_code") or ""
        if not iso3:
            continue
        crisis = {
            "crisis_id": r.get("crisis_id"),
            "crisis_name": r.get("crisis_name"),
            "acaps_severity": _float(r.get("acaps_severity")),
            "severity_class": r.get("severity_class"),
            "has_hrp": _bool(r.get("has_hrp")),
            "appeal_type": r.get("appeal_type"),
            "funding_state": r.get("funding_state"),
            "people_in_need": _int(r.get("people_in_need")),
            "funding_gap_usd": _float(r.get("funding_gap_usd")),
            "funding_coverage_pct": _float(r.get("funding_coverage_pct")),
            "avg_b2b_ratio": _float(r.get("avg_b2b_ratio")),
            "median_b2b_ratio": _float(r.get("median_b2b_ratio")),
            "project_count": _int(r.get("project_count")),
            "crisis_rank": _int(r.get("crisis_rank")),
        }
        by_country[iso3].append(crisis)

    countries = []
    seen = set()
    for r in rows:
        iso3 = r.get("iso3") or r.get("location_code") or ""
        if not iso3 or iso3 in seen:
            continue
        seen.add(iso3)
        countries.append({
            "iso3": iso3,
            "country_name": r.get("country_name") or r.get("location_name") or iso3,
            "lat": _float(r.get("lat")),
            "lng": _float(r.get("lng")),
            "crises": by_country.get(iso3, []),
        })

    return {"year": year, "countries": countries}


@router.get("/b2b")
async def get_globe_b2b(
    iso3: str = Query(..., description="ISO3 country code"),
    year: int = Query(2024, ge=2022, le=2026),
):
    """Project-level B2B breakdown when user clicks a volcano."""
    iso3 = _validate_iso3(iso3)
    year = _validate_year(year)

    # Safe: iso3 validated as 3 alpha chars, year validated as int in range
    try:
        rows = await execute_sql(
            f"""SELECT project_code, project_name, cluster, requested_funds,
                target_beneficiaries, b2b_ratio, cost_per_beneficiary,
                b2b_percentile, is_outlier, cluster_median_b2b
            FROM workspace.default.project_embeddings
            WHERE iso3 = '{iso3}' AND year = {year}
            ORDER BY b2b_ratio DESC"""
        )
    except RuntimeError as e:
        raise HTTPException(502, f"Databricks error: {e}") from e

    projects = []
    for r in rows:
        projects.append({
            "project_code": r.get("project_code"),
            "project_name": r.get("project_name"),
            "cluster": r.get("cluster"),
            "requested_funds": _float(r.get("requested_funds")),
            "target_beneficiaries": _int(r.get("target_beneficiaries")),
            "b2b_ratio": _float(r.get("b2b_ratio")),
            "cost_per_beneficiary": _float(r.get("cost_per_beneficiary")),
            "b2b_percentile": _float(r.get("b2b_percentile")),
            "is_outlier": _bool(r.get("is_outlier")),
            "cluster_median_b2b": _float(r.get("cluster_median_b2b")),
        })

    b2b_ratios = [p["b2b_ratio"] for p in projects if p["b2b_ratio"] is not None]
    summary = {
        "avg_b2b": sum(b2b_ratios) / len(b2b_ratios) if b2b_ratios else None,
        "median_b2b": _median(b2b_ratios) if b2b_ratios else None,
        "total_projects": len(projects),
        "outlier_count": sum(1 for p in projects if p.get("is_outlier")),
    }

    return {
        "iso3": iso3,
        "year": year,
        "projects": projects,
        "summary": summary,
    }


def _float(v) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _int(v) -> int | None:
    if v is None:
        return None
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def _bool(v) -> bool:
    if v is None:
        return False
    if isinstance(v, bool):
        return v
    return str(v).lower() in ("true", "1", "yes")


def _median(lst: list[float]) -> float:
    s = sorted(lst)
    n = len(s)
    if n % 2:
        return s[n // 2]
    return (s[n // 2 - 1] + s[n // 2]) / 2
