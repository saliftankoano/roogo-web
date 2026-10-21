"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence } from "framer-motion";
import { CaretDownIcon, CaretLeftIcon, CaretRightIcon, MapPinIcon, PlusIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { notifyApprovalsChanged } from "@/components/admin/useStudioApprovals";
import {
  addDays,
  dayLabel,
  isoToDateAndSlot,
  shortDayName,
  slotLabel,
  weekDays,
  weekRangeLabel,
  weekStart,
} from "@/lib/studio/publishing";
import { glass, initials, avatarTone } from "../studio-ui";
import { StudioSwitch } from "../StudioSwitch";
import { ApprovalPreview } from "../publishing/ApprovalPreview";
import { Toast, type ToastMessage } from "../publishing/Toast";
import { NetworkIcons } from "./NetworkIcons";
import { PlanVisitDialog } from "./PlanVisitDialog";
import { PostEditor, type EditorTarget } from "./PostEditor";
import { calendarStatus, readError, type CalendarData, type Post } from "./calendar-types";

type View = "property" | "day";

const VIEW_KEY = "roogo-studio-calendar-view";

function todayIso() {
  // Ouagadougou is UTC+0, so the UTC date is the local date.
  return new Date().toISOString().slice(0, 10);
}

const MONTHS_SHORT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
function shortDate(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

const lower = (text: string) => text.replace(/^./, (c) => c.toLowerCase());

/**
 * The Studio calendar (design approved 2026-10-13). Desktop: inline week
 * title, Par bien | Par jour, the founder's "À valider par vous" tray.
 * Phone: week strip and a day list, a dark banner for the founder. Nothing
 * goes out unless a founder validated it.
 */
export function PublishingCalendar() {
  const [week, setWeek] = useState(() => weekStart(todayIso()));
  const [data, setData] = useState<CalendarData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("property");
  const [mine, setMine] = useState(false);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState<EditorTarget | null>(null);
  const [planning, setPlanning] = useState(false);
  const [preview, setPreview] = useState<{ queue: Post[]; index: number } | null>(null);
  const [day, setDay] = useState<string>(todayIso());
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_KEY);
      if (saved === "day" || saved === "property") setView(saved);
    } catch {
      // Per-viewer convenience only.
    }
  }, []);
  const chooseView = (next: View) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Not critical.
    }
  };

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

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const isFounder = data?.me.role === "founder";
  const slots = data?.slots ?? ["12:00", "19:00"];
  const days = weekDays(week);
  const today = todayIso();
  const posts = useMemo(
    () => (data?.posts ?? []).filter((p) => !mine || !data || p.assigneeId === data.me.id),
    [data, mine],
  );
  const byDay = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const p of posts) {
      const { date } = isoToDateAndSlot(p.scheduledAt);
      map.set(date, [...(map.get(date) ?? []), p]);
    }
    return map;
  }, [posts]);
  const waiting = data?.waiting ?? [];
  const metaOff = data && (!data.meta.facebook || !data.meta.instagram);

  // The phone's selected day follows the week.
  useEffect(() => {
    setDay(days.includes(today) ? today : days[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week]);

  function merge(post: Post | null, removedId?: string) {
    setData((current) => {
      if (!current) return current;
      let list = current.posts.filter((p) => p.id !== (removedId ?? post?.id));
      if (post && isoToDateAndSlot(post.scheduledAt).date >= week && isoToDateAndSlot(post.scheduledAt).date < addDays(week, 7)) list = [...list, post];
      list.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
      let waitingList = current.waiting.filter((p) => p.id !== (removedId ?? post?.id));
      if (post && post.status === "a_valider" && current.me.role === "founder") waitingList = [...waitingList, post].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
      return { ...current, posts: list, waiting: waitingList };
    });
  }

  function open(post: Post) {
    if (isFounder && post.status === "a_valider") {
      const index = waiting.findIndex((p) => p.id === post.id);
      setPreview({ queue: index >= 0 ? waiting : [post], index: Math.max(0, index) });
    } else {
      setEditing({ kind: "edit", post });
    }
  }

  async function quickApprove(post: Post) {
    try {
      const res = await fetch(`/api/admin/studio/publications/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const { post: saved } = (await res.json()) as { post: Post };
      merge(saved);
      notifyApprovalsChanged();
      setToast({ id: Date.now(), text: `Validée. Part ${lower(slotLabel(saved.scheduledAt))}.` });
    } catch (e) {
      setToast({ id: Date.now(), text: e instanceof Error ? e.message : "Validation impossible", tone: "warn" });
    }
  }

  const newPost = () => setEditing({ kind: "new", date: days.includes(today) ? today : days[0], slot: slots[slots.length - 1] });

  const planMenu = (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu}
        onClick={() => setMenu((v) => !v)}
        className="inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#C96A2E] px-4 text-sm font-bold text-white transition-colors hover:bg-[#B85E26] md:h-10"
      >
        <PlusIcon size={15} weight="bold" className="size-[15px]" />
        Planifier
        <CaretDownIcon size={13} weight="bold" className={cn("size-[13px] transition-transform", menu && "rotate-180")} />
      </button>
      {menu && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-64 rounded-[20px] border border-[rgba(74,52,36,0.10)] bg-white p-1.5 shadow-2xl">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(false);
              newPost();
            }}
            className="flex min-h-11 w-full items-center gap-2.5 rounded-2xl px-3 text-left text-sm font-semibold text-[#1F1A16] hover:bg-[#F6F1EA]"
          >
            <PlusIcon size={16} weight="bold" className="text-[#C96A2E]" />
            Nouvelle publication
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(false);
              setPlanning(true);
            }}
            className="flex min-h-11 w-full items-center gap-2.5 rounded-2xl px-3 text-left text-sm font-semibold text-[#1F1A16] hover:bg-[#F6F1EA]"
          >
            <MapPinIcon size={16} weight="bold" className="text-[#C96A2E]" />
            Planifier une visite
          </button>
        </div>
      )}
    </div>
  );

  const weekNav = (
    <div className="flex min-w-0 items-center gap-1">
      <button
        type="button"
        aria-label="Semaine précédente"
        onClick={() => setWeek(addDays(week, -7))}
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-neutral-700 hover:bg-white/80 md:size-9"
      >
        <CaretLeftIcon size={16} weight="bold" />
      </button>
      <h1 className="min-w-0 truncate text-center text-xl font-bold tracking-tight text-[#1F1A16] md:text-2xl" aria-live="polite">
        {weekRangeLabel(week)}
      </h1>
      <button
        type="button"
        aria-label="Semaine suivante"
        onClick={() => setWeek(addDays(week, 7))}
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-neutral-700 hover:bg-white/80 md:size-9"
      >
        <CaretRightIcon size={16} weight="bold" />
      </button>
    </div>
  );

  const loading = data === null && !error;

  return (
    // Break out of the admin container, like the Studio itself.
    <div className="relative left-1/2 w-[calc(100vw-1rem)] max-w-[1840px] -translate-x-1/2 md:w-[calc(100vw-3rem)]">
      {/* Toolbar. Phone: switch and Planifier, then the week. Desktop: one line. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-1">
        <StudioSwitch />
        <div className="ml-auto md:hidden">{planMenu}</div>
        <div className="flex w-full justify-center md:w-auto md:justify-start">{weekNav}</div>
        <div className="ml-auto hidden items-center gap-2 md:flex">
          {data && !isFounder && (
            <button
              type="button"
              aria-pressed={mine}
              onClick={() => setMine((v) => !v)}
              className={cn(
                "inline-flex h-10 items-center rounded-full px-3.5 text-sm font-semibold transition-colors",
                mine ? "bg-[rgba(201,106,46,0.12)] text-[#A8521D]" : "bg-white/70 text-neutral-600 hover:bg-white",
              )}
            >
              Seulement mes tâches
            </button>
          )}
          <div role="radiogroup" aria-label="Affichage" className="inline-flex rounded-full bg-[rgba(255,255,255,0.7)] p-1">
            {(
              [
                ["property", "Par bien"],
                ["day", "Par jour"],
              ] as const
            ).map(([key, text]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={view === key}
                onClick={() => chooseView(key)}
                className={cn(
                  "h-9 rounded-full px-3.5 text-sm font-semibold transition-colors",
                  view === key ? "bg-white text-[#1F1A16] shadow-sm" : "text-neutral-600 hover:text-[#1F1A16]",
                )}
              >
                {text}
              </button>
            ))}
          </div>
          {planMenu}
        </div>
      </div>

      {metaOff && (
        <p className="mt-3 flex items-start gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-[13px] text-amber-900 ring-1 ring-inset ring-amber-200">
          <WarningCircleIcon size={16} weight="bold" className="mt-0.5 size-4 shrink-0" />
          <span>
            Publication automatique inactive pour{" "}
            {[!data.meta.facebook && "Facebook", !data.meta.instagram && "Instagram"].filter(Boolean).join(" et ")} : la connexion Meta n&apos;est
            pas encore configurée. Une publication validée échouera à son heure.
          </span>
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm font-semibold text-red-600">
          {error}
        </p>
      )}

      {/* Founder: what waits for you. Desktop tray, phone banner. */}
      {isFounder && waiting.length > 0 && (
        <>
          <section aria-labelledby="tray-title" className="mt-3 hidden rounded-[24px] bg-white/80 p-4 ring-2 ring-[#F1D3A1] md:block">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h2 id="tray-title" className="text-[15px] font-bold text-[#1F1A16]">
                À valider par vous
              </h2>
              <span className="text-[13px] text-neutral-600">
                {waiting.length} publication{waiting.length > 1 ? "s" : ""}
              </span>
              <span className="ml-auto text-[13px] text-neutral-600">Rien ne part sans votre validation.</span>
            </div>
            <ul className="mt-3 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,360px),1fr))]">
              {waiting.map((p, i) => (
                <li key={p.id} className="flex min-w-0 gap-3 rounded-2xl bg-[#FBF7F2] p-2.5 ring-1 ring-[rgba(74,52,36,0.08)]">
                  <span className="relative h-24 w-[54px] shrink-0 overflow-hidden rounded-xl bg-[linear-gradient(160deg,#d4a985,#8a5a3a)]">
                    {p.property?.image && <Image src={p.property.image} alt="" fill sizes="54px" unoptimized className="object-cover" />}
                  </span>
                  <span className="grid min-w-0 flex-1 content-center gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-[#1F1A16]">{[p.title, p.property?.place].filter(Boolean).join(", ")}</span>
                      <span className="block truncate text-xs text-neutral-600">
                        Proposée par {p.submittedByName ?? p.assigneeName ?? "l'équipe"} · {lower(slotLabel(p.scheduledAt))}
                      </span>
                    </span>
                    <span className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setPreview({ queue: waiting, index: i })}
                        className="h-9 rounded-full bg-white px-4 text-[13px] font-bold text-[#1F1A16] ring-1 ring-[rgba(74,52,36,0.18)] hover:bg-[#F6F1EA]"
                      >
                        Aperçu
                      </button>
                      <button
                        type="button"
                        onClick={() => void quickApprove(p)}
                        className="h-9 rounded-full bg-[#1F1A16] px-4 text-[13px] font-bold text-white hover:bg-black"
                      >
                        Valider
                      </button>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <button
            type="button"
            onClick={() => setPreview({ queue: waiting, index: 0 })}
            className="mt-3 flex min-h-12 w-full items-center gap-2 rounded-2xl bg-[#1F1A16] px-4 text-left text-sm font-bold text-white ring-2 ring-[#F1D3A1] md:hidden"
          >
            <span className="min-w-0 flex-1">
              {waiting.length} publication{waiting.length > 1 ? "s" : ""} à valider par vous
            </span>
            <span className="shrink-0 text-[#F1B862]">Ouvrir ›</span>
          </button>
        </>
      )}

      {/* Phone: week strip, filter, the week's posts day by day. */}
      <div className="mt-3 md:hidden">
        <div className="grid grid-cols-7 gap-1" role="tablist" aria-label="Jours de la semaine">
          {days.map((d) => {
            const on = d === day;
            const has = (byDay.get(d) ?? []).length > 0;
            return (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => {
                  setDay(d);
                  document.getElementById(`cal-day-${d}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className={cn(
                  "flex h-16 min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl text-xs font-semibold",
                  on ? "bg-[#C96A2E] text-white" : "bg-white/70 text-neutral-600",
                  d === today && !on && "ring-1 ring-[#C96A2E]",
                )}
              >
                <span>{shortDayName(d)}</span>
                <span className="text-base font-bold">{new Date(`${d}T00:00:00Z`).getUTCDate()}</span>
                <span aria-hidden="true" className={cn("size-1.5 rounded-full", has ? (on ? "bg-white" : "bg-[#C96A2E]") : "bg-transparent")} />
              </button>
            );
          })}
        </div>
        {data && !isFounder && (
          <div role="radiogroup" aria-label="Filtre" className="mt-3 grid grid-cols-2 rounded-full bg-[rgba(255,255,255,0.7)] p-1">
            {(
              [
                [true, "À moi"],
                [false, "Équipe"],
              ] as const
            ).map(([value, text]) => (
              <button
                key={text}
                type="button"
                role="radio"
                aria-checked={mine === value}
                onClick={() => setMine(value)}
                className={cn("h-11 rounded-full text-sm font-semibold", mine === value ? "bg-white text-[#1F1A16] shadow-sm" : "text-neutral-600")}
              >
                {text}
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 grid gap-4">
          {loading && <span className="studio-skeleton h-28 rounded-2xl" />}
          {data && posts.length === 0 && <p className="rounded-2xl bg-white/70 px-4 py-6 text-center text-sm text-neutral-600">Aucune publication cette semaine.</p>}
          {days
            .filter((d) => (byDay.get(d) ?? []).length > 0)
            .map((d) => {
              const label = dayLabel(d);
              return (
                <section key={d} id={`cal-day-${d}`} aria-label={`${label.name} ${label.date}`} className="grid scroll-mt-24 gap-2">
                  <h2 className="px-1 text-xs font-bold uppercase tracking-[0.06em] text-neutral-600">
                    {label.name} {new Date(`${d}T00:00:00Z`).getUTCDate()}
                  </h2>
                  {(byDay.get(d) ?? []).map((p) => (
                    <PhoneCard key={p.id} post={p} onOpen={() => open(p)} />
                  ))}
                </section>
              );
            })}
        </div>
      </div>

      {/* Desktop. */}
      <div className="mt-3 hidden md:block">
        {view === "property" ? (
          <ByProperty days={days} posts={posts} today={today} loading={loading} onOpen={open} />
        ) : (
          <div className="grid gap-2.5 xl:grid-cols-7">
            {days.map((d) => {
              const label = dayLabel(d);
              const list = byDay.get(d) ?? [];
              const atSlot = (slot: string) => list.filter((p) => isoToDateAndSlot(p.scheduledAt).slot === slot);
              const others = list.filter((p) => !slots.includes(isoToDateAndSlot(p.scheduledAt).slot));
              return (
                <section key={d} aria-label={`${label.name} ${label.date}`} className={cn(glass, "flex min-w-0 flex-col gap-2 p-2.5", d === today && "ring-2 ring-primary/40")}>
                  <header className="flex items-baseline justify-between px-1">
                    <span className="text-sm font-bold text-neutral-900">{label.name}</span>
                    <span className={cn("text-xs font-semibold", d === today ? "text-[#a8521d]" : "text-neutral-500")}>{label.date}</span>
                  </header>
                  {loading ? (
                    <span className="studio-skeleton h-24 rounded-2xl" />
                  ) : (
                    <>
                      {slots.map((slot) => (
                        <div key={slot} className="grid gap-1.5">
                          <span className="px-1 text-[11px] font-semibold tabular-nums text-neutral-500">{slot}</span>
                          {atSlot(slot).map((p) => (
                            <CalCard key={p.id} post={p} onOpen={() => open(p)} />
                          ))}
                          {atSlot(slot).length === 0 && (
                            <button
                              type="button"
                              onClick={() => setEditing({ kind: "new", date: d, slot })}
                              className="flex h-10 items-center justify-center gap-1 rounded-2xl border border-dashed border-[rgba(74,52,36,0.18)] text-xs font-semibold text-neutral-400 transition-colors hover:border-primary/40 hover:bg-white/50 hover:text-[#a8521d]"
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
                            <CalCard key={p.id} post={p} onOpen={() => open(p)} />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {editing && data && (
          <PostEditor
            key={editing.kind === "edit" ? editing.post.id : "new"}
            target={editing}
            slots={slots}
            team={data.team}
            me={data.me}
            tiktok={data.tiktok}
            onClose={() => setEditing(null)}
            onSaved={(post, removedId) => {
              merge(post, removedId);
              notifyApprovalsChanged();
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
              const target = first ? weekStart(isoToDateAndSlot(first.scheduledAt).date) : week;
              setWeek(target);
              void load(target);
            }}
          />
        )}
      </AnimatePresence>
      {preview && data && (
        <ApprovalPreview
          queue={preview.queue}
          startIndex={preview.index}
          daySlots={slots}
          tiktok={data.tiktok}
          onClose={() => {
            setPreview(null);
            void load(week);
          }}
          onChanged={(post) => merge(post)}
        />
      )}
      <Toast toast={toast} onDone={clearToast} />
    </div>
  );
}

/** Desktop "Par bien": one row per property, the week's seven days across. */
function ByProperty({ days, posts, today, loading, onOpen }: { days: string[]; posts: Post[]; today: string; loading: boolean; onOpen: (p: Post) => void }) {
  const rows = useMemo(() => {
    const map = new Map<string, { key: string; title: string; visit: string | null; posts: Post[] }>();
    for (const p of posts) {
      const key = p.propertyId ?? "none";
      const row = map.get(key) ?? { key, title: p.property?.title ?? "Sans bien", visit: null, posts: [] };
      row.posts.push(p);
      if (p.visitDate && (!row.visit || p.visitDate > row.visit)) row.visit = p.visitDate;
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => a.posts[0].scheduledAt.localeCompare(b.posts[0].scheduledAt));
  }, [posts]);

  return (
    <div className="overflow-hidden rounded-[24px] bg-white/85 ring-1 ring-[rgba(74,52,36,0.08)]">
      <div role="table" aria-label="Publications par bien" className="min-w-0">
        <div role="row" className="grid grid-cols-[minmax(150px,200px)_repeat(7,minmax(0,1fr))] border-b border-[rgba(74,52,36,0.08)] text-xs font-semibold text-neutral-600">
          <span role="columnheader" className="px-4 py-3">
            Bien et visite
          </span>
          {days.map((d) => (
            <span role="columnheader" key={d} className={cn("px-2 py-3", d === today && "font-bold text-[#C96A2E]")}>
              {shortDayName(d)} {new Date(`${d}T00:00:00Z`).getUTCDate()}
            </span>
          ))}
        </div>
        {loading && <span className="studio-skeleton m-4 block h-24 rounded-2xl" />}
        {!loading && rows.length === 0 && <p className="px-4 py-10 text-center text-sm text-neutral-600">Aucune publication cette semaine.</p>}
        {rows.map((row) => (
          <div role="row" key={row.key} className="grid min-h-28 grid-cols-[minmax(150px,200px)_repeat(7,minmax(0,1fr))] border-b border-[rgba(74,52,36,0.06)] last:border-b-0">
            <span role="rowheader" className="min-w-0 border-r border-[rgba(74,52,36,0.06)] px-4 py-3">
              <span className="block break-words text-sm font-bold text-[#1F1A16]">{row.title}</span>
              {row.visit && <span className="block text-xs text-neutral-600">Visite du {shortDate(row.visit)}</span>}
            </span>
            {days.map((d) => (
              <span role="cell" key={d} className="grid min-w-0 content-start gap-1.5 p-1.5">
                {row.posts
                  .filter((p) => isoToDateAndSlot(p.scheduledAt).date === d)
                  .map((p) => (
                    <CalCard key={p.id} post={p} onOpen={() => onOpen(p)} />
                  ))}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function CalCard({ post, onOpen }: { post: Post; onOpen: () => void }) {
  const { label, tone } = calendarStatus(post);
  const time = isoToDateAndSlot(post.scheduledAt).slot;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid w-full min-w-0 gap-1 rounded-xl px-2.5 py-2 text-left transition-transform hover:-translate-y-px"
      style={{ background: tone.bg, boxShadow: `inset 0 0 0 ${post.status === "a_valider" ? 2 : 1}px ${tone.border}` }}
    >
      <span className="truncate text-[11px] font-bold" style={{ color: tone.fg }}>
        {label}
      </span>
      <span className="line-clamp-2 break-words text-[12px] font-bold leading-snug text-[#1F1A16]">
        {time} · {post.title || "Sans titre"}
      </span>
      <NetworkIcons networks={post.networks} size={13} />
    </button>
  );
}

function PhoneCard({ post, onOpen }: { post: Post; onOpen: () => void }) {
  const { label, tone } = calendarStatus(post);
  const time = isoToDateAndSlot(post.scheduledAt).slot;
  const kind = { video: "Vidéo", image: "Image", carousel: "Photos", text: "Texte" }[post.mediaType];
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full min-w-0 gap-3 rounded-2xl bg-white p-2.5 text-left ring-1 ring-[rgba(74,52,36,0.08)]",
        post.status === "a_valider" && "ring-2 ring-[#E9A23B]",
      )}
    >
      <span className="relative h-24 w-[54px] shrink-0 overflow-hidden rounded-xl bg-[linear-gradient(160deg,#d4a985,#8a5a3a)]">
        {post.property?.image && <Image src={post.property.image} alt="" fill sizes="54px" unoptimized className="object-cover" />}
      </span>
      <span className="grid min-w-0 flex-1 content-center gap-1">
        <span className="text-[11px] font-semibold text-neutral-600">
          {time} · {kind}
        </span>
        <span className="break-words text-[15px] font-bold leading-snug text-[#1F1A16]">
          {[post.title, post.property?.place].filter(Boolean).join(", ") || "Sans titre"}
        </span>
        <NetworkIcons networks={post.networks} size={15} />
        <span className="flex items-center gap-2">
          <span className="inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-bold" style={{ background: tone.bg, color: tone.fg }}>
            {label}
          </span>
          {post.assigneeName && (
            <span title={post.assigneeName} className={cn("ml-auto flex size-6 items-center justify-center rounded-full text-[10px] font-bold", avatarTone(post.assigneeName))}>
              {initials(post.assigneeName)}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
