export type PaymentFailureLocale = "fr" | "en";

export type PaymentFailure = {
  code: string;
  providerMessage: string | null;
};

export type PawaPayDepositStatusResult = {
  lookupStatus: "FOUND" | "NOT_FOUND" | null;
  deposit: Record<string, unknown> | null;
  status: string | null;
};

const GENERIC_FAILURE_CODE = "UNSPECIFIED_FAILURE";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function parseRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string") return asRecord(value);
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

/**
 * Normalize both the PawaPay v2 status envelope and the legacy/direct shapes.
 * V2 returns `{ status: "FOUND", data: Deposit }` or `{ status: "NOT_FOUND" }`.
 */
export function parsePawaPayDepositStatus(
  payload: unknown,
): PawaPayDepositStatusResult {
  const candidate = Array.isArray(payload) ? payload[0] : payload;
  const root = parseRecord(candidate);
  if (!root) return { lookupStatus: null, deposit: null, status: null };

  const outerStatus =
    typeof root.status === "string" ? root.status.trim().toUpperCase() : "";
  if (outerStatus === "NOT_FOUND") {
    return { lookupStatus: "NOT_FOUND", deposit: null, status: "NOT_FOUND" };
  }
  if (outerStatus === "FOUND") {
    const deposit = asRecord(root.data);
    const status =
      typeof deposit?.status === "string"
        ? deposit.status.trim().toUpperCase()
        : typeof deposit?.depositStatus === "string"
          ? deposit.depositStatus.trim().toUpperCase()
          : null;
    return { lookupStatus: "FOUND", deposit, status };
  }

  const directStatus =
    outerStatus ||
    (typeof root.depositStatus === "string"
      ? root.depositStatus.trim().toUpperCase()
      : "");
  return {
    lookupStatus: null,
    deposit: root,
    status: directStatus || null,
  };
}

function reasonFrom(value: unknown): PaymentFailure | null {
  const record = parseRecord(value);
  if (!record) return null;

  const code =
    typeof record.failureCode === "string"
      ? record.failureCode.trim().toUpperCase()
      : "";
  const providerMessage =
    typeof record.failureMessage === "string"
      ? record.failureMessage.trim()
      : null;

  if (!code && !providerMessage) return null;
  return { code: code || GENERIC_FAILURE_CODE, providerMessage };
}

/** Extract the v2 failureReason regardless of which PawaPay response path stored it. */
export function extractPaymentFailure(payload: unknown): PaymentFailure {
  const root = parseRecord(payload);
  if (!root) return { code: GENERIC_FAILURE_CODE, providerMessage: null };

  const details = asRecord(root.details);
  const metadata = asRecord(root.metadata);
  const pawapay = asRecord(metadata?.pawapay) ?? asRecord(root.pawapay);

  const candidates = [
    root.failureReason,
    details?.failureReason,
    pawapay?.failureReason,
    root.failure_reason,
    metadata?.failureReason,
  ];

  for (const candidate of candidates) {
    const failure = reasonFrom(candidate);
    if (failure) return failure;
  }

  const directCode =
    typeof root.failureCode === "string"
      ? root.failureCode.trim().toUpperCase()
      : typeof root.failure_code === "string"
        ? root.failure_code.trim().toUpperCase()
        : "";

  return {
    code: directCode || GENERIC_FAILURE_CODE,
    providerMessage:
      typeof root.failure_message === "string" ? root.failure_message : null,
  };
}

export function extractPaymentPayerPhone(payload: unknown): string | null {
  const root = parseRecord(payload);
  if (!root) return null;
  const metadata = asRecord(root.metadata);
  const pawapay = asRecord(metadata?.pawapay) ?? asRecord(root.pawapay);

  for (const source of [root, pawapay]) {
    const payer = asRecord(source?.payer);
    const accountDetails = asRecord(payer?.accountDetails);
    if (typeof accountDetails?.phoneNumber === "string") {
      return accountDetails.phoneNumber;
    }
  }
  return typeof root.payer_phone === "string" ? root.payer_phone : null;
}

/**
 * PawaPay documents HTTP 5xx + UNKNOWN_ERROR as an indeterminate initiation:
 * the deposit may still have reached them and must be reconciled by deposit ID.
 */
export function isUncertainPaymentInitiationFailure(
  httpStatus: number,
  payload: unknown,
) {
  return (
    httpStatus >= 500 &&
    extractPaymentFailure(payload).code === "UNKNOWN_ERROR"
  );
}

const TERMINAL_PAYMENT_STATUSES = new Set([
  "completed",
  "failed",
  "refunded",
]);

/** Prevent delayed callbacks from regressing a deposit that already settled. */
export function shouldApplyPaymentStatus(
  currentStatus: string | null | undefined,
  nextStatus: string | null | undefined,
) {
  const current = currentStatus?.trim().toLowerCase() ?? "";
  const next = nextStatus?.trim().toLowerCase() ?? "";
  if (!TERMINAL_PAYMENT_STATUSES.has(current)) return true;
  if (current === next) return true;
  return current === "completed" && next === "refunded";
}

const RETRYABLE_NOTIFICATION_REASONS = new Set([
  "claim_failed",
  "sms_claim_failed",
  "push",
  "sms",
]);

export function shouldRetryPaymentFailureNotification(result: {
  delivered: boolean;
  reason: string;
}) {
  return (
    !result.delivered && RETRYABLE_NOTIFICATION_REASONS.has(result.reason)
  );
}

const FAILURE_MESSAGES: Record<
  string,
  Record<PaymentFailureLocale, string>
> = {
  INSUFFICIENT_BALANCE: {
    fr: "Solde Mobile Money insuffisant. Approvisionnez le compte puis réessayez.",
    en: "Your Mobile Money balance is insufficient. Add funds and try again.",
  },
  PAYMENT_NOT_APPROVED: {
    fr: "Le paiement n'a pas été autorisé. Réessayez et confirmez la demande sur votre téléphone.",
    en: "The payment was not authorized. Try again and approve the request on your phone.",
  },
  PAYMENT_IN_PROGRESS: {
    fr: "Un autre paiement est encore en cours. Attendez quelques minutes puis réessayez.",
    en: "Another payment is still in progress. Wait a few minutes and try again.",
  },
  PAYER_NOT_FOUND: {
    fr: "Ce numéro ne correspond pas à l'opérateur choisi. Vérifiez le numéro et réessayez.",
    en: "This number does not match the selected provider. Check the number and try again.",
  },
  PROVIDER_TEMPORARILY_UNAVAILABLE: {
    fr: "L'opérateur Mobile Money est temporairement indisponible. Réessayez plus tard.",
    en: "The Mobile Money provider is temporarily unavailable. Try again later.",
  },
};

const GENERIC_MESSAGES: Record<PaymentFailureLocale, string> = {
  fr: "Le paiement a échoué. Vérifiez les informations puis réessayez.",
  en: "The payment failed. Check the details and try again.",
};

export function paymentFailureMessage(
  failureCode: string | null | undefined,
  locale: PaymentFailureLocale = "fr",
) {
  const code = failureCode?.trim().toUpperCase() || GENERIC_FAILURE_CODE;
  return FAILURE_MESSAGES[code]?.[locale] ?? GENERIC_MESSAGES[locale];
}

export function paymentFailureTitle(locale: PaymentFailureLocale = "fr") {
  return locale === "en" ? "Payment failed" : "Paiement échoué";
}

export function paymentFailureSmsMessage(
  failureCode: string | null | undefined,
  locale: PaymentFailureLocale = "fr",
) {
  const prefix =
    locale === "en"
      ? "Roogo: payment failed. "
      : "Roogo: paiement echoue. ";
  return `${prefix}${paymentFailureMessage(failureCode, locale)}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
