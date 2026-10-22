"use client";

// "Mon briefing" (Main.dc.html on phone, Bureau.dc.html on desktop, end of
// day from FinDeJournee.dc.html). Every staff member lands here on /admin.

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { ArrowRightIcon, CaretRightIcon, ChatsCircleIcon, ClipboardTextIcon, PhoneIcon, PlusIcon } from "@phosphor-icons/react";
import { waitingSentence, type InboxCounts } from "@/lib/social/inbox";
import { cn } from "@/lib/utils";
import type { DemandeView } from "@/lib/team-tasks/core";
import type { BriefingPayload, ViewItem } from "@/lib/team-tasks/server";
import type { GoalsPayload } from "@/lib/team-goals/server";
import { TaskComposer, type ComposerGoal } from "./TaskComposer";
import { AsksBlock, MyAsksBlock, ReplyCards, type AskAction } from "./AsksBlock";
import { CallPanel } from "./CallPanel";
import { EndOfDayCard } from "./DayReport";
import type { MyDayReportPayload } from "@/lib/team-tasks/day-reports-server";
import { GoalsOverlays, GoalsStrip, LeversTally, MyShare, PrincipleBand, useGoalsUi } from "./goals/GoalsStrip";
import {
  Chip,
  CheckButton,
  CreamBackdrop,
  SectionLabel,
  ViewSwitch,
  announceTasksChanged,
  callApi,
  useEntrance,
} from "./ui";

type Busy = Record<string, boolean>;

function useBriefing(initial: BriefingPayload) {
  const [data, setData] = useState(initial);
  const [overrides, setOverrides] = useState<Record<string, "fait" | "a_faire">>({});
  const [busy, setBusy] = useState<Busy>({});
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const body = await callApi<{ briefing: BriefingPayload }>("/api/admin/team-tasks");
      setData(body.briefing);
      setOverrides({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Le briefing n’a pas pu se recharger.");
    }
  }, []);

  const run = useCallback(
    async (key: string, request: () => Promise<unknown>, optimistic?: "fait" | "a_faire") => {
      setError(null);
      setBusy((b) => ({ ...b, [key]: true }));
      if (optimistic) setOverrides((o) => ({ ...o, [key]: optimistic }));
      try {
        await request();
        announceTasksChanged();
        await refresh();
      } catch (err) {
        setOverrides((o) => {
          const next = { ...o };
          delete next[key];
          return next;
        });
        setError(err instanceof Error ? err.message : "L’action a échoué.");
      } finally {
        setBusy((b) => {
          const next = { ...b };
          delete next[key];
          return next;
        });
      }
    },
    [refresh],
  );

  const toggle = useCallback(
    (item: ViewItem) => {
      const done = (overrides[item.key] ?? item.status) === "fait";
      if (item.taskId) {
        return run(item.key, () =>
          callApi(`/api/admin/team-tasks/${item.taskId}`, {
            method: "PATCH",
            body: JSON.stringify({ action: done ? "undo" : "done" }),
          }), done ? "a_faire" : "fait");
      }
      return run(item.key, () =>
        callApi("/api/admin/team-tasks/auto", { method: "POST", body: JSON.stringify({ action: "done", key: item.key }) }),
        "fait");
    },
    [overrides, run],
  );

  return { data, overrides, busy, error, setError, refresh, run, toggle };
}

function isDone(item: ViewItem, overrides: Record<string, string>) {
  return (overrides[item.key] ?? item.status) === "fait";
}

function emptyGoals(data: BriefingPayload): GoalsPayload {
  return {
    ready: false, todayKey: data.todayKey, viewerId: data.viewer.id, canManage: false, canEnterReading: false,
    goals: [], mine: [], mineTotals: { done: 0, target: 0 }, people: [], tally: [], catalog: [], periodChoices: [], used: [], failedMetrics: [],
  };
}

export function BriefingView({ initial, dayReport = null, socialInbox = null }: {
  initial: BriefingPayload;
  /** « Fin de journée » (migration 099). Null when it could not be loaded. */
  dayReport?: MyDayReportPayload | null;
  /** Studio > Réseaux « À répondre » counts (Conseiller and above). Null to hide. */
  socialInbox?: InboxCounts | null;
}) {
  const { data, overrides, busy, error, refresh, run, toggle } = useBriefing(initial);
  const [composerOpen, setComposerOpen] = useState(false);
  const [callTaskId, setCallTaskId] = useState<string | null>(null);
  const goalsUi = useGoalsUi(initial.goals ?? emptyGoals(initial));
  const rootRef = useRef<HTMLDivElement>(null);
  useEntrance(rootRef, "[data-anim]", []);
  const refreshGoals = goalsUi.refresh;
  const refreshAll = useCallback(async () => {
    await Promise.all([refresh(), refreshGoals()]);
  }, [refresh, refreshGoals]);
  const composerGoals: ComposerGoal[] = goalsUi.data.goals.map((goal) => ({
    id: goal.id,
    title: goal.title,
    levers: goal.levers.map((lever) => ({ id: lever.id, title: lever.title, ownerId: lever.ownerId })),
  }));
  /** A call task opens « Appeler et noter » instead of being ticked (it needs a result first). */
  const toggleOrCall = (item: ViewItem) => {
    if (item.isCall && item.taskId && !isDone(item, overrides)) {
      setCallTaskId(item.taskId);
      return;
    }
    return toggle(item).then(refreshGoals);
  };

  const all = useMemo(() => [...data.late, ...(data.next ? [data.next] : []), ...data.rest], [data]);
  const doneCount = all.filter((item) => isDone(item, overrides)).length;
  const total = data.total;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  const openLate = data.late.filter((item) => !isDone(item, overrides));
  const allDone = total > 0 && doneCount === total;
  const me = data.people.find((p) => p.isMe);

  const onAsk = (ask: DemandeView, body: AskAction) =>
    run(`ask:${ask.id}`, () => callApi(`/api/admin/team-tasks/${ask.id}`, { method: "PATCH", body: JSON.stringify(body) }));

  return (
    <div ref={rootRef} className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 pb-20 text-[#1F1A16] lg:gap-5 lg:pb-0">
      <CreamBackdrop />
      {data.canSeeTeam && (
        <div data-anim>
          <ViewSwitch active="briefing" />
        </div>
      )}

      {!data.tasksReady && <SetupNotice />}
      {socialInbox && waitingSentence(socialInbox) && (
        <Link
          data-anim
          href="/admin/studio/reseaux"
          className={cn(
            "flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold ring-1 ring-inset",
            socialInbox.overdue > 0
              ? "bg-[#FBE3DF] text-[#8E2A1E] ring-[#F2C2BA] hover:bg-[#F8D6D0]"
              : "bg-[#FCEBDD] text-[#8A3F12] ring-[#F1C9A6] hover:bg-[#F9E0CB]",
          )}
        >
          <ChatsCircleIcon size={18} weight="bold" className="shrink-0" />
          <span className="min-w-0 flex-1">{waitingSentence(socialInbox, "sur Facebook et Instagram")}.</span>
          <span className="shrink-0 underline underline-offset-2">Répondre</span>
        </Link>
      )}
      {data.failedSources.length > 0 && (
        <p className="m-0 rounded-2xl bg-[#FCEFD4] px-4 py-3 text-sm font-semibold text-[#6E4300]" role="status">
          Certaines tâches automatiques n’ont pas pu être chargées. Les autres sont à jour.
        </p>
      )}

      <header data-anim className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-1.5">
          <span className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#8A4924] lg:text-[13px]">
            {data.todayLabel} · {data.viewer.levelLabel}
          </span>
          {allDone ? (
            <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.01em] lg:text-[34px]">Journée bouclée, {data.viewer.firstName}</h1>
          ) : (
            <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.01em] lg:text-[34px]">Bonjour {data.viewer.firstName}</h1>
          )}
          <p className="m-0 max-w-[720px] text-[15px] leading-[1.45] text-[#4A4540] lg:text-[17px]">{data.sentence}</p>
        </div>
        <div className="flex w-full flex-[0_1_320px] items-center gap-2.5 lg:gap-3">
          <div aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-full bg-[#E9DFD2] lg:h-2.5">
            <div
              className={cn("h-full rounded-full transition-[width] duration-500", pct === 100 ? "bg-[#2F7A48]" : "bg-[#C96A2E]")}
              style={{ width: total ? `${Math.max(pct, 3)}%` : "0%" }}
            />
          </div>
          <span className="whitespace-nowrap text-[13px] font-extrabold lg:text-sm" aria-live="polite">
            {doneCount} sur {total} faites
          </span>
        </div>
      </header>

      {/* Nos objectifs (merged from /admin/objectifs, 2026-10-21): the principle, the goals, then on the phone the levers tally. */}
      {initial.goals && <PrincipleBand />}
      {initial.goals && <GoalsStrip ui={goalsUi} />}
      {initial.goals && <LeversTally tally={goalsUi.data.tally} className="lg:hidden" />}

      {error && (
        <p role="alert" className="m-0 rounded-2xl bg-[#FBE3DF] px-4 py-3 text-sm font-semibold text-[#8E2A1E]">
          {error}
        </p>
      )}

      <ReplyCards
        asks={data.myAsks}
        busy={busy}
        onOpen={(ask) => {
          onAsk(ask, { action: "seen" });
          requestAnimationFrame(() => document.getElementById(`demande-${ask.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
        }}
      />

      {data.asks.length > 0 && (
        <div data-anim>
          <AsksBlock asks={data.asks} busy={busy} todayKey={data.todayKey} onAction={onAsk} />
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <main className="flex min-w-0 flex-col gap-3">
          {dayReport && <EndOfDayCard initial={dayReport} onSaved={refreshAll} />}
          {data.fieldNotices.length > 0 && <FieldNotices notices={data.fieldNotices} canSeeTeam={data.canSeeTeam} />}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[repeat(auto-fit,minmax(300px,1fr))]">
            {openLate.map((item) => (
              <LateCard key={item.key} item={item} busy={!!busy[item.key]} onDone={() => toggleOrCall(item)} onCall={() => setCallTaskId(item.taskId)} />
            ))}
            {data.next && !isDone(data.next, overrides) && (
              <NowCard item={data.next} busy={!!busy[data.next.key]} onDone={() => toggleOrCall(data.next!)} onCall={() => setCallTaskId(data.next!.taskId)} />
            )}
          </div>

          <section aria-labelledby="plus-tard" className="flex flex-col gap-2 lg:overflow-hidden lg:rounded-[20px] lg:border lg:border-[#EAE1D5] lg:bg-white lg:gap-0">
            <SectionLabel className="mt-1 lg:m-0 lg:border-b lg:border-[#F0E8DD] lg:px-4 lg:py-3.5">
              <span id="plus-tard">Plus tard aujourd’hui</span>
            </SectionLabel>
            {total === 0 ? (
              <EmptyDay canSeeTeam={data.canSeeTeam} onAdd={() => setComposerOpen(true)} />
            ) : (
              rowsFor(data, overrides).length === 0 && (
                <p className="m-0 rounded-[18px] border border-dashed border-[#D6CBBE] px-4 py-3 text-sm text-[#6B625B] lg:rounded-none lg:border-0">
                  Rien d’autre après ça.
                </p>
              )
            )}
            {rowsFor(data, overrides).map((item) => (
              <TaskRow
                key={item.key}
                item={item}
                done={isDone(item, overrides)}
                busy={!!busy[item.key]}
                viewerId={data.viewer.id}
                viewerIsFounder={data.viewer.level === "fondateur"}
                onToggle={() => toggleOrCall(item)}
                onCall={() => setCallTaskId(item.taskId)}
                onPostpone={() => run(item.key, () => callApi(`/api/admin/team-tasks/${item.taskId}`, { method: "PATCH", body: JSON.stringify({ action: "postpone" }) }))}
                onDelete={() => run(item.key, () => callApi(`/api/admin/team-tasks/${item.taskId}`, { method: "DELETE" }))}
              />
            ))}
          </section>

          {data.myAsks.length > 0 && <MyAsksBlock asks={data.myAsks} busy={busy} onAction={onAsk} />}

          <section aria-labelledby="demain" className="mt-1 flex flex-col gap-2">
            <SectionLabel>
              <span id="demain">Demain, {data.tomorrowLabel}</span>
            </SectionLabel>
            {data.tomorrow.length === 0 ? (
              <p className="m-0 text-sm text-[#6B625B]">Rien de prévu pour l’instant.</p>
            ) : (
              data.tomorrow.map((item) => (
                <div key={item.key} className="flex flex-col gap-1 rounded-[18px] border border-[#EAE1D5] bg-white px-3.5 py-3">
                  <span className="text-[13px] font-extrabold">{item.dueTime ? (item.timeMode === "before" ? `Avant ${item.dueTime}` : item.dueTime) : "Dans la journée"} · {item.kindLabel}</span>
                  <span className="text-[15px] font-extrabold leading-snug">{item.title}</span>
                  {item.fromName && <span className="text-xs text-[#6B625B]">Donnée par {item.fromName}</span>}
                </div>
              ))
            )}
          </section>
        </main>

        <aside className="flex min-w-0 flex-col gap-3">
          <LeversTally tally={goalsUi.data.tally} className="hidden lg:flex" />
          <MyShare mine={goalsUi.data.mine} totals={goalsUi.data.mineTotals} api={goalsUi.api} busy={goalsUi.busy} className="hidden lg:flex" />
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="hidden h-12 items-center justify-center gap-2 self-stretch rounded-full bg-[#C96A2E] px-5 text-[15px] font-extrabold text-white transition-colors hover:bg-[#8A4924] lg:inline-flex"
          >
            <PlusIcon size={18} weight="bold" aria-hidden="true" />
            {data.canSeeTeam ? "Donner une tâche" : "Ajouter une tâche"}
          </button>
          <Link
            href="/admin/fiche-visite"
            className="inline-flex h-12 items-center justify-center gap-2 self-stretch rounded-full border border-[#E2D8CC] bg-white px-5 text-[15px] font-extrabold text-[#1F1A16] no-underline transition-colors hover:border-[#C96A2E]"
          >
            <ClipboardTextIcon size={18} weight="bold" aria-hidden="true" />
            Commencer une fiche de visite
          </Link>
          {data.canSeeTeam && data.unassignedCount > 0 && (
            <Link
              href="/admin/equipe"
              className="flex min-h-11 items-center gap-3 rounded-[20px] border border-dashed border-[#D6CBBE] bg-[#FBF7F1] px-4 py-3 text-sm font-bold text-[#1F1A16] no-underline"
            >
              <span className="flex-1">
                {data.unassignedCount} {data.unassignedCount > 1 ? "éléments arrivés seuls attendent" : "élément arrivé seul attend"} un responsable
              </span>
              <ArrowRightIcon size={16} weight="bold" aria-hidden="true" />
            </Link>
          )}
          <WeekPanel week={data.week} />
          <section aria-label="D’où viennent vos tâches" className="hidden flex-col gap-1.5 rounded-[20px] border border-[#EFE6DA] bg-[#FBF7F1] p-4 lg:flex">
            <span className="text-sm font-extrabold">D’où viennent vos tâches</span>
            <span className="text-[13px] leading-normal text-[#4A4540]">
              Visites, rendez-vous chez le notaire, messages d’assistance et de vente, et propositions sur vos appels à biens arrivent seuls quand ils vous sont attribués. Le Directeur et le Fondateur peuvent aussi vous donner une tâche.
            </span>
          </section>
        </aside>
      </div>

      <button
        type="button"
        onClick={() => setComposerOpen(true)}
        aria-label={data.canSeeTeam ? "Donner une tâche" : "Ajouter une tâche"}
        className="fixed bottom-6 right-4 z-40 inline-flex h-14 items-center gap-1.5 rounded-full bg-[#C96A2E] pl-4 pr-5 text-[15px] font-extrabold text-white shadow-[0_14px_30px_-12px_rgba(201,106,46,0.8)] lg:hidden"
      >
        <PlusIcon size={18} weight="bold" aria-hidden="true" />
        Tâche
      </button>

      {me && (
        <TaskComposer
          open={composerOpen}
          onClose={() => setComposerOpen(false)}
          onCreated={refreshAll}
          people={data.people}
          todayKey={data.todayKey}
          viewerName={data.viewer.firstName}
          viewerLevelLabel={data.viewer.levelLabel}
          presetOwnerId={data.canSeeTeam ? null : me.id}
          goals={composerGoals}
        />
      )}
      <CallPanel taskId={callTaskId} onClose={() => setCallTaskId(null)} onSaved={refreshAll} />
      <GoalsOverlays ui={goalsUi} />
    </div>
  );
}

function rowsFor(data: BriefingPayload, overrides: Record<string, string>) {
  // A late or current item that was just ticked drops into the list, struck through.
  const extra = [...data.late, ...(data.next ? [data.next] : [])].filter((item) => isDone(item, overrides));
  return [...data.rest, ...extra];
}

/** No task today: say where tasks come from and offer the one action that fills the day. */
function EmptyDay({ canSeeTeam, onAdd }: { canSeeTeam: boolean; onAdd: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[18px] border border-dashed border-[#D6CBBE] bg-white px-4 py-4 lg:rounded-none lg:border-0 lg:py-5">
      <div className="flex flex-col gap-1">
        <span className="text-[15px] font-extrabold">Aucune tâche pour aujourd’hui</span>
        <span className="max-w-[560px] text-[13px] leading-relaxed text-[#6B625B]">
          Vos tâches arrivent ici : celles que vous ajoutez, celles qu’on vous donne, et les visites, messages et dossiers qui vous sont attribués.
        </span>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-[#C96A2E] px-4 text-sm font-extrabold text-white transition-colors hover:bg-[#8A4924]"
      >
        <PlusIcon size={16} weight="bold" aria-hidden="true" />
        {canSeeTeam ? "Donner une tâche" : "Ajouter une tâche"}
      </button>
    </div>
  );
}

export function SetupNotice() {
  return (
    <p className="m-0 rounded-2xl border border-dashed border-[#D6CBBE] bg-white px-4 py-3 text-sm text-[#4A4540]" role="status">
      Les tâches données à la main ne sont pas encore installées (migration 089 à lancer). Les tâches automatiques s’affichent quand même.
    </p>
  );
}

function PrimaryAction({ item, dark = false }: { item: ViewItem; dark?: boolean }) {
  if (!item.href) return null;
  return (
    <Link
      href={item.href}
      className={cn(
        "inline-flex h-12 items-center rounded-full px-[18px] text-[15px] font-extrabold text-white no-underline lg:h-11 lg:text-sm",
        dark ? "bg-[#1F1A16] hover:bg-black" : "bg-[#C96A2E] hover:bg-[#8A4924]",
      )}
    >
      {item.actionLabel}
    </Link>
  );
}

/** « Pour : <objectif> » on a task linked to a goal. */
function GoalChip({ item }: { item: ViewItem }) {
  if (!item.goalTitle) return null;
  return (
    <span className="inline-flex h-[22px] max-w-full items-center self-start truncate rounded-full bg-[#F7E4D3] px-2 text-[11px] font-extrabold text-[#8A4924]">
      Pour : {item.goalTitle}
    </span>
  );
}

function CallChip() {
  return (
    <span className="inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full bg-white px-2 text-[11px] font-extrabold text-[#8E2A1E]">
      <PhoneIcon size={12} weight="bold" aria-hidden="true" />
      Appel
    </span>
  );
}

/** « Appeler et noter »: the call panel, where a call task gets its result before it can be done. */
function CallButton({ onCall, dark = false }: { onCall: () => void; dark?: boolean }) {
  return (
    <button
      type="button"
      onClick={onCall}
      className={cn(
        "inline-flex h-12 cursor-pointer items-center gap-2 rounded-full px-[18px] text-[15px] font-extrabold text-white lg:h-11 lg:text-sm",
        dark ? "bg-[#1F1A16] hover:bg-black" : "bg-[#C96A2E] hover:bg-[#8A4924]",
      )}
    >
      <PhoneIcon size={16} weight="bold" aria-hidden="true" />
      Appeler et noter
    </button>
  );
}

function DoneButton({ item, busy, onDone, tone }: { item: ViewItem; busy: boolean; onDone: () => void; tone: "late" | "now" }) {
  if (!item.canCheck || item.isCall) return null;
  return (
    <button
      type="button"
      onClick={onDone}
      disabled={busy}
      className={cn(
        "h-12 cursor-pointer rounded-full bg-white px-4 text-sm font-bold disabled:cursor-wait disabled:opacity-60 lg:h-11",
        tone === "late" ? "border border-[#E8B9B0]" : "border border-[#E2D8CC]",
      )}
    >
      C’est fait
    </button>
  );
}

function LateCard({ item, busy, onDone, onCall }: { item: ViewItem; busy: boolean; onDone: () => void; onCall: () => void }) {
  return (
    <section data-anim aria-label="En retard" className="flex flex-col gap-2 rounded-[18px] bg-[#FBE3DF] px-3.5 py-3 lg:rounded-[20px] lg:p-4">
      <span className="flex items-center gap-2">
        <span className="flex-1 text-xs font-extrabold uppercase tracking-[0.06em] text-[#8E2A1E]">En retard · {item.lateWhen}</span>
        {item.isCall && <CallChip />}
      </span>
      <span className="text-base font-extrabold leading-tight lg:text-lg">{item.title}</span>
      {(item.sub || item.fromName) && (
        <span className="text-[13px] text-[#6B3A33] [overflow-wrap:anywhere] lg:text-sm">
          {[item.isCall ? null : item.kindLabel, item.fromName ? `de ${item.fromName}` : null, item.sub].filter(Boolean).join(" · ")}
        </span>
      )}
      <GoalChip item={item} />
      <span className="flex-1" />
      <div className="flex flex-wrap gap-2">
        {item.isCall && item.taskId ? <CallButton onCall={onCall} dark /> : <PrimaryAction item={item} dark />}
        {item.isCall && item.href && (
          <Link href={item.href} className="inline-flex h-12 items-center rounded-full border border-[#E8B9B0] bg-white px-4 text-sm font-bold text-[#1F1A16] no-underline lg:h-11">
            {item.actionLabel}
          </Link>
        )}
        <DoneButton item={item} busy={busy} onDone={onDone} tone="late" />
      </div>
    </section>
  );
}

function NowCard({ item, busy, onDone, onCall }: { item: ViewItem; busy: boolean; onDone: () => void; onCall: () => void }) {
  return (
    <section
      data-anim
      aria-label="Maintenant"
      className="flex flex-col gap-2.5 rounded-[20px] bg-white p-3.5 shadow-[0_0_0_2px_#C96A2E,0_14px_30px_-18px_rgba(31,26,22,0.5)] lg:gap-2 lg:p-4"
    >
      <div className="flex items-center gap-2">
        <span className="flex-1 text-xs font-extrabold uppercase tracking-[0.06em] text-[#C96A2E]">Maintenant</span>
        <span className="text-sm font-extrabold lg:text-[15px]">{item.when}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip tone={item.tone}>{item.kindLabel}</Chip>
        {item.fromName && <span className="text-[11px] font-extrabold text-[#6B625B]">De {item.fromName}</span>}
      </div>
      <span className="text-lg font-extrabold leading-tight">{item.title}</span>
      {item.sub && <span className="text-sm leading-snug text-[#6B625B] [overflow-wrap:anywhere]">{item.sub}</span>}
      <GoalChip item={item} />
      <div className="flex flex-wrap gap-2">
        {item.isCall && item.taskId ? <CallButton onCall={onCall} /> : <PrimaryAction item={item} />}
        <DoneButton item={item} busy={busy} onDone={onDone} tone="now" />
      </div>
    </section>
  );
}

function TaskRow({
  item,
  done,
  busy,
  viewerId,
  viewerIsFounder,
  onToggle,
  onCall,
  onPostpone,
  onDelete,
}: {
  item: ViewItem;
  done: boolean;
  busy: boolean;
  viewerId: string;
  viewerIsFounder: boolean;
  onToggle: () => void;
  onCall: () => void;
  onPostpone: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const manual = item.origin === "manuel" || item.origin === "demande";
  const canDelete = item.origin === "manuel" && (!item.fromId || item.fromId === viewerId || viewerIsFounder);
  const hasDetail = manual && (!!item.note || !done);
  return (
    <div
      data-anim
      className={cn(
        "flex flex-wrap items-start gap-3 rounded-[18px] border border-[#EAE1D5] bg-white p-3 lg:items-center lg:gap-3.5 lg:rounded-none lg:border-0 lg:border-b lg:border-[#F0E8DD] lg:px-4 lg:py-3 lg:last:border-b-0",
        done && "opacity-60",
      )}
    >
      {item.canCheck ? (
        <CheckButton
          done={done}
          busy={busy}
          label={done ? "Marquer comme à faire" : item.isCall ? "Noter le résultat de l’appel avant de cocher" : "Marquer comme faite"}
          onToggle={onToggle}
        />
      ) : (
        <span className="-m-1.5 inline-flex size-11 shrink-0 items-center justify-center" aria-hidden="true">
          <span className="inline-flex size-8 items-center justify-center rounded-full border-2 border-dashed border-[#D6CBBE] text-[#B8AC9F]">
            <ArrowRightIcon size={14} weight="bold" />
          </span>
        </span>
      )}
      <span className="hidden w-[92px] shrink-0 text-sm font-extrabold lg:inline">{item.when}</span>
      <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-[3px] lg:gap-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[13px] font-extrabold lg:hidden">{item.when}</span>
          <Chip tone={item.tone}>{item.kindLabel}</Chip>
          {item.fromName && <span className="text-[11px] font-extrabold text-[#6B625B]">De {item.fromName}</span>}
        </div>
        <span className={cn("text-[15px] font-extrabold leading-snug [overflow-wrap:anywhere]", done && "text-[#6B625B] line-through")}>
          {item.title}
        </span>
        {item.sub && !open && <span className="text-xs text-[#6B625B] [overflow-wrap:anywhere] lg:text-[13px]">{item.sub}</span>}
        {item.goalTitle && (
          <span className="mt-0.5 inline-flex h-[22px] max-w-full items-center self-start truncate rounded-full bg-[#F7E4D3] px-2 text-[11px] font-extrabold text-[#8A4924]">
            Pour : {item.goalTitle}
          </span>
        )}
        {open && (
          <div className="mt-2 flex flex-col gap-2">
            {item.note && <p className="m-0 whitespace-pre-wrap text-[13px] leading-relaxed text-[#4A4540]">{item.note}</p>}
            <div className="flex flex-wrap gap-2">
              {!done && (
                <button type="button" onClick={onPostpone} disabled={busy} className="h-11 rounded-full border border-[#E8C98F] bg-white px-3.5 text-[13px] font-bold">
                  Reporter à demain
                </button>
              )}
              {canDelete && (
                <button type="button" onClick={onDelete} disabled={busy} className="h-11 rounded-full border border-[#E8B9B0] bg-white px-3.5 text-[13px] font-bold text-[#8E2A1E]">
                  Supprimer
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {item.isCall && item.taskId && !done && (
          <button
            type="button"
            onClick={onCall}
            className="inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-full bg-[#1F1A16] px-3.5 text-[13px] font-extrabold text-white lg:h-10"
          >
            <PhoneIcon size={14} weight="bold" aria-hidden="true" />
            Appeler et noter
          </button>
        )}
        {hasDetail && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="h-11 rounded-full border border-[#E2D8CC] bg-white px-3 text-[13px] font-bold lg:h-10"
          >
            {open ? "Fermer" : item.note ? "Voir la note" : "Options"}
          </button>
        )}
        {item.href && (
          <Link
            href={item.href}
            aria-label={`${item.actionLabel} : ${item.title}`}
            className="inline-flex size-11 items-center justify-center rounded-full bg-[#F6F1EA] text-[#1F1A16] no-underline lg:h-10 lg:w-auto lg:border lg:border-[#E2D8CC] lg:bg-white lg:px-3.5 lg:text-[13px] lg:font-bold"
          >
            <span className="hidden whitespace-nowrap lg:inline">{item.actionLabel}</span>
            <CaretRightIcon size={18} weight="bold" aria-hidden="true" className="lg:hidden" />
          </Link>
        )}
      </div>
    </div>
  );
}

function WeekPanel({ week }: { week: BriefingPayload["week"] }) {
  return (
    <section aria-labelledby="cette-semaine" className="flex flex-col gap-2.5 rounded-[20px] border border-[#EAE1D5] bg-white p-4">
      <SectionLabel>
        <span id="cette-semaine">Cette semaine</span>
      </SectionLabel>
      {week.map((day) => {
        const pct = day.total ? Math.round((day.done / day.total) * 100) : 0;
        return (
          <div key={day.key} className="flex items-center gap-3">
            <span className={cn("w-14 shrink-0 text-[13px]", day.isToday ? "font-extrabold text-[#C96A2E]" : "font-bold text-[#4A4540]")}>
              {day.label}
            </span>
            <div aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-full bg-[#F0E8DD]">
              <div className={cn("h-full rounded-full", pct === 100 ? "bg-[#2F7A48]" : "bg-[#C96A2E]")} style={{ width: `${day.total ? Math.max(pct, 4) : 0}%` }} />
            </div>
            <span className="w-[72px] text-right text-[13px] font-bold text-[#4A4540]">
              {day.total ? `${day.done} sur ${day.total}` : "·"}
            </span>
          </div>
        );
      })}
    </section>
  );
}

/** "Sur le terrain": the in-app notice of the field visit sheet's four time buttons. */
function FieldNotices({ notices, canSeeTeam }: { notices: BriefingPayload["fieldNotices"]; canSeeTeam: boolean }) {
  return (
    <section data-anim aria-labelledby="sur-le-terrain" className="flex flex-col gap-2 rounded-[20px] border border-[#EAE1D5] bg-white p-3.5 lg:p-4">
      <div className="flex items-center gap-2">
        <SectionLabel className="flex-1">
          <span id="sur-le-terrain">Sur le terrain aujourd’hui</span>
        </SectionLabel>
        {canSeeTeam && (
          <Link href="/admin/studio/visites" className="inline-flex min-h-11 items-center text-[13px] font-extrabold text-[#8A4924] lg:min-h-0">
            Suivi des visites
          </Link>
        )}
      </div>
      {notices.map((n) => (
        <div key={n.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[#F0E8DD] pt-2">
          <span className={cn("size-2.5 shrink-0 rounded-full", n.done ? "bg-[#2F7A48]" : "bg-[#C96A2E]")} aria-hidden="true" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[15px] font-extrabold leading-snug">{n.last}</span>
            <span className="text-xs text-[#6B625B]">
              {n.team} · {n.label}
            </span>
          </span>
          {n.mine && !n.done ? (
            <Link href={`/admin/fiche-visite/${n.id}`} className="inline-flex h-11 items-center rounded-full bg-[#C96A2E] px-4 text-[13px] font-extrabold text-white no-underline lg:h-9">
              Reprendre la fiche
            </Link>
          ) : canSeeTeam ? (
            <Link href={`/admin/studio/visites?fiche=${n.id}`} className="inline-flex h-11 items-center rounded-full border border-[#E2D8CC] px-4 text-[13px] font-extrabold text-[#1F1A16] no-underline lg:h-9">
              Voir
            </Link>
          ) : null}
        </div>
      ))}
    </section>
  );
}
