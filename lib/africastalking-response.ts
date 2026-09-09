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

export function smsRecipientOutcome(
  response: unknown,
  phone: string,
): "accepted" | "rejected" | "unknown" {
  const root = asRecord(response);
  const messageData = asRecord(root?.SMSMessageData);
  const recipients = Array.isArray(messageData?.Recipients)
    ? (messageData.Recipients as SmsRecipientResult[])
    : [];
  const requestedPhone = normalizePhone(phone);
  const recipient =
    recipients.find(
      (candidate) => normalizePhone(candidate.number) === requestedPhone,
    ) ??
    (recipients.length === 1 && !recipients[0]?.number ? recipients[0] : null);

  if (!recipient) return "unknown";

  const statusCode = Number(recipient.statusCode);
  if ([100, 101, 102].includes(statusCode)) return "accepted";

  const status =
    typeof recipient.status === "string"
      ? recipient.status.trim().toLowerCase()
      : "";
  if (["processed", "success", "sent", "queued"].includes(status))
    return "accepted";
  // Explicit rejections from AT's immediate response. RiskHold (401) and
  // internal/gateway errors (500/501) remain uncertain; do not infer non-delivery.
  // https://help.africastalking.com/en/articles/16150386-messaging-error-codes
  if ([402, 403, 404, 405, 406, 407, 502].includes(statusCode))
    return "rejected";
  return "unknown";
}

/** Whether Africa's Talking accepted this recipient for processing. */
export function isSmsRecipientAccepted(response: unknown, phone: string) {
  return smsRecipientOutcome(response, phone) === "accepted";
}
