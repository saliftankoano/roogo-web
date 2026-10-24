"use client";

// The one place to connect YouTube: inside the YouTube card of Studio >
// Statistiques, like TikTok (TikTokConnection.tsx). Founder only for the
// actions (every route checks the founder again); the rest of the team sees
// who connects it. The OAuth callback comes back to this page with
// ?youtube=<outcome>.

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { YouTubeStatus } from "@/lib/team-goals/youtube-store";

export type YouTubeAdmin = { isFounder: boolean; founderName: string; status: YouTubeStatus | null };

export const YOUTUBE_CONNECT_PATH = "/api/admin/social/youtube/connect";

export const YOUTUBE_OUTCOMES: Record<string, { text: string; good: boolean }> = {
  connecte: { text: "YouTube est connecté. Les chiffres s'affichent dans cette carte.", good: true },
  refus: { text: "L'autorisation a été refusée sur Google.", good: false },
  scope: { text: "Il faut laisser cochées les deux autorisations YouTube sur Google : voir la chaîne et mettre en ligne des vidéos.", good: false },
  chaine: { text: "Ce compte Google n'a pas de chaîne YouTube. Recommencez avec le compte qui possède la chaîne Roogo.", good: false },
  etat: { text: "La connexion a expiré. Recommencez.", good: false },
  config: { text: "Les identifiants Google ne sont pas encore sur le serveur.", good: false },
  table: { text: "La migration 106 n'est pas encore passée.", good: false },
  erreur: { text: "La connexion a échoué. Réessayez dans un instant.", good: false },
};

/** Reads ?youtube=<outcome> once, then removes it from the address bar. */
function useOutcome() {
  const [outcome, setOutcome] = useState<string | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href);
    const value = url.searchParams.get("youtube");
    if (!value) return;
    if (YOUTUBE_OUTCOMES[value]) setOutcome(value);
    url.searchParams.delete("youtube");
    window.history.replaceState(null, "", url.toString());
  }, []);
  return outcome;
}

function OutcomeNote({ outcome }: { outcome: string | null }) {
  const message = outcome ? YOUTUBE_OUTCOMES[outcome] : null;
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

function ConnectButton({ label }: { label: string }) {
  return (
    <a
      href={YOUTUBE_CONNECT_PATH}
      className="mt-3 inline-flex h-11 items-center justify-center rounded-full bg-[#1F1A16] px-4 text-sm font-extrabold text-white no-underline transition-colors hover:bg-black md:h-10"
    >
      {label}
    </a>
  );
}

/** The not-connected YouTube card body: the connect button for the founder, who connects it for everyone else. */
export function YouTubeConnectPanel({ admin }: { admin: YouTubeAdmin }) {
  const outcome = useOutcome();
  if (!admin.isFounder) {
    return (
      <p className="mt-4 rounded-2xl bg-[#FBF7F2] px-3 py-3 text-[13px] text-neutral-700">
        YouTube n&apos;est pas encore connecté. {capitalize(admin.founderName)} le connecte depuis Statistiques.
      </p>
    );
  }
  const status = admin.status;
  const canConnect = !status || (status.configured && status.tableReady);
  return (
    <div className="mt-4 rounded-2xl bg-[#FBF7F2] px-3 py-3">
      <p className="text-[13px] leading-snug text-neutral-700">
        Connectez la chaîne Roogo une fois, avec le compte Google qui la possède : abonnés, vidéos et vues se lisent ensuite tout seuls.
      </p>
      {status && !status.configured && (
        <p className="mt-1.5 text-[12px] leading-snug text-neutral-500">À ajouter sur Vercel : {status.missing.join(", ")}.</p>
      )}
      {status && status.configured && !status.tableReady && (
        <p className="mt-1.5 text-[12px] leading-snug text-neutral-500">Les migrations 100 et 106 ne sont pas encore passées.</p>
      )}
      <OutcomeNote outcome={outcome} />
      {canConnect && <ConnectButton label="Connecter YouTube" />}
    </div>
  );
}

/**
 * Bottom of the connected YouTube card, founder only: the 7-day note when
 * Google says the connection ends soon (app in « Testing »), the last failed
 * read with « Reconnecter YouTube » when the connection broke, and a
 * discreet « Déconnecter ».
 */
export function YouTubeConnectedFooter({ admin, broken = false }: { admin: YouTubeAdmin; broken?: boolean }) {
  const outcome = useOutcome();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!admin.isFounder) return null;
  const status = admin.status;
  const needsReconnect = broken || !!status?.lastError;

  async function disconnect() {
    if (!window.confirm("Déconnecter YouTube ? Les chiffres YouTube ne seront plus lus jusqu'à la prochaine connexion.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/social/youtube/disconnect", { method: "POST" });
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
      {status?.testingMode && status.refreshExpiresAt && (
        <p className="mt-2 rounded-xl bg-[#FBF7F2] px-3 py-2 text-[12px] leading-snug text-neutral-700">
          Connexion valable jusqu&apos;au {longDate(status.refreshExpiresAt)}. L&apos;application Google est en mode « Test » : Google coupe la connexion après 7 jours. Publiez-la « En production » dans Google Cloud.
        </p>
      )}
      {/* When the card already shows the error, the same reason is not repeated here. */}
      {status?.lastError && !broken && (
        <p role="status" className="mt-2 rounded-xl bg-[#FBF1DE] px-3 py-2 text-[12px] font-semibold leading-snug text-[#6B4A12]">
          Dernière lecture ratée : {status.lastError}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[12px] font-semibold text-[#8E2A1E]">
          {error}
        </p>
      )}
      {needsReconnect && <ConnectButton label="Reconnecter YouTube" />}
      <div>
        <button
          type="button"
          onClick={disconnect}
          disabled={busy}
          className="mt-2 inline-flex h-10 items-center text-[12px] font-semibold text-neutral-500 underline-offset-2 hover:text-neutral-800 hover:underline disabled:opacity-60"
        >
          {busy ? "Déconnexion…" : "Déconnecter YouTube"}
        </button>
      </div>
    </div>
  );
}

function longDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });
}

function capitalize(text: string) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}
