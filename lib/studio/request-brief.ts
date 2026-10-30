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

const fcfa = (value: number) =>
  `${new Intl.NumberFormat("fr-FR").format(value).replace(/ | /g, " ")} FCFA`;

/** « Demande : Villa à Ouaga 2000 », the project's title in the history. */
export function requestProjectTitle(request: Pick<RequestForBrief, "title">): string {
  return `Demande : ${request.title}`.slice(0, 120);
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
