// Splits the assistant's reply while it streams: the prose for the bubble and
// the script for a live card, so the script appears as it is written instead
// of all at once at the end.

export type StreamSplit = {
  /** Text outside the script block, for the chat bubble. */
  prose: string;
  /** The script written so far, or null if no script block has started. */
  script: string | null;
  /** True once the closing fence has arrived. */
  scriptDone: boolean;
};

const OPEN = /```script[^\n]*\n?/i;

export function splitStreaming(text: string): StreamSplit {
  const open = text.match(OPEN);
  if (!open || open.index === undefined) {
    // Hide a fence that is still arriving ("``", "```scr") so it never flashes.
    return { prose: text.replace(/`{1,3}[a-z]*$/i, "").trim(), script: null, scriptDone: false };
  }
  const before = text.slice(0, open.index);
  const rest = text.slice(open.index + open[0].length);
  const close = rest.indexOf("```");
  if (close === -1) {
    return { prose: before.trim(), script: rest.replace(/`{1,2}$/, ""), scriptDone: false };
  }
  const after = rest.slice(close + 3);
  return { prose: `${before}${after}`.trim(), script: rest.slice(0, close).trim(), scriptDone: true };
}
