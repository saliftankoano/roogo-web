// Writes today's automatic follower readings (team_goal_readings, source
// 'automatique') with planFollowerReadings: insert when the day is empty,
// refresh today's automatic value, never overwrite a manual reading. Used by
// the nightly /api/cron/social-followers, every fresh Studio > Statistiques
// snapshot (6 h cron and « Actualiser ») and the TikTok connection, so the
// goal cards on Accueil follow the same numbers as Statistiques.

import { supabaseAdmin } from "@/lib/supabase-admin";
import { planFollowerReadings, type ExistingReading, type FollowerResult, type ReadingPlan } from "./meta-followers";

export type WriteOutcome = { ok: true; plan: ReadingPlan } | { ok: false; error: string };

/** Today's key, as the nightly cron writes it (UTC, the Ouagadougou time zone). */
export function todayReadingKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Never throws: the reason is returned (and logged by the caller). */
export async function writeFollowerReadings(results: FollowerResult[], todayKey = todayReadingKey()): Promise<WriteOutcome> {
  const ok = results.filter((r) => r.ok);
  if (!ok.length) return { ok: true, plan: { inserts: [], updates: [], keptManual: [] } };
  try {
    const metrics = [...new Set(ok.map((r) => r.metric))];
    const { data: existing, error: readError } = await supabaseAdmin
      .from("team_goal_readings")
      .select("id, metric, measured_on, source, value")
      .in("metric", metrics)
      .eq("measured_on", todayKey);
    if (readError) return { ok: false, error: `lecture des relevés du jour: ${readError.code ?? ""} ${readError.message}`.trim() };

    const plan = planFollowerReadings(results, (existing ?? []) as ExistingReading[], todayKey);
    if (plan.inserts.length) {
      const { error } = await supabaseAdmin.from("team_goal_readings").insert(plan.inserts);
      if (error) return { ok: false, error: `ajout des relevés: ${error.code ?? ""} ${error.message}`.trim() };
    }
    for (const update of plan.updates) {
      // Only an automatic row is ever updated (the filter repeats the rule in SQL).
      const { error } = await supabaseAdmin.from("team_goal_readings").update({ value: update.value }).eq("id", update.id).eq("source", "automatique");
      if (error) return { ok: false, error: `mise à jour du relevé ${update.metric}: ${error.code ?? ""} ${error.message}`.trim() };
    }
    return { ok: true, plan };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
