# Databricks notebook source

# COMMAND ----------

# MAGIC %md
# MAGIC # 05 - Cluster Benchmarking
# MAGIC Groups projects by humanitarian cluster, computes percentile bands for
# MAGIC budget, and identifies outliers within each cluster.
# MAGIC
# MAGIC **Reads:** `workspace.default.project_anomalies`
# MAGIC **Writes:** `workspace.default.cluster_benchmarks`, `workspace.default.project_benchmarked`

# COMMAND ----------

from pyspark.sql import functions as F
from pyspark.sql.window import Window

# COMMAND ----------

# MAGIC %md
# MAGIC ## 1. Load Project Data with Anomaly Scores

# COMMAND ----------

projects = spark.table("workspace.default.project_anomalies")
print(f"Total projects: {projects.count()}")
print(f"Unique clusters: {projects.select('cluster').distinct().count()}")

projects.groupBy("cluster").agg(
    F.count("*").alias("project_count"),
    F.avg("budget").alias("avg_budget"),
    F.sum("budget").alias("total_budget")
).orderBy(F.desc("project_count")).show(truncate=False)

# COMMAND ----------

# MAGIC %md
# MAGIC ## 2. Compute Per-Cluster Benchmark Statistics

# COMMAND ----------

cluster_stats = projects.groupBy("cluster").agg(
    F.count("*").alias("project_count"),
    F.avg("budget").alias("avg_budget"),
    F.stddev("budget").alias("std_budget"),
    F.min("budget").alias("min_budget"),
    F.max("budget").alias("max_budget"),
    F.percentile_approx("budget", 0.25).alias("p25"),
    F.percentile_approx("budget", 0.50).alias("median"),
    F.percentile_approx("budget", 0.75).alias("p75"),
    F.sum("budget").alias("total_budget"),
)

# Compute IQR-based outlier bounds
cluster_stats = cluster_stats.withColumn(
    "iqr", F.col("p75") - F.col("p25")
).withColumn(
    "lower_bound", F.col("p25") - 1.5 * F.col("iqr")
).withColumn(
    "upper_bound", F.col("p75") + 1.5 * F.col("iqr")
)

cluster_stats.write.format("delta").mode("overwrite").saveAsTable("workspace.default.cluster_benchmarks")
print(f"Wrote {cluster_stats.count()} cluster benchmarks")

# COMMAND ----------

display(cluster_stats.orderBy(F.desc("project_count")))

# COMMAND ----------

# MAGIC %md
# MAGIC ## 3. Benchmark Each Project Against Its Cluster

# COMMAND ----------

# Join projects with their cluster benchmarks
benchmarked = projects.join(
    cluster_stats.select(
        "cluster", "avg_budget", "std_budget", "median",
        "p25", "p75", "lower_bound", "upper_bound"
    ),
    on="cluster",
    how="left"
)

# Flag projects as outliers within their cluster (budget outside IQR bounds)
benchmarked = benchmarked.withColumn(
    "cluster_outlier",
    F.when(
        (F.col("budget") < F.col("lower_bound")) |
        (F.col("budget") > F.col("upper_bound")),
        True
    ).otherwise(False)
)

# Compute z-score within cluster
benchmarked = benchmarked.withColumn(
    "cluster_budget_zscore",
    F.when(F.col("std_budget") > 0,
        (F.col("budget") - F.col("avg_budget")) / F.col("std_budget")
    ).otherwise(0)
)

# Percentile rank within cluster
w_cluster = Window.partitionBy("cluster").orderBy("budget")
benchmarked = benchmarked.withColumn(
    "cluster_percentile", F.percent_rank().over(w_cluster)
)

benchmarked.write.format("delta").mode("overwrite").saveAsTable("workspace.default.project_benchmarked")
print(f"Wrote {benchmarked.count()} benchmarked projects")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 4. Preview: Most Extreme Outliers by Cluster

# COMMAND ----------

outliers = benchmarked.filter(F.col("cluster_outlier") == True)
print(f"Total cluster outliers: {outliers.count()}")

display(
    outliers.orderBy(F.desc(F.abs(F.col("cluster_budget_zscore")))).select(
        "projectCode", "countryName", "cluster", "budget",
        "cluster_budget_zscore", "anomaly_score", "planYear"
    ).limit(30)
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Summary
# MAGIC
# MAGIC **Tables created:**
# MAGIC - `workspace.default.cluster_benchmarks` -- per-cluster statistics (avg, median, percentiles, outlier bounds)
# MAGIC - `workspace.default.project_benchmarked` -- all projects with cluster z-scores, percentile ranks, and outlier flags
