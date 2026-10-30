// A Studio project can start from a property request (« demande spécifique »):
// the first message asks the assistant for an owner call-out script built only
// from the request's public fields. The client's name, contact and Roogo's
// internal notes never reach the script (Salif, 2026-10-30).

export type RequestForBrief = {
  title: string;
  description: string;
  listing_type: "vendre" | "louer";
  property_type: string;
  city: string;
  neighborhood: string | null;
  budget_min: number | null;
  budget_max: number;
  min_area: number | null;
  min_bedrooms: number | null;
};

// Same output as formatCurrency (lib/format.ts) with plain spaces between
// thousands, since the brief feeds a voice-over script. Kept local because
// this module runs under the Node test runner, which cannot load "../format".
const fcfa = (value: number) =>
  `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 })
    .format(value)
    .replace(/[\u202f\u00a0]/g, " ")} FCFA`;

const REQUEST_TITLE_PREFIX = "Demande : ";

/** Asks for a fresh call-out script in a project started from a request. */
export const REQUEST_REDRAFT =
  "Écris un nouveau script d'appel à propriétaires pour cette demande.";

/**
 * « Demande : Villa à Ouaga 2000 », the project's title in the history.
 * Normalised exactly like the conversations API stores a title (long dash
 * replaced, 80 characters), so an existing project can be found by its title.
 */
export function requestProjectTitle(request: Pick<RequestForBrief, "title">): string {
  return `${REQUEST_TITLE_PREFIX}${request.title}`.trim().replace(/\u2014/g, ",").slice(0, 80);
}

/** Whether a project was started from a request (it has no property). */
export function isRequestProjectTitle(title: string | null | undefined): boolean {
  return (title ?? "").startsWith(REQUEST_TITLE_PREFIX);
}

/** The first message of a project started from a request. */
export function requestBrief(request: RequestForBrief): string {
  const place = request.neighborhood?.trim()
    ? `${request.neighborhood.trim()}, ${request.city}`
    : request.city;
  const wants = request.listing_type === "louer" ? "à louer" : "à acheter";
  const budget =
    request.budget_min !== null
      ? `entre ${fcfa(request.budget_min)} et ${fcfa(request.budget_max)}`
      : `jusqu'à ${fcfa(request.budget_max)}`;
  const needs = [
    request.min_bedrooms !== null ? `au moins ${request.min_bedrooms} chambres` : null,
    request.min_area !== null ? `au moins ${request.min_area} m²` : null,
  ].filter(Boolean);

  return [
    "Écris un script de voix off pour un appel à propriétaires.",
    `Un client cherche : ${request.property_type} ${wants}, à ${place}.`,
    `Budget : ${budget}.`,
    needs.length ? `Il lui faut ${needs.join(" et ")}.` : null,
    `Ce qu'il veut : ${request.description.trim()}`,
    "Les propriétaires qui ont ce bien doivent appeler Roogo.",
  ]
    .filter(Boolean)
    .join("\n");
}
