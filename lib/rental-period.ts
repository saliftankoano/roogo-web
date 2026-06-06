export type RentalFrequency = "mensuel" | "journalier";

type RentalPeriodInput = {
  period?: string | null;
  frequence?: string | null;
};

type DailyConditionInput = RentalPeriodInput & {
  cautionType?: string | null;
  cautionValeur?: number | null;
  sejourMinimum?: number | null;
  capaciteMax?: number | null;
};

const DAILY_PERIOD_VALUES = new Set(["day", "daily", "jour", "jours", "nuit", "nuits"]);
const MONTHLY_PERIOD_VALUES = new Set(["month", "monthly", "mois"]);

function normalize(value?: string | null) {
  return (value || "").trim().toLowerCase();
}

export function isDailyRental(input: RentalPeriodInput) {
  const period = normalize(input.period);
  const frequence = normalize(input.frequence);

  return frequence === "journalier" || DAILY_PERIOD_VALUES.has(period);
}

export function getRentalFrequency(input: RentalPeriodInput): RentalFrequency {
  return isDailyRental(input) ? "journalier" : "mensuel";
}

export function normalizeRentalPeriod(input: RentalPeriodInput) {
  const period = normalize(input.period);
  const frequence = normalize(input.frequence);

  if (isDailyRental(input)) return "day";
  if (MONTHLY_PERIOD_VALUES.has(period) || frequence === "mensuel") {
    return "month";
  }

  return input.period || "month";
}

export function getPricePeriodLabel(input: RentalPeriodInput) {
  return isDailyRental(input) ? "FCFA / nuit" : "FCFA / mois";
}

export function getPricePeriodUnitLabel(input: RentalPeriodInput) {
  return isDailyRental(input) ? "nuit" : "mois";
}

export function getPriceTitle(input: RentalPeriodInput) {
  return isDailyRental(input) ? "Tarif par nuit" : "Prix du loyer";
}

export function formatXofAmount(amount?: string | number | null) {
  const numeric = typeof amount === "number" ? amount : Number(amount ?? 0);
  if (!Number.isFinite(numeric)) return "0";
  return numeric.toLocaleString("fr-FR");
}

export function formatDailyCaution(input: DailyConditionInput) {
  const cautionType = normalize(input.cautionType);
  const cautionValeur = Number(input.cautionValeur ?? 0);

  if (!cautionType || cautionType === "aucune" || cautionValeur <= 0) {
    return "Aucune";
  }

  if (cautionType === "pourcentage") {
    return `${cautionValeur}% du séjour`;
  }

  if (cautionType === "fixe") {
    return `${formatXofAmount(cautionValeur)} FCFA`;
  }

  return "Aucune";
}

export function getDailyConditionRows(input: DailyConditionInput) {
  return [
    { label: "Caution", value: formatDailyCaution(input) },
    {
      label: "Séjour minimum",
      value: `${Math.max(1, Number(input.sejourMinimum ?? 1))} nuit(s)`,
    },
    {
      label: "Capacité max.",
      value: `${Math.max(1, Number(input.capaciteMax ?? 2))} personne(s)`,
    },
  ];
}
