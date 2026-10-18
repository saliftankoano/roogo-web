// Quality minimum a listing must meet before it goes live (status
// en_ligne). Approved by Salif on 2026-10-18 after half of the live listings
// were found with one-line descriptions and Google left them unindexed.
// Pure (no imports) so the status route, the admin page, the owner form and
// node:test share one source.
//
// Owners can still submit a shorter listing (older mobile builds validate
// 10 characters and 3 photos); staff complete it before publishing.

export const LISTING_QUALITY_MIN = {
  descriptionWords: 60,
  photos: 5,
} as const;

export type ListingQualityInput = {
  description?: string | null;
  photoCount: number;
};

export type ListingQualityCheck = {
  id: "description" | "photos";
  label: string;
  ok: boolean;
  current: number;
  required: number;
};

export function countWords(text?: string | null): number {
  const trimmed = (text || "").trim();
  if (!trimmed) return 0;
  // Words are runs of letters or digits, so "3ch." or "-" alone are not
  // padding the count.
  return trimmed.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token))
    .length;
}

export function checkListingQuality(
  input: ListingQualityInput,
): ListingQualityCheck[] {
  const words = countWords(input.description);
  return [
    {
      id: "description",
      label: `Description d'au moins ${LISTING_QUALITY_MIN.descriptionWords} mots`,
      ok: words >= LISTING_QUALITY_MIN.descriptionWords,
      current: words,
      required: LISTING_QUALITY_MIN.descriptionWords,
    },
    {
      id: "photos",
      label: `Au moins ${LISTING_QUALITY_MIN.photos} photos`,
      ok: input.photoCount >= LISTING_QUALITY_MIN.photos,
      current: input.photoCount,
      required: LISTING_QUALITY_MIN.photos,
    },
  ];
}

export function listingQualityError(
  checks: ListingQualityCheck[],
): string | null {
  const missing = checks.filter((check) => !check.ok);
  if (!missing.length) return null;
  const parts = missing.map((check) =>
    check.id === "description"
      ? `la description fait ${check.current} mots sur ${check.required} minimum`
      : `${check.current} photo${check.current > 1 ? "s" : ""} sur ${check.required} minimum`,
  );
  return `Annonce trop incomplète pour la mise en ligne : ${parts.join(", ")}.`;
}
