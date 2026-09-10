type ExpoPushTicket = {
  status?: unknown;
  details?: unknown;
};

function getTickets(response: unknown): ExpoPushTicket[] {
  if (!response || typeof response !== "object") return [];
  const data = (response as { data?: unknown }).data;
  return (Array.isArray(data) ? data : data ? [data] : []) as ExpoPushTicket[];
}

/** Whether Expo accepted at least one target for downstream delivery. */
export function isExpoPushResponseAccepted(response: unknown) {
  return getTickets(response).some(
    (ticket) =>
      typeof ticket?.status === "string" &&
      ticket.status.trim().toLowerCase() === "ok",
  );
}

export function isExpoPushResponseRejected(
  response: unknown,
  targetCount: number,
) {
  const tickets = getTickets(response);
  return (
    targetCount > 0 &&
    tickets.length === targetCount &&
    tickets.every((ticket) => ticket?.status === "error")
  );
}

/** Tokens Expo has definitively rejected and that must no longer be used. */
export function getInvalidExpoPushTokens(response: unknown, tokens: string[]) {
  return getTickets(response).flatMap((ticket, index) => {
    const details =
      ticket.details && typeof ticket.details === "object"
        ? (ticket.details as { error?: unknown })
        : null;
    const unregistered =
      typeof ticket.status === "string" &&
      ticket.status.trim().toLowerCase() === "error" &&
      details?.error === "DeviceNotRegistered";
    return unregistered && tokens[index] ? [tokens[index]] : [];
  });
}
