// Server side of the TikTok panel (PRD « TikTok posting screen for the
// audit », 2026-10-31): fresh creator info for the approval screen and the
// publisher, and the founder's choices in studio_publications.tiktok_settings
// (migration 109). Read and written apart from PUBLICATION_COLUMNS, so the
// Studio keeps working before the migration runs: TikTok direct approval is
// then refused with « migration 109 à lancer ». The token never leaves the
// server and is never logged.

import { supabaseAdmin } from "@/lib/supabase-admin";
import { tiktokAccessToken, tiktokDemo, tiktokPublishStatus } from "./tiktok-token-server";
import { fetchCreatorInfo, readSettings, type CreatorInfoResult, type TikTokSettings } from "./tiktok-post-settings";

export { tiktokDemo };

const DEMO_CREATOR: CreatorInfoResult = {
  ok: true,
  creator: {
    nickname: "Roogo Burkina",
    username: "roogo.226",
    avatarUrl: null,
    privacyLevelOptions: ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"],
    commentDisabled: false,
    duetDisabled: false,
    stitchDisabled: true,
    maxVideoPostDurationSec: 600,
  },
};

/** The connected account's creator info, read from TikTok now (never cached). */
export async function creatorInfoNow(): Promise<CreatorInfoResult> {
  if (tiktokDemo()) return DEMO_CREATOR;
  const access = await tiktokAccessToken();
  if ("error" in access) return { ok: false, cannotPost: false, code: "not_connected", error: access.error };
  return fetchCreatorInfo((url, init) => fetch(url, init), access.token);
}

/** Direct mode with TikTok usable: the panel is required at approval. */
export async function tiktokPanelRequired(): Promise<boolean> {
  if (tiktokDemo()) return true;
  const info = await tiktokPublishStatus();
  return info.enabled && info.mode === "direct";
}

function missingColumn(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "42703" || error?.code === "PGRST204" || /tiktok_settings/.test(error?.message ?? "");
}

export type SettingsRead = { ready: boolean; settings: TikTokSettings | null };

export async function loadTikTokSettings(id: string): Promise<SettingsRead> {
  const { data, error } = await supabaseAdmin.from("studio_publications").select("tiktok_settings").eq("id", id).maybeSingle();
  if (error) {
    if (!missingColumn(error)) console.error("[tiktok-settings] read failed", { code: error.code });
    return { ready: !missingColumn(error), settings: null };
  }
  return { ready: true, settings: readSettings((data as { tiktok_settings?: unknown } | null)?.tiktok_settings) };
}

/** Saves the choices while the post is still in `status` and not claimed. */
export async function saveTikTokSettings(id: string, status: string, settings: TikTokSettings | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabaseAdmin
    .from("studio_publications")
    .update({ tiktok_settings: settings })
    .eq("id", id)
    .eq("status", status)
    .is("claimed_at", null)
    .select("id");
  if (error) {
    if (missingColumn(error)) return { ok: false, error: "Les réglages TikTok ne sont pas encore installés (migration 109 à lancer)." };
    console.error("[tiktok-settings] save failed", { code: error.code });
    return { ok: false, error: "Les réglages TikTok n'ont pas pu être enregistrés." };
  }
  if (!data?.length) return { ok: false, error: "La publication a changé entre-temps. Rechargez la page." };
  return { ok: true };
}
