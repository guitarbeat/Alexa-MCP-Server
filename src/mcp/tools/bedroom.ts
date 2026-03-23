/**
 * Retrieves the aggregated state of bedroom devices including temperature,
 * illuminance, motion sensors, and lighting statuses.
 *
 * @param _args - Unused tool arguments.
 * @param context - The context containing environment variables including `API_BASE`.
 * @returns The structured response summarizing the bedroom state for the MCP client.
 */
export async function getBedroomState(
  _args: unknown,
  context: { env: Record<string, string | undefined> },
) {
  const apiBase = context.env?.API_BASE;

  if (!apiBase) {
    return {
      content: [{ type: 'text' as const, text: 'Error: API_BASE not configured.' }],
      isError: true,
    };
  }

  try {
    const response = await fetch(`${apiBase}/api/bedroom`, { method: 'GET' });

    if (!response.ok) {
      return {
        content: [
          { type: 'text' as const, text: `Bedroom state lookup failed: ${response.status}` },
        ],
        isError: true,
      };
    }

    const state = (await response.json()) as any;

    // Use a descriptive summary for the model
    const motionStatus = state.motion?.detected ? 'Occupied' : 'Empty';
    const lightStatus = state.lighting?.isOn ? `ON (${state.lighting.brightness}%)` : 'OFF';

    const summary = [
      `Temperature: ${state.temperature?.fahrenheit ? `${Math.round(state.temperature.fahrenheit)}°F` : 'N/A'}`,
      `Illuminance: ${state.illuminance ? `${state.illuminance} lux` : 'N/A'}`,
      `Motion: ${motionStatus}`,
      `Light: ${lightStatus}`,
      `Last Updated: ${state.timestamp}`,
    ].join('\n');

    return {
      content: [
        {
          type: 'text' as const,
          text: summary,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Network error fetching bedroom state: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}
