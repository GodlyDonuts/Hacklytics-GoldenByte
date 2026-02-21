# Adding `change_view_mode` tool in ElevenLabs

1. Log in to your [ElevenLabs Dashboard](https://elevenlabs.io/).
2. Go to **Agents** and select the agent you are using for Pablo (`agent_1201khzd23t9fsaramppkhnftan0`).
3. Under the agent settings, navigate to the **Tools** or **Actions** section.
4. Click **Add Tool** or **Create Tool** (usually "Client Tool" since the frontend handles it).
5. Set the **Tool Name** exactly as:
   `change_view_mode`
6. Set the **Description** to tell Pablo what this does:
   `Allows the agent to change the globe's visualization mode to show severity, the funding gap, or anomalies based on the user's request.`
7. Add the required **Parameter**:
   *   **Name**: `mode`
   *   **Type**: `string`
   *   **Description**: `The visual mode to change to. Must be exactly one of: 'severity', 'funding-gap', or 'anomalies'.`
   *   *(Optional but recommended)* Provide the allowed ENUM values: `["severity", "funding-gap", "anomalies"]`
8. **Save** the tool and then **Save** the Agent settings.

Once saved, Pablo will know he has this capability and will send the `change_view_mode` tool call to your frontend when a user asks to see different maps.
