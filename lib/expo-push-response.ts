type ExpoPushTicket = {
  status?: unknown;
};

/** Whether Expo accepted at least one target for downstream delivery. */
export function isExpoPushResponseAccepted(response: unknown) {
  if (!response || typeof response !== "object") return false;
  const data = (response as { data?: unknown }).data;
  const tickets = (Array.isArray(data) ? data : data ? [data] : []) as ExpoPushTicket[];
  return tickets.some(
    (ticket) =>
      typeof ticket?.status === "string" &&
      ticket.status.trim().toLowerCase() === "ok",
  );
}
