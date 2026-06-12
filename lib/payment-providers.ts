/**
 * PawaPay correspondents enabled on the Roogo account.
 * Only countries/providers listed here are selectable in the payment flow.
 */
export type PaymentCorrespondent = {
  code: string;
  label: string;
  shortName: string;
  countryIso: string;
  countryName: string;
  countryNameFr: string;
  countryFlag: string;
  dialCode: string;
  requiresPreAuth: boolean;
  otpUssd?: string;
  themeColor: string;
  lightColor: string;
};

export const PAYMENT_CORRESPONDENTS: PaymentCorrespondent[] = [
  // ── Burkina Faso ──────────────────────────────────────────────────────────
  {
    code: "ORANGE_BFA",
    label: "Orange Money",
    shortName: "Orange",
    countryIso: "BF",
    countryName: "Burkina Faso",
    countryNameFr: "Burkina Faso",
    countryFlag: "🇧🇫",
    dialCode: "226",
    requiresPreAuth: true,
    otpUssd: "*144*4*6#",
    themeColor: "#FF7900",
    lightColor: "#FFF4E6",
  },
  {
    code: "MOOV_BFA",
    label: "Moov Money",
    shortName: "Moov",
    countryIso: "BF",
    countryName: "Burkina Faso",
    countryNameFr: "Burkina Faso",
    countryFlag: "🇧🇫",
    dialCode: "226",
    requiresPreAuth: false,
    themeColor: "#0066B2",
    lightColor: "#E6F0FF",
  },
  // ── Côte d'Ivoire ─────────────────────────────────────────────────────────
  {
    code: "ORANGE_CIV",
    label: "Orange Money",
    shortName: "Orange",
    countryIso: "CI",
    countryName: "Côte d'Ivoire",
    countryNameFr: "Côte d'Ivoire",
    countryFlag: "🇨🇮",
    dialCode: "225",
    requiresPreAuth: false,
    themeColor: "#FF7900",
    lightColor: "#FFF4E6",
  },
  {
    code: "MTN_MOMO_CIV",
    label: "MTN MoMo",
    shortName: "MTN",
    countryIso: "CI",
    countryName: "Côte d'Ivoire",
    countryNameFr: "Côte d'Ivoire",
    countryFlag: "🇨🇮",
    dialCode: "225",
    requiresPreAuth: false,
    themeColor: "#FFCC00",
    lightColor: "#FFFDE6",
  },
  {
    code: "WAVE_CIV",
    label: "Wave",
    shortName: "Wave",
    countryIso: "CI",
    countryName: "Côte d'Ivoire",
    countryNameFr: "Côte d'Ivoire",
    countryFlag: "🇨🇮",
    dialCode: "225",
    requiresPreAuth: false,
    themeColor: "#009EFF",
    lightColor: "#E6F6FF",
  },
  // ── Sénégal ───────────────────────────────────────────────────────────────
  {
    code: "ORANGE_SEN",
    label: "Orange Money",
    shortName: "Orange",
    countryIso: "SN",
    countryName: "Senegal",
    countryNameFr: "Sénégal",
    countryFlag: "🇸🇳",
    dialCode: "221",
    requiresPreAuth: false,
    themeColor: "#FF7900",
    lightColor: "#FFF4E6",
  },
  {
    code: "FREE_SEN",
    label: "Free Money",
    shortName: "Free",
    countryIso: "SN",
    countryName: "Senegal",
    countryNameFr: "Sénégal",
    countryFlag: "🇸🇳",
    dialCode: "221",
    requiresPreAuth: false,
    themeColor: "#E60000",
    lightColor: "#FFE6E6",
  },
  {
    code: "WAVE_SEN",
    label: "Wave",
    shortName: "Wave",
    countryIso: "SN",
    countryName: "Senegal",
    countryNameFr: "Sénégal",
    countryFlag: "🇸🇳",
    dialCode: "221",
    requiresPreAuth: false,
    themeColor: "#009EFF",
    lightColor: "#E6F6FF",
  },
];

export type PaymentCountry = {
  iso: string;
  name: string;
  nameFr: string;
  flag: string;
  dialCode: string;
  correspondents: PaymentCorrespondent[];
};

export const PAYMENT_COUNTRIES: PaymentCountry[] = (() => {
  const map = new Map<string, PaymentCountry>();
  for (const c of PAYMENT_CORRESPONDENTS) {
    if (!map.has(c.countryIso)) {
      map.set(c.countryIso, {
        iso: c.countryIso,
        name: c.countryName,
        nameFr: c.countryNameFr,
        flag: c.countryFlag,
        dialCode: c.dialCode,
        correspondents: [],
      });
    }
    map.get(c.countryIso)!.correspondents.push(c);
  }
  return Array.from(map.values());
})();

export const DEFAULT_PAYMENT_COUNTRY_ISO = "BF";

export const ALLOWED_CORRESPONDENT_CODES = new Set(
  PAYMENT_CORRESPONDENTS.map((c) => c.code),
);

export function getCorrespondent(code: string): PaymentCorrespondent | undefined {
  return PAYMENT_CORRESPONDENTS.find((c) => c.code === code);
}

export function getPaymentCountry(iso: string): PaymentCountry | undefined {
  return PAYMENT_COUNTRIES.find((c) => c.iso === iso);
}
