a#!/usr/bin/env python3
"""
Build a CSV of year, iso3, population for 2022–2026 using World Bank API.

- Reads the ACAPS INFORM Severity CSV (from fetch_acaps_inform_severity_csv.py)
  to get the list of unique countries (iso3). ISO3 is derived from crisis_id
  (e.g. "UKR-001" -> "UKR").
- For each country, calls World Bank:
  GET https://api.worldbank.org/v2/country/{ISO3}/indicator/SP.POP.TOTL?date=2022:2026&format=json
- Uses response index [1] as the list of observations (index 0 is metadata).
- Output CSV columns: year, iso3, population.

Usage (from project root):
  python scripts/fetch_worldbank_population_csv.py [--input ACAPS.csv] [--output POPULATION.csv]
"""

import argparse
import csv
import sys
from pathlib import Path

import requests

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT = PROJECT_ROOT / "crisis.csv"
DEFAULT_OUTPUT = PROJECT_ROOT / "worldbank_population_2022_2026.csv"
WB_URL = "https://api.worldbank.org/v2/country/{iso3}/indicator/SP.POP.TOTL"
DATE_RANGE = "2022:2026"


def log(msg, flush=True):
    print(msg, flush=flush)


def iso3_from_crisis_id(crisis_id):
    """Derive ISO3 from crisis_id (e.g. 'UKR-001' -> 'UKR')."""
    if not crisis_id or not isinstance(crisis_id, str):
        return None
    s = crisis_id.strip().upper()
    if "-" in s:
        return s.split("-")[0].strip()
    if len(s) >= 3:
        return s[:3]
    return None


def unique_iso3_from_acaps_csv(path):
    """Read ACAPS CSV and return sorted unique 3-letter ISO3 codes."""
    iso3_set = set()
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if "crisis_id" not in reader.fieldnames:
            raise ValueError(f"Expected 'crisis_id' column in {path}")
        for row in reader:
            cid = row.get("crisis_id", "")
            iso = iso3_from_crisis_id(cid)
            if iso and len(iso) == 3 and iso.isalpha():
                iso3_set.add(iso)
    return sorted(iso3_set)


def fetch_population(iso3):
    """Call World Bank API; return list of (year, value) from response[1]."""
    url = f"{WB_URL.format(iso3=iso3)}?date={DATE_RANGE}&format=json"
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    data = r.json()
    if not isinstance(data, list) or len(data) < 2:
        return []
    rows = data[1]
    if not isinstance(rows, list):
        return []
    out = []
    for item in rows:
        if not isinstance(item, dict):
            continue
        year_s = item.get("date")
        value = item.get("value")
        if year_s is None:
            continue
        try:
            year = int(year_s)
        except (TypeError, ValueError):
            continue
        if value is not None:
            try:
                value = int(value)
            except (TypeError, ValueError):
                pass
        out.append((year, value))
    return out


def main():
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(line_buffering=True)
        except Exception:
            pass

    parser = argparse.ArgumentParser(
        description="Build year/iso3/population CSV from World Bank using countries from ACAPS CSV"
    )
    parser.add_argument(
        "--input", "-i",
        default=str(DEFAULT_INPUT),
        help="Path to ACAPS INFORM Severity CSV (must have crisis_id column)",
    )
    parser.add_argument(
        "--output", "-o",
        default=str(DEFAULT_OUTPUT),
        help="Output CSV path",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Print each country as it is fetched",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.is_file():
        print(f"Error: Input CSV not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    log("Reading countries from ACAPS CSV...")
    countries = unique_iso3_from_acaps_csv(input_path)
    log(f"Found {len(countries)} unique countries (iso3).")

    all_rows = []
    for i, iso3 in enumerate(countries, start=1):
        if args.verbose:
            log(f"  [{i}/{len(countries)}] {iso3}...")
        try:
            pairs = fetch_population(iso3)
        except requests.RequestException as e:
            print(f"Error fetching {iso3}: {e}", file=sys.stderr, flush=True)
            continue
        for year, value in pairs:
            all_rows.append({"year": year, "iso3": iso3, "population": value})

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["year", "iso3", "population"])
        w.writeheader()
        w.writerows(all_rows)

    log(f"Wrote {len(all_rows)} rows to {out_path}")


if __name__ == "__main__":
    main()
