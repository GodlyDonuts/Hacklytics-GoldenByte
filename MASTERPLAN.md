# 🌐 CRISIS TOPOGRAPHY COMMAND CENTER: THE ULTIMATE MASTERPLAN

## 🏆 EXECUTIVE VISION
Humanitarian aid is broken. Billions of dollars are allocated yearly, not based on calculated systemic need or long-term safety projections, but largely driven by reactive media sentiment. Overlooked crises deepen while well-publicized ones receive disproportionate capital.

The **Crisis Topography Command Center** is built to solve this. It is a fully interactive, 3D spatial intelligence system designed to treat global humanitarian aid as a *Quantitative Capital Allocation Problem*. By leveraging advanced Vector Intelligence and Generative AI, we transform raw, disjointed OCHA and HDX data into a visceral, predictive command interface.

This is not just a dashboard; it is the control room of the future. This project is engineered exclusively to dominate the **Best Overall**, **Finance**, **Pure Imagination**, and **SafetyKit/Actian** tracks at Hacklytics 2026.

---

## 🎯 TRACK PURSUIT STRATEGIES

### 1. BEST OVERALL (The "Wow" Factor)
**The Philosophy:** A hackathon winner must be immediately impressive, technically dense, but intuitively understandable within 30 seconds.
**The Execution:**
*   **The Spatial UI:** A cutting-edge Next.js + Three.gl WebGL 3D globe interface. It feels like software from a sci-fi film.
*   **The Agentic Experience (Pablo):** A fully conversational AI (ElevenLabs + Gemini) that doesn't just answer questions, but actively "drives" the UI, flying the user around the world and changing visualization modes dynamically.
*   **Aesthetic Dominance:** The "Aurora" design system—midnight dark modes, glassmorphic overlays, and multi-phase gradient routing that ensures the app looks like a multi-million-dollar Enterprise SaaS product.

### 2. PURE IMAGINATION (Visceral Data Representation)
**The Philosophy:** We do not read data; we *feel* data.
**The Execution:**
*   **Topographic Mismatch (Dynamic Polygons):** Instead of a flat heatmap, the globe physically alters its geometry. Countries suffering from high severity but possessing low funding "protrude" out of the earth. We are literally mapping the topography of suffering.
*   **Atmospheric Resonance:** The atmosphere of the globe itself reacts to the user's cursor. Hovering over a critically underfunded region shifts the global atmospheric glow from a serene blue to an urgent, warning amber.
*   **Data-Driven Arcs:** When comparing two nations, smooth, glowing arcs shoot across the planet, physically tying the data narratives together.

### 3. FINANCE (The "Humanitarian ROI")
**The Philosophy:** Treat aid like a hedge fund treats capital. Find the inefficiencies in the market.
**The Execution:**
*   **The Massive Dashboard (`/dashboard`):** We are ditching the traditional "KPI boxes" for a heavy, chart-dominant financial terminal interface built with Recharts/Chart.js.
*   **Humanitarian Risk Index (HRI):** A complex, bespoke metric calculating the exact "Volatility of Funding" versus "Cluster-Specific Needs" (e.g., Water & Sanitation vs. Protection).
*   **Capital Gap Visualization:** Massive scatter plots mapping the precise millions needed vs. severity, allowing UN officers to identify the exact "High-Yield Humanitarian Interventions" (where $1M saves the most lives).
*   **Benchmarking (Actian VectorDB):** By vectorizing 8,000 past projects, we allow users to click an underfunded crisis and instantly say, "Show me 5 successful comparable projects in this typography to prove this intervention works."

### 4. SAFETYKIT & ACTIAN VECTOR DB (Predictive Intelligence)
**The Philosophy:** Stop reacting to crises. Start predicting them before people die.
**The Execution:**
*   **Safety Anomaly Detection (Dashboard):** We use Actian VectorDB to surface anomalies in historical project data—specifically flagging projects with "Unusually high or low beneficiary-to-budget ratios." Are these corrupt allocations or signs of extreme desperation? The UI highlights them for investigation.
*   **Predictive Risk Alerts (The Globe Mode):** A revolutionary new view mode on the 3D globe. Instead of plotting current data, we pass Actian anomalies through Gemini AI. Gemini analyzes the vectors and projects *future* safety risks (e.g., "Vector anomaly detected in border funding: 82% risk of mass migration event in 6 months"). These alerts flash directly as 3D markers on the physical globe.

---

## 🏗️ SYSTEM ARCHITECTURE & ENGINEERING

### The Data Layer (Databricks + Vultr)
*   **Ingestion Pipeline:** Python scripts pulling real-time HDX HAPI v2 and HPC Tools data.
*   **Transformation:** Databricks processes the raw JSON into normalized, relational structures.
*   **Vectorization (`sentence-transformers`):** Over 8,000 project descriptions are vectorized alongside their budget ratios to create semantic embeddings.
*   **Actian VectorDB on Vultr:** The embeddings are loaded into a self-hosted Actian instance running on high-compute Vultr nodes for sub-100ms similarity searches.

### The Application Backend (FastAPI)
*   **Concurrency:** Built on FastAPI (Python 3.11) to handle rapid simultaneous requests from the globe mapping thousands of polygons.
*   **The Mismatch Engine (`services/mismatch_engine.py`):** The core algorithmic brain calculating the HRI and Severity-Gap ratios.
*   **Gemini Integration:** Endpoints designed explicitly to ingest current globe context and return structured JSON risk assessments or PDF reports.

### The Client Frontend (Next.js 14)
*   **Performance:** Utilizing React Server Components where possible, isolating the heavy WebGL components to client boundaries.
*   **State Management:** Complex Context API (`GlobeContext`) perfectly syncing the state of the 3D camera, the UI overlays, the current Data filters, and Pablo's conversational awareness.
*   **3D Rendering:** `react-globe.gl` deeply customized via Three.js hooks to manipulate polygon altitudes, colors, and camera tweening on raw data changes.

---

## 🚀 ROADMAP & EXECUTION PHASES

### PHASE 1: Data & Visualization Core (✅ COMPLETED)
*   ETL pipelines established from UN HDX to backend.
*   Base 3D globe configured with interactive polygons.
*   ElevenLabs WebRTC wrapper integrated.

### PHASE 2: The UI/UX "Wow" Factor (🚧 IN PROGRESS)
*   **Atmospheric Glow:** Refactor `GlobeView.tsx` so the globe's atmosphere pulses red when hovering over severe zones.
*   **Topographic Extrusion:** Finalize the algorithm that mathematically ties funding gap to 3D polygon height.
*   **Phase-Shift Theming:** Ensure the sleek, dark-mode gradient aesthetic is uniform across all modals and sliders.

### PHASE 3: The "Finance" Dashboard Rewrite (⏳ PENDING)
*   Completely wipe the current `/dashboard`.
*   Build a massive grid system.
*   Implement heavy scatter plots representing the Humanitarian Risk Index.
*   Build the Actian VectorDB query component mapping similar projects by ROI.

### PHASE 4: Safety Predictive Modes (⏳ PENDING)
*   Add the "Predictive Risk Alert" toggle to `GlobeControls.tsx`.
*   Connect the Globe Context to a Gemini inference endpoint.
*   Overlay AI-generated warning text and anomaly highlight markers directly over the countries on the 3D map.

### PHASE 5: Presentation Polish (⏳ FINAL)
*   Record a flawless 2-minute demonstration video highlighting Pablo driving the UI to find a severe, overlooked crisis, analyzing the anomalies, and generating a report based on the Vector search.
*   Update individual component READMEs indicating exactly which Hacklytics Track the code satisfies.

---
> "The map is not the territory. But a predictive, intelligent map can save the territory before it burns."
