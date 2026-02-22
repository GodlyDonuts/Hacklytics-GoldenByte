"""
Build the crisis_hrp_funding merge table from all available CSVs:
  - crises.csv (crisis severity data, 2022-2026)
  - hrp.csv (humanitarian response plans)
  - requirements_funding.csv (funding per HRP)
  - worldbank_population_2022_2026.csv (country population by year)
  - pop_data.csv (per-crisis affected population and condition levels)

Outputs: databricks/data/crisis_hrp_funding.csv
"""

import json
import os
from pathlib import Path

import pandas as pd

DATA_DIR = Path(__file__).parent / "data"


# ---------------------------------------------------------------------------
# Step 1: Load and normalize crises.csv
# ---------------------------------------------------------------------------

def load_crises(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)

    # Parse JSON array fields to plain strings (single-element arrays)
    def parse_json_array(val):
        if pd.isna(val):
            return val
        try:
            parsed = json.loads(val.replace('""', '"'))
            if isinstance(parsed, list) and len(parsed) > 0:
                return parsed[0]
        except (json.JSONDecodeError, AttributeError):
            pass
        return val

    df["iso3"] = df["iso3"].apply(parse_json_array)
    df["country"] = df["country"].apply(parse_json_array)

    # Filter years (should be no-op but explicit)
    df = df[df["year"].isin([2022, 2023, 2024, 2025, 2026])].copy()

    # Select and rename columns
    df = df.rename(columns={
        "year": "crisis_year",
        "month": "crisis_month",
        "INFORM Severity Index": "inform_severity_index",
        "People in need": "people_in_need",
    })
    keep = [
        "crisis_year", "crisis_month", "iso3", "country",
        "crisis_id", "crisis_name", "inform_severity_index", "people_in_need",
    ]
    df = df[keep].copy()

    # Validation
    assert df["crisis_id"].notna().all(), "Null crisis_id found"
    assert df["iso3"].notna().all(), "Null iso3 found"
    assert df["iso3"].str.match(r"^[A-Z]{3}$").all(), "iso3 not plain 3-letter codes"

    print("=== Step 1: crises ===")
    print(f"  Shape: {df.shape}")
    print(f"  Unique years: {sorted(df['crisis_year'].unique())}")
    print(f"  Unique crisis_ids: {df['crisis_id'].nunique()}")
    print(df.head())
    print()

    return df


# ---------------------------------------------------------------------------
# Step 2: Load and normalize hrp.csv
# ---------------------------------------------------------------------------

def load_hrp(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, skiprows=[1])  # skip HXL tag row

    # Parse locations: pipe-separated ISO3 codes -> list
    df["locations"] = df["locations"].apply(
        lambda v: [x.strip() for x in str(v).split("|")] if pd.notna(v) else []
    )

    # Parse years: pipe-separated -> list of ints, then explode
    df["years"] = df["years"].apply(
        lambda v: [int(x.strip()) for x in str(v).split("|")] if pd.notna(v) else []
    )
    df = df.explode("years").rename(columns={"years": "hrp_year"})
    df["hrp_year"] = df["hrp_year"].astype(int)

    # Filter to 2022-2026
    df = df[df["hrp_year"].isin([2022, 2023, 2024, 2025, 2026])].copy()

    # Rename columns
    df = df.rename(columns={
        "code": "hrp_code",
        "planVersion": "hrp_name",
    })

    keep = [
        "hrp_code", "internalId", "hrp_name", "locations",
        "hrp_year", "origRequirements", "revisedRequirements",
    ]
    df = df[keep].copy()

    print("=== Step 2: hrp ===")
    print(f"  Shape: {df.shape}")
    print(f"  Unique hrp_year: {sorted(df['hrp_year'].unique())}")
    print(df.head())
    print()

    return df


# ---------------------------------------------------------------------------
# Step 3: Load and normalize requirements_funding.csv
# ---------------------------------------------------------------------------

def load_requirements_funding(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, skiprows=[1])  # skip HXL tag row

    # Priority filter A: drop "Not specified" rows
    df = df[df["name"] != "Not specified"].copy()

    # Filter to 2022-2026
    df["year"] = pd.to_numeric(df["year"], errors="coerce")
    df = df[df["year"].isin([2022, 2023, 2024, 2025, 2026])].copy()

    # Drop rows with empty/null code
    df = df[df["code"].notna() & (df["code"] != "")].copy()

    # Cast numeric columns
    df["requirements"] = pd.to_numeric(df["requirements"], errors="coerce")
    df["funding"] = pd.to_numeric(df["funding"], errors="coerce")
    df["percentFunded"] = pd.to_numeric(df["percentFunded"], errors="coerce")

    # Rename
    df = df.rename(columns={
        "code": "hrp_code",
        "name": "hrp_name_rf",
        "typeName": "hrp_type_name",
        "year": "hrp_year",
        "percentFunded": "percent_funding",
    })
    df["hrp_year"] = df["hrp_year"].astype(int)

    keep = [
        "countryCode", "hrp_code", "hrp_name_rf", "hrp_type_name",
        "hrp_year", "requirements", "funding", "percent_funding",
    ]
    df = df[keep].copy()

    print("=== Step 3: requirements_funding ===")
    print(f"  Shape: {df.shape}")
    print(f"  'Not specified' rows: {(df['hrp_name_rf'] == 'Not specified').sum()}")
    print(f"  Rows with requirements == 0: {(df['requirements'] == 0).sum()}")
    print(df.head())
    print()

    return df


# ---------------------------------------------------------------------------
# Step 4a: Join HRP + requirements_funding
# ---------------------------------------------------------------------------

def join_hrp_funding(hrp: pd.DataFrame, rf: pd.DataFrame) -> pd.DataFrame:
    merged = hrp.merge(rf, on=["hrp_code", "hrp_year"], how="inner")

    # Flag whether this HRP actually has funding available
    merged["hrp_funds_available"] = merged["requirements"] > 0

    # Build pipe-separated locations string for output
    merged["hrp_locations"] = merged["locations"].apply(lambda locs: " | ".join(locs))

    print("=== Step 4a: hrp + funding merged ===")
    print(f"  Shape: {merged.shape}")
    funds_false = (~merged["hrp_funds_available"]).sum()
    print(f"  Rows with hrp_funds_available == False: {funds_false}")
    if funds_false > 0:
        print("  Sample unfunded rows:")
        print(merged[~merged["hrp_funds_available"]].head())
    print(merged.head())
    print()

    return merged


# ---------------------------------------------------------------------------
# Step 4b: Match crises to HRPs (covered vs overlooked)
# ---------------------------------------------------------------------------

def match_crises_to_hrps(crises: pd.DataFrame, hrp_funded: pd.DataFrame):
    # Only HRPs with actual funding count as covering
    funded = hrp_funded[hrp_funded["hrp_funds_available"]].copy()

    # Explode funded HRPs on locations so each row has one ISO3
    funded_exploded = funded.explode("locations").rename(
        columns={"locations": "hrp_iso3"}
    )

    # Filter to only rows where the exploded location matches the funding
    # country code. This prevents a regional HRP's per-country funding rows
    # from cross-joining with all locations in the plan.
    funded_exploded = funded_exploded[
        funded_exploded["hrp_iso3"] == funded_exploded["countryCode"]
    ].copy()

    # Merge crises with funded HRPs on (year, iso3)
    covered = crises.merge(
        funded_exploded,
        left_on=["crisis_year", "iso3"],
        right_on=["hrp_year", "hrp_iso3"],
        how="inner",
    )
    covered["has_hrp"] = True
    covered["overlooked_crisis"] = False

    # Overlooked: crises with no match in covered set
    covered_keys = covered[["crisis_id", "crisis_month"]].drop_duplicates()
    covered_keys["_matched"] = True
    all_crises = crises.merge(
        covered_keys, on=["crisis_id", "crisis_month"], how="left"
    )
    overlooked = all_crises[all_crises["_matched"].isna()].drop(columns=["_matched"]).copy()
    overlooked["has_hrp"] = False
    overlooked["overlooked_crisis"] = True

    print("=== Step 4b: covered vs overlooked ===")
    print(f"  Covered rows: {len(covered)}")
    print(f"  Covered unique crisis_ids: {covered['crisis_id'].nunique()}")
    print(f"  Overlooked rows: {len(overlooked)}")
    print(f"  Overlooked unique crisis_ids: {overlooked['crisis_id'].nunique()}")
    print()

    return covered, overlooked


# ---------------------------------------------------------------------------
# Step 5: Load population data
# ---------------------------------------------------------------------------

def load_populations(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    df = df.rename(columns={"iso3": "iso3", "year": "pop_year"})

    # Forward-fill 2024 values into 2025 and 2026 since World Bank
    # data lags by ~1 year
    latest = df[df["pop_year"] == df["pop_year"].max()].copy()
    filled = []
    for target_year in [2025, 2026]:
        if target_year not in df["pop_year"].values:
            fill = latest.copy()
            fill["pop_year"] = target_year
            filled.append(fill)
    if filled:
        df = pd.concat([df] + filled, ignore_index=True)

    print("=== Step 5: populations ===")
    print(f"  Shape: {df.shape}")
    print(f"  Years: {sorted(df['pop_year'].unique())}")
    print(f"  Countries: {df['iso3'].nunique()}")
    print()

    return df


# ---------------------------------------------------------------------------
# Step 6: Load pop_data.csv (per-crisis affected population)
# ---------------------------------------------------------------------------

def load_pop_data(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)

    # Parse year_month into separate columns for joining
    df["pop_year"] = df["year_month"].str[:4].astype(int)
    df["pop_month"] = df["year_month"].str[5:7].astype(int)
    df = df.drop(columns=["year_month"])

    print("=== Step 6: pop_data ===")
    print(f"  Shape: {df.shape}")
    print(f"  Unique crisis_ids: {df['crisis_id'].nunique()}")
    print(f"  Year range: {df['pop_year'].min()}-{df['pop_year'].max()}")
    print()

    return df


# ---------------------------------------------------------------------------
# Step 4c: Union and finalize
# ---------------------------------------------------------------------------

def finalize(covered: pd.DataFrame, overlooked: pd.DataFrame,
             populations: pd.DataFrame, pop_data: pd.DataFrame) -> pd.DataFrame:
    # Align columns: add HRP columns as null to overlooked
    hrp_cols = [
        "hrp_code", "hrp_name", "hrp_type_name", "hrp_locations",
        "hrp_year", "requirements", "funding", "percent_funding",
    ]
    for col in hrp_cols:
        if col not in overlooked.columns:
            overlooked[col] = None

    pop_detail_cols = [
        "percent_affected_pop",
        "people_in_minimal", "people_in_stressed",
        "people_in_moderate", "people_in_severe", "people_in_extreme",
    ]

    # Final column order
    final_cols = [
        "row_id",
        "crisis_year", "crisis_month", "iso3", "country",
        "crisis_id", "crisis_name", "inform_severity_index", "people_in_need",
        "population",
    ] + pop_detail_cols + [
        "total_affected", "b2b_ratio",
        "has_hrp", "overlooked_crisis",
    ] + hrp_cols

    # Union covered + overlooked
    covered_out = covered.copy()
    df = pd.concat([covered_out, overlooked], ignore_index=True)

    # Join population data on (crisis_year, iso3)
    df = df.merge(
        populations[["pop_year", "iso3", "population"]],
        left_on=["crisis_year", "iso3"],
        right_on=["pop_year", "iso3"],
        how="left",
    )
    df = df.drop(columns=["pop_year"])

    pop_matched = df["population"].notna().sum()
    print(f"=== Population join ===")
    print(f"  Matched: {pop_matched}/{len(df)} ({100*pop_matched/len(df):.1f}%)")

    # Join pop_data on (crisis_id, crisis_year, crisis_month)
    df = df.merge(
        pop_data,
        left_on=["crisis_id", "crisis_year", "crisis_month"],
        right_on=["crisis_id", "pop_year", "pop_month"],
        how="left",
    )
    df = df.drop(columns=["pop_year", "pop_month"], errors="ignore")

    pop_data_matched = df["percent_affected_pop"].notna().sum()
    print(f"=== Pop data join ===")
    print(f"  Matched: {pop_data_matched}/{len(df)} ({100*pop_data_matched/len(df):.1f}%)")

    # Compute total_affected per the plan (section 4.1):
    # total_affected = (percent_affected_pop / 100) * population
    # If percent_affected_pop >= 100, cap at population
    df["total_affected"] = (df["percent_affected_pop"] / 100.0) * df["population"]
    cap_mask = df["percent_affected_pop"] >= 100.0
    df.loc[cap_mask, "total_affected"] = df.loc[cap_mask, "population"]

    # Compute b2b_ratio = funding / total_affected
    # Null for overlooked (no funding) or when total_affected is 0/null
    df["b2b_ratio"] = df["funding"] / df["total_affected"].replace(0, pd.NA)

    print(f"=== Derived columns ===")
    print(f"  total_affected non-null: {df['total_affected'].notna().sum()}/{len(df)}")
    print(f"  b2b_ratio non-null: {df['b2b_ratio'].notna().sum()}/{len(df)}")
    print()

    # Add row_id
    df["row_id"] = range(1, len(df) + 1)

    # Ensure all final columns exist
    for col in final_cols:
        if col not in df.columns:
            df[col] = None

    df = df[final_cols]

    return df


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    crises = load_crises(DATA_DIR / "crises.csv")
    hrp = load_hrp(DATA_DIR / "hrp.csv")
    rf = load_requirements_funding(DATA_DIR / "requirements_funding.csv")
    populations = load_populations(DATA_DIR / "worldbank_population_2022_2026.csv")
    pop_data = load_pop_data(DATA_DIR / "pop_data.csv")

    hrp_funded = join_hrp_funding(hrp, rf)
    covered, overlooked = match_crises_to_hrps(crises, hrp_funded)
    result = finalize(covered, overlooked, populations, pop_data)

    # Write output
    out_path = DATA_DIR / "crisis_hrp_funding.csv"
    result.to_csv(out_path, index=False)
    print(f"=== Output written to {out_path} ===")

    # End-to-end verification
    print("\n=== Verification ===")
    print(f"  Final shape: {result.shape}")
    print(f"  has_hrp value_counts:\n{result['has_hrp'].value_counts()}")
    print(f"  overlooked_crisis value_counts:\n{result['overlooked_crisis'].value_counts()}")

    # Check complementary flags
    mismatched = result[result["has_hrp"] == result["overlooked_crisis"]]
    assert len(mismatched) == 0, f"has_hrp and overlooked_crisis are not complementary: {len(mismatched)} rows"

    # Check all crisis_ids from input appear in output
    input_ids = set(crises["crisis_id"].unique())
    output_ids = set(result["crisis_id"].unique())
    missing = input_ids - output_ids
    assert len(missing) == 0, f"Missing crisis_ids in output: {missing}"

    # Covered rows should have non-null HRP columns
    covered_rows = result[result["has_hrp"] == True]
    assert covered_rows["hrp_code"].notna().all(), "Covered rows have null hrp_code"
    assert covered_rows["requirements"].notna().all(), "Covered rows have null requirements"
    # funding can be NaN for plans that have requirements but no funding received yet
    null_funding = covered_rows["funding"].isna().sum()
    if null_funding > 0:
        print(f"  Note: {null_funding} covered rows have null funding (unfunded plans with requirements > 0)")
    assert covered_rows["requirements"].notna().all(), "Covered rows have null requirements"

    # Overlooked rows should have null HRP columns
    overlooked_rows = result[result["overlooked_crisis"] == True]
    assert overlooked_rows["hrp_code"].isna().all(), "Overlooked rows have non-null hrp_code"

    # No "Not specified" in output
    if "hrp_name" in result.columns:
        assert (result["hrp_name"] != "Not specified").all() or result["hrp_name"].isna().any(), \
            "Found 'Not specified' in output"

    print("\n  All verifications passed.")

    # Samples
    print("\n  Sample covered rows:")
    print(covered_rows[["crisis_id", "crisis_name", "iso3", "hrp_code", "requirements", "funding"]].head())
    print("\n  Sample overlooked rows:")
    print(overlooked_rows[["crisis_id", "crisis_name", "iso3", "country"]].head())


if __name__ == "__main__":
    main()
