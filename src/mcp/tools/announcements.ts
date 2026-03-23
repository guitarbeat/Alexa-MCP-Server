import type { z } from 'zod';
import { AlexaAnnounceSchema } from '@/schemas/alexa';

/**
 * Sends a voice announcement to specific or all Alexa devices.
 *
 * @param args - The payload containing the message to announce and optional device names.
 * @param context - The context containing environment variables including `API_BASE`.
 * @returns The structured response to return to the MCP client.
 */
export async function announceAlexa(
  args: z.infer<typeof AlexaAnnounceSchema>,
  context: { env: Record<string, string | undefined> },
) {
  const { name, message } = args;
  const apiBase = context.env?.API_BASE;

  if (!apiBase) {
    return {
      content: [{ type: 'text' as const, text: 'Error: API_BASE not configured.' }],
      isError: true,
    };
  }

  try {
    const response = await fetch(`${apiBase}/api/announce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, message }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      return {
        content: [
          { type: 'text' as const, text: `Announcement failed: ${response.status} - ${errorText}` },
        ],
        isError: true,
      };
    }

    const result = (await response.json()) as any;
    return {
      content: [
        {
          type: 'text' as const,
          text: `Announcement sent successfully.\nStatus: ${result.status}\nDelivered: ${result.deliveredAt || 'N/A'}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Network error during announcement: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}
