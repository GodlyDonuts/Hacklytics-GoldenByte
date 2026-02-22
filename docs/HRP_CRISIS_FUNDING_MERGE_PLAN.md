# Databricks: Merge HRP + requirements_funding + crisis into one RAG-ready table

This plan is **standalone** and does not depend on existing `project_embeddings` or `crisis_summary` in the repo. It is for your Databricks person to implement using the five CSVs you provided.

---

## 1. Input datasets


| Dataset                      | Purpose                                                            | Key columns for merge / output                                                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **hrp.csv**                  | HRP master: which plans exist and which locations they cover       | code, internalId, startDate, endDate, planVersion, categories, **locations** (e.g. "IRN \| TJK \| UZB \| TKM \| PAK"), **years**, origRequirements, revisedRequirements                       |
| **requirements_funding.csv** | Funding per HRP (or per HRP per country)                           | countryCode, id, name, **code**, typeId, typeName, startDate, endDate, **year**, **requirements**, **funding**, percentFunding                                                                  |
| **crisis.csv**               | Crises by year/country — no funding; used only to **link** to HRPs | **year**, month, country, iso3, **crisis_id**, crisis_name, **INFORM Severity Index**, **People in need**, etc.                                                                                 |
| **pop_data.csv**             | Per-crisis population impact and condition levels                  | **crisis_id**, **percent_affected_pop**, **people_in_minimal**, **people_in_stressed**, **people_in_moderate**, **people_in_severe**, **people_in_extreme** (percent of affected in each level) |
| **populations.csv**          | Country population by year                                        | **year**, **iso3**, **population**                                                                                                                                                              |


**Link logic**: A crisis (year, iso3) is "covered" by an HRP if that HRP's **year** (or years) includes the crisis year and the HRP's **locations** list contains that **iso3**. Funding for that HRP comes from **requirements_funding** (match on **code** + **year** to hrp's code and year).

---

## 2. Overlap and filtering (as you noted)

- **hrp.csv vs requirements_funding.csv**: Both have plan identifier (**code**) and temporal (**year** or dates). Merge them on **code** and **year** so each HRP has one row with requirements/funding (prefer requirements_funding for **requirements**, **funding**, **percentFunding**; keep from hrp: **locations**, **origRequirements**, **revisedRequirements** if useful). Drop rows outside 2022–2026 or where requirements/funding are null/invalid if you don't need them.
- **Filtering**: Restrict to **year in (2022–2026)** for both HRPs and crisis. Exclude any HRP or requirements_funding rows that don't fit (e.g. missing code, missing locations, or invalid requirements).

### 2.1 Priority filters (apply FIRST — before any empty-entry filtering)

Apply these rules **first**; only after that should "empty entry" filtering be applied.

**A. Exclude "Not specified" (requirements_funding.csv)**  

- Do **not** include in the final SQL table any row from **requirements_funding.csv** where any column (or the relevant identifier/name column) has the value **"Not specified"**.  
- Filter out such rows when loading or joining requirements_funding so they never enter the merge.

**B. Zero requirements = plan provided no funding → crises overlooked for that year**  

- In **requirements_funding.csv**, if **requirements = 0** for a given (code, year), that reflects the revised funding in **hrp.csv** being set to 0 for that plan/year (e.g. HUKR22 with revised funding 0).  
- **Interpretation**: That HRP did **not** provide funding for that year. Crises that would otherwise be "covered" by that HRP for that year must be treated as **overlooked** for that year.  
- **Implementation**: When deciding if a crisis is "covered" by an HRP, only count an HRP as covering the crisis if that HRP has **requirements > 0** (and, if used, revised requirements > 0) for that year. If the only HRP(s) that match (year + iso3 in locations) have requirements = 0, treat the crisis as **overlooked** (no row in the "covered" set; include in the overlooked set instead).

**C. Then: empty-entry filtering**  

- After applying A and B, apply any additional rule to filter out rows where required fields are empty (e.g. missing code, missing locations, or other empty checks).

---

## 3. Target table: grain and intent

- **Grain**:  
  - **Covered crises**: One row per **(crisis, HRP)** — each crisis that is covered by at least one HRP appears once per covering HRP, with that HRP's funding.  
  - **Overlooked crises**: One row per **crisis** that has **no** HRP covering it (no matching year + iso3 in any HRP's locations); HRP/funding columns are null.
- **Use**:  
  - "Under their respective HRP" → filter by `has_hrp = true` and group by `hrp_code` (or `hrp_name`) to see all crises and funding for that HRP.  
  - "Batch of overlooked_crisis" → filter by `overlooked_crisis = true` to list all overlooked crises.  
  - **Vector search (e.g. ElevenLabs agent)**: Queries like "show me 10 similar crises to {crisis_name} that DO have HRPs" — vector search over the table with `has_hrp = true`, so results are similar crises (by embedding/similar fields) that have an HRP. Users can then ask follow-up info on what they see.

You cannot "batch" as a column type in SQL, so **overlooked_crisis** is a **boolean flag**; the "batch" is the set of rows where `overlooked_crisis = true`.

---

## 4. Proposed schema (columns)

Naming is chosen to be self-explanatory and independent of existing repo tables.

**Crisis fields (every row)**  

- `crisis_year` (int) — from crisis.csv **year**, 2022–2026  
- `crisis_month` (int) — from crisis.csv **month**  
- `iso3` (string)  
- `country` (string)  
- `crisis_id` (string)  
- `crisis_name` (string)  
- `inform_severity_index` (same name as in crisis.csv)  
- `people_in_need` (same name as in crisis.csv)

**Population and condition-level (from pop_data + populations)**  

- `population` (double) — from **populations.csv** (year, iso3); country population for that year. Repeated for every row with same (year, iso3).  
- `percent_affected_pop` (double) — from **pop_data.csv**; percentage of total population affected by this crisis_id.  
- `people_in_minimal`, `people_in_stressed`, `people_in_moderate`, `people_in_severe`, `people_in_extreme` (double) — from **pop_data.csv**; percentage of the affected population in each condition level (e.g. of the 30% affected, 5% in minimal).  
- `total_affected` (double) — **derived**. See §4.1.  
- `b2b_ratio` (double) — **derived**: `funding / total_affected`. One value per HRP plan row and per overlooked_crisis row; for overlooked (no funding), use 0 or null.

**Flags**  

- `has_hrp` (boolean) — true if this crisis is covered by at least one HRP.  
- `overlooked_crisis` (boolean) — true when the crisis has **no** covering HRP (so `overlooked_crisis = NOT has_hrp`). Use this to "view all overlooked" (`WHERE overlooked_crisis = true`).

**HRP and funding (null when `has_hrp = false`)**  

- `hrp_code` (string)  
- `hrp_name` (string) — from requirements_funding **name** or hrp **planVersion.name** if merged  
- `hrp_type_name` (string) — e.g. "Regional Refugee Response Plan" from requirements_funding **typeName**  
- `hrp_locations` (string) — e.g. "IRN | TJK | UZB | TKM | PAK" from hrp **locations**  
- `hrp_year` (int)  
- `requirements` (double) — from **requirements_funding** only (revised requirements from hrp.csv are not needed; this column is the source).  
- `funding` (double)  
- `percent_funding` (double) — from requirements_funding percentFunding  

**Stability**  

- `row_id` — auto-generated only (e.g. UUID or auto-increment) so each row is uniquely identified.

### 4.1 total_affected (derived)

- **For rows with an HRP (has_hrp = true)**: The HRP can link multiple crises. Sum `(percent_affected_pop / 100 * population)` over each crisis linked to that HRP (same country/year). **Exception**: if any of those linked crises has `percent_affected_pop = 100.0`, then set `total_affected` to that country's **population** for that year (do not sum). Apply consistently per HRP (e.g. per HRP per country/year when an HRP spans multiple countries).  
- **For overlooked rows (has_hrp = false)**: One crisis per row. `total_affected = (percent_affected_pop / 100) * population` for that crisis's country/year; if `percent_affected_pop = 100.0`, then `total_affected = population`.

---

## 5. Merge steps (for Databricks implementation)

**Step 1 — Load and normalize CSVs**  

- Read **hrp.csv**, **requirements_funding.csv**, **crisis.csv**, **pop_data.csv**, **populations.csv** from a chosen location (e.g. Unity Catalog volume or FileStore).  
- Normalize column names (e.g. snake_case, consistent casing).  
- Parse **locations** in hrp: split by `|`, trim, to get a list of ISO3 codes per HRP.  
- Restrict crisis and HRP/requirements to **year in (2022, 2023, 2024, 2025, 2026)**.  
- **Priority filters (first)**: On **requirements_funding**, drop any row where any column is **"Not specified"**. Then drop rows where required fields are empty (see §2.1).

**Step 2 — HRP + requirements_funding**  

- Join **hrp** and **requirements_funding** on **code** and **year** (or equivalent key).  
- **Only treat as "funded" HRPs** those where **requirements > 0** (and optionally revised_requirements > 0 in hrp). Rows with requirements = 0 will be used only to know the plan existed; crises matching such plans for that year are **overlooked** for that year (see Step 3).  
- Result: one DataFrame per HRP (per year) with: code, name, typeName, locations, year, requirements, funding, percent_funding; keep a flag or filter so that only rows with requirements > 0 count as "covering" in Step 3.

**Step 3 — Which crises are covered by which HRP**  

- For each **crisis** row (crisis_year, iso3, crisis_id, crisis_name, …):  
  - Find all HRP rows where `hrp_year = crisis_year`, `iso3` is in that HRP's **locations** list, **and** that HRP has **requirements > 0** (and revised funding > 0 if you use it) for that year.
- Produce "covered" rows **only** for those HRPs: one row per (crisis, HRP) with crisis columns + HRP columns + requirements, funding, percent_funding; set `has_hrp = true`, `overlooked_crisis = false`.  
- Crises that match an HRP only via year + location but where that HRP has requirements = 0 for that year are **not** in the covered set; they go into the overlooked set (Step 4).

**Step 4 — Overlooked crises**  

- From **crisis**, take crises that never appeared in the "covered" set (no HRP with matching year and iso3 in locations).  
- Include also crises whose only matching HRPs had **requirements = 0** for that year (they are not in the covered set).  
- Add one row per such crisis with same crisis columns, `has_hrp = false`, `overlooked_crisis = true`, and null for all HRP/funding columns.

**Step 5 — Enrich with pop_data and populations**  

- Join **crisis** (and thus covered + overlooked rows) to **pop_data** on **crisis_id** to attach `percent_affected_pop`, `people_in_minimal`, `people_in_stressed`, `people_in_moderate`, `people_in_severe`, `people_in_extreme`.  
- Join to **populations** on **(year, iso3)** to attach **population** (country population for that year); this value repeats for all rows with the same (year, iso3).

**Step 6 — Derived columns: total_affected and b2b_ratio**  

- **total_affected**: For each HRP (or HRP + country/year when HRP spans countries), sum `(percent_affected_pop / 100 * population)` over all crises linked to that HRP; if any linked crisis has `percent_affected_pop = 100.0`, set total_affected to that country's population for that year. For overlooked rows, total_affected = (percent_affected_pop / 100) * population, or population if percent_affected_pop = 100.0.  
- **b2b_ratio**: `funding / total_affected` for every row; for overlooked (no funding), set to 0 or null.

**Step 7 — Union and write**  

- Union covered rows (Step 3, enriched in Steps 5–6) and overlooked rows (Step 4, enriched in Steps 5–6).  
- Add **row_id** (auto-generated, e.g. UUID or auto-increment).  
- Select final column list to match the schema in §4.  
- Write to a single Delta table (e.g. `workspace.default.crisis_hrp_funding` or a name you choose).  
- This table is the "one clean SQL table" ready for downstream use and vectorization.

**Step 8 — Vectorization (separate step)**  

- Add a **text blob** column (e.g. concatenate crisis_name, country, year, hrp_name, requirements, funding, inform_severity_index, people_in_need, percent_affected_pop, condition levels, b2b_ratio, etc.) for embedding so vector search returns similar crises by content.  
- Create a Databricks Vector Search index on this table (embedding on the text blob).  
- For queries like "10 similar crises to {crisis_name} that DO have HRPs", filter the index or query result by `has_hrp = true` and limit to top 10 by similarity.

---

## 6. Example query patterns (for your Databricks person / docs)

- **All crises under a given HRP**:  
`SELECT * FROM crisis_hrp_funding WHERE has_hrp = true AND hrp_code = '...'`  
- **All overlooked crises**:  
`SELECT * FROM crisis_hrp_funding WHERE overlooked_crisis = true`  
- **Funding per crisis (when covered)**:  
`SELECT crisis_id, crisis_name, country, hrp_code, requirements, funding, percent_funding FROM crisis_hrp_funding WHERE has_hrp = true`  
- **Vector search: similar crises with HRPs (e.g. ElevenLabs)**: Embed the user prompt (e.g. "10 similar crises to {crisis_name} that DO have HRPs"), query the vector index, then filter results with `has_hrp = true` and return top 10 by similarity.

---

## 7. Summary for your Databricks person

- **Inputs**: hrp.csv, requirements_funding.csv, crisis.csv, pop_data.csv, populations.csv (paths to be decided).  
- **Output**: One Delta table with the schema in §4: crisis identifiers + `inform_severity_index`, `people_in_need` + population/condition-level columns + `total_affected`, `b2b_ratio` + `has_hrp` + `overlooked_crisis` + HRP/funding columns (null for overlooked).  
- **Logic**: Link crisis (year, iso3) to HRP (year, locations ∋ iso3); attach funding from requirements_funding (code, year). Only HRPs with **requirements > 0** for that year count as "covering"; zero-requirements HRPs mean those crises are overlooked for that year. One row per (crisis, HRP) for covered crises; one row per crisis with no covering HRP for overlooked.  
- **Filtering (order matters)**:  
  1. **First**: Exclude requirements_funding rows with **"Not specified"** in any column; treat **requirements = 0** (or revised funding = 0) as "no funding for that year" so associated crises are overlooked.
  2. **Then**: 2022–2026 only; drop rows with empty required fields.
- **"Batch of overlooked_crisis"** = all rows with `overlooked_crisis = true`.  
- **Derived**: total_affected (sum of percent_affected_pop * population per HRP, with 100% rule); b2b_ratio = funding / total_affected for every row (0 or null for overlooked).  
- After this table exists, add a text blob column and create a Vector Search index for RAG; support queries like "10 similar crises to {crisis_name} that DO have HRPs" (filter by `has_hrp = true`).
