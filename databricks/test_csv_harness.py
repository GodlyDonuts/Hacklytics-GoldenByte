"""CSV harness: validates ACAPS crisis data parsing end-to-end.

Exercises every transformation the notebook applies to the real CSV:
JSON array parsing, column mapping, filtering, severity handling,
and output shape validation.

Run: python databricks/test_csv_harness.py
"""

import json
import os
import sys

import numpy as np
import pandas as pd

CSV_PATH = os.path.join(os.path.dirname(__file__), "data", "acaps_crises_2022_2026.csv")

PASS = 0
FAIL = 0


def check(name: str, condition: bool, detail: str = ""):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  PASS: {name}")
    else:
        FAIL += 1
        print(f"  FAIL: {name} -- {detail}")


# ---------------------------------------------------------------------------
# Parsing helpers (must match notebook logic exactly)
# ---------------------------------------------------------------------------

def parse_json_array_first(val):
    """Extract first element from a JSON array string like '["AFG"]'."""
    if pd.isna(val):
        return None
    s = str(val).strip()
    if s.startswith("["):
        try:
            arr = json.loads(s)
            return arr[0] if arr else None
        except (ValueError, IndexError):
            pass
    return s


def parse_json_array_all(val):
    """Parse a full JSON array string like '["NGA","NER"]' into a list."""
    if pd.isna(val):
        return []
    s = str(val).strip()
    if s.startswith("["):
        try:
            return json.loads(s)
        except ValueError:
            pass
    return [s]


def severity_class(score):
    if pd.isna(score):
        return "Unknown"
    if score < 1:
        return "Very Low"
    if score < 2:
        return "Low"
    if score < 3:
        return "Medium"
    if score < 4:
        return "High"
    return "Very High"


# ---------------------------------------------------------------------------
# Load and normalize (replicates notebook Step 1)
# ---------------------------------------------------------------------------

def load_and_normalize():
    """Load CSV and apply all notebook normalizations. Returns raw + processed."""
    raw = pd.read_csv(CSV_PATH)
    df = raw.copy()
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]

    # Parse JSON arrays
    df["iso3_raw"] = df["iso3"].copy()
    df["iso3"] = df["iso3"].apply(parse_json_array_first)
    df["country_parsed"] = df["country"].apply(parse_json_array_first)

    # Rename columns
    df = df.rename(columns={
        "inform_severity_index": "acaps_severity",
        "inform_severity_category": "severity_class",
        "country_parsed": "country_name",
        "people_in_need": "acaps_people_in_need_score",
    })

    # Coerce types
    df["year"] = pd.to_numeric(df["year"], errors="coerce").astype("Int64")
    df["month"] = pd.to_numeric(df["month"], errors="coerce").astype("Int64")
    df["acaps_severity"] = pd.to_numeric(df["acaps_severity"], errors="coerce")
    df["iso3"] = df["iso3"].str.strip().str.upper()

    return raw, df


# ---------------------------------------------------------------------------
# Test suites
# ---------------------------------------------------------------------------

def test_json_parsing(df):
    print("\n--- JSON Array Parsing ---")

    # Single-element arrays
    check("Single iso3 parses correctly",
          parse_json_array_first('["AFG"]') == "AFG")
    check("Single country parses correctly",
          parse_json_array_first('["Afghanistan"]') == "Afghanistan")

    # Multi-element arrays (regional)
    check("Multi-iso3 returns first element",
          parse_json_array_first('["NGA", "NER", "TCD"]') == "NGA")

    # Edge cases
    check("NaN returns None", parse_json_array_first(np.nan) is None)
    check("Empty array returns None", parse_json_array_first("[]") is None)
    check("Plain string passes through",
          parse_json_array_first("AFG") == "AFG")
    check("Malformed JSON passes through",
          parse_json_array_first("[broken") == "[broken")

    # Validate on real data: no brackets left after parsing
    parsed = df["iso3"].dropna()
    check("No leftover brackets in parsed iso3",
          not parsed.str.contains(r"[\[\]\"]", regex=True).any(),
          f"found brackets in: {parsed[parsed.str.contains(r'[\\[\\]]', regex=True)].head(3).tolist()}")

    # All parsed iso3 should be exactly 3 uppercase alpha chars
    valid_iso3 = parsed.str.match(r"^[A-Z]{3}$")
    bad_iso3 = parsed[~valid_iso3]
    check("All parsed iso3 are 3 uppercase letters",
          len(bad_iso3) == 0,
          f"{len(bad_iso3)} invalid: {bad_iso3.head(5).tolist()}")

    # Country name should not contain brackets
    cnames = df["country_name"].dropna()
    check("No brackets in parsed country names",
          not cnames.str.contains(r"[\[\]\"]", regex=True).any())


def test_regional_filtering(df):
    print("\n--- Regional vs Country Filtering ---")

    total = len(df)
    regional = df[df["regional_or_country"].str.strip().str.lower() == "regional"]
    country = df[df["regional_or_country"].str.strip().str.lower() == "country"]

    check("regional_or_country column exists", "regional_or_country" in df.columns)
    check("Only 'Country' and 'Regional' values",
          set(df["regional_or_country"].str.strip()) == {"Country", "Regional"},
          f"got: {df['regional_or_country'].unique()}")

    check("Regional rows have multi-element iso3 arrays",
          all(len(parse_json_array_all(v)) > 1 for v in regional["iso3_raw"].head(20)),
          "some regional rows have single iso3")

    check("Country rows have single-element iso3 arrays",
          all(len(parse_json_array_all(v)) == 1 for v in country["iso3_raw"].head(100)),
          "some country rows have multi iso3")

    # Aggregated vs Individual (within Country rows)
    aggregated = country[country["individual_aggregated"] == "Aggregated"]
    individual = country[country["individual_aggregated"] == "Individual"]

    check("Aggregated rows are 'Multiple crises' summaries",
          aggregated["crisis_name"].str.contains("Multiple|Country level", case=False).mean() > 0.90,
          f"only {aggregated['crisis_name'].str.contains('Multiple|Country level', case=False).mean():.0%}")

    check("Individual rows are specific crises",
          individual["crisis_name"].str.contains("Multiple|Country level", case=False).mean() < 0.05)

    # No countries lost by filtering to Individual only
    countries_all = set(country["iso3"].dropna().unique())
    countries_individual = set(individual["iso3"].dropna().unique())
    lost = countries_all - countries_individual
    check("No countries lost by excluding Aggregated rows",
          len(lost) == 0,
          f"lost: {lost}")

    print(f"\n  Regional:   {len(regional):>5} rows (excluded)")
    print(f"  Aggregated: {len(aggregated):>5} rows (excluded)")
    print(f"  Individual: {len(individual):>5} rows (kept)")
    print(f"  Total:      {total:>5}")


def test_severity_handling(df):
    print("\n--- Severity Handling ---")

    sev = df["acaps_severity"]

    # Null rate
    null_rate = sev.isna().mean()
    check("Severity null rate under 10%", null_rate < 0.10, f"got {null_rate:.1%}")

    # Range
    valid_sev = sev.dropna()
    check("Min severity >= 0.5", valid_sev.min() >= 0.5, f"got {valid_sev.min()}")
    check("Max severity <= 5.0", valid_sev.max() <= 5.0, f"got {valid_sev.max()}")

    # Severity class from CSV matches our derivation
    if "severity_class" in df.columns:
        csv_classes = set(df["severity_class"].dropna().unique())
        expected_classes = {"Very Low", "Low", "Medium", "High", "Very High"}
        check("CSV severity classes are expected values",
              csv_classes.issubset(expected_classes),
              f"unexpected: {csv_classes - expected_classes}")

    # Cross-validate: severity_class should align with acaps_severity
    sample = df.dropna(subset=["acaps_severity", "severity_class"]).head(500)
    mismatches = 0
    for _, row in sample.iterrows():
        derived = severity_class(row["acaps_severity"])
        if derived != row["severity_class"]:
            mismatches += 1
    # ACAPS uses slightly different thresholds than our simple derivation.
    # The notebook uses the CSV's own severity_class directly, so this is informational.
    check("CSV severity_class mostly aligns with score (within 10% tolerance)",
          mismatches / len(sample) < 0.10 if len(sample) > 0 else True,
          f"{mismatches}/{len(sample)} mismatches -- notebook uses CSV class directly")

    # Rows where severity is null but severity_class exists
    null_sev_with_class = df[df["acaps_severity"].isna() & df["severity_class"].notna()]
    check("No orphan severity_class without score",
          len(null_sev_with_class) == 0,
          f"{len(null_sev_with_class)} rows have class but no score")

    # Distribution should be roughly pyramid (more Medium/High than extremes)
    dist = valid_sev.apply(severity_class).value_counts()
    print(f"\n  Severity distribution:")
    for cls in ["Very High", "High", "Medium", "Low", "Very Low"]:
        count = dist.get(cls, 0)
        pct = count / len(valid_sev) * 100
        bar = "#" * int(pct)
        print(f"    {cls:>10}: {count:>5} ({pct:4.1f}%) {bar}")


def test_crisis_deduplication(df):
    print("\n--- Crisis Deduplication ---")

    # Filter to what the notebook keeps
    country_individual = df[
        (df["regional_or_country"].str.strip().str.lower() == "country") &
        (df["individual_aggregated"] == "Individual")
    ].copy()

    # No duplicate crisis_id within a single year-month
    dupes = country_individual.groupby(["crisis_id", "year", "month"]).size()
    multi = dupes[dupes > 1]
    check("No duplicate crisis_id per year-month", len(multi) == 0,
          f"{len(multi)} duplicates found")

    # Each crisis_id maps to exactly one iso3
    crisis_iso = country_individual.groupby("crisis_id")["iso3"].nunique()
    multi_iso = crisis_iso[crisis_iso > 1]
    check("Each crisis_id maps to one country",
          len(multi_iso) == 0,
          f"{len(multi_iso)} crises span multiple countries: {multi_iso.head(3).to_dict()}")

    # Crisis count per country per month (for rank cap test)
    per_country_month = country_individual.groupby(["iso3", "year", "month"]).size()
    max_crises = per_country_month.max()
    gt8 = (per_country_month > 8).sum()
    check("Max crises per country-month is reasonable",
          max_crises <= 30,
          f"max is {max_crises}")
    print(f"\n  Max crises per country-month: {max_crises}")
    print(f"  Country-months exceeding 8 crises: {gt8}")
    print(f"  Total unique crises: {country_individual['crisis_id'].nunique()}")
    print(f"  Total country-month groups: {len(per_country_month)}")


def test_year_month_coverage(df):
    print("\n--- Year-Month Coverage ---")

    country_individual = df[
        (df["regional_or_country"].str.strip().str.lower() == "country") &
        (df["individual_aggregated"] == "Individual")
    ]

    years = sorted(country_individual["year"].dropna().unique())
    months = sorted(country_individual["month"].dropna().unique())

    check("Years span 2022-2026",
          years == [2022, 2023, 2024, 2025, 2026],
          f"got {years}")
    check("All 12 months present",
          months == list(range(1, 13)),
          f"got {months}")

    # Coverage matrix: how many crises per year-month
    pivot = country_individual.groupby(["year", "month"]).size().unstack(fill_value=0)
    # 2026 only has January in this dataset, so allow sparse months
    full_years = pivot.loc[pivot.index < 2026]
    check("No empty year-month cells for 2022-2025",
          (full_years > 0).all().all() if len(full_years) > 0 else True,
          f"empty cells found in years before 2026")

    # Check for data dropoff in recent months (2026 may be sparse)
    if 2026 in years:
        months_2026 = country_individual[country_individual["year"] == 2026]["month"].unique()
        print(f"\n  2026 coverage: months {sorted(months_2026)}")
        check("2026 has at least 1 month of data", len(months_2026) >= 1)

    # Countries per year
    for y in years:
        n = country_individual[country_individual["year"] == y]["iso3"].nunique()
        print(f"  {y}: {n} countries")


def test_connected_crises(df):
    print("\n--- Connected Crises Field ---")

    # connected_crises links related crises (e.g. AFG001 <-> AFG005)
    has_connected = df["connected_crises"].notna().sum()
    total = len(df)
    check("connected_crises field exists", "connected_crises" in df.columns)
    print(f"  Rows with connected_crises: {has_connected}/{total} ({has_connected/total:.0%})")

    # Parse and validate format
    sample = df["connected_crises"].dropna().head(50)
    valid_json = 0
    for val in sample:
        try:
            parsed = json.loads(val)
            if isinstance(parsed, list):
                valid_json += 1
        except (ValueError, TypeError):
            pass
    check("connected_crises are valid JSON arrays",
          valid_json == len(sample),
          f"only {valid_json}/{len(sample)} are valid JSON")


def test_drivers_field(df):
    print("\n--- Drivers Field ---")

    has_drivers = df["drivers"].notna().sum()
    total = len(df)
    print(f"  Rows with drivers: {has_drivers}/{total} ({has_drivers/total:.0%})")

    # Parse and extract unique driver categories
    all_drivers = set()
    for val in df["drivers"].dropna().head(200):
        try:
            parsed = json.loads(val)
            if isinstance(parsed, list):
                all_drivers.update(parsed)
        except (ValueError, TypeError):
            pass

    if all_drivers:
        print(f"  Unique driver categories: {sorted(all_drivers)}")
        check("Drivers include expected categories",
              "Conflict" in all_drivers or "Violence" in all_drivers,
              f"got: {all_drivers}")


def test_full_pipeline_output(df):
    print("\n--- Full Pipeline Output Shape ---")

    # Apply the exact same filters the notebook applies
    filtered = df[
        (df["regional_or_country"].str.strip().str.lower() == "country") &
        (df["individual_aggregated"] == "Individual")
    ].copy()

    # Drop null severity
    filtered = filtered.dropna(subset=["acaps_severity"])

    # Compute crisis_rank
    filtered["crisis_rank"] = (
        filtered.groupby(["iso3", "year", "month"])["acaps_severity"]
        .rank(method="first", ascending=False)
        .astype(int)
    )

    # Cap at 8
    capped = filtered[filtered["crisis_rank"] <= 8].copy()

    check("Pipeline output has rows", len(capped) > 0)
    check("All ranks <= 8", capped["crisis_rank"].max() <= 8)
    check("All ranks >= 1", capped["crisis_rank"].min() >= 1)

    # Stats
    print(f"\n  Before rank cap: {len(filtered)} rows")
    print(f"  After rank cap:  {len(capped)} rows")
    print(f"  Rows dropped by cap: {len(filtered) - len(capped)}")
    print(f"  Countries: {capped['iso3'].nunique()}")
    print(f"  Crises: {capped['crisis_id'].nunique()}")

    # Verify centroid coverage using the full dict from the notebook
    CENTROIDS = {
        "AFG": (33.9, 67.7), "AGO": (-11.2, 17.9), "ARM": (40.1, 45.0),
        "AZE": (40.1, 47.6), "BDI": (-3.4, 29.9), "BEN": (9.3, 2.3),
        "BFA": (12.4, -1.6), "BGD": (23.7, 90.4), "BGR": (42.7, 25.5),
        "BLR": (53.7, 27.9), "BOL": (-16.3, -63.6), "BRA": (-14.2, -51.9),
        "CAF": (6.6, 20.9), "CHL": (-35.7, -71.5), "CIV": (7.5, -5.5),
        "CMR": (7.4, 12.4), "COD": (-4.0, 21.8), "COG": (-0.2, 15.8),
        "COL": (4.6, -74.3), "CRI": (9.7, -83.8), "CUB": (21.5, -77.8),
        "CZE": (49.8, 15.5), "DJI": (11.6, 43.1), "DOM": (18.7, -70.2),
        "DZA": (28.0, 1.7), "ECU": (-1.8, -78.2), "EGY": (26.8, 30.8),
        "ERI": (15.2, 39.8), "ESP": (40.5, -3.7), "EST": (58.6, 25.0),
        "ETH": (9.1, 40.5), "GHA": (7.9, -1.0), "GMB": (13.4, -15.3),
        "GRC": (39.1, 21.8), "GTM": (15.8, -90.2), "HND": (15.2, -86.2),
        "HTI": (19.0, -72.4), "HUN": (47.2, 19.5), "IDN": (-0.8, 113.9),
        "IND": (20.6, 78.9), "IRN": (32.4, 53.7), "IRQ": (33.2, 43.7),
        "ITA": (41.9, 12.6), "JAM": (18.1, -77.3), "JOR": (30.6, 36.2),
        "KEN": (-0.02, 37.9), "KHM": (12.6, 105.0), "LAO": (19.9, 102.5),
        "LBN": (33.9, 35.9), "LBY": (26.3, 17.2), "LKA": (7.9, 80.8),
        "LSO": (-29.6, 28.2), "LTU": (55.2, 23.9), "LVA": (56.9, 24.1),
        "MAR": (31.8, -7.1), "MDA": (47.4, 28.4), "MDG": (-18.8, 46.9),
        "MEX": (23.6, -102.6), "MLI": (17.6, -4.0), "MMR": (21.9, 95.9),
        "MNG": (46.9, 103.8), "MOZ": (-18.7, 35.5), "MRT": (21.0, -10.9),
        "MWI": (-13.3, 34.3), "MYS": (4.2, 101.9), "NAM": (-22.6, 17.1),
        "NER": (17.6, 8.1), "NGA": (9.1, 8.7), "NIC": (12.9, -85.2),
        "NPL": (28.4, 84.1), "PAK": (30.4, 69.3), "PAN": (8.5, -80.8),
        "PER": (-9.2, -75.0), "PHL": (12.9, 121.8), "PNG": (-6.3, 143.9),
        "POL": (51.9, 19.1), "PRK": (40.3, 127.5), "PSE": (31.9, 35.2),
        "ROU": (45.9, 25.0), "RUS": (61.5, 105.3), "RWA": (-1.9, 29.9),
        "SDN": (15.5, 32.5), "SEN": (14.5, -14.5), "SLV": (13.8, -88.9),
        "SOM": (5.2, 46.2), "SSD": (6.9, 31.3), "SVK": (48.7, 19.7),
        "SWZ": (-26.5, 31.5), "SYR": (35.0, 38.5), "TCD": (15.5, 18.7),
        "TGO": (8.6, 1.2), "THA": (15.9, 100.9), "TLS": (-8.9, 125.7),
        "TON": (-21.2, -175.2), "TTO": (10.7, -61.2), "TUN": (33.9, 9.5),
        "TUR": (38.9, 35.2), "TZA": (-6.4, 34.9), "UGA": (1.4, 32.3),
        "UKR": (48.4, 31.2), "VEN": (6.4, -66.6), "VNM": (14.1, 108.3),
        "VUT": (-15.4, 166.9), "YEM": (15.3, 44.2), "ZMB": (-13.1, 27.8),
        "ZWE": (-19.0, 29.2),
    }
    matched = capped["iso3"].isin(CENTROIDS.keys()).sum()
    total_rows = len(capped)
    print(f"  Rows matching centroid lookup: {matched}/{total_rows} ({matched/total_rows:.0%})")
    unmatched_countries = set(capped["iso3"].unique()) - set(CENTROIDS.keys())
    if unmatched_countries:
        print(f"  Countries missing from centroid dict ({len(unmatched_countries)}): "
              f"{sorted(list(unmatched_countries))}")
    else:
        print(f"  All {capped['iso3'].nunique()} countries have centroids")
    check("Centroid coverage 100%",
          len(unmatched_countries) == 0,
          f"missing: {sorted(unmatched_countries)}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=" * 60)
    print("ACAPS CSV Harness")
    print("=" * 60)

    if not os.path.exists(CSV_PATH):
        print(f"CSV not found at {CSV_PATH}")
        sys.exit(1)

    raw, df = load_and_normalize()
    print(f"\nLoaded {len(raw)} rows, {len(df.columns)} columns")

    test_json_parsing(df)
    test_regional_filtering(df)
    test_severity_handling(df)
    test_crisis_deduplication(df)
    test_year_month_coverage(df)
    test_connected_crises(df)
    test_drivers_field(df)
    test_full_pipeline_output(df)

    print("\n" + "=" * 60)
    print(f"Results: {PASS} passed, {FAIL} failed")
    print("=" * 60)

    sys.exit(1 if FAIL > 0 else 0)
