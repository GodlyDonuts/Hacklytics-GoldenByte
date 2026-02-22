# Pablo's Abilities

Pablo is the interactive ElevenLabs voice agent powering the Crisis Topography Command Center. He acts as an intelligent copilot, able to directly manipulate the 3D globe and generate insights based on the user's voice commands.

## Current Abilities

1. **`show_location_on_globe`**
   - **Description**: Moves the globe's camera to a specific latitude and longitude.
   - **Usage**: "Pablo, take me to Sudan."
   - **Action**: Smoothly animates the 3D globe to center on the requested coordinates at a closer altitude.

2. **`change_view_mode`**
   - **Description**: Switches the primary visualization metric on the Heatmap layer.
   - **Usage**: "Show me the worst funding gaps."
   - **Action**: Changes the view mode to `severity`, `funding-gap`, or `anomalies`.

3. **`compare_countries`**
   - **Description**: Compares the metrics between two countries and visually connects them.
   - **Usage**: "How does Ukraine compare to Afghanistan?"
   - **Action**: Aggregates data for both countries, draws a glowing comparison arc between them, and adjusts the viewport to frame both.

## New/Planned Abilities

4. **`reset_view`**
   - **Description**: Zooms the globe back out to a high-level planetary view.
   - **Usage**: "Zoom out" or "Show me the whole world."
   - **Action**: Resets the camera altitude, pulling back to show the full globe.

5. **`generate_report`**
   - **Description**: Generates a detailed, two-page PDF report using Gemini AI based on the current context.
   - **Usage**: "Generate a report for my presentation."
   - **Action**: 
     - If focused on a specific country, it generates a deep-dive report on that country's crisis and funding mismatch.
     - If zoomed out (global focus), it generates a comprehensive global summary of the worst crises and anomalies.
     - Triggers a browser download of the generated PDF.

6. **`navigate_to_page`**
   - **Description**: Switches the user's current view between the 3D globe and the unified dashboard.
   - **Usage**: "Show me the dashboard" or "Go back to the globe."
   - **Action**: Uses the browser router to change paths without refreshing the session.
