"use client";

// Founder only, on « Nos objectifs »: connect the @roogo.226 TikTok account
// once so its follower count is read every night (TikTok Login Kit, scope
// user.info.stats). The server checks the founder on every route; this card
// only shows the state and the two actions.

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { roogoMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { GoalIcon } from "./GoalIcon";

type Status = {
  configured: boolean;
  missing: string[];
  tableReady: boolean;
  connected: boolean;
  accountName: string | null;
  connectedAt: string | null;
  lastReadAt: string | null;
  lastError: string | null;
};

const OUTCOMES: Record<string, { text: string; good: boolean }> = {
  connecte: { text: "TikTok est connecté. Le premier chiffre arrive cette nuit.", good: true },
  refus: { text: "L’autorisation a été refusée sur TikTok.", good: false },
  scope: { text: "Il faut laisser cochée la case des statistiques du compte sur TikTok.", good: false },
  etat: { text: "La connexion a expiré. Recommencez.", good: false },
  config: { text: "Les clés TikTok ne sont pas encore sur le serveur.", good: false },
  table: { text: "La migration 100 n’est pas encore passée.", good: false },
  erreur: { text: "La connexion a échoué. Réessayez dans un instant.", good: false },
};

function shortDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

export function TikTokConnect() {
  const [status, setStatus] = useState<Status | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await fetch("/api/admin/social/tiktok/status", { cache: "no-store" });
      if (res.ok) setStatus((await res.json()) as Status);
    } catch {
      // The card is optional; the goals still work.
    }
  };

  useEffect(() => {
    load();
    const url = new URL(window.location.href);
    const value = url.searchParams.get("tiktok");
    if (value && OUTCOMES[value]) {
      setOutcome(value);
      url.searchParams.delete("tiktok");
      window.history.replaceState(null, "", url.toString());
    }
  }, []);

  const disconnect = async () => {
    setBusy(true);
    try {
      await fetch("/api/admin/social/tiktok/disconnect", { method: "POST" });
      setOutcome(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;
  const message = outcome ? OUTCOMES[outcome] : null;
  const canConnect = status.configured && status.tableReady;

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={roogoMotion.standard}
      aria-labelledby="tiktok-auto"
      className="flex flex-col gap-2.5 rounded-[20px] border border-[#EAE1D5] bg-white p-4"
    >
      <div className="flex items-center gap-3">
        <GoalIcon kind="tiktok" size={32} />
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 id="tiktok-auto" className="m-0 text-sm font-extrabold">Abonnés TikTok</h2>
          <span className={cn("text-[13px] font-bold", status.connected ? "text-[#2F7A48]" : "text-[#6B625B]")}>
            {status.connected ? "Lus chaque nuit" : "Saisis à la main"}
          </span>
        </div>
      </div>

      {status.connected ? (
        <p className="m-0 text-[13px] leading-snug text-[#4A4540]">
          {status.accountName ? `Compte ${status.accountName}, connecté le ${shortDate(status.connectedAt)}.` : `Connecté le ${shortDate(status.connectedAt)}.`}
          {status.lastReadAt && ` Dernière lecture le ${shortDate(status.lastReadAt)}.`}
        </p>
      ) : (
        <p className="m-0 text-[13px] leading-snug text-[#4A4540]">Connectez @roogo.226 une fois : le chiffre se lit ensuite tout seul.</p>
      )}
      {status.connected && status.lastError && (
        <p role="status" className="m-0 rounded-xl bg-[#FBF1DE] px-3 py-2 text-[13px] font-semibold leading-snug text-[#6B4A12]">
          Dernière lecture ratée : {status.lastError}
        </p>
      )}
      {!status.configured && (
        <p className="m-0 text-xs leading-snug text-[#6B625B]">À ajouter sur Vercel : {status.missing.join(", ")}.</p>
      )}
      {status.configured && !status.tableReady && (
        <p className="m-0 text-xs leading-snug text-[#6B625B]">La migration 100 n’est pas encore passée.</p>
      )}
      {message && (
        <p role="status" className={cn("m-0 rounded-xl px-3 py-2 text-[13px] font-semibold leading-snug", message.good ? "bg-[#E6F2EA] text-[#1F5A33]" : "bg-[#FBE3DF] text-[#8E2A1E]")}>
          {message.text}
        </p>
      )}

      {status.connected ? (
        <button
          type="button"
          onClick={disconnect}
          disabled={busy}
          className="inline-flex h-10 cursor-pointer items-center justify-center self-start rounded-full border border-[#EAE1D5] px-4 text-sm font-bold text-[#4A4540] transition-colors hover:bg-[#FBF7F1] disabled:opacity-60"
        >
          Déconnecter
        </button>
      ) : canConnect ? (
        <a
          href="/api/admin/social/tiktok/connect"
          className="inline-flex h-10 items-center justify-center self-start rounded-full bg-[#1F1A16] px-4 text-sm font-extrabold text-white no-underline transition-colors hover:bg-black"
        >
          Connecter TikTok
        </a>
      ) : null}
    </motion.section>
  );
}
