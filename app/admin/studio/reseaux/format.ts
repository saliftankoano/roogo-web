// Dates for Studio > Réseaux. Ouagadougou is UTC all year, so every label is
// formatted in UTC.

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** "21 oct. à 08:30" (Ouagadougou time). */
export function ouagaTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} à ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "à l'instant", "il y a 12 min", "il y a 3 h", then the date. */
export function ago(iso: string | null, now: number): string {
  if (!iso) return "jamais";
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `le ${ouagaTime(iso)}`;
}
