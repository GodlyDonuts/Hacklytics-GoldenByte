# Databricks notebook source

# COMMAND ----------

# MAGIC %md
# MAGIC # 02 - Country-Level Mismatch Detection
# MAGIC Computes a mismatch score per country by comparing severity (people in need)
# MAGIC against funding received. Countries with high need but low funding rank higher.
# MAGIC
# MAGIC **Reads:** `workspace.default.humanitarian_needs`, `workspace.default.funding`
# MAGIC **Writes:** `workspace.default.country_mismatch`

# COMMAND ----------

from pyspark.sql import functions as F
from pyspark.sql.window import Window

# COMMAND ----------

# MAGIC %md
# MAGIC ## 1. Load and Aggregate Severity Data

# COMMAND ----------

needs = spark.table("workspace.default.humanitarian_needs")

# Filter to de-duplicated cross-sector totals only.
# "Intersectoral" is HDX HAPI's de-duplicated total -- summing individual sectors
# (Food Security + Health + ...) would count the same people multiple times.
needs_filtered = needs.filter(
    (F.col("population_status") == "INN") &
    (F.col("sector_code") == "Intersectoral")
)

# Keep only the latest reference period per country to avoid summing across years
latest_period = needs_filtered.groupBy("location_code").agg(
    F.max("reference_period_start").alias("max_ref_period")
)
needs_filtered = needs_filtered.join(latest_period, on="location_code").filter(
    F.col("reference_period_start") == F.col("max_ref_period")
).drop("max_ref_period")

# Prefer the lowest admin_level per country (admin_level 0 = national aggregate).
# If only sub-national data exists, sum across the finest level available.
min_admin = needs_filtered.groupBy("location_code").agg(
    F.min("admin_level").alias("target_admin_level")
)
needs_filtered = needs_filtered.join(min_admin, on="location_code").filter(
    F.col("admin_level") == F.col("target_admin_level")
).drop("target_admin_level")

# Aggregate: total people in need per country (sum across categories/age groups)
severity = needs_filtered.groupBy("location_code", "location_name").agg(
    F.sum("population").alias("people_in_need"),
    F.max("reference_period_start").alias("latest_period")
)

# Count distinct active sectors per country from the full (non-Intersectoral) data
# for downstream use in RAG document generation
sector_counts = needs.filter(
    (F.col("population_status") == "INN") &
    (F.col("sector_code") != "Intersectoral")
).groupBy("location_code").agg(
    F.countDistinct("sector_code").alias("sector_count")
)
severity = severity.join(sector_counts, on="location_code", how="left")

print(f"Countries with severity data: {severity.count()}")
severity.orderBy(F.desc("people_in_need")).show(10, truncate=False)

# COMMAND ----------

# MAGIC %md
# MAGIC ## 2. Load and Aggregate Funding Data

# COMMAND ----------

funding = spark.table("workspace.default.funding")

# Use only the latest plausible reference period year to match the severity data window.
# Without this filter, funding sums span 2020-2026 producing cumulative multi-year totals.
# Cap at current year to ignore malformed future-dated records from the API.
import datetime
current_year = datetime.date.today().year

funding_latest = funding.withColumn(
    "ref_year", F.year("reference_period_start")
).filter(F.col("ref_year") <= current_year)

max_year = funding_latest.agg(F.max("ref_year")).collect()[0][0]
funding_latest = funding_latest.filter(F.col("ref_year") == max_year).drop("ref_year")
print(f"Using funding data for year: {max_year}")

# Aggregate funding per country across all appeals within the latest year
funding_agg = funding_latest.groupBy("location_code", "location_name").agg(
    F.sum("funding_usd").alias("total_funding"),
    F.sum("requirements_usd").alias("total_requirements"),
    F.avg("funding_pct").alias("avg_funding_pct"),
    F.count("*").alias("appeal_count")
)

print(f"Countries with funding data: {funding_agg.count()}")
funding_agg.orderBy(F.desc("total_funding")).show(10, truncate=False)

# COMMAND ----------

# MAGIC %md
# MAGIC ## 3. Join and Compute Mismatch Score

# COMMAND ----------

# Join severity with funding on ISO3 location_code
country_mismatch = severity.join(
    funding_agg,
    on="location_code",
    how="left"
).select(
    severity["location_code"].alias("iso3"),
    severity["location_name"].alias("country"),
    "people_in_need",
    "sector_count",
    F.coalesce(funding_agg["total_funding"], F.lit(0)).alias("total_funding"),
    F.coalesce(funding_agg["total_requirements"], F.lit(0)).alias("total_requirements"),
    F.coalesce(funding_agg["avg_funding_pct"], F.lit(0)).alias("avg_funding_pct"),
)

# Compute derived metrics
country_mismatch = country_mismatch.withColumn(
    "funding_per_capita",
    F.when(F.col("people_in_need") > 0,
           F.col("total_funding") / F.col("people_in_need")
    ).otherwise(0)
).withColumn(
    "coverage_ratio",
    F.when(F.col("total_requirements") > 0,
           F.col("total_funding") / F.col("total_requirements")
    ).otherwise(0)
)

# COMMAND ----------

# Rank-based mismatch:
# High severity rank (1 = most people in need) + Low funding rank = high mismatch

w_severity = Window.orderBy(F.desc("people_in_need"))
w_funding = Window.orderBy(F.desc("funding_per_capita"))

country_mismatch = country_mismatch.withColumn(
    "severity_rank", F.rank().over(w_severity)
).withColumn(
    "funding_rank", F.rank().over(w_funding)
)

# Mismatch score: normalized difference between severity rank and funding rank
# Positive = underfunded relative to need, Negative = overfunded relative to need
total_countries = country_mismatch.count()

country_mismatch = country_mismatch.withColumn(
    "mismatch_score",
    (F.col("funding_rank") - F.col("severity_rank")) / F.lit(total_countries)
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## 4. Compute Severity Score (1-5 scale)

# COMMAND ----------

# Map people_in_need to a 0-5 severity scale using percentile-based bucketing
w_pct = Window.orderBy("people_in_need")
country_mismatch = country_mismatch.withColumn(
    "percentile_rank", F.percent_rank().over(w_pct)
).withColumn(
    "severity",
    F.when(F.col("percentile_rank") >= 0.9, 5.0)
     .when(F.col("percentile_rank") >= 0.75, 4.0)
     .when(F.col("percentile_rank") >= 0.5, 3.0)
     .when(F.col("percentile_rank") >= 0.25, 2.0)
     .otherwise(1.0)
).drop("percentile_rank")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 5. Write Results

# COMMAND ----------

country_mismatch.write.format("delta").mode("overwrite").saveAsTable("workspace.default.country_mismatch")
print(f"Wrote {country_mismatch.count()} rows to workspace.default.country_mismatch")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 6. Preview Top Mismatches

# COMMAND ----------

# Show countries with highest mismatch (most underfunded relative to need)
country_mismatch.orderBy(F.desc("mismatch_score")).select(
    "iso3", "country", "people_in_need", "total_funding",
    "funding_per_capita", "coverage_ratio", "severity", "mismatch_score",
    "severity_rank", "funding_rank"
).show(20, truncate=False)
