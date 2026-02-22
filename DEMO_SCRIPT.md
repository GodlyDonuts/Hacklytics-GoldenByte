# Crisis Topography -- Voice Agent Demo Script

A guided walkthrough for demonstrating the full capabilities of Crisis Topography
using the ElevenLabs voice agent. Each section targets a specific API endpoint or
visualization feature. Pause between commands to let animations and data load.

---

## 1. Opening -- Globe Overview (severity mode)

> "Show me the global crisis landscape."

The globe loads in **Severity mode** by default, coloring countries by ACAPS crisis
severity scores. Red/orange = high severity, blue/green = lower severity. Polygon
altitude encodes the same metric so the worst-hit regions literally rise off the globe.

---

## 2. Navigate to a Country

> "Take me to Yemen."

The camera flies to Yemen and activates the spotlight, dimming all other countries.
Clicking the country opens the **Country Detail Overlay** on the right showing every
active crisis, funding gaps, and severity badges.

---

## 3. Drill into Project-Level Data

After the overlay opens, expand the **Project-Level B2B Analysis** section manually
(or narrate it). This calls `GET /api/globe/b2b` and shows per-project
budget-to-beneficiary ratios, outlier flags, and cluster medians.

> "Yemen has multiple active crises. Notice the project-level breakdown -- outlier
> projects with unusually high cost-per-beneficiary are flagged in amber."

---

## 4. Benchmark a Project

Click **Find comparable projects** on any project card. This calls
`POST /api/benchmark` and returns semantically similar projects from other countries,
ranked by B2B delta.

> "We can benchmark any individual project against its closest peers across the
> entire humanitarian portfolio to spot inefficiencies."

---

## 5. Switch View Modes

> "Switch to the funding gap view."

The globe recolors: green = well-funded, red = large unmet funding needs. Altitude
now encodes the coverage gap ratio.

> "Now show me the overlooked crises view."

Recolors again to the oversight score gradient. Bright red countries are receiving
disproportionately less attention relative to their severity.

---

## 6. Compare Two Countries

> "Compare Syria and Sudan."

The camera flies to Syria, then draws an animated arc between Syria and Sudan.
Side-by-side stats appear for mismatch scores, people in need, severity, risk,
and funding gaps.

---

## 7. Natural Language Data Query (Genie)

> "Which countries have the highest number of people in need?"

This sends the question to `POST /api/genie`, which translates it to SQL via
Databricks Genie Spaces. The **GenieChartPanel** slides in from the left showing
a horizontal bar chart, ranked list, and the generated SQL query.

Follow-up queries to try:

> "What is the total funding gap by crisis cluster?"

> "Show me the top 10 crises with the lowest coverage ratio."

> "Which countries have more than 5 active crises?"

---

## 8. RAG-Powered Q&A

This one is triggered via the text-based `/ask` endpoint (not directly exposed as a
voice tool, but can be demoed from the API or a separate UI). It vector-searches the
crisis knowledge base and generates a grounded answer with source citations.

Example question for the API:
> "What are the main drivers of food insecurity in the Sahel region?"

---

## 9. Predictive Risk Analysis

This endpoint is not voice-triggered but can be demoed via the API or a dedicated UI
panel. It queries Databricks for projects with anomaly scores above 0.8, groups them
by country, and sends the anomalies to an LLM (Qwen 3.5 via OpenRouter) to predict
geopolitical risks such as mass migration, famine, or civil unrest.

Call `GET /api/predictive/risks` to receive a structured list of risks per country,
each with a severity level, confidence score, and contributing factors drawn from
the actual anomaly data.

> "The predictive layer flags countries where anomalous funding patterns may signal
> deeper systemic failures -- corruption, extreme desperation, or imminent collapse."

---

## 10. Generate a Report

> "Generate a report on Yemen."

Calls `GET /report?scope=country&iso3=YEM`, which uses Gemini 2.0 Flash to produce
a PDF intelligence brief covering funding requested vs received, coverage percentage,
and key crisis dynamics. The PDF downloads automatically.

> "Now generate a global report."

Calls `GET /report?scope=global`, producing a PDF summarizing the top 5 largest
funding gaps worldwide with analysis.

---

## 11. Reset and Wrap Up

> "Reset the view."

Clears all overlays, comparison arcs, and chart panels. Returns to default severity
mode with the camera at the starting position.

> "End the conversation."

Gracefully terminates the voice session.

---

## Quick Reference -- All Voice Commands

| Command | What It Does | Backend Endpoint |
|---------|-------------|-----------------|
| "Take me to [country]" | Fly camera to location | Client-side only |
| "Switch to [severity/funding gap/overlooked] view" | Change color mode | Client-side only |
| "Compare [country A] and [country B]" | Draw arc, show stats | Client-side only |
| "Which countries have the highest [metric]?" | NL-to-SQL query | POST /api/genie |
| "Generate a report on [country]" | PDF intelligence brief | GET /report |
| "Generate a global report" | Global PDF summary | GET /report |
| "Reset the view" | Clear everything | Client-side only |
| "End the conversation" | Close voice session | Client-side only |

---

## Tips for a Smooth Demo

- **Pause 2-3 seconds** between voice commands to let animations complete.
- The **Agent Activity Feed** (top-right pills) shows real-time tool execution
  status -- point this out to the audience.
- If Genie queries take a moment, narrate: "The system is translating that natural
  language question into SQL and running it against our Databricks warehouse."
- The country detail overlay loads B2B data lazily -- expand the section to trigger
  the API call.
- For the benchmark feature, pick a project with an outlier flag for maximum impact.
