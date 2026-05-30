import type { SupabaseClient } from "@supabase/supabase-js";
import { JOURNALIER_LISTING_PUBLICATION_FEE } from "@/lib/journalier-pricing";

export const REFERRAL_DISCOUNT_BPS = 500;
export const REFERRAL_COMMISSION_BPS = 500;
export const REFERRAL_CURRENCY = "XOF";

export type ReferralValidationResult = {
  id: string;
  userId: string;
  code: string;
  displayName: string | null;
};

export type ListingQuoteInput = {
  tierId?: string | null;
  addOns?: string[] | null;
  frequence?: string | null;
  monthlyRent?: number | null;
};

export type ListingReferralQuote = {
  tierId: string | null;
  baseFee: number;
  addOnsTotal: number;
  commissionAmount: number;
  originalAmount: number;
  monthlyRent: number;
  frequence: "mensuel" | "journalier";
};

export type AppliedReferral = {
  profile: ReferralValidationResult;
  originalAmount: number;
  discountAmount: number;
  paidAmount: number;
  commissionAmount: number;
};

export class ReferralValidationError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "ReferralValidationError";
    this.code = code;
    this.status = status;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function uniqueStrings(values: string[] | null | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean),
    ),
  );
}

function toWholeXof(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
}

export function normalizeReferralCode(code: unknown): string {
  if (typeof code !== "string") return "";
  return code.trim().replace(/\s+/g, "-").toUpperCase();
}

function codeBaseFromUser(user: {
  full_name?: string | null;
  email?: string | null;
}): string {
  const raw = user.full_name || user.email?.split("@")[0] || "PRO";
  const ascii = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 8);
  return ascii || "PRO";
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 5).toUpperCase();
}

export async function generateReferralCode(
  supabase: SupabaseClient,
  user: { full_name?: string | null; email?: string | null },
): Promise<string> {
  const base = codeBaseFromUser(user);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = `ROOGO-${base}-${randomSuffix()}`;
    const { data } = await supabase
      .from("referrer_profiles")
      .select("id")
      .eq("code", code)
      .maybeSingle();

    if (!data) return code;
  }

  return `ROOGO-${base}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}

export async function computeListingSubmissionQuote(
  supabase: SupabaseClient,
  input: ListingQuoteInput,
): Promise<ListingReferralQuote> {
  const frequence =
    input.frequence === "journalier" ? "journalier" : "mensuel";
  const addOns = uniqueStrings(input.addOns);

  let addOnsTotal = 0;
  if (addOns.length > 0) {
    const { data: addonsData, error: addonsError } = await supabase
      .from("listing_addons")
      .select("id, price")
      .in("id", addOns)
      .eq("active", true);

    if (addonsError) throw addonsError;
    addOnsTotal = (addonsData || []).reduce(
      (sum, addon) => sum + toWholeXof(addon.price),
      0,
    );
  }

  if (frequence === "journalier") {
    return {
      tierId: input.tierId || "essentiel",
      baseFee: JOURNALIER_LISTING_PUBLICATION_FEE,
      addOnsTotal,
      commissionAmount: 0,
      originalAmount: JOURNALIER_LISTING_PUBLICATION_FEE + addOnsTotal,
      monthlyRent: 0,
      frequence,
    };
  }

  if (!input.tierId) {
    throw new ReferralValidationError(
      "missing_tier",
      "Pack de publication manquant.",
    );
  }

  const monthlyRent = toWholeXof(input.monthlyRent);
  if (monthlyRent <= 0) {
    throw new ReferralValidationError(
      "missing_monthly_rent",
      "Loyer mensuel manquant pour calculer le parrainage.",
    );
  }

  const [{ data: tier, error: tierError }, { data: config, error: configError }] =
    await Promise.all([
      supabase
        .from("listing_tiers")
        .select("id, min_price")
        .eq("id", input.tierId)
        .maybeSingle(),
      supabase
        .from("listing_config")
        .select("commission_percentage")
        .eq("id", "default")
        .maybeSingle(),
    ]);

  if (tierError) throw tierError;
  if (!tier) {
    throw new ReferralValidationError("invalid_tier", "Pack invalide.");
  }
  if (configError) throw configError;

  const commissionPercentage = Number(config?.commission_percentage);
  if (!Number.isFinite(commissionPercentage)) {
    throw new ReferralValidationError(
      "missing_commission_config",
      "Commission non configuree.",
      500,
    );
  }

  const baseFee = toWholeXof(tier.min_price);
  const commissionAmount = Math.round(monthlyRent * commissionPercentage);

  return {
    tierId: tier.id,
    baseFee,
    addOnsTotal,
    commissionAmount,
    originalAmount: baseFee + commissionAmount + addOnsTotal,
    monthlyRent,
    frequence,
  };
}

export async function validateReferralForUser(
  supabase: SupabaseClient,
  params: {
    code: unknown;
    referredUserId: string;
    referredUserType: string | null | undefined;
  },
): Promise<ReferralValidationResult> {
  const code = normalizeReferralCode(params.code);
  if (!code) {
    throw new ReferralValidationError(
      "missing_code",
      "Code de parrainage manquant.",
    );
  }

  if (
    !["owner", "agent", "staff", "founder", "admin"].includes(
      params.referredUserType || "",
    )
  ) {
    throw new ReferralValidationError(
      "invalid_user_type",
      "Le code est réservé aux propriétaires, agents, staff et fondateurs.",
      403,
    );
  }

  const { data: profile, error } = await supabase
    .from("referrer_profiles")
    .select("id, user_id, code, status, legal_name, users:user_id(full_name, email)")
    .eq("code", code)
    .maybeSingle();

  if (error) throw error;
  if (!profile) {
    throw new ReferralValidationError(
      "invalid_code",
      "Code de parrainage invalide.",
      404,
    );
  }
  if (profile.status !== "approved") {
    throw new ReferralValidationError(
      "inactive_code",
      "Ce code n'est pas actif.",
      403,
    );
  }
  if (profile.user_id === params.referredUserId) {
    throw new ReferralValidationError(
      "self_referral",
      "Vous ne pouvez pas utiliser votre propre code.",
    );
  }

  const { data: existing, error: existingError } = await supabase
    .from("referral_redemptions")
    .select("id")
    .eq("referred_user_id", params.referredUserId)
    .eq("status", "qualified")
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) {
    throw new ReferralValidationError(
      "already_used",
      "Un code de parrainage a deja ete utilise pour ce compte.",
    );
  }

  const joinedUser = Array.isArray(profile.users)
    ? profile.users[0]
    : profile.users;
  const userRecord = asRecord(joinedUser);
  const displayName =
    (typeof userRecord?.full_name === "string" && userRecord.full_name) ||
    (typeof profile.legal_name === "string" && profile.legal_name) ||
    null;

  return {
    id: profile.id,
    userId: profile.user_id,
    code: profile.code,
    displayName,
  };
}

export function applyReferralToQuote(
  quote: ListingReferralQuote,
  profile: ReferralValidationResult,
): AppliedReferral {
  const discountAmount = Math.round(
    (quote.originalAmount * REFERRAL_DISCOUNT_BPS) / 10000,
  );
  const paidAmount = Math.max(0, quote.originalAmount - discountAmount);
  const commissionAmount = Math.round(
    (paidAmount * REFERRAL_COMMISSION_BPS) / 10000,
  );

  return {
    profile,
    originalAmount: quote.originalAmount,
    discountAmount,
    paidAmount,
    commissionAmount,
  };
}

export function buildReferralMetadata(referral: AppliedReferral | null) {
  if (!referral) return {};
  return {
    referralCode: referral.profile.code,
    referralProfileId: referral.profile.id,
    originalAmount: referral.originalAmount,
    discountAmount: referral.discountAmount,
    paidAmount: referral.paidAmount,
    referralOriginalAmount: referral.originalAmount,
    referralDiscountAmount: referral.discountAmount,
    referralPaidAmount: referral.paidAmount,
    referralCommissionAmount: referral.commissionAmount,
  };
}

export function getReferralMetadata(metadata: unknown) {
  const data = asRecord(metadata);
  if (!data) return null;
  const profileId =
    typeof data.referralProfileId === "string" ? data.referralProfileId : null;
  const code =
    typeof data.referralCode === "string"
      ? normalizeReferralCode(data.referralCode)
      : "";
  if (!profileId || !code) return null;

  return {
    profileId,
    code,
    originalAmount: toWholeXof(
      data.referralOriginalAmount ?? data.originalAmount,
    ),
    discountAmount: toWholeXof(
      data.referralDiscountAmount ?? data.discountAmount,
    ),
    paidAmount: toWholeXof(data.referralPaidAmount ?? data.paidAmount),
    commissionAmount: toWholeXof(data.referralCommissionAmount),
  };
}

export async function createPendingReferralRedemption(
  supabase: SupabaseClient,
  params: {
    referral: AppliedReferral | null;
    referredUserId: string;
    transactionId: string;
  },
) {
  if (!params.referral || params.referral.originalAmount <= 0) return;

  const { error } = await supabase.from("referral_redemptions").upsert(
    {
      referrer_profile_id: params.referral.profile.id,
      referred_user_id: params.referredUserId,
      code_used: params.referral.profile.code,
      transaction_id: params.transactionId,
      original_amount: params.referral.originalAmount,
      discount_amount: params.referral.discountAmount,
      paid_amount: params.referral.paidAmount,
      status: "pending_payment",
    },
    { onConflict: "transaction_id" },
  );

  if (error) throw error;
}

export async function voidPendingReferralForTransaction(
  supabase: SupabaseClient,
  transactionId: string,
) {
  if (!transactionId) return;

  const { error } = await supabase
    .from("referral_redemptions")
    .update({
      status: "void",
      updated_at: new Date().toISOString(),
    })
    .eq("transaction_id", transactionId)
    .eq("status", "pending_payment");

  if (error) throw error;
}

export async function qualifyReferralForTransaction(
  supabase: SupabaseClient,
  params: { depositId: string; propertyId: string },
) {
  const { data: transaction, error: transactionError } = await supabase
    .from("transactions")
    .select("id, user_id, status, metadata, amount, currency")
    .eq("deposit_id", params.depositId)
    .maybeSingle();

  if (transactionError) throw transactionError;
  if (!transaction || transaction.status !== "completed") {
    return { qualified: false };
  }

  const metadata = getReferralMetadata(transaction.metadata);
  if (!metadata) return { qualified: false };

  const { data: existingQualified, error: existingQualifiedError } =
    await supabase
      .from("referral_redemptions")
      .select("id, transaction_id")
      .eq("referred_user_id", transaction.user_id)
      .eq("status", "qualified")
      .maybeSingle();

  if (existingQualifiedError) throw existingQualifiedError;
  if (
    existingQualified &&
    existingQualified.transaction_id !== transaction.id
  ) {
    await voidPendingReferralForTransaction(supabase, transaction.id);
    return { qualified: false };
  }

  const redemptionResult = await supabase
    .from("referral_redemptions")
    .select("id, status, referrer_profile_id, paid_amount")
    .eq("transaction_id", transaction.id)
    .maybeSingle();
  let redemption = redemptionResult.data;

  if (redemptionResult.error) throw redemptionResult.error;

  if (!redemption) {
    const { data: inserted, error: insertError } = await supabase
      .from("referral_redemptions")
      .insert({
        referrer_profile_id: metadata.profileId,
        referred_user_id: transaction.user_id,
        code_used: metadata.code,
        transaction_id: transaction.id,
        property_id: params.propertyId,
        original_amount: metadata.originalAmount,
        discount_amount: metadata.discountAmount,
        paid_amount: metadata.paidAmount,
        status: "qualified",
      })
      .select("id, status, referrer_profile_id, paid_amount")
      .single();

    if (insertError) throw insertError;
    redemption = inserted;
  } else if (redemption.status !== "qualified") {
    const { data: updated, error: updateError } = await supabase
      .from("referral_redemptions")
      .update({
        property_id: params.propertyId,
        status: "qualified",
        updated_at: new Date().toISOString(),
      })
      .eq("id", redemption.id)
      .select("id, status, referrer_profile_id, paid_amount")
      .single();

    if (updateError) throw updateError;
    redemption = updated;
  }

  const commissionAmount =
    metadata.commissionAmount ||
    Math.round((toWholeXof(redemption.paid_amount) * REFERRAL_COMMISSION_BPS) / 10000);

  const { data: existingCommission, error: existingCommissionError } =
    await supabase
      .from("referral_commissions")
      .select("id")
      .eq("redemption_id", redemption.id)
      .maybeSingle();

  if (existingCommissionError) throw existingCommissionError;

  if (existingCommission) {
    return { qualified: true, redemptionId: redemption.id };
  }

  const { error: commissionError } = await supabase
    .from("referral_commissions")
    .insert({
      redemption_id: redemption.id,
      referrer_profile_id: redemption.referrer_profile_id,
      amount: commissionAmount,
      currency:
        typeof transaction.currency === "string"
          ? transaction.currency
          : REFERRAL_CURRENCY,
      status: "pending",
    });

  if (commissionError && commissionError.code !== "23505") {
    throw commissionError;
  }
  return { qualified: true, redemptionId: redemption.id };
}
