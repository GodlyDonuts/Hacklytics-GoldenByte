"""Globe API -- volcano data and B2B drill-down.

Serves crisis_summary for globe volcanoes and project_embeddings for B2B breakdown.
All data is served from the in-memory cache (loaded once at startup).
"""

from collections import defaultdict

from fastapi import APIRouter, HTTPException, Query

from services.cache import get_crises, get_projects

router = APIRouter()

VALID_YEARS = range(2022, 2027)
VALID_MONTHS = range(1, 13)


def _validate_year(year: int) -> int:
    if year not in VALID_YEARS:
        raise HTTPException(400, f"year must be 2022-2026, got {year}")
    return year


def _validate_month(month: int | None) -> int | None:
    if month is None:
        return None
    if month not in VALID_MONTHS:
        raise HTTPException(400, f"month must be 1-12, got {month}")
    return month


def _validate_iso3(iso3: str) -> str:
    s = (iso3 or "").strip().upper()
    if len(s) != 3 or not s.isalpha():
        raise HTTPException(400, f"iso3 must be 3-letter country code, got {iso3!r}")
    return s


@router.get("/crises")
async def get_globe_crises(
    year: int = Query(2024, ge=2022, le=2026),
    month: int | None = Query(None, ge=1, le=12, description="Filter to specific month (1-12); omit for full year"),
):
    """Volcano data for the globe. Served from in-memory cache."""
    year = _validate_year(year)
    month = _validate_month(month)

    rows = get_crises(year, month)

    # Group by country (iso3), deduplicating crises by crisis_id.
    # When viewing a full year (month=None), crisis_summary has one row
    # per crisis per month. Keep the latest month's snapshot per crisis.
    by_country: dict[str, list] = defaultdict(list)
    seen_crises: dict[tuple[str, str], dict] = {}  # (iso3, crisis_id) -> crisis dict
    for r in sorted(rows, key=lambda r: r.get("month") or 0):
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
            "target_beneficiaries": _int(r.get("target_beneficiaries")),
            "funding_usd": _float(r.get("funding_usd")),
            "requirements_usd": _float(r.get("requirements_usd")),
            "funding_gap_usd": _float(r.get("funding_gap_usd")),
            "funding_coverage_pct": _pct(r.get("funding_coverage_pct")),
            "coverage_ratio": _float(r.get("coverage_ratio")),
            "oversight_score": _float(r.get("oversight_score")),
            "b2b_ratio": _float(r.get("b2b_ratio")),
            "crisis_rank": _int(r.get("crisis_rank")),
        }
        cid = crisis.get("crisis_id") or ""
        key = (iso3, cid)
        # Latest month wins (rows sorted ascending by month)
        seen_crises[key] = (iso3, crisis)

    for (_iso3, _cid), (country_iso, crisis) in seen_crises.items():
        by_country[country_iso].append(crisis)

    # Sort crises by rank (most severe first)
    for iso3 in by_country:
        by_country[iso3].sort(key=lambda c: c.get("crisis_rank") or 999)

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


@router.get("/b2b")
async def get_globe_b2b(
    iso3: str = Query(..., description="ISO3 country code"),
    year: int = Query(2024, ge=2022, le=2026),
):
    """Project-level B2B breakdown when user clicks a volcano. Served from in-memory cache."""
    iso3 = _validate_iso3(iso3)
    year = _validate_year(year)

    rows = get_projects(iso3, year)

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
            "anomaly_score": _float(r.get("anomaly_score")),
        })

    # Weighted B2B: sum(beneficiaries) / sum(funding) -- weights by project size
    total_beneficiaries = sum(
        p["target_beneficiaries"] for p in projects
        if p["target_beneficiaries"] is not None and p["requested_funds"] is not None
        and p["requested_funds"] > 0
    )
    total_funding = sum(
        p["requested_funds"] for p in projects
        if p["target_beneficiaries"] is not None and p["requested_funds"] is not None
        and p["requested_funds"] > 0
    )
    b2b_ratios = [p["b2b_ratio"] for p in projects if p["b2b_ratio"] is not None]
    summary = {
        "weighted_b2b": total_beneficiaries / total_funding if total_funding > 0 else None,
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


def _pct(v) -> float | None:
    """Convert a 0-1 ratio to a 0-100 percentage."""
    f = _float(v)
    if f is None:
        return None
    return round(f * 100, 1)


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
