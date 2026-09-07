export type PaymentFailureLocale = "fr" | "en";

export type PaymentFailure = {
  code: string;
  providerMessage: string | null;
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
