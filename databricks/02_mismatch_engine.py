# Databricks notebook source

# COMMAND ----------

# MAGIC %md
# MAGIC # 02 - Country-Level Mismatch Detection
# MAGIC Computes a mismatch score per country by comparing severity (people in need)
# MAGIC against funding received. Countries with high need but low funding rank higher.
# MAGIC
# MAGIC **Reads:** `workspace.default.humanitarian_needs`, `workspace.default.funding_flows`
# MAGIC **Writes:** `workspace.default.country_mismatch`

# COMMAND ----------

from pyspark.sql import functions as F
from pyspark.sql.window import Window

# COMMAND ----------

# MAGIC %md
# MAGIC ## 1. Load and Aggregate Severity Data

# COMMAND ----------

needs = spark.table("workspace.default.humanitarian_needs")

# Aggregate: total people in need per country
# population_status "INN" = In Need
severity = needs.filter(
    F.col("population_status") == "INN"
).groupBy("location_code", "location_name").agg(
    F.sum("population").alias("people_in_need"),
    F.countDistinct("sector_code").alias("sector_count"),
    F.max("reference_period_start").alias("latest_period")
)

print(f"Countries with severity data: {severity.count()}")
severity.orderBy(F.desc("people_in_need")).show(10, truncate=False)

# COMMAND ----------

# MAGIC %md
# MAGIC ## 2. Load and Aggregate Funding Data

# COMMAND ----------

flows = spark.table("workspace.default.funding_flows")

# Aggregate funding per country across all years
# FTS API groups by country name (no ISO3 in flow data), so we join on name
funding = flows.groupBy("country_name").agg(
    F.sum("totalFunding").alias("total_funding"),
    F.count("*").alias("year_count")
)

print(f"Countries with funding data: {funding.count()}")
funding.orderBy(F.desc("total_funding")).show(10, truncate=False)

# COMMAND ----------

# MAGIC %md
# MAGIC ## 3. Join and Compute Mismatch Score

# COMMAND ----------

# Join severity with funding on country name
# HDX uses location_name, FTS uses country_name
country_mismatch = severity.join(
    funding,
    F.lower(severity["location_name"]) == F.lower(funding["country_name"]),
    "left"
).select(
    severity["location_code"].alias("iso3"),
    severity["location_name"].alias("country"),
    "people_in_need",
    "sector_count",
    F.coalesce(funding["total_funding"], F.lit(0)).alias("total_funding"),
)

# Compute derived metrics
country_mismatch = country_mismatch.withColumn(
    "funding_per_capita",
    F.when(F.col("people_in_need") > 0,
           F.col("total_funding") / F.col("people_in_need")
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
    "funding_per_capita", "severity", "mismatch_score",
    "severity_rank", "funding_rank"
).show(20, truncate=False)
