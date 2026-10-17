"use client";

// « Ajouter un objectif » / « Nouvel objectif » (NouvelObjectif.dc.html and
// the add flow of Bureau.dc.html): choose what we measure, then the target,
// then the period, then (optional) the levers. Founder only; the server
// refuses anyone else.

import { useEffect, useId, useState } from "react";
import { PlusIcon, XIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { METRICS, PRINCIPLE, formatCount, type GoalMetric, type GoalPeriod } from "@/lib/team-goals/core";
import type { GoalsPayload } from "@/lib/team-goals/server";
import { CloseButton, Drawer } from "../Drawer";
import { GoalIcon } from "./GoalIcon";
import type { GoalsApi } from "./useGoals";

type DraftLever = { key: string; ownerId: string; title: string; rhythm: string; weeklyTarget: string };

export function GoalForm({
  open,
  onClose,
  onCreated,
  data,
  api,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
  data: GoalsPayload;
  api: GoalsApi;
  busy: boolean;
}) {
  const id = useId();
  const [metric, setMetric] = useState<GoalMetric | null>(null);
  const [target, setTarget] = useState("");
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [period, setPeriod] = useState<GoalPeriod | null>(null);
  const [levers, setLevers] = useState<DraftLever[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMetric(null);
    setTarget("");
    setTitle("");
    setTitleTouched(false);
    setPeriod(null);
    setLevers([]);
    setProblem(null);
  }, [open]);

  const n = Number(target.replace(/\s/g, ""));
  const validTarget = Number.isInteger(n) && n > 0;
  useEffect(() => {
    if (metric && !titleTouched) setTitle(validTarget ? METRICS[metric].title(n) : "");
  }, [metric, n, validTarget, titleTouched]);

  const step = !metric ? 1 : !validTarget ? 2 : !period ? 3 : 4;
  const stepText = !metric
    ? "Choisissez ce qu’on mesure. Le chiffre est relié tout seul."
    : !validTarget
      ? `« ${METRICS[metric].pick} » : quelle cible ?`
      : !period
        ? "Pour quand ? Chaque objectif a sa propre échéance."
        : "Les leviers : facultatif, vous pourrez en ajouter plus tard.";

  async function publish() {
    setProblem(null);
    if (!metric || !validTarget || !period) return;
    const clean = levers.filter((l) => l.title.trim());
    for (const lever of clean) {
      if (!lever.ownerId) {
        setProblem("Choisissez qui tient chaque levier.");
        return;
      }
    }
    const result = await api.create({
      metric,
      target: n,
      period,
      title: title.trim() || null,
      levers: clean.map((l) => ({ ownerId: l.ownerId, title: l.title.trim(), rhythm: l.rhythm.trim() || null, weeklyTarget: Number(l.weeklyTarget) || 1 })),
    });
    if (result) onCreated(result.id);
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      label="Nouvel objectif"
      width={520}
      header={
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <span className="flex-1 text-lg font-extrabold">Nouvel objectif</span>
            <span className="text-xs font-bold text-[#6B625B]">Visible par l’équipe</span>
            <CloseButton onClose={onClose} />
          </div>
          <span className="text-[13px] font-bold text-[#8A4924]" aria-live="polite">
            Étape {Math.min(step, 4)} sur 4 · {stepText}
          </span>
        </div>
      }
      footer={
        <div className="flex flex-col gap-2">
          {problem && <p role="alert" className="m-0 text-sm font-semibold text-[#8E2A1E]">{problem}</p>}
          <button
            type="button"
            disabled={step < 4 || busy}
            onClick={publish}
            className="h-[54px] w-full cursor-pointer rounded-full bg-[#C96A2E] text-base font-extrabold text-white shadow-[0_14px_30px_-14px_rgba(201,106,46,0.8)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Publication…" : "Publier pour l’équipe"}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 bg-[#F6F1EA] p-4 lg:p-5">
        <section className="flex flex-col gap-2.5 rounded-[20px] bg-white p-3.5">
          <span className="text-xs font-extrabold uppercase tracking-[0.06em] text-[#6B625B]">Ce qu’on mesure</span>
          <div className="flex flex-wrap gap-2">
            {data.catalog.map((item) => {
              const on = metric === item.metric;
              return (
                <button
                  key={item.metric}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setMetric(item.metric);
                    setPeriod(null);
                  }}
                  className={cn(
                    "inline-flex h-12 cursor-pointer items-center gap-2 rounded-full pl-1.5 pr-3.5 text-[13px] font-extrabold",
                    on ? "bg-[#FDF6EF] shadow-[inset_0_0_0_2px_#C96A2E]" : "border border-[#E2D8CC] bg-white",
                  )}
                >
                  <GoalIcon kind={item.icon} />
                  {item.pick}
                </button>
              );
            })}
          </div>
          {metric && <p className="m-0 text-xs leading-snug text-[#6B625B]">{METRICS[metric].measure}</p>}
        </section>

        {metric && (
          <section className="flex flex-col gap-2.5 rounded-[20px] bg-white p-3.5">
            <div className="flex flex-wrap gap-2">
              <label htmlFor={`${id}-t`} className="flex w-32 flex-col gap-1.5">
                <span className="text-xs font-extrabold uppercase tracking-[0.06em] text-[#6B625B]">Cible</span>
                <input
                  id={`${id}-t`}
                  inputMode="numeric"
                  autoFocus
                  value={target}
                  placeholder="1 000"
                  onChange={(event) => setTarget(event.target.value.replace(/[^\d\s]/g, ""))}
                  className="h-12 rounded-[14px] border border-[#E2D8CC] bg-[#FBF7F1] px-3.5 text-base font-bold"
                />
              </label>
              <label htmlFor={`${id}-n`} className="flex min-w-0 flex-[1_1_200px] flex-col gap-1.5">
                <span className="text-xs font-extrabold uppercase tracking-[0.06em] text-[#6B625B]">L’objectif</span>
                <input
                  id={`${id}-n`}
                  value={title}
                  maxLength={120}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setTitleTouched(true);
                  }}
                  className="h-12 min-w-0 rounded-[14px] border border-[#E2D8CC] bg-[#FBF7F1] px-3.5 text-base font-bold"
                />
              </label>
            </div>
          </section>
        )}

        {metric && validTarget && (
          <section className="flex flex-col gap-2.5 rounded-[20px] bg-white p-3.5">
            <span className="text-xs font-extrabold uppercase tracking-[0.06em] text-[#6B625B]">Pour quand</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {data.periodChoices.map((choice) => {
                const on = period === choice.period;
                const taken = data.used.includes(`${metric}|${choice.period}`);
                return (
                  <button
                    key={choice.period}
                    type="button"
                    aria-pressed={on}
                    disabled={taken}
                    onClick={() => setPeriod(choice.period)}
                    className={cn(
                      "flex min-h-14 cursor-pointer flex-col items-start justify-center gap-0.5 rounded-[14px] px-3.5 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50",
                      on ? "bg-[#FDF6EF] shadow-[inset_0_0_0_2px_#C96A2E]" : "border border-[#E2D8CC] bg-white",
                    )}
                  >
                    <span className="text-sm font-extrabold">{choice.label}</span>
                    <span className="text-[11px] font-bold leading-snug text-[#6B625B]">{taken ? "Un objectif existe déjà sur cette période" : choice.sub}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {step === 4 && (
          <section className="flex flex-col gap-2.5 rounded-[20px] bg-[#1F1A16] p-3.5 text-white">
            <span className="text-[17px] font-extrabold leading-snug">{PRINCIPLE}</span>
            <span className="text-[13px] leading-snug text-[#D9CFC4]">
              Écrivez ce qu’on fait chaque semaine, quoi qu’il arrive. Chaque levier a une personne et un rythme.
            </span>
            {levers.map((lever, index) => (
              <div key={lever.key} className="flex flex-col gap-2 rounded-2xl bg-[#2B241F] p-3">
                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor={`${id}-l${index}`}>Levier {index + 1}</label>
                  <input
                    id={`${id}-l${index}`}
                    value={lever.title}
                    maxLength={160}
                    placeholder="Ex. Signer un mandat de vente par semaine"
                    onChange={(event) => setLevers((all) => all.map((l) => (l.key === lever.key ? { ...l, title: event.target.value } : l)))}
                    className="h-11 min-w-0 flex-1 rounded-xl border border-white/15 bg-white/10 px-3 text-sm font-bold text-white placeholder:text-white/45"
                  />
                  <button
                    type="button"
                    aria-label={`Retirer le levier ${index + 1}`}
                    onClick={() => setLevers((all) => all.filter((l) => l.key !== lever.key))}
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-white/80 hover:bg-white/10"
                  >
                    <XIcon size={16} weight="bold" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    aria-label="Qui tient ce levier"
                    value={lever.ownerId}
                    onChange={(event) => setLevers((all) => all.map((l) => (l.key === lever.key ? { ...l, ownerId: event.target.value } : l)))}
                    className="h-10 min-w-0 flex-[1_1_120px] rounded-full border-0 bg-[#C96A2E] px-3 text-xs font-extrabold text-white"
                  >
                    <option value="">Qui ?</option>
                    {data.people.map((p) => (
                      <option key={p.id} value={p.id}>{p.firstName}</option>
                    ))}
                  </select>
                  <input
                    aria-label="Rythme"
                    value={lever.rhythm}
                    maxLength={80}
                    placeholder="Chaque semaine"
                    onChange={(event) => setLevers((all) => all.map((l) => (l.key === lever.key ? { ...l, rhythm: event.target.value } : l)))}
                    className="h-10 min-w-0 flex-[2_1_140px] rounded-full border-0 bg-[#3A322C] px-3 text-xs font-bold text-[#F1E7DB] placeholder:text-[#B8AC9F]"
                  />
                  <label className="flex h-10 items-center gap-1.5 rounded-full bg-[#3A322C] pl-3 pr-1 text-xs font-bold text-[#F1E7DB]">
                    Par semaine
                    <input
                      inputMode="numeric"
                      value={lever.weeklyTarget}
                      onChange={(event) => setLevers((all) => all.map((l) => (l.key === lever.key ? { ...l, weeklyTarget: event.target.value.replace(/\D/g, "").slice(0, 3) } : l)))}
                      className="h-8 w-12 rounded-full border-0 bg-white/10 text-center text-xs font-extrabold text-white"
                    />
                  </label>
                </div>
              </div>
            ))}
            {levers.length < 10 && (
              <button
                type="button"
                onClick={() => setLevers((all) => [...all, { key: `${Date.now()}-${all.length}`, ownerId: "", title: "", rhythm: "", weeklyTarget: "1" }])}
                className="inline-flex h-[46px] cursor-pointer items-center justify-center gap-2 rounded-full border border-dashed border-[#8C7D70] bg-transparent text-sm font-extrabold text-white"
              >
                <PlusIcon size={16} weight="bold" aria-hidden="true" />
                Ajouter un levier
              </button>
            )}
            {validTarget && metric && (
              <span className="text-xs text-[#D9CFC4]">
                Résumé : {title.trim() || METRICS[metric].title(n)}, cible {formatCount(n)}, {data.periodChoices.find((c) => c.period === period)?.label.toLowerCase()}.
              </span>
            )}
          </section>
        )}
      </div>
    </Drawer>
  );
}
