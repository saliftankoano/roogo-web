import type {
  PropertyRequest,
  PropertyRequestInput,
} from "./property-requests";

export const REQUEST_FIELD_LABELS: Record<keyof PropertyRequestInput, string> =
  {
    title: "Titre de l’appel",
    description: "Description publique",
    listing_type: "Transaction",
    property_type: "Type de bien",
    city: "Ville",
    neighborhood: "Quartier souhaité",
    budget_min: "Budget minimum",
    budget_max: "Budget maximum",
    min_area: "Surface minimum",
    min_bedrooms: "Chambres minimum",
    commission_rate: "Commission (%)",
    commission_terms: "Conditions de commission",
    customer_name: "Nom du client",
    customer_contact: "Contact du client",
    internal_notes: "Notes internes",
    status: "Publication",
  };
export type RequestField = keyof PropertyRequestInput;
export type RequestDraft = Record<RequestField, string>;
export const REQUEST_FIELDS = Object.keys(
  REQUEST_FIELD_LABELS,
) as RequestField[];

export function toRequestDraft(request: PropertyRequest | null): RequestDraft {
  return Object.fromEntries(
    REQUEST_FIELDS.map((key) => [
      key,
      String(
        request?.[key] ??
          (
            {
              listing_type: "vendre",
              property_type: "Maison",
              status: "draft",
            } as Partial<RequestDraft>
          )[key] ??
          "",
      ),
    ]),
  ) as RequestDraft;
}

// Preserve local changes, adopt unrelated server changes, and surface overlapping edits.
export function mergeRequestDraft(
  base: RequestDraft,
  local: RequestDraft,
  latest: RequestDraft,
  unresolved: RequestField[] = [],
) {
  const draft = { ...local };
  const conflicts: RequestField[] = [];
  for (const key of REQUEST_FIELDS) {
    if (local[key] === base[key] && !unresolved.includes(key))
      draft[key] = latest[key];
    else if (
      local[key] !== latest[key] &&
      (latest[key] !== base[key] || unresolved.includes(key))
    )
      conflicts.push(key);
  }
  return { draft, conflicts };
}

// PostgreSQL versions include microseconds; Date.parse alone drops that precision.
export function isNewerRequestVersion(incoming: string, current: string) {
  const micros = (value: string) =>
    Date.parse(value) * 1000 +
    Number((value.match(/\.(\d+)/)?.[1] || "").padEnd(6, "0").slice(3, 6));
  return micros(incoming) > micros(current);
}
