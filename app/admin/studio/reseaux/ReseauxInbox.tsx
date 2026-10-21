"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowClockwiseIcon, ChatCircleDotsIcon, ChatTextIcon, CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  INBOX_STATUS_LABELS,
  TIKTOK_COMMENTS_NOTE,
  type InboxCounts,
  type InboxItemDto,
  type InboxKind,
  type InboxPayload,
  type InboxStatus,
  type SourceStateDto,
} from "@/lib/social/inbox";
import { notifySocialInboxChanged } from "@/components/admin/useSocialInboxCount";
import { StudioSwitch } from "../StudioSwitch";
import { NetworkIcon } from "../calendrier/NetworkIcons";
import { InboxCard } from "./InboxCard";
import { ago } from "./format";

type NetworkFilter = "tous" | "facebook" | "instagram";
type StatusFilter = InboxStatus | "tous";

function countsOf(items: InboxItemDto[]): InboxCounts {
  const comments = items.filter((i) => i.kind === "comment" && i.status === "a_repondre").length;
  const messages = items.filter((i) => i.kind === "message" && i.status === "a_repondre").length;
  return { comments, messages, total: comments + messages };
}

type Props = {
  initial: InboxPayload;
  /** Preview only: open tab, and reply drafts to show in the boxes. */
  initialTab?: InboxKind;
  drafts?: Record<string, string>;
  /** Preview only: a fixed clock. */
  fixedNow?: number;
};

export function ReseauxInbox({ initial, initialTab = "comment", drafts, fixedNow }: Props) {
  const [data, setData] = useState<InboxPayload>(initial);
  const [tab, setTab] = useState<InboxKind>(initialTab);
  const [network, setNetwork] = useState<NetworkFilter>("tous");
  const [status, setStatus] = useState<StatusFilter>("a_repondre");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => fixedNow ?? Date.now());

  // The 24-hour window labels move with the clock.
  useEffect(() => {
    if (fixedNow) return;
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [fixedNow]);

  // The server count can be ahead of the 200 items listed; local changes adjust it.
  const counts = useMemo(() => {
    const local = countsOf(data.items);
    const listedAll = data.items.length < 200;
    return listedAll ? local : data.counts;
  }, [data]);

  async function refresh() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/admin/social/inbox/refresh", { method: "POST" });
      const body = (await res.json().catch(() => null)) as (InboxPayload & { refreshed?: boolean; error?: string }) | null;
      if (!res.ok || !body || !Array.isArray(body.items)) {
        setNote(`Actualisation impossible (HTTP ${res.status}${body?.error ? ` : ${body.error}` : ""}).`);
        return;
      }
      setData(body);
      setNow(Date.now());
      notifySocialInboxChanged();
      setNote(
        !body.ready ? null : body.refreshed ? "Commentaires et messages relus chez Meta." : "La dernière lecture a moins de 2 minutes : la liste est déjà à jour.",
      );
    } catch (error) {
      setNote(`Actualisation impossible : ${error instanceof Error ? error.message : "erreur réseau"}.`);
    } finally {
      setBusy(false);
    }
  }

  function onItemChange(item: InboxItemDto) {
    setData((cur) => ({ ...cur, items: cur.items.map((i) => (i.id === item.id ? item : i)) }));
    notifySocialInboxChanged();
  }

  const list = useMemo(
    () =>
      data.items.filter(
        (i) => i.kind === tab && (network === "tous" || i.network === network) && (status === "tous" || i.status === status),
      ),
    [data.items, tab, network, status],
  );

  const tabCount = tab === "comment" ? counts.comments : counts.messages;
  const failing = data.sources.filter((s) => s.lastError);

  return (
    <div className="mx-auto w-full max-w-4xl px-1 pb-16 text-[#1F1A16]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <StudioSwitch inboxCount={counts.total} />
        <div className="ml-auto flex items-center gap-2">
          {data.ready && <span className="hidden text-[13px] text-neutral-600 sm:inline">Lu {ago(data.lastSyncAt, now)}</span>}
          <button
            type="button"
            onClick={refresh}
            disabled={busy || !data.ready}
            className="inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#C96A2E] px-4 text-sm font-bold text-white transition-colors hover:bg-[#B85E26] disabled:opacity-60 md:h-10"
          >
            <ArrowClockwiseIcon size={15} weight="bold" className={cn("size-[15px]", busy && "animate-spin")} />
            {busy ? "Lecture…" : "Actualiser"}
          </button>
        </div>
      </div>

      <h1 className="mt-4 text-2xl font-bold tracking-tight md:text-[28px]">Réseaux</h1>
      <p className="mt-1 max-w-2xl text-[14px] text-neutral-600">
        Les commentaires et les messages privés de Facebook et Instagram, au même endroit. Les réponses partent au nom de Roogo et chacune est enregistrée avec le nom de la personne qui l&apos;envoie.
      </p>
      {data.ready && <p className="mt-1 text-[12px] text-neutral-500 sm:hidden">Lu {ago(data.lastSyncAt, now)}, relu toutes les 10 minutes</p>}

      {note && (
        <p role="status" className="mt-3 rounded-2xl bg-white/80 px-3 py-2 text-[13px] font-semibold text-neutral-700 ring-1 ring-[rgba(74,52,36,0.08)]">
          {note}
        </p>
      )}

      {data.notice && <Banner tone={data.ready ? "error" : "warn"}>{data.notice}</Banner>}
      {data.missing.length > 0 && (
        <Banner tone="warn">Configuration Meta incomplète sur le serveur : {data.missing.join(", ")}. Ajoutez ces variables dans Vercel puis redéployez.</Banner>
      )}

      {data.ready && <SourceCards sources={data.sources} now={now} failing={failing.length} />}

      {/* Commentaires | Messages */}
      <div role="tablist" aria-label="Listes" className="mt-5 grid grid-cols-2 gap-1 rounded-full bg-[rgba(255,255,255,0.7)] p-1">
        {(
          [
            ["comment", "Commentaires", counts.comments, ChatTextIcon],
            ["message", "Messages", counts.messages, ChatCircleDotsIcon],
          ] as const
        ).map(([key, label, n, Icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "inline-flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-full px-2 text-[14px] font-bold transition-colors sm:px-3 sm:text-[15px] md:h-10",
              tab === key ? "bg-white text-[#1F1A16] shadow-sm" : "text-neutral-600 hover:text-neutral-900",
            )}
          >
            <Icon size={17} weight={tab === key ? "fill" : "bold"} className="hidden shrink-0 sm:block" />
            <span className="truncate">{label}</span>
            {n > 0 && (
              <span aria-label={`${n} à répondre`} className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#C96A2E] px-1.5 text-[11px] font-bold leading-none text-white">
                {n > 99 ? "99+" : n}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Réseau" className="inline-flex flex-wrap gap-1">
          {(["tous", "facebook", "instagram"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={network === key}
              onClick={() => setNetwork(key)}
              className={cn(
                "inline-flex h-10 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold ring-1 ring-inset sm:px-3 md:h-9",
                network === key ? "bg-white text-[#1F1A16] ring-[#C96A2E]" : "bg-white/50 text-neutral-600 ring-[rgba(74,52,36,0.10)] hover:text-neutral-900",
              )}
            >
              {key !== "tous" && <NetworkIcon network={key} size={15} label={false} />}
              {key === "tous" ? "Tous" : key === "facebook" ? "Facebook" : "Instagram"}
            </button>
          ))}
          <span
            title={TIKTOK_COMMENTS_NOTE}
            aria-disabled="true"
            aria-label={`TikTok, bientôt. ${TIKTOK_COMMENTS_NOTE}`}
            className="inline-flex h-10 cursor-help items-center gap-1.5 rounded-full border border-dashed border-[rgba(74,52,36,0.18)] px-2.5 text-sm font-semibold text-neutral-400 sm:px-3 md:h-9"
          >
            <NetworkIcon network="tiktok" size={15} label={false} className="opacity-50 grayscale" />
            <span className="hidden sm:inline">Bientôt</span>
          </span>
        </div>
        <label className="ml-auto inline-flex items-center gap-2 text-sm font-semibold text-neutral-700">
          <span className="sr-only sm:not-sr-only">Statut</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="h-10 rounded-full border-0 bg-white px-3 pr-8 text-sm font-semibold ring-1 ring-inset ring-[rgba(74,52,36,0.12)] focus:outline-none focus:ring-2 focus:ring-[#C96A2E] md:h-9"
          >
            {(["a_repondre", "repondu", "ignore"] as const).map((s) => (
              <option key={s} value={s}>
                {INBOX_STATUS_LABELS[s]}
              </option>
            ))}
            <option value="tous">Tous les statuts</option>
          </select>
        </label>
      </div>

      {/* The list */}
      {!data.ready ? (
        <EmptyState>La liste apparaîtra ici une fois la migration 101 lancée.</EmptyState>
      ) : list.length === 0 ? (
        <EmptyState>
          {status === "a_repondre"
            ? tab === "comment"
              ? "Aucun commentaire n'attend de réponse. Bravo."
              : "Aucun message n'attend de réponse. Bravo."
            : "Rien à afficher avec ces filtres."}
        </EmptyState>
      ) : (
        <ul className="mt-3 grid gap-2.5" aria-label={`${tab === "comment" ? "Commentaires" : "Messages"}, ${tabCount} à répondre`}>
          {list.map((item) => (
            <InboxCard key={item.id} item={item} now={now} pageId={data.pageId} onChange={onItemChange} initialDraft={drafts?.[item.id]} />
          ))}
        </ul>
      )}

      <p className="mt-4 text-[12px] text-neutral-500">
        {TIKTOK_COMMENTS_NOTE} Les messages privés peuvent recevoir une réponse depuis Roogo pendant 7 jours après le dernier message de la personne : normalement pendant 24 heures, puis en agent humain (règle de Meta).
      </p>
    </div>
  );
}

function SourceCards({ sources, now, failing }: { sources: SourceStateDto[]; now: number; failing: number }) {
  return (
    <section aria-label="Lecture chez Meta" className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
      {sources.map((s) => {
        const network = s.source.startsWith("facebook") ? "facebook" : "instagram";
        return (
          <div
            key={s.source}
            className={cn(
              "min-w-0 rounded-2xl p-2.5 ring-1 ring-inset",
              s.lastError ? "bg-[#FBE3DF] ring-[#F2C2BA]" : "bg-white/80 ring-[rgba(74,52,36,0.08)]",
              s.lastError && failing > 0 && "col-span-2",
            )}
          >
            <p className="flex min-w-0 items-start gap-1.5 text-[12px] font-bold leading-tight text-[#1F1A16]">
              <NetworkIcon network={network} size={14} label={false} className="mt-px" />
              <span className="min-w-0 break-words">{s.label}</span>
            </p>
            {s.lastError ? (
              <p className="mt-1 flex items-start gap-1 text-[12px] leading-snug text-[#8E2A1E]">
                <WarningCircleIcon size={14} weight="bold" className="mt-px size-3.5 shrink-0" />
                <span className="break-words">{s.lastError}</span>
              </p>
            ) : (
              <p className="mt-1 flex items-center gap-1 text-[12px] text-neutral-600">
                <CheckCircleIcon size={14} weight="fill" className="size-3.5 shrink-0 text-emerald-600" />
                <span className="truncate">{s.lastSuccessAt ? `Lu ${ago(s.lastSuccessAt, now)}` : "Pas encore lu"}</span>
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}

function Banner({ tone, children }: { tone: "warn" | "error"; children: React.ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "mt-3 flex items-start gap-2 rounded-2xl px-3 py-2.5 text-[14px] ring-1 ring-inset",
        tone === "error" ? "bg-[#FBE3DF] text-[#8E2A1E] ring-[#F2C2BA]" : "bg-amber-50 font-semibold text-amber-900 ring-amber-200",
      )}
    >
      <WarningCircleIcon size={17} weight="bold" className="mt-0.5 size-[17px] shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 rounded-[22px] bg-white/80 px-4 py-8 text-center text-sm text-neutral-600">{children}</p>;
}
