"use client";

// The one place to connect TikTok: inside the TikTok card of Studio >
// Statistiques. Founder only for the actions (every route checks the founder
// again); the rest of the team sees who connects it. The OAuth callback comes
// back to this page with ?tiktok=<outcome>.

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { TikTokStatus } from "@/lib/team-goals/tiktok-store";

export type TikTokAdmin = { isFounder: boolean; founderName: string; status: TikTokStatus | null };

export const TIKTOK_OUTCOMES: Record<string, { text: string; good: boolean }> = {
  connecte: { text: "TikTok est connecté. Les chiffres s'affichent dans cette carte.", good: true },
  refus: { text: "L'autorisation a été refusée sur TikTok.", good: false },
  scope: { text: "Il faut laisser cochée la case des statistiques du compte sur TikTok.", good: false },
  etat: { text: "La connexion a expiré. Recommencez.", good: false },
  config: { text: "Les clés TikTok ne sont pas encore sur le serveur.", good: false },
  table: { text: "La migration 100 n'est pas encore passée.", good: false },
  erreur: { text: "La connexion a échoué. Réessayez dans un instant.", good: false },
};

/** Reads ?tiktok=<outcome> once, then removes it from the address bar. */
function useOutcome() {
  const [outcome, setOutcome] = useState<string | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href);
    const value = url.searchParams.get("tiktok");
    if (!value) return;
    if (TIKTOK_OUTCOMES[value]) setOutcome(value);
    url.searchParams.delete("tiktok");
    window.history.replaceState(null, "", url.toString());
  }, []);
  return outcome;
}

function OutcomeNote({ outcome }: { outcome: string | null }) {
  const message = outcome ? TIKTOK_OUTCOMES[outcome] : null;
  if (!message) return null;
  return (
    <p
      role="status"
      className={cn(
        "mt-3 rounded-xl px-3 py-2 text-[13px] font-semibold leading-snug",
        message.good ? "bg-[#E6F2EA] text-[#1F5A33]" : "bg-[#FBE3DF] text-[#8E2A1E]",
      )}
    >
      {message.text}
    </p>
  );
}

/** The not-connected TikTok card body: the connect button for the founder, who connects it for everyone else. */
export function TikTokConnectPanel({ admin }: { admin: TikTokAdmin }) {
  const outcome = useOutcome();
  if (!admin.isFounder) {
    return (
      <p className="mt-4 rounded-2xl bg-[#FBF7F2] px-3 py-3 text-[13px] text-neutral-700">
        TikTok n&apos;est pas encore connecté. {capitalize(admin.founderName)} le connecte depuis Statistiques.
      </p>
    );
  }
  const status = admin.status;
  const canConnect = !status || (status.configured && status.tableReady);
  return (
    <div className="mt-4 rounded-2xl bg-[#FBF7F2] px-3 py-3">
      <p className="text-[13px] leading-snug text-neutral-700">
        Connectez @roogo.226 une fois : abonnés, vidéos et vues se lisent ensuite tout seuls.
      </p>
      {status && !status.configured && (
        <p className="mt-1.5 text-[12px] leading-snug text-neutral-500">À ajouter sur Vercel : {status.missing.join(", ")}.</p>
      )}
      {status && status.configured && !status.tableReady && (
        <p className="mt-1.5 text-[12px] leading-snug text-neutral-500">La migration 100 n&apos;est pas encore passée.</p>
      )}
      <OutcomeNote outcome={outcome} />
      {canConnect && (
        <a
          href="/api/admin/social/tiktok/connect"
          className="mt-3 inline-flex h-11 items-center justify-center rounded-full bg-[#1F1A16] px-4 text-sm font-extrabold text-white no-underline transition-colors hover:bg-black md:h-10"
        >
          Connecter TikTok
        </a>
      )}
    </div>
  );
}

/** Bottom of the connected TikTok card, founder only: last failed read and a discreet « Déconnecter ». */
export function TikTokConnectedFooter({ admin }: { admin: TikTokAdmin }) {
  const outcome = useOutcome();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!admin.isFounder) return null;

  async function disconnect() {
    if (!window.confirm("Déconnecter TikTok ? Les chiffres TikTok ne seront plus lus jusqu'à la prochaine connexion.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/social/tiktok/disconnect", { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? `La déconnexion a échoué (HTTP ${res.status}).`);
        return;
      }
      window.location.reload();
    } catch (e) {
      setError(`La déconnexion a échoué : ${e instanceof Error ? e.message : "erreur réseau"}.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 border-t border-[rgba(74,52,36,0.08)] pt-3">
      <OutcomeNote outcome={outcome} />
      {admin.status?.lastError && (
        <p role="status" className="mt-2 rounded-xl bg-[#FBF1DE] px-3 py-2 text-[12px] font-semibold leading-snug text-[#6B4A12]">
          Dernière lecture ratée : {admin.status.lastError}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[12px] font-semibold text-[#8E2A1E]">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={disconnect}
        disabled={busy}
        className="mt-2 inline-flex h-10 items-center text-[12px] font-semibold text-neutral-500 underline-offset-2 hover:text-neutral-800 hover:underline disabled:opacity-60"
      >
        {busy ? "Déconnexion…" : "Déconnecter TikTok"}
      </button>
    </div>
  );
}

function capitalize(text: string) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}
