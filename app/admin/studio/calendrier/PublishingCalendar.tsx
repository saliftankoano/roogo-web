"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence } from "framer-motion";
import {
  CalendarDotsIcon,
  CaretLeftIcon,
  CaretRightIcon,
  FilmSlateIcon,
  ImagesIcon,
  MapPinIcon,
  PlusIcon,
  TextAaIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  NETWORK_LABELS,
  TIKTOK_PENDING_TOOLTIP,
  addDays,
  dayLabel,
  isoToDateAndSlot,
  weekDays,
  weekLabel,
  weekStart,
  type MediaType,
  type Network,
} from "@/lib/studio/publishing";
import { glass, initials, avatarTone, primaryGradient, stage } from "../studio-ui";
import { NetworkIcon, NetworkIcons } from "./NetworkIcons";
import { PlanVisitDialog } from "./PlanVisitDialog";
import { PostEditor, type EditorTarget } from "./PostEditor";
import { StatusChip } from "./StatusChip";
import { readError, type CalendarData, type Post } from "./calendar-types";

const MEDIA_ICON: Record<MediaType, typeof FilmSlateIcon> = {
  video: FilmSlateIcon,
  image: ImagesIcon,
  carousel: ImagesIcon,
  text: TextAaIcon,
};

type Filter = "all" | Network;

function todayIso() {
  // Ouagadougou is UTC+0, so the UTC date is the local date.
  return new Date().toISOString().slice(0, 10);
}


/**
 * The Studio publishing calendar (2026-10-12): one week, Monday to Sunday,
 * cards at the day's posting slots (12:00 and 19:00 Ouagadougou time by
 * default). Nothing goes out unless a founder pressed "Valider".
 */
export function PublishingCalendar() {
  const [week, setWeek] = useState(() => weekStart(todayIso()));
  const [data, setData] = useState<CalendarData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<EditorTarget | null>(null);
  const [planning, setPlanning] = useState(false);

  const load = useCallback(async (monday: string) => {
    try {
      const res = await fetch(`/api/admin/studio/publications?week=${monday}`);
      if (!res.ok) throw new Error(await readError(res));
      setData((await res.json()) as CalendarData);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Calendrier indisponible");
    }
  }, []);

  useEffect(() => {
    void load(week);
  }, [week, load]);

  const slots = data?.slots ?? ["12:00", "19:00"];
  const days = weekDays(week);
  const today = todayIso();
  const posts = useMemo(
    () => (data?.posts ?? []).filter((p) => filter === "all" || p.networks.includes(filter)),
    [data, filter],
  );
  const byDay = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const p of posts) {
      const { date } = isoToDateAndSlot(p.scheduledAt);
      map.set(date, [...(map.get(date) ?? []), p]);
    }
    return map;
  }, [posts]);
  const waiting = (data?.posts ?? []).filter((p) => p.status === "a_valider").length;
  const metaOff = data && (!data.meta.facebook || !data.meta.instagram);

  function onSaved(post: Post | null, removedId?: string) {
    setData((current) => {
      if (!current) return current;
      let list = current.posts.filter((p) => p.id !== (removedId ?? post?.id));
      if (post) list = [...list, post];
      list.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
      return { ...current, posts: list };
    });
  }

  return (
    // Break out of the admin container, like the Studio itself.
    <div className="relative left-1/2 w-[calc(100vw-1rem)] max-w-[1840px] -translate-x-1/2 md:w-[calc(100vw-3rem)]">
      <div className={cn(stage, "p-2.5 md:p-4")}>
        <div className={cn(glass, "p-3 md:p-4")}>
          {/* Header: where we are, which week, what to do. */}
          <div className="flex flex-wrap items-center gap-3">
            <nav aria-label="Studio" className="inline-flex h-10 items-center rounded-full border border-[rgba(74,52,36,0.10)] bg-white/60 p-1">
              <Link href="/admin/studio" className="inline-flex h-8 items-center rounded-full px-3 text-sm font-semibold text-neutral-600 hover:bg-white">
                Projets
              </Link>
              <span aria-current="page" className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary/12 px-3 text-sm font-semibold text-[#a8521d]">
                <CalendarDotsIcon size={15} weight="bold" className="size-[15px]" />
                Calendrier
              </span>
            </nav>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-bold leading-tight text-neutral-900">Calendrier de publication</h1>
              <p className="text-xs text-neutral-500">Heures de Ouagadougou. Rien n&apos;est publié sans la validation de Salif.</p>
            </div>
            <button
              type="button"
              onClick={() => setPlanning(true)}
              className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full border border-[rgba(74,52,36,0.12)] bg-white/80 px-4 text-sm font-semibold text-neutral-800 hover:bg-white"
            >
              <MapPinIcon size={16} weight="bold" className="size-4" />
              Planifier une visite
            </button>
            <button
              type="button"
              onClick={() => setEditing({ kind: "new", date: days.includes(today) ? today : days[0], slot: slots[slots.length - 1] })}
              className={cn("inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-semibold", primaryGradient)}
            >
              <PlusIcon size={16} weight="bold" className="size-4" />
              Nouvelle publication
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                aria-label="Semaine précédente"
                onClick={() => setWeek(addDays(week, -7))}
                className="flex size-9 items-center justify-center rounded-full border border-[rgba(74,52,36,0.10)] bg-white/70 text-neutral-700 hover:bg-white"
              >
                <CaretLeftIcon size={16} weight="bold" />
              </button>
              <button
                type="button"
                onClick={() => setWeek(weekStart(today))}
                className="inline-flex h-9 items-center rounded-full border border-[rgba(74,52,36,0.10)] bg-white/70 px-3 text-sm font-semibold text-neutral-700 hover:bg-white"
              >
                Cette semaine
              </button>
              <button
                type="button"
                aria-label="Semaine suivante"
                onClick={() => setWeek(addDays(week, 7))}
                className="flex size-9 items-center justify-center rounded-full border border-[rgba(74,52,36,0.10)] bg-white/70 text-neutral-700 hover:bg-white"
              >
                <CaretRightIcon size={16} weight="bold" />
              </button>
            </div>
            <span className="text-sm font-semibold text-neutral-800">{weekLabel(week)}</span>
            {waiting > 0 && (
              <span className="inline-flex h-7 items-center rounded-full bg-amber-50 px-2.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
                {waiting} à valider
              </span>
            )}
            <div role="group" aria-label="Filtrer par réseau" className="ml-auto inline-flex flex-wrap items-center gap-1">
              {(["all", "facebook", "instagram"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors",
                    filter === key ? "bg-white text-neutral-900 shadow-sm ring-1 ring-[rgba(74,52,36,0.12)]" : "text-neutral-600 hover:bg-white/60",
                  )}
                >
                  {key !== "all" && <NetworkIcon network={key} />}
                  {key === "all" ? "Tous" : NETWORK_LABELS[key]}
                </button>
              ))}
              <span
                title={TIKTOK_PENDING_TOOLTIP}
                aria-disabled="true"
                className="inline-flex h-8 cursor-help items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-neutral-400"
              >
                <NetworkIcon network="tiktok" className="opacity-40" />
                TikTok (bientôt)
              </span>
            </div>
          </div>

          {metaOff && (
            <p className="mt-3 flex items-start gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-[13px] text-amber-900 ring-1 ring-inset ring-amber-200">
              <WarningCircleIcon size={16} weight="bold" className="mt-0.5 size-4 shrink-0" />
              <span>
                Publication automatique inactive pour{" "}
                {[!data.meta.facebook && "Facebook", !data.meta.instagram && "Instagram"].filter(Boolean).join(" et ")} : la connexion Meta
                n&apos;est pas encore configurée. Le calendrier fonctionne, mais une publication validée échouera à son heure.
              </span>
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm font-semibold text-red-600">
              {error}
            </p>
          )}
        </div>

        {/* The week. Seven columns on a wide screen, one day per row on a phone. */}
        <div className="mt-3 grid gap-2.5 xl:grid-cols-7">
          {days.map((day) => {
            const label = dayLabel(day);
            const list = byDay.get(day) ?? [];
            const atSlot = (slot: string) => list.filter((p) => isoToDateAndSlot(p.scheduledAt).slot === slot);
            const others = list.filter((p) => !slots.includes(isoToDateAndSlot(p.scheduledAt).slot));
            const weekend = label.name === "Samedi" || label.name === "Dimanche";
            return (
              <section
                key={day}
                aria-label={`${label.name} ${label.date}`}
                className={cn(glass, "flex min-w-0 flex-col gap-2 p-2.5", weekend && "opacity-80", day === today && "ring-2 ring-primary/40")}
              >
                <header className="flex items-baseline justify-between px-1">
                  <span className="text-sm font-bold text-neutral-900">{label.name}</span>
                  <span className={cn("text-xs font-semibold", day === today ? "text-[#a8521d]" : "text-neutral-500")}>
                    {day === today ? "Aujourd'hui" : label.date}
                  </span>
                </header>
                {data === null && !error ? (
                  <span className="studio-skeleton h-24 rounded-2xl" />
                ) : (
                  <>
                    {slots.map((slot) => (
                      <div key={slot} className="grid gap-1.5">
                        <span className="px-1 text-[11px] font-semibold tabular-nums text-neutral-500">{slot}</span>
                        {atSlot(slot).map((p) => (
                          <PostCard key={p.id} post={p} onOpen={() => setEditing({ kind: "edit", post: p })} />
                        ))}
                        {atSlot(slot).length === 0 && (
                          <button
                            type="button"
                            onClick={() => setEditing({ kind: "new", date: day, slot })}
                            className="flex h-11 items-center justify-center gap-1 rounded-2xl border border-dashed border-[rgba(74,52,36,0.18)] text-xs font-semibold text-neutral-400 transition-colors hover:border-primary/40 hover:bg-white/50 hover:text-[#a8521d]"
                            aria-label={`Ajouter une publication ${label.name} à ${slot}`}
                          >
                            <PlusIcon size={13} weight="bold" />
                            {slot}
                          </button>
                        )}
                      </div>
                    ))}
                    {others.length > 0 && (
                      <div className="grid gap-1.5">
                        <span className="px-1 text-[11px] font-semibold text-neutral-500">Autres heures</span>
                        {others.map((p) => (
                          <PostCard key={p.id} post={p} showTime onOpen={() => setEditing({ kind: "edit", post: p })} />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </section>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {editing && data && (
          <PostEditor
            key={editing.kind === "edit" ? editing.post.id : "new"}
            target={editing}
            slots={slots}
            team={data.team}
            me={data.me}
            onClose={() => setEditing(null)}
            onSaved={(post, removedId) => {
              onSaved(post, removedId);
              if (!post) setEditing(null);
              else setEditing({ kind: "edit", post });
            }}
          />
        )}
        {planning && data && (
          <PlanVisitDialog
            slots={slots}
            team={data.team}
            me={data.me}
            onClose={() => setPlanning(false)}
            onPlanned={(created) => {
              setPlanning(false);
              const first = created[0];
              if (first) setWeek(weekStart(isoToDateAndSlot(first.scheduledAt).date));
              void load(first ? weekStart(isoToDateAndSlot(first.scheduledAt).date) : week);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function PostCard({ post, onOpen, showTime }: { post: Post; onOpen: () => void; showTime?: boolean }) {
  const Icon = MEDIA_ICON[post.mediaType];
  const thumb = post.mediaType === "carousel" || post.mediaType === "image" ? post.photoUrls[0] ?? post.property?.image : post.property?.image;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full min-w-0 cursor-pointer flex-col gap-1.5 rounded-2xl border border-white/80 bg-white/85 p-2 text-left shadow-[0_6px_18px_-14px_rgba(90,50,26,0.6)] transition-[transform,border-color] hover:-translate-y-px hover:border-primary/30"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="relative size-9 shrink-0 overflow-hidden rounded-xl bg-[linear-gradient(145deg,#c9a58a,#7d5c45)]">
          {thumb ? (
            <Image src={thumb} alt="" fill sizes="36px" unoptimized className="object-cover" />
          ) : null}
          <span className="absolute bottom-0.5 right-0.5 flex size-4 items-center justify-center rounded-md bg-white/90">
            <Icon size={11} weight="bold" className="text-neutral-700" />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold leading-tight text-neutral-900">{post.title || "Sans titre"}</span>
          <span className="block truncate text-[11px] text-neutral-500">
            {showTime ? `${isoToDateAndSlot(post.scheduledAt).slot} · ` : ""}
            {post.property?.title.split(",").slice(1).join(",").trim() || post.property?.place || "Sans bien"}
          </span>
        </span>
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
        <StatusChip status={post.status} publishing={post.publishing} />
        <NetworkIcons networks={post.networks} />
        {post.assigneeName && (
          <span
            title={post.assigneeName}
            className={cn("ml-auto flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold", avatarTone(post.assigneeName))}
          >
            {initials(post.assigneeName)}
          </span>
        )}
      </span>
    </button>
  );
}
