export const REFERRAL_SOURCE_SOCIAL = "Réseaux sociaux";
export const REFERRAL_SOURCE_WORD_OF_MOUTH = "Bouche à oreille";
export const REFERRAL_SOURCE_GOOGLE = "Recherche Google";
export const REFERRAL_SOURCE_ADVERTISING = "Publicité";
export const REFERRAL_SOURCE_OTHER = "Autre";

export const REFERRAL_SOURCES = [
  REFERRAL_SOURCE_SOCIAL,
  REFERRAL_SOURCE_WORD_OF_MOUTH,
  REFERRAL_SOURCE_GOOGLE,
  REFERRAL_SOURCE_ADVERTISING,
  REFERRAL_SOURCE_OTHER,
] as const;

export const SOCIAL_PLATFORMS = [
  "Facebook",
  "Instagram",
  "TikTok",
  "WhatsApp",
] as const;

const SOCIAL_VALUES = new Set(["Réseaux sociaux", "Social media"]);
const OTHER_VALUES = new Set(["Autre", "Other"]);

export type AcquisitionSourceInput = {
  referralSource?: string | null;
  socialPlatform?: string | null;
  referralSourceDetail?: string | null;
  referralSourceOther?: string | null;
};

export function isSocialReferralSource(source?: string | null) {
  return Boolean(source && SOCIAL_VALUES.has(source));
}

export function isOtherReferralSource(source?: string | null) {
  return Boolean(source && OTHER_VALUES.has(source));
}

export function hasRequiredAcquisitionSourceDetail(input: AcquisitionSourceInput) {
  const source = input.referralSource?.trim();
  if (!source) return false;

  if (isSocialReferralSource(source)) {
    return Boolean(input.socialPlatform?.trim());
  }

  if (isOtherReferralSource(source)) {
    return Boolean(
      input.referralSourceDetail?.trim() || input.referralSourceOther?.trim(),
    );
  }

  return true;
}

export function getAcquisitionSourceDetail(input: AcquisitionSourceInput) {
  if (isSocialReferralSource(input.referralSource)) {
    return input.socialPlatform?.trim() || null;
  }
  if (isOtherReferralSource(input.referralSource)) {
    return (
      input.referralSourceDetail?.trim() ||
      input.referralSourceOther?.trim() ||
      null
    );
  }
  return null;
}
