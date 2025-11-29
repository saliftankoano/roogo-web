/**
 * Interdictions utility - mirrors app/utils/interdictions.ts
 * Maps interdiction IDs to labels for consistent storage
 */

const INTERDICTION_LABEL_MAP: Record<string, string> = {
  no_animaux: "Pas d'animaux",
  no_fumeurs: "Pas de fumeurs",
  no_etudiants: "Pas d'étudiants",
  no_colocation: "Pas de colocation",
};

/**
 * Convert interdiction ID to label
 */
export function getIdToLabel(id: string): string {
  return INTERDICTION_LABEL_MAP[id] || id;
}

/**
 * Convert interdiction IDs array to labels array
 */
export function convertIdsToLabels(
  ids: string[] | null | undefined
): string[] | null {
  if (!ids || ids.length === 0) return null;
  return ids.map(getIdToLabel);
}
