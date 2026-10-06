import { supabaseAdmin } from "@/lib/supabase-admin";
import { startOfMonthIso } from "./budget";
import type { GlossaryEntry } from "./tts-prepare";

export const STUDIO_BUCKET = "content-studio";

const FALLBACK_DEFAULT_CAP_USD = 15;

export function defaultMonthlyCapUsd(): number {
  const raw = Number(process.env.STUDIO_DEFAULT_MONTHLY_CAP_USD);
  return Number.isFinite(raw) && raw >= 0 ? raw : FALLBACK_DEFAULT_CAP_USD;
}

export async function getMonthlyCapUsd(userId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("studio_user_limits")
    .select("monthly_cap_usd")
    .eq("user_id", userId)
    .maybeSingle();
  return data ? Number(data.monthly_cap_usd) : defaultMonthlyCapUsd();
}

export async function getUsedThisMonthUsd(userId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("studio_generations")
    .select("est_cost_usd")
    .eq("user_id", userId)
    .in("kind", ["voiceover", "preview", "image", "transcription"])
    .in("status", ["running", "finalizing", "done"])
    .gte("created_at", startOfMonthIso());
  return (data ?? []).reduce((sum, row) => sum + Number(row.est_cost_usd), 0);
}

export async function loadGlossary(): Promise<GlossaryEntry[]> {
  const { data } = await supabaseAdmin
    .from("studio_glossary")
    .select("term, spoken")
    .order("created_at", { ascending: true });
  return (data ?? []) as GlossaryEntry[];
}
