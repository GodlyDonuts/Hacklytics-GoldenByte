#!/usr/bin/env python3
"""Fetch ACAPS months 46-49 (Oct2025, Nov2025, Dec2025, Jan2026) and append to existing CSV."""
import csv
import importlib.util
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = PROJECT_ROOT / "acaps_inform_severity_2022_2026.csv"
WRITE_COLUMNS = ["year_month", "crisis_id", "percent_affected_pop", "people_in_minimal",
                 "people_in_stressed", "people_in_moderate", "people_in_severe", "people_in_extreme"]

# Months 46-49: Oct2025, Nov2025, Dec2025, Jan2026
MONTHS_TO_FETCH = [
    (2025, 10, "Oct2025"),
    (2025, 11, "Nov2025"),
    (2025, 12, "Dec2025"),
    (2026, 1, "Jan2026"),
]


def main():
    # Load fetch module without running its main
    spec = importlib.util.spec_from_file_location(
        "fetch_acaps",
        Path(__file__).resolve().parent / "fetch_acaps_inform_severity_csv.py",
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    token = mod.get_token()
    session = mod.requests.Session()
    session.headers.update({
        "Authorization": f"Token {token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    })

    new_rows = []
    for year, month_1, label in MONTHS_TO_FETCH:
        print(f"Fetching {label}...", flush=True)
        impact_url = f"{mod.BASE_URL}/impact-of-crisis/{label}/"
        conditions_url = f"{mod.BASE_URL}/conditions-of-people-affected/{label}/"
        try:
            impact_rows = mod.fetch_json(session, impact_url, label)
            conditions_rows = mod.fetch_json(session, conditions_url, label)
        except mod.requests.RequestException as e:
            print(f"Error fetching {label}: {e}", file=sys.stderr)
            raise
        month_rows = mod.merge_month_data(impact_rows, conditions_rows)
        for row in month_rows:
            row_with_month = dict(row)
            row_with_month["year_month"] = f"{year}-{month_1:02d}"
            new_rows.append(row_with_month)
        print(f"  -> {len(month_rows)} crises", flush=True)

    # Read existing CSV
    existing = []
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        existing = list(reader)

    # Append new rows
    combined = existing + new_rows

    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=WRITE_COLUMNS, extrasaction="ignore")
        w.writeheader()
        w.writerows(combined)

    print(f"Appended {len(new_rows)} rows. Total rows: {len(combined)}. Wrote to {CSV_PATH}", flush=True)


if __name__ == "__main__":
    main()
