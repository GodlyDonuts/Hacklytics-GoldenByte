# Databricks AI/BI Dashboard Setup

Instructions for creating and embedding a Databricks dashboard that visualizes
the humanitarian funding mismatch data from our Delta tables.

## Prerequisites

- Databricks workspace with the 5 notebooks already run (tables populated)
- SQL warehouse active (or auto-start enabled)
- Tables in `workspace.default.*` namespace

## Step 1: Create a New Dashboard

1. In Databricks, go to **SQL** > **Dashboards** > **Create Dashboard**
2. Name it "Crisis Topography -- Funding Mismatch Analysis"

## Step 2: Add Datasets

Connect the following tables as datasets:

| Dataset Name | Source Table |
|---|---|
| Country Mismatch | `workspace.default.country_mismatch` |
| Project Anomalies | `workspace.default.project_anomalies` |
| Cluster Benchmarks | `workspace.default.cluster_benchmarks` |

## Step 3: Build Charts

### Chart 1: Top Underfunded Countries (Bar Chart)

- **Dataset:** Country Mismatch
- **X-axis:** `location_name`
- **Y-axis:** `mismatch_score`
- **Sort:** Descending by `mismatch_score`
- **Limit:** Top 15
- **Color:** Gradient by `mismatch_score` (red = high)

```sql
SELECT location_name, mismatch_score, coverage_ratio
FROM workspace.default.country_mismatch
ORDER BY mismatch_score DESC
LIMIT 15
```

### Chart 2: Severity vs Funding (Scatter Plot)

- **Dataset:** Country Mismatch
- **X-axis:** `severity` (humanitarian need severity)
- **Y-axis:** `coverage_ratio` (funding received / requested)
- **Size:** `people_in_need`
- **Label:** `location_name`

```sql
SELECT location_name, severity, coverage_ratio, people_in_need, mismatch_score
FROM workspace.default.country_mismatch
```

### Chart 3: Anomaly Distribution by Cluster (Bar Chart)

- **Dataset:** Project Anomalies
- **X-axis:** `cluster_name`
- **Y-axis:** Count of anomalies
- **Filter:** `is_anomaly = true`

```sql
SELECT cluster_name, COUNT(*) as anomaly_count
FROM workspace.default.project_anomalies
WHERE is_anomaly = true
GROUP BY cluster_name
ORDER BY anomaly_count DESC
```

### Chart 4: Cluster Budget Distribution (Box Plot)

- **Dataset:** Cluster Benchmarks
- **X-axis:** `cluster_name`
- **Values:** `mean_budget`, `median_budget`, `min_budget`, `max_budget`

```sql
SELECT cluster_name, mean_budget, median_budget, std_budget, min_budget, max_budget, project_count
FROM workspace.default.cluster_benchmarks
ORDER BY median_budget DESC
```

### Chart 5: Funding Coverage Summary (Counter/KPI)

- **Dataset:** Country Mismatch

```sql
SELECT
  COUNT(*) as total_countries,
  ROUND(AVG(coverage_ratio) * 100, 1) as avg_coverage_pct,
  SUM(CASE WHEN coverage_ratio < 0.3 THEN 1 ELSE 0 END) as critically_underfunded,
  ROUND(SUM(funding_requested - funding_received) / 1e9, 2) as total_gap_billions
FROM workspace.default.country_mismatch
```

Display as 4 KPI counters:
- Total Countries Tracked
- Average Coverage (%)
- Critically Underfunded (<30%)
- Total Funding Gap ($B)

## Step 4: Publish and Embed

1. Click **Share** > **Publish**
2. Enable **Embed** in the sharing settings
3. Copy the embed URL
4. Add to your `.env` file:

```
NEXT_PUBLIC_DATABRICKS_DASHBOARD_URL=https://your-workspace.cloud.databricks.com/embed/dashboards/...
```

5. Restart the Next.js dev server to pick up the new env var

## Notes

- The dashboard auto-refreshes based on Databricks settings (default: on page load)
- Free-tier SQL warehouses auto-suspend after 10 minutes of inactivity
- First load after suspension takes 30-60 seconds while the warehouse starts
- The `DatabricksDashboard` component in `frontend/src/components/` handles the iframe embedding with proper CSP headers configured in `next.config.ts`
