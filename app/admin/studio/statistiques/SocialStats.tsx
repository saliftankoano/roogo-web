"use client";

import { useMemo, useState } from "react";
import {
  ArrowClockwiseIcon,
  ArrowSquareOutIcon,
  TrendDownIcon,
  TrendUpIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { AccountSnapshot, FollowerTrend, Network, PostFormat, SocialPost, SocialSnapshot } from "@/lib/social/insights";
import type { SocialHistory } from "@/lib/social/insights-server";
import { StudioHeader } from "../StudioHeader";
import { NetworkIcon } from "../calendrier/NetworkIcons";
import { TikTokConnectPanel, TikTokConnectedFooter, type TikTokAdmin } from "./TikTokConnection";

export type { TikTokAdmin };

type Payload = { snapshot: SocialSnapshot; history: SocialHistory };

const NUMBER = new Intl.NumberFormat("fr-FR");
const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "–" : NUMBER.format(n));
const pct = (r: number | null) => (r === null ? "–" : `${(r * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`);

const NETWORK_NAME: Record<Network, string> = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok" };
const FORMAT_LABEL: Record<PostFormat, string> = {
  reel: "Reel",
  video: "Vidéo",
  photo: "Photo",
  carrousel: "Carrousel",
  texte: "Texte",
  autre: "Publication",
};

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
}

function ago(iso: string, now = Date.now()) {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `le ${shortDate(iso)}`;
}

function daysLabel(days: number | null) {
  if (days === null) return "Aucune publication lue";
  if (days === 0) return "Dernière publication aujourd'hui";
  if (days === 1) return "Dernière publication hier";
  return `Dernière publication il y a ${days} jours`;
}

export function SocialStats({ initial, tiktok }: { initial: Payload; tiktok: TikTokAdmin }) {
  const [data, setData] = useState<Payload>(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [filter, setFilter] = useState<"tous" | Network>("tous");
  const { snapshot, history } = data;

  async function refresh() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/admin/social/insights", { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.snapshot) {
        setNote(`Actualisation impossible (HTTP ${res.status}${body?.error ? ` : ${body.error}` : ""}).`);
        return;
      }
      setData({ snapshot: body.snapshot, history: body.history });
      setNote(body.refreshed ? "Chiffres relus chez Meta et TikTok." : "Les chiffres ont moins de 10 minutes : ils sont déjà à jour.");
    } catch (error) {
      setNote(`Actualisation impossible : ${error instanceof Error ? error.message : "erreur réseau"}.`);
    } finally {
      setBusy(false);
    }
  }

  const posts = useMemo(() => {
    const all = [...snapshot.facebook.posts, ...snapshot.instagram.posts, ...(snapshot.tiktok?.posts ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return filter === "tous" ? all : all.filter((p) => p.network === filter);
  }, [snapshot, filter]);

  return (
    <div className="mx-auto w-full max-w-6xl px-1 pb-16 text-[#1F1A16]">
      <StudioHeader
        actions={
          <>
            <span className="text-[13px] text-neutral-600">Mis à jour {ago(snapshot.fetchedAt)}</span>
            <button
              type="button"
              onClick={refresh}
              disabled={busy}
              className="inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#C96A2E] px-4 text-sm font-bold text-white transition-colors hover:bg-[#B85E26] disabled:opacity-60 md:h-10"
            >
              <ArrowClockwiseIcon size={15} weight="bold" className={cn("size-[15px]", busy && "animate-spin")} />
              {busy ? "Lecture…" : "Actualiser"}
            </button>
          </>
        }
      />

      <h2 className="mt-4 text-2xl font-bold tracking-tight md:text-[28px]">Nos réseaux sociaux</h2>
      <p className="mt-1 max-w-2xl text-[14px] text-neutral-600">
        Abonnés, publications et rythme de publication de la Page Facebook, du compte Instagram et du compte TikTok. Les chiffres viennent de Meta et de TikTok et sont relus toutes les 6 heures.
      </p>

      {note && (
        <p role="status" className="mt-3 rounded-2xl bg-white/80 px-3 py-2 text-[13px] font-semibold text-neutral-700 ring-1 ring-[rgba(74,52,36,0.08)]">
          {note}
        </p>
      )}

      {snapshot.missing.length > 0 && (
        <Banner tone="warn">
          Configuration Meta incomplète sur le serveur : {snapshot.missing.join(", ")}. Ajoutez ces variables dans Vercel puis redéployez.
        </Banner>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <AccountCard account={snapshot.facebook} trend={history.facebook} />
        <AccountCard account={snapshot.instagram} trend={history.instagram} />
        {snapshot.tiktok && <AccountCard account={snapshot.tiktok} trend={history.tiktok ?? EMPTY_TREND} tiktokAdmin={tiktok} />}
      </div>
      {history.error && <Banner tone="warn">{history.error}</Banner>}

      <section aria-labelledby="posts-title" className="mt-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="posts-title" className="text-lg font-bold">
            Dernières publications
          </h2>
          <div role="radiogroup" aria-label="Réseau" className="ml-auto inline-flex rounded-full bg-[rgba(255,255,255,0.7)] p-1">
            {(["tous", "facebook", "instagram", "tiktok"] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={filter === key}
                onClick={() => setFilter(key)}
                className={cn(
                  "inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold md:h-9",
                  filter === key ? "bg-[rgba(201,106,46,0.12)] text-[#A8521D]" : "text-neutral-600 hover:text-neutral-900",
                )}
              >
                {key !== "tous" && <NetworkIcon network={key} size={14} label={false} />}
                {key === "tous" ? "Tous" : NETWORK_NAME[key]}
              </button>
            ))}
          </div>
        </div>
        {posts.length === 0 ? (
          <p className="mt-3 rounded-[24px] bg-white/80 px-4 py-6 text-center text-sm text-neutral-600">
            Aucune publication à afficher pour le moment.
          </p>
        ) : (
          <ul className="mt-3 grid gap-2.5">
            {posts.map((post) => (
              <PostRow key={`${post.network}-${post.id}`} post={post} />
            ))}
          </ul>
        )}
        <p className="mt-3 text-[12px] text-neutral-500">
          Portée : comptes uniques touchés. Vues : lectures de la vidéo ou affichages. Engagement : interactions divisées par la portée. Un tiret veut dire que Meta ou TikTok ne donne pas ce chiffre. TikTok ne donne ni la portée ni les enregistrements.
        </p>
      </section>
    </div>
  );
}

const EMPTY_TREND: FollowerTrend = { points: [], delta: null, since: null };

function Banner({ tone, children }: { tone: "warn" | "error"; children: React.ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : undefined}
      className={cn(
        "mt-3 flex items-start gap-2 rounded-2xl px-3 py-2 text-[13px] ring-1 ring-inset",
        tone === "error" ? "bg-[#FBE3DF] text-[#8E2A1E] ring-[#F2C2BA]" : "bg-amber-50 text-amber-900 ring-amber-200",
      )}
    >
      <WarningCircleIcon size={16} weight="bold" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function Sparkline({ points }: { points: { date: string; value: number }[] }) {
  if (points.length < 2) return null;
  const w = 120;
  const h = 32;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${((i / (points.length - 1)) * w).toFixed(1)},${(h - 2 - ((p.value - min) / span) * (h - 4)).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="shrink-0">
      <path d={d} fill="none" stroke="#C96A2E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AccountCard({ account, trend, tiktokAdmin }: { account: AccountSnapshot; trend: FollowerTrend; tiktokAdmin?: TikTokAdmin }) {
  const { cadence } = account;
  const maxWeek = Math.max(1, ...cadence.weeks.map((w) => w.count));
  return (
    <section className="min-w-0 rounded-[24px] bg-white/85 p-4 ring-1 ring-[rgba(74,52,36,0.08)] md:p-5" aria-label={NETWORK_NAME[account.network]}>
      <div className="flex items-center gap-2">
        <NetworkIcon network={account.network} size={22} label={false} />
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-bold">{account.name ?? NETWORK_NAME[account.network]}</h2>
          {account.handle && <p className="truncate text-[12px] text-neutral-500">@{account.handle}</p>}
        </div>
      </div>

      {account.notConnected ? (
        tiktokAdmin ? (
          <TikTokConnectPanel admin={tiktokAdmin} />
        ) : (
          <p className="mt-4 rounded-2xl bg-[#FBF7F2] px-3 py-3 text-[13px] text-neutral-700">{account.error}</p>
        )
      ) : account.error ? (
        <Banner tone="error">{account.error}</Banner>
      ) : (
        <>
          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wide text-neutral-500">Abonnés</p>
              <p className="text-[34px] font-extrabold leading-none tabular-nums">{fmt(account.followers)}</p>
              {trend.delta !== null && trend.since && (
                <p
                  className={cn(
                    "mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold",
                    trend.delta >= 0 ? "bg-emerald-50 text-emerald-800" : "bg-[#FBE3DF] text-[#8E2A1E]",
                  )}
                >
                  {trend.delta >= 0 ? <TrendUpIcon size={13} weight="bold" /> : <TrendDownIcon size={13} weight="bold" />}
                  {trend.delta >= 0 ? "+" : ""}
                  {fmt(trend.delta)} depuis le {shortDate(`${trend.since}T00:00:00Z`)}
                </p>
              )}
            </div>
            <Sparkline points={trend.points} />
          </div>

          {account.network === "tiktok" ? (
            <dl className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-[#FBF7F2] p-3 text-center">
              <Stat label="J'aime total" value={fmt(account.profileTotals?.likes)} />
              <Stat label="Vidéos" value={fmt(account.profileTotals?.videos)} />
              <Stat label="Vues des vidéos des 28 derniers jours" value={fmt(account.totals?.views)} wrap />
            </dl>
          ) : (
            <dl className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-[#FBF7F2] p-3 text-center">
              <Stat label="Portée 28 j" value={fmt(account.totals?.reach)} />
              <Stat label="Vues 28 j" value={fmt(account.totals?.views)} />
              <Stat label="Interactions 28 j" value={fmt(account.totals?.interactions)} />
            </dl>
          )}

          <div className="mt-4">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-neutral-500">Rythme de publication</p>
            <p className="mt-1 text-[14px]">
              <strong className="tabular-nums">{cadence.last7}</strong> cette semaine glissante,{" "}
              <strong className="tabular-nums">{cadence.last30}</strong> en 30 jours, soit{" "}
              <strong className="tabular-nums">{cadence.perWeek.toLocaleString("fr-FR")}</strong> par semaine en moyenne.
            </p>
            <p className={cn("text-[13px]", (cadence.daysSinceLast ?? 99) > 3 ? "font-semibold text-[#A8521D]" : "text-neutral-600")}>
              {daysLabel(cadence.daysSinceLast)}
            </p>
            <div className="mt-2 flex h-14 items-end gap-1.5" role="img" aria-label={`Publications par semaine : ${cadence.weeks.map((w) => w.count).join(", ")}`}>
              {cadence.weeks.map((w) => (
                <div key={w.weekStart} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className={cn("w-full rounded-md", w.count ? "bg-[#C96A2E]" : "bg-[rgba(74,52,36,0.10)]")}
                    style={{ height: `${Math.max(4, (w.count / maxWeek) * 40)}px` }}
                    title={`Semaine du ${shortDate(`${w.weekStart}T00:00:00Z`)} : ${w.count}`}
                  />
                  <span className="text-[10px] tabular-nums text-neutral-500">{w.count}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-neutral-500">8 dernières semaines, du lundi au dimanche</p>
          </div>
        </>
      )}

      {account.warnings.map((w) => (
        <Banner key={w} tone="warn">
          {w}
        </Banner>
      ))}
      {account.network === "tiktok" && !account.notConnected && tiktokAdmin && <TikTokConnectedFooter admin={tiktokAdmin} />}
    </section>
  );
}

function Stat({ label, value, wrap = false }: { label: string; value: string; wrap?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col justify-end">
      <dt className={cn("text-[11px] text-neutral-500", wrap ? "leading-tight" : "truncate")}>{label}</dt>
      <dd className="text-[17px] font-bold tabular-nums">{value}</dd>
    </div>
  );
}

function Thumb({ src }: { src: string | null }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <div className="size-16 shrink-0 rounded-xl bg-[#F6F1EA]" aria-hidden="true" />;
  return (
    // Meta and TikTok CDN images (signed, short-lived, TikTok covers expire after 6 h): a plain img, not next/image.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className="size-16 shrink-0 rounded-xl bg-[#F6F1EA] object-cover" />
  );
}

function PostRow({ post }: { post: SocialPost }) {
  const metrics: [string, string][] = [
    ["Portée", fmt(post.reach)],
    ["Vues", fmt(post.views)],
    ["J'aime", fmt(post.likes)],
    ["Comm.", fmt(post.comments)],
    ["Partages", fmt(post.shares)],
    ["Enreg.", fmt(post.saves)],
    ["Engag.", pct(post.engagementRate)],
  ];
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-[20px] bg-white/85 p-3 ring-1 ring-[rgba(74,52,36,0.08)] md:flex-row md:items-center">
      <div className="flex min-w-0 flex-1 gap-3">
        <Thumb src={post.thumbnail} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-neutral-600">
            <NetworkIcon network={post.network} size={14} label={false} />
            <span className="font-semibold text-neutral-800">{NETWORK_NAME[post.network]}</span>
            <span aria-hidden="true">·</span>
            <span>{FORMAT_LABEL[post.format]}</span>
            <span aria-hidden="true">·</span>
            <span>{shortDate(post.createdAt)}</span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[14px] leading-snug">{post.caption || "Sans texte"}</p>
          {post.permalink && (
            <a
              href={post.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-[#A8521D] hover:underline"
            >
              Voir la publication
              <ArrowSquareOutIcon size={12} weight="bold" />
            </a>
          )}
        </div>
      </div>
      <dl className="grid shrink-0 grid-cols-4 gap-x-2 gap-y-1.5 rounded-2xl bg-[#FBF7F2] p-2.5 text-center sm:grid-cols-7 md:w-[460px]">
        {metrics.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="truncate text-[10px] text-neutral-500">{label}</dt>
            <dd className="text-[14px] font-bold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}
