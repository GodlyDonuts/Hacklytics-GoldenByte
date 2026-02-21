# Agentic Voice & Globe Features (IDEAS)

Here are several ideas to make Pablo the Voice Agent more powerful, agentic, and deeply integrated into the 3D interactive globe experience. 

## 1. Advanced Agentic Tooling for Pablo

**Current State:** Pablo can move the camera.
**Future State:** Pablo controls visualization modes, filters data, and acts as an autonomous analyst.

*   **Change Visualization Layers:** Give Pablo a tool to switch the globe view. E.g., User says "Show me the climate anomalies map", and Pablo calls `switch_layer({ layer: "heat_map", metric: "anomalies" })`. 
*   **Time-Travel filtering:** Create a tool that allows Pablo to change the dataset's chronological year. "Pablo, show me how Afghanistan looked in 2015" `change_year({ year: 2015 })`.
*   **Autonomous Data Summarization:** Give Pablo a tool that fetches the raw JSON stats for a country the user is hovering over, so he can dynamically read the latest data to the user without needing it pre-prompted. `get_country_stats({ iso3: "AFG" })`.
*   **Sequential Storytelling:** Pablo could be given a `guided_tour` tool. When asked, he can automatically fly from country to country (e.g., from Yemen to Sudan to Syria), pausing at each, zooming in, and narrating the current crisis stats sequentially.

## 2. Interactive Globe Enhancements

**Current State:** The globe visualizes data static points and handles clicks.
**Future State:** The globe reacts to the data dynamically and creates a more immersive visual experience.

*   **Data-Driven Arc Connections:** Use `react-globe.gl`'s `arcsData`. If there's a relationship between two countries (e.g., funding flows, refugee migration from crisis zones), animate glowing arcs between them.
*   **Real-time Event Webhooks:** Instead of static data, connect the globe to a live crisis data feed (like GDACS or ReliefWeb RSS). When a new high-severity event occurs, automatically spawn a pulsing point on the map and have Pablo notify the user: "Alert: A new flood has just been reported in Bangladesh."
*   **Dynamic Polygon Altitudes:** Instead of a flat world surface, extrapolate the `mismatch_score` or `severity_score` to raise the 3D polygon height of a country, creating a literal "topography of crisis". A country in severe need with zero funding would physically protrude higher out of the globe.
*   **Atmospheric Context:** When zooming into a severe crisis zone, modify the globe's atmosphere color (e.g., from the default blue glow to a subtle red/orange tint) to subconsciously indicate the severity of the region being viewed.

## 3. UI/UX "Magic" Integrations

*   **Gaze/Hover Narration:** If the user clicks on a country, pass that country's ID back to Pablo via ElevenLabs's conversation context API. Pablo can then proactively say "Ah, you're looking at Sudan. Did you know..." without the user having to press space and ask.
*   **Screenshot & Report Generation:** Give Pablo a tool to `generate_report()`. If the user has heavily filtered the map and says "Pablo, save this for my presentation", Pablo could trigger a frontend function to take a canvas `.toDataURL()` snapshot of the globe, package it with his current context, and export a PDF.
