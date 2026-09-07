type SmsRecipientResult = {
  number?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function normalizePhone(value: unknown) {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

/** Whether Africa's Talking accepted this recipient for processing. */
export function isSmsRecipientAccepted(response: unknown, phone: string) {
  const root = asRecord(response);
  const messageData = asRecord(root?.SMSMessageData);
  const recipients = Array.isArray(messageData?.Recipients)
    ? (messageData.Recipients as SmsRecipientResult[])
    : [];
  const requestedPhone = normalizePhone(phone);
  const recipient =
    recipients.find(
      (candidate) => normalizePhone(candidate.number) === requestedPhone,
    ) ?? (recipients.length === 1 ? recipients[0] : null);

  if (!recipient) return false;

  const statusCode = Number(recipient.statusCode);
  if ([100, 101, 102].includes(statusCode)) return true;

  const status =
    typeof recipient.status === "string"
      ? recipient.status.trim().toLowerCase()
      : "";
  return ["processed", "success", "sent", "queued"].includes(status);
}
