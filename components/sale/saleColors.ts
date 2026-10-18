// One colour per party in every sale breakdown (simulator design, 2026-10-18).
// Green is kept for the owner's money only (vault: Color psychology).

export type SalePartyKey = "owner" | "notary" | "intermediary" | "sponsor" | "roogo";

export const SALE_PARTY_COLORS: Record<SalePartyKey, string> = {
  owner: "#3FAE6A",
  notary: "#4F8FD6",
  intermediary: "#E0A92E",
  sponsor: "#9B6FD6",
  roogo: "#E07B39",
};

/** "39 000 000 FCFA" with plain spaces. */
export function fcfaFull(n: number) {
  return `${Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ")} FCFA`;
}
