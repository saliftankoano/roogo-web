// The three checks a sale passes before it goes online (owner account linked,
// ownership documents approved, signed mandate), and who may skip them.
//
// Directeur and Fondateur may put a sale online without them, for an owner who
// cannot use the app (Salif, 2026-10-30). Documents a staff member reviewed and
// refused are a scam signal, not a missing step: they block everyone.
// Pure function, so the rules are tested without a database
// (lib/sale-go-live.test.mjs); app/api/properties/[id]/status/route.ts applies it.

export type SaleCheck = "owner_link" | "ownership_documents" | "signed_mandate";

export type SaleGoLiveInput = {
  agentId: string | null;
  ownershipStatus: string | null;
  hasSignedMandate: boolean;
  canSkipChecks: boolean;
};

export type SaleGoLiveDecision =
  | { ok: true; skipped: SaleCheck[] }
  | { ok: false; code: string; error: string };

export function saleGoLiveDecision(input: SaleGoLiveInput): SaleGoLiveDecision {
  const skipped: SaleCheck[] = [];

  if (input.ownershipStatus === "rejected") {
    return {
      ok: false,
      code: "sale_ownership_rejected",
      error:
        "Les documents de propriété ont été refusés. La vente ne peut pas être mise en ligne.",
    };
  }

  if (!input.agentId) {
    if (!input.canSkipChecks) {
      return {
        ok: false,
        code: "sale_owner_link_required",
        error:
          "Rattachez d'abord l'annonce au compte du propriétaire avant la mise en ligne.",
      };
    }
    skipped.push("owner_link");
  }

  if (input.ownershipStatus !== "approved") {
    if (!input.canSkipChecks) {
      return {
        ok: false,
        code: "sale_ownership_verification_required",
        error:
          "Les documents de propriété doivent être vérifiés avant la mise en ligne.",
      };
    }
    skipped.push("ownership_documents");
  }

  if (!input.hasSignedMandate) {
    if (!input.canSkipChecks) {
      return {
        ok: false,
        code: "sale_mandate_required",
        error:
          "Le mandat de vente doit être signé par le propriétaire avant la mise en ligne.",
      };
    }
    skipped.push("signed_mandate");
  }

  return { ok: true, skipped };
}
