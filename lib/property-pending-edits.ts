import { z } from "zod";
import { sanitizeForStorage } from "@/lib/text-sanitize";
import { normalizeQuartier } from "@/lib/property-url";
import { convertIdsToLabels } from "@/lib/interdictions";
import {
  buildStalePropertyTranslationUpdate,
  getPropertyTranslationSourceHash,
} from "@/lib/property-translations";
import { supabaseAdmin } from "@/lib/supabase-admin";

// ---------------------------------------------------------------------------
// Allowlist schema — fields owners are permitted to stage as pending edits.
// Never include tier/boost entitlements, status, frequence/period, virtual_tour_url,
// payment ids, is_test, agent_id, or address (address is derived server-side
// from quartier + city in applyPendingEdit to keep the columns in sync).
// ---------------------------------------------------------------------------
export const pendingEditPayloadSchema = z.object({
  // Price & financial terms
  price: z.coerce.number().int().min(100).optional(),
  caution_mois: z.coerce.number().int().min(0).max(12).optional(),
  loyer_avance_mois: z.coerce.number().int().min(1).max(12).optional(),
  caution_type: z.enum(["aucune", "pourcentage", "fixe"]).optional(),
  caution_valeur: z.coerce.number().min(0).optional(),

  // Location (medium-risk — allowed with review)
  city: z.enum(["ouaga", "bobo"]).optional(),
  quartier: z.string().min(2).max(100).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),

  // Physical specs
  property_type: z
    .enum([
      "villa",
      "appartement",
      "maison",
      "terrain",
      "commercial",
      "célibatorium",
    ])
    .optional(),
  bedrooms: z.coerce.number().int().min(1).optional(),
  bathrooms: z.coerce.number().int().min(1).optional(),
  area: z.coerce.number().int().min(1).optional(),
  parking_spaces: z.coerce.number().int().min(0).optional(),

  // Daily-rental-specific
  sejour_minimum: z.coerce.number().int().min(1).max(30).optional(),
  capacite_max: z.coerce.number().int().min(1).max(20).optional(),

  // Free text / rules
  description: z.string().min(10).max(1200).optional(),
  dos_and_donts: z.array(z.string().min(2).max(200)).max(20).optional(),
  // Clients send IDs (no_animaux, ...); server converts to French labels before storage.
  interdictions: z
    .array(
      z.enum(["no_animaux", "no_fumeurs", "no_etudiants", "no_colocation"]),
    )
    .optional(),

  // Amenities (names, synced via property_amenities join table on apply)
  amenities: z.array(z.string().min(1).max(100)).max(50).optional(),
});

export type PendingEditPayload = z.infer<typeof pendingEditPayloadSchema>;

// ---------------------------------------------------------------------------
// Server-side sanitization and caps.
// ---------------------------------------------------------------------------
function sanitizePendingPayload(
  payload: PendingEditPayload,
): PendingEditPayload {
  const out: PendingEditPayload = { ...payload };

  if (out.description !== undefined)
    out.description = sanitizeForStorage(out.description);
  if (out.quartier !== undefined)
    out.quartier = normalizeQuartier(sanitizeForStorage(out.quartier));
  if (out.dos_and_donts !== undefined)
    out.dos_and_donts = out.dos_and_donts.map(sanitizeForStorage);

  // Convert interdiction IDs to French labels so the stored diff matches the
  // DB column format (which stores labels, not IDs).
  if (out.interdictions !== undefined) {
    const labels = convertIdsToLabels(out.interdictions);
    // Cast: after this point `interdictions` holds French label strings.
    (out as Record<string, unknown>).interdictions = labels ?? [];
  }

  // Daily caution server caps
  if (out.caution_type === "pourcentage" && out.caution_valeur !== undefined)
    out.caution_valeur = Math.min(out.caution_valeur, 50);
  if (out.caution_type === "fixe" && out.caution_valeur !== undefined)
    out.caution_valeur = Math.min(out.caution_valeur, 50_000);

  return out;
}

// ---------------------------------------------------------------------------
// Diff builder — returns only the keys that actually changed vs the current row.
// ---------------------------------------------------------------------------
type PropertyRow = Record<string, unknown>;

export function buildDiff(
  payload: PendingEditPayload,
  current: PropertyRow,
): PendingEditPayload {
  const diff: PendingEditPayload = {};

  for (const key of Object.keys(payload) as (keyof PendingEditPayload)[]) {
    if (key === "amenities") continue; // handled separately below
    const incoming = payload[key];
    const existing = current[key];

    if (incoming === undefined) continue;

    // For interdictions: normalize null/undefined/empty-array to [] before comparing
    // so that a "no interdictions" signal (empty array from convertIdsToLabels)
    // correctly compares against a null column value.
    if (key === "interdictions") {
      const incomingNorm = JSON.stringify(
        Array.isArray(incoming) ? [...(incoming as string[])].sort() : [],
      );
      const existingNorm = JSON.stringify(
        Array.isArray(existing)
          ? [...(existing as string[])].sort()
          : existing == null
            ? []
            : [existing],
      );
      if (incomingNorm !== existingNorm) {
        (diff as Record<string, unknown>)[key] = incoming;
      }
      continue;
    }

    const isSame = JSON.stringify(incoming) === JSON.stringify(existing);
    if (!isSame) {
      (diff as Record<string, unknown>)[key] = incoming;
    }
  }

  // Amenities: compare sorted arrays
  if (payload.amenities !== undefined) {
    const incoming = [...payload.amenities].sort().join(",");
    const existing = Array.isArray(current.amenities)
      ? [...(current.amenities as string[])].sort().join(",")
      : "";
    if (incoming !== existing) {
      diff.amenities = payload.amenities;
    }
  }

  return diff;
}

// ---------------------------------------------------------------------------
// Validate, sanitize, and diff-reduce an incoming payload.
// Returns { ok, payload }, { ok: false, error, noChanges: true }, or
// { ok: false, error } for validation failures.
// ---------------------------------------------------------------------------
export function validateAndDiffPendingEdit(
  raw: unknown,
  current: PropertyRow,
):
  | { ok: true; payload: PendingEditPayload }
  | { ok: false; error: string; noChanges?: boolean } {
  const result = pendingEditPayloadSchema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      error: result.error.issues.map((e) => e.message).join(", "),
    };
  }

  const sanitized = sanitizePendingPayload(result.data);
  const diff = buildDiff(sanitized, current);

  if (Object.keys(diff).length === 0) {
    return { ok: false, error: "Aucun changement détecté.", noChanges: true };
  }

  return { ok: true, payload: diff };
}

// ---------------------------------------------------------------------------
// Apply helper — called when staff approves a pending edit.
// Writes payload columns to `properties`, syncs amenities join table,
// resets translations when description or dos_and_donts change, and
// recomputes `address` whenever quartier or city is updated.
// ---------------------------------------------------------------------------
export async function applyPendingEdit(
  propertyId: string,
  payload: PendingEditPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { amenities, ...dbFields } = payload;

    // Interdictions and house rules are tenant concepts — never write them
    // onto a sale, mirroring the create route's guard (a pending edit staged
    // by an older app build can still carry them for a vendre listing).
    const { data: listingTypeRow } = await supabaseAdmin
      .from("properties")
      .select("listing_type")
      .eq("id", propertyId)
      .maybeSingle();
    if (listingTypeRow?.listing_type === "vendre") {
      delete dbFields.interdictions;
      delete dbFields.dos_and_donts;
    }

    // Build the properties update object
    const dbUpdate: Record<string, unknown> = { ...dbFields };

    const needsTranslationReset =
      dbFields.description !== undefined ||
      dbFields.dos_and_donts !== undefined;

    const needsAddressRecompute =
      dbFields.quartier !== undefined || dbFields.city !== undefined;

    if (needsTranslationReset || needsAddressRecompute) {
      const { data: currentRow } = await supabaseAdmin
        .from("properties")
        .select(
          "description, dos_and_donts, translation_source_locale, quartier, city",
        )
        .eq("id", propertyId)
        .maybeSingle();

      if (currentRow) {
        if (needsTranslationReset) {
          const nextHash = getPropertyTranslationSourceHash({
            sourceLocale: currentRow.translation_source_locale,
            description:
              dbFields.description ?? (currentRow.description as string | null),
            dosAndDonts:
              dbFields.dos_and_donts ??
              (Array.isArray(currentRow.dos_and_donts)
                ? (currentRow.dos_and_donts as string[])
                : []),
          });
          const prevHash = getPropertyTranslationSourceHash({
            sourceLocale: currentRow.translation_source_locale,
            description: currentRow.description as string | null,
            dosAndDonts: Array.isArray(currentRow.dos_and_donts)
              ? (currentRow.dos_and_donts as string[])
              : [],
          });

          if (nextHash !== prevHash) {
            Object.assign(dbUpdate, buildStalePropertyTranslationUpdate());
          }
        }

        if (needsAddressRecompute) {
          const newQuartier =
            dbFields.quartier ?? (currentRow.quartier as string | null) ?? "";
          const newCity =
            dbFields.city ?? (currentRow.city as string | null) ?? "";
          dbUpdate.address = `${newQuartier}, ${newCity}`;
        }
      }
    }

    if (Object.keys(dbUpdate).length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from("properties")
        .update(dbUpdate)
        .eq("id", propertyId);

      if (updateError) {
        return { ok: false, error: updateError.message };
      }
    }

    // Sync amenities join table
    if (amenities !== undefined) {
      await supabaseAdmin
        .from("property_amenities")
        .delete()
        .eq("property_id", propertyId);

      if (amenities.length > 0) {
        const { data: amenityRows } = await supabaseAdmin
          .from("amenities")
          .select("id, name")
          .in("name", amenities);

        if (amenityRows && amenityRows.length > 0) {
          await supabaseAdmin.from("property_amenities").insert(
            amenityRows.map((a: { id: string }) => ({
              property_id: propertyId,
              amenity_id: a.id,
            })),
          );
        }
      }
    }

    return { ok: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error applying edit";
    return { ok: false, error: message };
  }
}
