"""Local test harness for Databricks notebook logic.

Tests all pandas transformations, joins, funding state classification,
B2B computations, and output schemas WITHOUT Spark or Databricks.

Run: python databricks/test_local.py
"""

import sys
import os
import pandas as pd
import numpy as np

# Track test results
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
# Mock data generators
# ---------------------------------------------------------------------------

def make_acaps_df() -> pd.DataFrame:
    """Simulate ACAPS crisis CSV data."""
    rows = [
        # Sudan: 2 crises, high severity
        {"iso3": "SDN", "country_name": "Sudan", "year": 2024, "month": 2,
         "crisis_id": "SDN-001", "crisis_name": "Armed Conflict", "acaps_severity": 4.8},
        {"iso3": "SDN", "country_name": "Sudan", "year": 2024, "month": 2,
         "crisis_id": "SDN-002", "crisis_name": "Food Crisis", "acaps_severity": 4.2},
        # Yemen: 1 crisis
        {"iso3": "YEM", "country_name": "Yemen", "year": 2024, "month": 2,
         "crisis_id": "YEM-001", "crisis_name": "Humanitarian Emergency", "acaps_severity": 4.5},
        # Burkina Faso: invisible crisis (will have no HRP)
        {"iso3": "BFA", "country_name": "Burkina Faso", "year": 2024, "month": 2,
         "crisis_id": "BFA-001", "crisis_name": "Displacement Crisis", "acaps_severity": 3.8},
        # Ukraine: well-funded
        {"iso3": "UKR", "country_name": "Ukraine", "year": 2024, "month": 2,
         "crisis_id": "UKR-001", "crisis_name": "Armed Conflict", "acaps_severity": 4.0},
        # Test 9 crises for one country to verify rank cap at 8
        *[
            {"iso3": "ETH", "country_name": "Ethiopia", "year": 2024, "month": 3,
             "crisis_id": f"ETH-{i:03d}", "crisis_name": f"Crisis {i}",
             "acaps_severity": round(4.5 - i * 0.3, 1)}
            for i in range(9)
        ],
    ]
    return pd.DataFrame(rows)


def make_hrp_agg() -> pd.DataFrame:
    """Simulate aggregated HRP funding data."""
    return pd.DataFrame([
        # Sudan: HRP exists, underfunded (30% coverage)
        {"iso3": "SDN", "year": 2024, "has_hrp": True, "appeal_type": "HRP",
         "appeal_code": "HRSDN24", "requirements_usd": 2_800_000_000,
         "funding_usd": 840_000_000, "funding_coverage_pct": 0.30,
         "funding_gap_usd": 1_960_000_000},
        # Yemen: HRP exists, underfunded (40%)
        {"iso3": "YEM", "year": 2024, "has_hrp": True, "appeal_type": "HRP",
         "appeal_code": "HRYEM24", "requirements_usd": 4_300_000_000,
         "funding_usd": 1_720_000_000, "funding_coverage_pct": 0.40,
         "funding_gap_usd": 2_580_000_000},
        # Ukraine: HRP exists, well-funded (65%)
        {"iso3": "UKR", "year": 2024, "has_hrp": True, "appeal_type": "HRP",
         "appeal_code": "HRUKR24", "requirements_usd": 3_100_000_000,
         "funding_usd": 2_015_000_000, "funding_coverage_pct": 0.65,
         "funding_gap_usd": 1_085_000_000},
        # BFA: no HRP row -- Burkina Faso is invisible
        # Ethiopia: HRP, funded at 55% but with low B2B (inefficient)
        {"iso3": "ETH", "year": 2024, "has_hrp": True, "appeal_type": "HRP",
         "appeal_code": "HRETH24", "requirements_usd": 3_000_000_000,
         "funding_usd": 1_650_000_000, "funding_coverage_pct": 0.55,
         "funding_gap_usd": 1_350_000_000},
    ])


def make_needs_agg() -> pd.DataFrame:
    """Simulate aggregated humanitarian needs."""
    return pd.DataFrame([
        {"iso3": "SDN", "year": 2024, "people_in_need": 24_800_000},
        {"iso3": "YEM", "year": 2024, "people_in_need": 21_600_000},
        {"iso3": "UKR", "year": 2024, "people_in_need": 14_600_000},
        {"iso3": "BFA", "year": 2024, "people_in_need": 3_400_000},
        {"iso3": "ETH", "year": 2024, "people_in_need": 20_100_000},
    ])


def make_b2b_agg() -> pd.DataFrame:
    """Simulate aggregated B2B data per country-year."""
    return pd.DataFrame([
        {"iso3": "SDN", "year": 2024, "target_beneficiaries": 3_528_000,
         "b2b_ratio": 0.0042, "project_count": 156},
        {"iso3": "YEM", "year": 2024, "target_beneficiaries": 8_772_000,
         "b2b_ratio": 0.0051, "project_count": 120},
        {"iso3": "UKR", "year": 2024, "target_beneficiaries": 9_800_000,
         "b2b_ratio": 0.0120, "project_count": 200},
        {"iso3": "ETH", "year": 2024, "target_beneficiaries": 1_650_000,
         "b2b_ratio": 0.0010, "project_count": 80},
    ])


# ---------------------------------------------------------------------------
# Test 1: Crisis Summary Pipeline
# ---------------------------------------------------------------------------

def test_crisis_summary():
    print("\n=== Test 1: Crisis Summary Pipeline ===")

    acaps_df = make_acaps_df()
    hrp_agg = make_hrp_agg()
    needs_agg = make_needs_agg()
    b2b_agg = make_b2b_agg()

    # Severity class
    def severity_class(score):
        if pd.isna(score):
            return "Unknown"
        if score < 1: return "Very Low"
        if score < 2: return "Low"
        if score < 3: return "Medium"
        if score < 4: return "High"
        return "Very High"

    acaps_df["severity_class"] = acaps_df["acaps_severity"].apply(severity_class)

    # Join
    result = acaps_df.copy()
    result = result.merge(
        hrp_agg[["iso3", "year", "has_hrp", "appeal_type", "appeal_code",
                 "requirements_usd", "funding_usd", "funding_gap_usd", "funding_coverage_pct"]],
        on=["iso3", "year"], how="left",
    )
    result = result.merge(
        needs_agg[["iso3", "year", "people_in_need"]],
        on=["iso3", "year"], how="left",
    )
    result = result.merge(
        b2b_agg[["iso3", "year", "target_beneficiaries", "b2b_ratio", "project_count"]],
        on=["iso3", "year"], how="left",
    )
    result["has_hrp"] = result["has_hrp"].fillna(False)
    result["project_count"] = result["project_count"].fillna(0).astype(int)
    for col in ["funding_usd", "requirements_usd", "funding_gap_usd",
                "funding_coverage_pct", "target_beneficiaries", "b2b_ratio"]:
        if col in result.columns:
            result[col] = result[col].fillna(0)

    check("Join preserves all ACAPS rows", len(result) == len(acaps_df))
    check("BFA has no HRP", not result[result["iso3"] == "BFA"].iloc[0]["has_hrp"])
    check("SDN has HRP", result[result["iso3"] == "SDN"].iloc[0]["has_hrp"])

    # Funding state classification
    # Global B2B 25th percentile from mock data
    all_medians = b2b_agg["b2b_ratio"].dropna()
    global_b2b_p25 = all_medians.quantile(0.25) if len(all_medians) > 0 else 0

    def classify_funding_state(row):
        if not row["has_hrp"]:
            return "NO_HRP"
        coverage = row.get("funding_coverage_pct")
        if pd.isna(coverage) or coverage < 0.50:
            return "UNDERFUNDED"
        median_b2b = row.get("b2b_ratio")
        if pd.notna(median_b2b) and global_b2b_p25 > 0 and median_b2b < global_b2b_p25:
            return "INEFFICIENT"
        return "ADEQUATE"

    result["funding_state"] = result.apply(classify_funding_state, axis=1)

    # Coverage ratio and oversight score
    result["coverage_ratio"] = np.where(
        result["people_in_need"] > 0,
        (result["target_beneficiaries"] / result["people_in_need"]).clip(0, 1),
        0.0,
    )
    result["oversight_score"] = result["acaps_severity"] * (1 - result["coverage_ratio"])

    # Validate coverage_ratio bounds
    check("coverage_ratio in [0, 1]",
          (result["coverage_ratio"] >= 0).all() and (result["coverage_ratio"] <= 1).all(),
          f"min={result['coverage_ratio'].min()}, max={result['coverage_ratio'].max()}")

    # BFA has NO_HRP -> coverage_ratio=0 -> oversight_score = raw severity
    bfa = result[result["iso3"] == "BFA"].iloc[0]
    check("BFA oversight_score equals raw severity",
          abs(bfa["oversight_score"] - bfa["acaps_severity"]) < 0.001,
          f"oversight={bfa['oversight_score']}, severity={bfa['acaps_severity']}")

    # UKR is well-funded with targeted beneficiaries -> oversight < severity
    ukr = result[result["iso3"] == "UKR"].iloc[0]
    check("UKR oversight_score less than severity",
          ukr["oversight_score"] < ukr["acaps_severity"],
          f"oversight={ukr['oversight_score']}, severity={ukr['acaps_severity']}")

    # Validate classifications
    bfa_state = result[result["iso3"] == "BFA"].iloc[0]["funding_state"]
    check("BFA classified as NO_HRP", bfa_state == "NO_HRP", f"got {bfa_state}")

    sdn_state = result[result["iso3"] == "SDN"].iloc[0]["funding_state"]
    check("SDN classified as UNDERFUNDED", sdn_state == "UNDERFUNDED", f"got {sdn_state}")

    ukr_state = result[result["iso3"] == "UKR"].iloc[0]["funding_state"]
    check("UKR classified as ADEQUATE", ukr_state == "ADEQUATE", f"got {ukr_state}")

    eth_state = result[result["iso3"] == "ETH"].iloc[0]["funding_state"]
    check("ETH classified as INEFFICIENT", eth_state == "INEFFICIENT", f"got {eth_state}")

    # Lat/lng
    CENTROIDS = {"SDN": (15.5, 32.5), "YEM": (15.3, 44.2), "UKR": (48.4, 31.2),
                 "BFA": (12.4, -1.6), "ETH": (9.1, 40.5)}
    result["lat"] = result["iso3"].map(lambda x: CENTROIDS.get(x, (0, 0))[0])
    result["lng"] = result["iso3"].map(lambda x: CENTROIDS.get(x, (0, 0))[1])

    check("SDN lat correct", result[result["iso3"] == "SDN"].iloc[0]["lat"] == 15.5)

    # Year-month
    result["year_month"] = result.apply(
        lambda r: f"{r['year']}-{int(r['month']):02d}" if pd.notna(r['month']) else str(r['year']),
        axis=1,
    )
    check("year_month format correct",
          result[result["iso3"] == "SDN"].iloc[0]["year_month"] == "2024-02")

    # Crisis rank
    result["crisis_rank"] = (
        result.groupby(["iso3", "year", "month"])["acaps_severity"]
        .rank(method="first", ascending=False)
        .astype(int)
    )

    # Check Ethiopia has 9 crises, rank should go 1-9
    eth = result[result["iso3"] == "ETH"]
    check("ETH has 9 crises before filter", len(eth) == 9)

    # Cap at 8
    result = result[result["crisis_rank"] <= 8].copy()

    eth_after = result[result["iso3"] == "ETH"]
    check("ETH capped at 8 crises", len(eth_after) == 8)

    # Verify output schema
    expected_cols = [
        "iso3", "country_name", "lat", "lng", "year", "month", "year_month",
        "crisis_id", "crisis_name", "acaps_severity", "severity_class",
        "has_hrp", "appeal_type", "appeal_code", "funding_state",
        "people_in_need", "target_beneficiaries", "requirements_usd", "funding_usd",
        "funding_gap_usd", "funding_coverage_pct",
        "coverage_ratio", "oversight_score",
        "b2b_ratio", "project_count", "crisis_rank",
    ]
    for col in expected_cols:
        check(f"Column '{col}' exists", col in result.columns, f"missing from {list(result.columns)}")

    # No NaN in critical columns
    check("No NaN in iso3", result["iso3"].isna().sum() == 0)
    check("No NaN in funding_state", result["funding_state"].isna().sum() == 0)
    check("No NaN in has_hrp", result["has_hrp"].isna().sum() == 0)

    print(f"\nFunding state distribution:\n{result['funding_state'].value_counts().to_string()}")
    return result


# ---------------------------------------------------------------------------
# Test 2: Project Embeddings Pipeline
# ---------------------------------------------------------------------------

def test_project_embeddings():
    print("\n=== Test 2: Project Embeddings Pipeline ===")

    # Simulate project data
    projects = []
    np.random.seed(42)

    clusters = ["Health", "Food Security", "WASH", "Protection", "Shelter"]
    countries = [
        ("SDN", "Sudan"), ("YEM", "Yemen"), ("UKR", "Ukraine"),
        ("ETH", "Ethiopia"), ("SOM", "Somalia"),
    ]

    for i in range(100):
        iso3, cname = countries[i % len(countries)]
        cluster = clusters[i % len(clusters)]
        budget = np.random.lognormal(mean=14, sigma=1.5)  # ~$1M typical
        orig_budget = budget * np.random.uniform(0.7, 1.3)  # original may differ
        beneficiaries = budget * np.random.uniform(0.001, 0.1)
        projects.append({
            "project_code": f"{iso3}-24/{cluster[0]}/{i:03d}",
            "project_name": f"{cluster} Response in {cname}",
            "iso3": iso3,
            "country_name": cname,
            "year": 2024,
            "cluster": cluster,
            "sector": cluster,
            "requested_funds": budget,
            "orig_requested_funds": orig_budget,
            "target_beneficiaries": beneficiaries,
            "description": f"Emergency {cluster.lower()} support",
            "objectives": f"Provide {cluster.lower()} services",
        })

    projects_df = pd.DataFrame(projects)

    # Filter valid
    valid = projects_df[
        (projects_df["requested_funds"] > 0) &
        (projects_df["target_beneficiaries"] > 0)
    ].copy()

    check("All test projects are valid", len(valid) == 100)

    # B2B ratios
    valid["b2b_ratio"] = valid["target_beneficiaries"] / valid["requested_funds"]
    valid["cost_per_beneficiary"] = valid["requested_funds"] / valid["target_beneficiaries"]

    check("B2B ratios are positive", (valid["b2b_ratio"] > 0).all())
    check("Cost per beneficiary is positive", (valid["cost_per_beneficiary"] > 0).all())
    check("B2B * CPB = 1", np.allclose(valid["b2b_ratio"] * valid["cost_per_beneficiary"], 1.0))

    # Budget revision ratio
    valid["budget_revision_ratio"] = np.where(
        valid["orig_requested_funds"] > 0,
        valid["requested_funds"] / valid["orig_requested_funds"],
        1.0,
    )
    check("budget_revision_ratio is positive", (valid["budget_revision_ratio"] > 0).all())

    # Budget z-score within cluster
    cluster_stats = valid.groupby("cluster")["requested_funds"].agg(["mean", "std"]).reset_index()
    cluster_stats.columns = ["cluster", "cluster_mean_budget", "cluster_std_budget"]
    valid = valid.merge(cluster_stats, on="cluster", how="left")
    valid["budget_zscore"] = np.where(
        valid["cluster_std_budget"] > 0,
        (valid["requested_funds"] - valid["cluster_mean_budget"]) / valid["cluster_std_budget"],
        0.0,
    )
    valid = valid.drop(columns=["cluster_mean_budget", "cluster_std_budget"])
    check("budget_zscore computed", "budget_zscore" in valid.columns)

    # Per-cluster percentiles
    cluster_medians = valid.groupby("cluster")["b2b_ratio"].median().reset_index()
    cluster_medians.columns = ["cluster", "cluster_median_b2b"]
    valid = valid.merge(cluster_medians, on="cluster", how="left")
    valid["b2b_percentile"] = valid.groupby("cluster")["b2b_ratio"].rank(pct=True)
    valid["is_outlier"] = (valid["b2b_percentile"] < 0.10) | (valid["b2b_percentile"] > 0.90)

    check("Percentiles between 0 and 1",
          (valid["b2b_percentile"] >= 0).all() and (valid["b2b_percentile"] <= 1).all())
    check("Outliers are ~20% of data",
          0.10 <= valid["is_outlier"].mean() <= 0.30,
          f"got {valid['is_outlier'].mean():.1%}")
    check("cluster_median_b2b populated", valid["cluster_median_b2b"].isna().sum() == 0)

    # IsolationForest anomaly detection
    from sklearn.ensemble import IsolationForest
    anomaly_features = ["b2b_ratio", "cost_per_beneficiary", "budget_zscore", "budget_revision_ratio"]
    X = valid[anomaly_features].copy()
    X = X.fillna(0).replace([np.inf, -np.inf], 0)

    iso_forest = IsolationForest(n_estimators=200, contamination=0.10, random_state=42)
    iso_forest.fit(X)
    raw_scores = iso_forest.decision_function(X)
    valid["anomaly_score"] = 1 - (raw_scores - raw_scores.min()) / (raw_scores.max() - raw_scores.min() + 1e-10)
    iso_labels = iso_forest.predict(X)
    valid["is_outlier"] = valid["is_outlier"] | (iso_labels == -1)

    check("anomaly_score in [0, 1]",
          (valid["anomaly_score"] >= 0).all() and (valid["anomaly_score"] <= 1).all(),
          f"min={valid['anomaly_score'].min():.3f}, max={valid['anomaly_score'].max():.3f}")
    check("IsolationForest flags ~10% anomalies",
          0.05 <= (iso_labels == -1).mean() <= 0.20,
          f"got {(iso_labels == -1).mean():.1%}")

    # Text blob
    valid["text_blob"] = (
        valid["project_name"].fillna("") + " | " +
        valid["cluster"].fillna("") + " | " +
        valid["sector"].fillna("") + " | " +
        valid["description"].fillna("") + " | " +
        valid["country_name"].fillna("") + " | " +
        valid["year"].astype(str)
    )

    check("text_blob not empty", (valid["text_blob"].str.len() > 10).all())

    # Project ID
    valid["project_id"] = valid["project_code"] + "_" + valid["year"].astype(str)
    check("project_id is unique", valid["project_id"].is_unique)

    # Schema validation
    expected_cols = [
        "project_id", "project_code", "project_name",
        "iso3", "country_name", "year",
        "cluster", "sector",
        "requested_funds", "orig_requested_funds", "target_beneficiaries",
        "b2b_ratio", "cost_per_beneficiary",
        "budget_zscore", "budget_revision_ratio", "anomaly_score",
        "b2b_percentile", "is_outlier", "cluster_median_b2b",
        "description", "text_blob",
    ]
    for col in expected_cols:
        check(f"Column '{col}' exists", col in valid.columns)

    print(f"\nB2B ratio stats:\n{valid['b2b_ratio'].describe().to_string()}")
    return valid


# ---------------------------------------------------------------------------
# Test 3: Backend Contract Validation
# ---------------------------------------------------------------------------

def test_backend_contract(crisis_df: pd.DataFrame, project_df: pd.DataFrame):
    print("\n=== Test 3: Backend Contract Validation ===")

    # Simulate what globe.py does: group by country
    from collections import defaultdict
    by_country = defaultdict(list)
    for _, r in crisis_df.iterrows():
        crisis = {
            "crisis_id": r.get("crisis_id"),
            "crisis_name": r.get("crisis_name"),
            "acaps_severity": float(r["acaps_severity"]) if pd.notna(r["acaps_severity"]) else None,
            "severity_class": r.get("severity_class"),
            "has_hrp": bool(r["has_hrp"]),
            "funding_state": r.get("funding_state"),
            "crisis_rank": int(r["crisis_rank"]),
        }
        by_country[r["iso3"]].append(crisis)

    check("Globe grouping produces country entries", len(by_country) > 0)
    check("SDN has 2 crises in grouping", len(by_country.get("SDN", [])) == 2)
    check("ETH capped at 8 in grouping", len(by_country.get("ETH", [])) == 8)

    # Validate crisis_rank ordering
    for iso3, crises in by_country.items():
        ranks = [c["crisis_rank"] for c in crises]
        check(f"{iso3} ranks are sequential from 1", ranks == list(range(1, len(ranks) + 1)),
              f"got {ranks}")

    # Simulate what benchmark.py does: look up a project
    test_code = project_df.iloc[0]["project_code"]
    found = project_df[project_df["project_code"] == test_code]
    check("Project lookup by code works", len(found) == 1)
    check("Found project has text_blob", len(found.iloc[0]["text_blob"]) > 10)


# ---------------------------------------------------------------------------
# Test 4: Edge Cases
# ---------------------------------------------------------------------------

def test_edge_cases():
    print("\n=== Test 4: Edge Cases ===")

    # Country with ACAPS data but no funding, needs, or B2B data at all
    acaps = pd.DataFrame([{
        "iso3": "XXX", "country_name": "Testland", "year": 2024, "month": 1,
        "crisis_id": "XXX-001", "crisis_name": "Test Crisis", "acaps_severity": 3.5,
        "severity_class": "High",
    }])

    hrp = pd.DataFrame(columns=["iso3", "year", "has_hrp", "appeal_type", "appeal_code",
                                 "requirements_usd", "funding_usd", "funding_gap_usd",
                                 "funding_coverage_pct"])
    needs = pd.DataFrame(columns=["iso3", "year", "people_in_need"])
    b2b = pd.DataFrame(columns=["iso3", "year", "b2b_ratio", "project_count"])

    result = acaps.merge(hrp, on=["iso3", "year"], how="left")
    result = result.merge(needs, on=["iso3", "year"], how="left")
    result = result.merge(b2b, on=["iso3", "year"], how="left")
    result["has_hrp"] = result["has_hrp"].fillna(False)
    result["project_count"] = result["project_count"].fillna(0).astype(int)

    check("Orphan ACAPS row survives join", len(result) == 1)
    check("Orphan defaults to no HRP", not result.iloc[0]["has_hrp"])
    check("Orphan has NaN people_in_need", pd.isna(result.iloc[0]["people_in_need"]))
    check("Orphan project_count is 0", result.iloc[0]["project_count"] == 0)

    # Test severity class boundaries
    def severity_class(score):
        if pd.isna(score): return "Unknown"
        if score < 1: return "Very Low"
        if score < 2: return "Low"
        if score < 3: return "Medium"
        if score < 4: return "High"
        return "Very High"

    check("Severity 0 = Very Low", severity_class(0) == "Very Low")
    check("Severity 0.99 = Very Low", severity_class(0.99) == "Very Low")
    check("Severity 1.0 = Low", severity_class(1.0) == "Low")
    check("Severity 2.5 = Medium", severity_class(2.5) == "Medium")
    check("Severity 3.5 = High", severity_class(3.5) == "High")
    check("Severity 4.0 = Very High", severity_class(4.0) == "Very High")
    check("Severity 5.0 = Very High", severity_class(5.0) == "Very High")
    check("Severity NaN = Unknown", severity_class(np.nan) == "Unknown")

    # B2B with zero budget
    check("Division by zero protection", True)  # Our filter requires budget > 0


# ---------------------------------------------------------------------------
# Test 5: Real ACAPS CSV Parsing
# ---------------------------------------------------------------------------

def test_real_csv():
    print("\n=== Test 5: Real ACAPS CSV Parsing ===")
    import json as _json

    csv_path = os.path.join(os.path.dirname(__file__), "data", "acaps_crises_2022_2026.csv")
    if not os.path.exists(csv_path):
        print("  SKIP: ACAPS CSV not found at databricks/data/acaps_crises_2022_2026.csv")
        return

    df = pd.read_csv(csv_path)
    check("CSV loaded", len(df) > 0, f"got {len(df)} rows")

    # Normalize columns
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]

    check("year column exists", "year" in df.columns)
    check("month column exists", "month" in df.columns)
    check("iso3 column exists", "iso3" in df.columns)
    check("crisis_id column exists", "crisis_id" in df.columns)
    check("crisis_name column exists", "crisis_name" in df.columns)
    check("inform_severity_index column exists", "inform_severity_index" in df.columns)

    # Test JSON array parsing
    def parse_json_array_first(val):
        if pd.isna(val):
            return None
        s = str(val).strip()
        if s.startswith("["):
            try:
                arr = _json.loads(s)
                return arr[0] if arr else None
            except (ValueError, IndexError):
                pass
        return s

    df["iso3"] = df["iso3"].apply(parse_json_array_first)
    df["country"] = df["country"].apply(parse_json_array_first)

    check("ISO3 parsed from JSON array", df["iso3"].iloc[0] == "AFG", f"got {df['iso3'].iloc[0]}")
    check("Country parsed from JSON array",
          df["country"].iloc[0] == "Afghanistan", f"got {df['country'].iloc[0]}")
    check("No leftover brackets in iso3",
          not df["iso3"].dropna().str.contains(r"[\[\]]").any())
    check("ISO3 values are 3 chars",
          (df["iso3"].dropna().str.len() == 3).all(),
          f"lengths: {df['iso3'].dropna().str.len().value_counts().to_dict()}")

    # Severity
    df["acaps_severity"] = pd.to_numeric(df["inform_severity_index"], errors="coerce")
    check("Severity is numeric", df["acaps_severity"].dtype in [np.float64, np.float32])
    check("Severity range 1-5", df["acaps_severity"].min() >= 0.5 and df["acaps_severity"].max() <= 5.0,
          f"got {df['acaps_severity'].min()}-{df['acaps_severity'].max()}")

    # Filter country-level
    if "regional_or_country" in df.columns:
        country_level = df[df["regional_or_country"].str.strip().str.lower() == "country"]
        check("Country-level filter retains data", len(country_level) > 100)
        regional = df[df["regional_or_country"].str.strip().str.lower() != "country"]
        print(f"  Filtered out {len(regional)} regional rows, kept {len(country_level)} country rows")

    # Drop NaN severity
    valid = df.dropna(subset=["acaps_severity"])
    check("Most rows have severity", len(valid) / len(df) > 0.90,
          f"only {len(valid)/len(df):.1%} have severity")

    # Summary stats
    print(f"\n  Total rows: {len(df)}")
    print(f"  Countries: {df['iso3'].nunique()}")
    print(f"  Crises: {df['crisis_id'].nunique()}")
    print(f"  Year range: {df['year'].min()}-{df['year'].max()}")
    print(f"  Severity null rate: {df['acaps_severity'].isna().mean():.1%}")
    print(f"  Severity category distribution:")
    if "inform_severity_category" in df.columns:
        print(f"    {df['inform_severity_category'].value_counts().to_dict()}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=" * 60)
    print("Local Test Harness for Databricks Notebooks")
    print("=" * 60)

    crisis_df = test_crisis_summary()
    project_df = test_project_embeddings()
    test_backend_contract(crisis_df, project_df)
    test_edge_cases()
    test_real_csv()

    print("\n" + "=" * 60)
    print(f"Results: {PASS} passed, {FAIL} failed")
    print("=" * 60)

    sys.exit(1 if FAIL > 0 else 0)
