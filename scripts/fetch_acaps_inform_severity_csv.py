#!/usr/bin/env python3
"""
Fetch ACAPS INFORM Severity data and write a CSV.

- Calls impact-of-crisis and conditions-of-people-affected for each month
  from January 2022 through January 2026 (inclusive).
- Uses credentials from project root .env: ACAPS_USERNAME, ACAPS_PASSWORD.
- Output CSV columns: year_month, crisis_id, percent_affected_pop,
  people_in_minimal, people_in_stressed, people_in_moderate, people_in_severe,
  people_in_extreme.

Usage (from project root):
  pip install -r scripts/requirements.txt   # once
  python scripts/fetch_acaps_inform_severity_csv.py [--output OUTPUT.csv]
"""

import argparse
import csv
import os
import sys
import time
from pathlib import Path

# Load .env from project root (parent of scripts/)
try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if load_dotenv:
    load_dotenv(PROJECT_ROOT / ".env")

import requests

BASE_URL = "https://api.acaps.org/api/v1/inform-severity-index"
TOKEN_URL = "https://api.acaps.org/api/v1/token-auth/"

# Month label for URL: Jan2022, Feb2022, ..., Jan2026
MONTH_LABELS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

# Keys we look for in impact-of-crisis response
CRISIS_ID_KEYS = ("crisis_id", "crisis id", "id")
PERCENT_AFFECTED_KEY = "% of total population living in the affected area"

# Keys we look for in conditions-of-people-affected response
CONDITION_KEYS = [
    "% of people in none/minimal conditions - Level 1",
    "% of people in stressed conditions - level 2",
    "% of people in moderate conditions - level 3",
    "% of people severe conditions - level 4",
    "% of people extreme conditions - level 5",
]

CSV_COLUMNS = [
    "crisis_id",
    "percent_affected_pop",
    "people_in_minimal",
    "people_in_stressed",
    "people_in_moderate",
    "people_in_severe",
    "people_in_extreme",
]


def log(msg, flush=True):
    print(msg, flush=flush)


def get_token():
    username = os.environ.get("ACAPS_USERNAME")
    password = os.environ.get("ACAPS_PASSWORD")
    if not username or not password:
        print("Error: Set ACAPS_USERNAME and ACAPS_PASSWORD in .env", file=sys.stderr)
        sys.exit(1)
    log("Getting token...")
    for attempt in range(3):
        try:
            r = requests.post(
                TOKEN_URL,
                json={"username": username, "password": password},
                headers={"Content-Type": "application/json"},
                timeout=60,
            )
            r.raise_for_status()
            break
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
            if attempt < 2:
                log(f"    Token request timeout, retrying in 10s...")
                time.sleep(10)
            else:
                raise
    data = r.json()
    token = data.get("token")
    if not token:
        print("Error: No token in auth response", file=sys.stderr)
        sys.exit(1)
    log("Token received.")
    return token


def month_range_jan2022_jan2026():
    """Yield (year, month_index_1based, label) from Jan 2022 through Jan 2026 (inclusive)."""
    for year in range(2022, 2027):
        for month_1 in range(1, 13):
            if year == 2026 and month_1 > 1:
                break
            label = f"{MONTH_LABELS[month_1 - 1]}{year}"
            yield year, month_1, label


def first_value(d, keys, default=""):
    if not isinstance(d, dict):
        return default
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    return default


def get_numeric(d, key, default=""):
    v = d.get(key) if isinstance(d, dict) else None
    if v is None:
        return default
    if isinstance(v, (int, float)):
        return v
    s = str(v).strip()
    if not s:
        return default
    try:
        return float(s)
    except ValueError:
        return s


# ACAPS can be slow for some months; use long timeout and retries
REQUEST_TIMEOUT = 180
MAX_RETRIES = 3
RETRY_DELAYS = (15, 30, 60)  # seconds between retries


def fetch_json(session, url, month_label):
    last_err = None
    for attempt in range(MAX_RETRIES):
        try:
            r = session.get(url, timeout=REQUEST_TIMEOUT)
            if r.status_code == 404:
                return []
            r.raise_for_status()
            data = r.json()
            break  # success
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
            last_err = e
            if attempt < MAX_RETRIES - 1:
                delay = RETRY_DELAYS[attempt]
                print(f"    Timeout/connection error, retrying in {delay}s (attempt {attempt + 1}/{MAX_RETRIES})...", flush=True)
                time.sleep(delay)
            else:
                raise
    else:
        if last_err:
            raise last_err
        raise RuntimeError("Unexpected retry loop exit")
    # Handle paginated or list response
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and "results" in data:
        return data["results"]
    if isinstance(data, dict) and "data" in data:
        return data["data"] if isinstance(data["data"], list) else [data["data"]]
    return []


def extract_crisis_id(row):
    return str(first_value(row, CRISIS_ID_KEYS, "")).strip()


def build_impact_map(rows):
    """Map crisis_id -> percent_affected_pop from impact-of-crisis rows."""
    out = {}
    for row in rows:
        cid = extract_crisis_id(row)
        if not cid:
            continue
        pct = get_numeric(row, PERCENT_AFFECTED_KEY)
        out[cid] = pct
    return out


def build_conditions_map(rows):
    """Map crisis_id -> dict of condition percentages from conditions rows."""
    out = {}
    for row in rows:
        cid = extract_crisis_id(row)
        if not cid:
            continue
        out[cid] = {
            "minimal": get_numeric(row, CONDITION_KEYS[0]),
            "stressed": get_numeric(row, CONDITION_KEYS[1]),
            "moderate": get_numeric(row, CONDITION_KEYS[2]),
            "severe": get_numeric(row, CONDITION_KEYS[3]),
            "extreme": get_numeric(row, CONDITION_KEYS[4]),
        }
    return out


def merge_month_data(impact_rows, conditions_rows):
    """Produce list of dicts with keys in CSV_COLUMNS."""
    impact_map = build_impact_map(impact_rows)
    conditions_map = build_conditions_map(conditions_rows)
    crisis_ids = sorted(set(impact_map) | set(conditions_map))
    rows = []
    for cid in crisis_ids:
        cond = conditions_map.get(cid, {})
        rows.append({
            "crisis_id": cid,
            "percent_affected_pop": impact_map.get(cid, ""),
            "people_in_minimal": cond.get("minimal", ""),
            "people_in_stressed": cond.get("stressed", ""),
            "people_in_moderate": cond.get("moderate", ""),
            "people_in_severe": cond.get("severe", ""),
            "people_in_extreme": cond.get("extreme", ""),
        })
    return rows


def main():
    # So progress lines appear immediately (no buffering when not a TTY)
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(line_buffering=True)
        except Exception:
            pass

    parser = argparse.ArgumentParser(description="Fetch ACAPS INFORM Severity and write CSV")
    parser.add_argument(
        "--output", "-o",
        default=str(PROJECT_ROOT / "acaps_inform_severity_2022_2026.csv"),
        help="Output CSV path",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Print each month as it is fetched",
    )
    args = parser.parse_args()

    token = get_token()
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Token {token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    })

    all_rows = []
    months = list(month_range_jan2022_jan2026())
    total_months = len(months)
    log(f"Fetching {total_months} months (2 API calls each, ~7s per call → ~{total_months * 2 * 7 // 60} min).")

    for i, (year, month_1, label) in enumerate(months, start=1):
        impact_url = f"{BASE_URL}/impact-of-crisis/{label}/"
        conditions_url = f"{BASE_URL}/conditions-of-people-affected/{label}/"
        log(f"  [{i}/{total_months}] {label}...")
        try:
            impact_rows = fetch_json(session, impact_url, label)
            conditions_rows = fetch_json(session, conditions_url, label)
        except requests.RequestException as e:
            print(f"Error fetching {label}: {e}", file=sys.stderr, flush=True)
            continue
        month_rows = merge_month_data(impact_rows, conditions_rows)
        for row in month_rows:
            row_with_month = dict(row)
            row_with_month["year_month"] = f"{year}-{month_1:02d}"
            all_rows.append(row_with_month)
        if args.verbose:
            log(f"      -> {len(month_rows)} crises")

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    write_columns = ["year_month"] + CSV_COLUMNS

    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=write_columns, extrasaction="ignore")
        w.writeheader()
        w.writerows(all_rows)

    log(f"Wrote {len(all_rows)} rows to {out_path}")


if __name__ == "__main__":
    main()
