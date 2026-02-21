"""Globe API — volcano data and B2B drill-down.

Serves crisis_summary for globe volcanoes and project_embeddings for B2B breakdown.
"""

from collections import defaultdict

from fastapi import APIRouter, HTTPException, Query

from ..services.databricks_client import execute_sql

router = APIRouter()

VALID_YEARS = range(2022, 2027)
VALID_MONTHS = range(1, 13)


def _validate_year(year: int) -> int:
    if year not in VALID_YEARS:
        raise HTTPException(400, f"year must be 2022–2026, got {year}")
    return year


def _validate_month(month: int | None) -> int | None:
    if month is None:
        return None
    if month not in VALID_MONTHS:
        raise HTTPException(400, f"month must be 1–12, got {month}")
    return month


def _validate_iso3(iso3: str) -> str:
    s = (iso3 or "").strip().upper()
    if len(s) != 3 or not s.isalpha():
        raise HTTPException(400, f"iso3 must be 3-letter country code, got {iso3!r}")
    return s


@router.get("/crises")
async def get_globe_crises(
    year: int = Query(2024, ge=2022, le=2026),
    month: int | None = Query(None, ge=1, le=12, description="Filter to specific month (1–12); omit for full year"),
):
    """Volcano data for the globe. Queries crisis_summary on demand. Month-based for simpler view."""
    year = _validate_year(year)
    month = _validate_month(month)

    if month is not None:
        where_clause = f"WHERE year = {year} AND month = {month}"
    else:
        where_clause = f"WHERE year = {year}"

    try:
        print(f"DESCRIBE workspace.default.crisis_summary: {await execute_sql('DESCRIBE workspace.default.crisis_summary')}")
        rows = await execute_sql(
            f"SELECT * FROM workspace.default.crisis_summary {where_clause} ORDER BY iso3, crisis_rank"
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
            "people_in_need": _int(r.get("people_in_need")),
            "funding_usd": _float(r.get("funding_usd")),
            "b2b_ratio": _float(r.get("b2b_ratio"))
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

    year_month = f"{year}-{month:02d}" if month is not None else f"{year}"
    return {
        "year": year,
        "month": month,
        "year_month": year_month,
        "countries": countries,
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
