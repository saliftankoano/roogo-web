// Small helpers for streaming: our own server-sent events to the browser, and
// reading the model provider's stream.

export type SseEvent = { event: string; data: unknown };

export function encodeSse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Splits a buffer of server-sent events into complete events and the rest.
 * The rest is the incomplete tail to prepend to the next chunk.
 */
export function parseSseBuffer(buffer: string): {
  events: SseEvent[];
  rest: string;
} {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  const events: SseEvent[] = [];
  for (const part of parts) {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of part.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (!dataLines.length) continue;
    try {
      events.push({ event, data: JSON.parse(dataLines.join("\n")) });
    } catch {
      // Ignore a malformed event rather than breaking the stream.
    }
  }
  return { events, rest };
}

/** The text delta of one OpenAI chat-completions stream line, if any. */
export function openAiDelta(line: string): string | "[DONE]" | null {
  if (!line.startsWith("data:")) return null;
  const payload = line.slice(5).trim();
  if (payload === "[DONE]") return "[DONE]";
  try {
    const json = JSON.parse(payload) as {
      choices?: Array<{ delta?: { content?: string | null } }>;
    };
    return json.choices?.[0]?.delta?.content ?? null;
  } catch {
    return null;
  }
}
