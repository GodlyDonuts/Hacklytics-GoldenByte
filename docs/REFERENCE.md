# Databricks Challenge: Humanitarian Funding Allocation Analysis

## Core Question

Are the world's worst humanitarian crises receiving proportional funding?

Some countries face extreme humanitarian need driven by conflict, famine, displacement, and natural disasters. Yet the funding they receive through Pooled Funds (CBPFs) may not match that need. At the project level, some interventions may be unusually expensive or unusually underfunded relative to how many people they serve.

The central theme of this challenge is: **Inequality in Humanitarian Funding Allocation.**

---

## What the Challenge Wants You to Reveal

**Geographic mismatches** -- Countries with high crisis severity but low funding coverage.

**Efficiency mismatches** -- Projects where budget and beneficiary numbers are abnormally misaligned.

**Benchmarking insights** -- Similar crises in different countries that produce very different cost-per-person outcomes.

Put simply: Where is humanitarian aid not aligned with actual human suffering?

---

## The Datasets and What They Measure

### Humanitarian Needs Overview (HNO) 
[https://data.humdata.org/dataset/global-hpc-hno](https://data.humdata.org/dataset/global-hpc-hno)
This dataset measures **how bad the situation is**. It contains:
- Severity scores by country or region
- Number of people in need
- Crisis classification levels

### Humanitarian Response Plan (HRP)
[https://data.humdata.org/dataset/humanitarian-response-plans](https://data.humdata.org/dataset/humanitarian-response-plans)
This dataset measures **what the UN says is required**. It contains:
- Planned interventions
- Target populations
- Requested funding amounts

### Requirements and Funding Data
[https://data.humdata.org/dataset/global-requirements-and-funding-data](https://data.humdata.org/dataset/global-requirements-and-funding-data)
This dataset measures **the funding gap**. It contains:
- How much money was requested
- How much was actually received

### CBPF (Country-Based Pooled Funds)
[https://cbpf.data.unocha.org/](https://cbpf.data.unocha.org/)
This dataset measures **real allocation of money to on-the-ground projects**. It contains:
- Actual project-level budgets
- Sectors covered (health, food, shelter, WASH, etc.)
- Number of beneficiaries reached

### Population Data
[https://data.humdata.org/dataset/cod-ps-global](https://data.humdata.org/dataset/cod-ps-global)
---

## Real-World Examples

### Example 1: Yemen -- High Need, Chronic Underfunding

Yemen faces massive food insecurity, cholera outbreaks, ongoing conflict, and millions of internally displaced people. The HNO data reflects an extremely high severity score with millions in need. However, funding data consistently shows the HRP is underfunded by 40 to 60 percent, with uneven CBPF coverage across clusters.

A map of Yemen would show deep red severity alongside weak funding coverage per capita. The real-world consequence is that food aid gets cut, hospitals close, and malnutrition rises.

A strong analytical finding here might read: "Yemen ranks in the top 5 for crisis severity but sits in the bottom 40% for pooled fund coverage per capita." That is a geographic mismatch insight.

---

### Example 2: Ukraine vs. Sudan -- Media Visibility Bias

Ukraine received rapid mobilization of funds, a strong donor response, and high global attention following its crisis. Sudan, despite massive displacement and severe conflict, has been chronically underreported.

The data may reveal similar numbers of people in need between these two countries, but very different funding per person. This suggests that funding correlates with political and media attention rather than severity alone. That is one of the most powerful stories this challenge can tell.

---

### Example 3: Health Projects with Abnormal Cost-per-Beneficiary

Consider two similar health projects:

- Country A: $5 million budget serving 100,000 people = $50 per beneficiary
- Country B: $5 million budget serving 10,000 people = $500 per beneficiary

A model that flags outlier beneficiary-to-budget ratios would surface Country B as an anomaly. The next step is to investigate why. Possible explanations include conflict-heavy environments that raise operational costs, poor infrastructure, remote geography, or genuine inefficiency. This kind of benchmarking drives accountability and helps donors and planners make better decisions.

---

## Summary

This challenge is ultimately about building an analytical framework that can answer: given the scale of suffering in a given country or crisis, is the funding response proportionate, efficient, and equitable? The datasets together allow you to measure need, compare it against planned and actual funding, and evaluate whether the money that does flow is being used effectively across sectors and geographies.