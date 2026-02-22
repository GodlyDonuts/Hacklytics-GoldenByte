# Crisis Topography -- Voice Agent Demo Script

A guided walkthrough for demonstrating the full capabilities of Crisis Topography
using the ElevenLabs voice agent. Each section targets a specific API endpoint or
visualization feature. Pause between commands to let animations and data load.

---

## 1. Opening -- Globe Overview (severity mode)

> "Show me the global crisis landscape."

The globe loads in **Severity mode** showing **January 2024** by default. Countries
are colored by ACAPS crisis severity scores: red/orange = high severity, blue/green =
lower severity. Polygon altitude encodes the same metric so the worst-hit regions
literally rise off the globe. The current time period is displayed as a read-only
indicator in the top left corner.

---

## 2. Change the Time Period

> "Show me March 2024."

The time indicator updates to **Mar 2024** and the globe reloads with month-specific
crisis data. The voice agent can navigate to any month between 2022 and 2026.

> "Go to 2025."

Switches to 2025, keeping the current month.

---

## 3. Navigate to a Country

> "Take me to Yemen."

The camera flies to Yemen and activates the spotlight, dimming all other countries.
Clicking any country on the globe also rotates to center on it. Clicking a country
with crisis data opens the **Country Detail Overlay** on the right showing every
active crisis, funding gaps, and severity badges.

---

## 4. Drill into Project-Level Data

After the overlay opens, expand the **Project-Level B2B Analysis** section manually
(or narrate it). This calls `GET /api/globe/b2b` and shows per-project
budget-to-beneficiary ratios, outlier flags, and cluster medians.

> "Yemen has multiple active crises. Notice the project-level breakdown -- outlier
> projects with unusually high cost-per-beneficiary are flagged in amber."

---

## 5. Benchmark a Project

Click **Find comparable projects** on any project card. This calls
`POST /api/benchmark` and returns semantically similar projects from other countries,
ranked by B2B delta.

> "We can benchmark any individual project against its closest peers across the
> entire humanitarian portfolio to spot inefficiencies."

---

## 6. Switch View Modes

> "Switch to the funding gap view."

The globe recolors: green = well-funded, red = large unmet funding needs. Altitude
now encodes the coverage gap ratio. Switching modes resets the selected country and
any active comparisons for a clean view.

> "Now show me the overlooked crises view."

Recolors again to the oversight score gradient. Bright red countries are receiving
disproportionately less attention relative to their severity.

---

## 7. Predictive Risk Analysis

Click the **Predictive Risks** button in the top nav bar. The globe queries
`GET /api/predictive/risks`, which uses Databricks anomaly scores and an LLM to
predict geopolitical risks such as mass migration, famine, or civil unrest. Pulsing
red markers appear at affected countries -- hover over them to see risk details,
confidence scores, and contributing factors.

> "The predictive layer flags countries where anomalous funding patterns may signal
> deeper systemic failures -- corruption, extreme desperation, or imminent collapse."

---

## 8. Compare Two Countries

> "Compare Syria and Sudan."

The camera flies to Syria, then draws an animated arc between Syria and Sudan.
Side-by-side stats appear for mismatch scores, people in need, severity, risk,
and funding gaps.

---

## 9. Natural Language Data Query (Genie)

> "Which countries have the highest number of people in need?"

This sends the question to `POST /api/genie`, which translates it to SQL via
Databricks Genie Spaces. The **GenieChartPanel** slides in from the left showing
a horizontal bar chart, ranked list, and the generated SQL query.

Follow-up queries to try:

> "What is the total funding gap by crisis cluster?"

> "Show me the top 10 crises with the lowest coverage ratio."

> "Which countries have more than 5 active crises?"

---

## 10. RAG-Powered Q&A

This is triggered via the `/ask` endpoint (not directly exposed as a voice tool,
but can be demoed from the API or a separate UI). It vector-searches the crisis
knowledge base using Actian Vector DB and generates a grounded answer with source
citations.

Example question for the API:
> "What are the main drivers of food insecurity in the Sahel region?"

Note: requires the `actiancortex` package and a running Actian Vector DB instance.

---

## 11. Generate a Report

> "Generate a report on Yemen."

Calls `GET /report?scope=country&iso3=YEM`, which uses Gemini 2.0 Flash to produce
a PDF intelligence brief covering funding requested vs received, coverage percentage,
and key crisis dynamics. The PDF downloads automatically.

> "Now generate a global report."

Calls `GET /report?scope=global`, producing a PDF summarizing the top 5 largest
funding gaps worldwide with analysis.

---

## 12. Reset and Wrap Up

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
| "Show me [month] [year]" | Change time period | Client-side only |
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
- Clicking any country (with or without crisis data) rotates the globe to center
  on it. Countries without crisis data will not open the detail overlay.
- Year/month navigation is voice-only -- there are no clickable controls on the globe.
