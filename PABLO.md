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
   - **Configuration (ElevenLabs JSON)**:
     ```json
     {
       "parameters": [
         {
           "id": "page",
           "name": "Page Name",
           "description": "The page to navigate to ('globe' or 'dashboard')",
           "type": "string",
           "required": true
         }
       ]
     }
     ```

7. **`set_time_period`**
   - **Description**: Changes the active year and/or month for the crisis data dashboard.
   - **Usage**: "Pablo, set the date to October" or "Change the year to 2025."
   - **Action**: 
     - Updates the global filters for year and month.
     - If only the month is mentioned, the year remains unchanged.
     - Year must be between 2022 and 2026.
   - **Configuration (ElevenLabs JSON)**:
     ```json
     {
       "parameters": [
         {
           "id": "year",
           "name": "Year",
           "description": "The 4-digit year (optional, 2022-2026).",
           "type": "integer",
           "required": false
         },
         {
           "id": "month",
           "name": "Month",
           "description": "The month number (optional, 1=Jan, 12=Dec).",
           "type": "integer",
           "required": false
         }
       ]
     }
     ```

8. **`run_predictive_scan`**
   - **Description**: Triggers a global intelligence scan to identify future crisis risks using the Actian Vector DB.
   - **Usage**: "Pablo, scan for future anomalies" or "Run a predictive intelligence scan."
   - **Action**: 
     - Switches the globe to predictive mode.
     - Fetches high-confidence risks from the vector database.
     - Narrates the top identified anomaly.
   - **Configuration (ElevenLabs JSON)**:
     ```json
     {
       "parameters": []
     }
     ```
