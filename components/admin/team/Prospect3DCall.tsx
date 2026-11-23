"use client";

// « Nouvel appel 3D » (PRD « Journal des appels de prospection 3D », approved
// by Salif on 2026-11-22). Pick or add the business, call it, tap the five
// points, save. Saving plans the next contact of the three (day 2 call back,
// day 7 WhatsApp message) and closes the task it was opened from. Full screen
// on the phone, side panel on desktop.

import gsap from "gsap";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  ArrowLeftIcon,
  CalendarPlusIcon,
  CheckCircleIcon,
  CopyIcon,
  LockSimpleIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  PhoneIcon,
  PlusIcon,
  WhatsappLogoIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  ANSWERED_BY,
  ANSWERED_BY_LABELS,
  CALL_RESULTS,
  CALL_RESULT_LABELS,
  INTERESTS,
  INTEREST_LABELS,
  OBJECTIONS,
  OBJECTION_LABELS,
  PROBLEM_ANSWERS,
  PROBLEM_ANSWER_LABELS,
  PROSPECT_KINDS,
  PROSPECT_KIND_LABELS,
  dialable,
  phoneDigits,
  whatsappMessage,
  type AnsweredBy,
  type CallResult,
  type Channel,
  type Interest,
  type Objection,
  type ProblemAnswer,
  type ProspectKind,
} from "@/lib/team-tasks/prospects";
import type { LoggedCall, ProspectHistory, ProspectView } from "@/lib/team-tasks/prospects-server";
import { CloseButton, Drawer } from "./Drawer";
import { announceTasksChanged, callApi, prefersReducedMotion } from "./ui";

export type Prospect3DPreset = { prospectId?: string; taskId?: string | null; channel?: Channel };

const NOT_READY = "Le journal des appels 3D n’est pas encore installé (migration 111 à lancer).";

const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
export function dueWords(key: string) {
  const d = new Date(`${key}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()}`;
}

const chip = (on: boolean) =>
  cn(
    "min-h-11 cursor-pointer rounded-[14px] px-3.5 text-left text-sm font-extrabold transition-colors lg:min-h-10 lg:rounded-full lg:text-[13px]",
    on ? "bg-[#1F1A16] text-white" : "border border-[#E2D8CC] bg-white text-[#1F1A16] hover:border-[#C96A2E]",
  );

const label = "text-xs font-extrabold uppercase tracking-[0.06em] text-[#6B625B]";
const input =
  "h-12 w-full rounded-[14px] border border-[#E2D8CC] bg-[#FBF7F1] px-3.5 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-[#C96A2E] lg:h-11 lg:text-[15px]";

const STATE_TONE: Record<ProspectView["state"], string> = {
  en_cours: "bg-[#F7E4D3] text-[#8A4924]",
  oui: "bg-[#DDF0E2] text-[#245C33]",
  non: "bg-[#EEEBE7] text-[#4A4540]",
  a_reprendre: "bg-[#FBEBC9] text-[#6E4300]",
};

export function StateChip({ state, children }: { state: ProspectView["state"]; children: React.ReactNode }) {
  return <span className={cn("inline-flex h-[22px] shrink-0 items-center rounded-full px-2 text-[11px] font-extrabold", STATE_TONE[state])}>{children}</span>;
}

function Choice<T extends string>({
  legend,
  values,
  labels,
  value,
  onChange,
  columns = 2,
}: {
  legend: string;
  values: readonly T[];
  labels: Record<T, string>;
  value: T | null;
  onChange: (v: T | null) => void;
  columns?: 2 | 3;
}) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className={cn(label, "mb-2 p-0")}>{legend}</legend>
      <div className={cn("grid gap-2 lg:flex lg:flex-wrap", columns === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {values.map((v) => (
          <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(value === v ? null : v)} className={chip(value === v)}>
            {labels[v]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** A business's calls, oldest first: « Contact 1 », « Contact 2 »… (PRD 1.6). */
export function CallHistory({ history }: { history: ProspectHistory }) {
  if (!history.calls.length && !history.hiddenCalls) {
    return <span className="text-[13px] text-[#6B625B]">Pas encore appelée. Ce sera le contact 1 sur 3.</span>;
  }
  return (
    <ol className="m-0 flex list-none flex-col gap-3.5 p-0">
      {history.calls.map((call) => (
        <li key={call.id} data-drawer-row className="flex gap-3">
          <span aria-hidden="true" className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[#1F1A16] text-[11px] font-extrabold text-white">
            {call.contactNumber}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[13px] font-extrabold">
              Contact {call.contactNumber} · {call.channel === "whatsapp" ? "WhatsApp" : "appel"} · {call.when}
            </span>
            <span className="text-xs text-[#6B625B]">
              {call.authorName} · {call.noAnswer ? "pas de réponse" : `${call.answeredBy?.toLowerCase()} a répondu`}
              {call.resultLabel ? ` · ${call.resultLabel.toLowerCase()}` : ""}
            </span>
            <FivePoints call={call} />
          </div>
        </li>
      ))}
      {history.hiddenCalls > 0 && (
        <li className="text-xs text-[#6B625B]">
          {history.hiddenCalls} {history.hiddenCalls > 1 ? "autres contacts notés" : "autre contact noté"} par l’équipe.
        </li>
      )}
    </ol>
  );
}

/** The structured answers of one call, as short labelled lines. */
export function FivePoints({ call }: { call: { problem: string | null; problemWords: string | null; objection: string | null; objectionWords: string | null; interest: string | null; notes: string | null } }) {
  const rows: [string, string | null, string | null][] = [
    ["Problème", call.problem, call.problemWords],
    ["Objection", call.objection, call.objectionWords],
    ["Intéressé par", call.interest, null],
  ];
  return (
    <div className="flex flex-col gap-1">
      {rows
        .filter(([, v, w]) => v || w)
        .map(([k, v, w]) => (
          <span key={k} className="text-[13px] leading-snug text-[#4A4540] [overflow-wrap:anywhere]">
            <span className="font-extrabold text-[#1F1A16]">{k} : </span>
            {v}
            {w ? <span className="text-[#6B625B]">{` «\u00a0${w}\u00a0»`}</span> : null}
          </span>
        ))}
      {call.notes && <span className="whitespace-pre-wrap text-[13px] leading-snug text-[#4A4540] [overflow-wrap:anywhere]">{call.notes}</span>}
    </div>
  );
}

type Step = "pick" | "add" | "call" | "saved";

export function Prospect3DCall({
  open,
  preset,
  callerName,
  onClose,
  onSaved,
}: {
  open: boolean;
  preset?: Prospect3DPreset | null;
  /** First name of the caller, signed in the WhatsApp message. */
  callerName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const id = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>("pick");
  const [ready, setReady] = useState(true);
  const [query, setQuery] = useState("");
  const [list, setList] = useState<ProspectView[] | null>(null);
  const [history, setHistory] = useState<ProspectHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<LoggedCall | null>(null);

  // New business
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ProspectKind | null>(null);
  const [phone, setPhone] = useState("");
  const [quartier, setQuartier] = useState("");
  const [city, setCity] = useState("Ouagadougou");
  const [mapsUrl, setMapsUrl] = useState("");
  const [dupes, setDupes] = useState<ProspectView[]>([]);

  // The five points
  const [answeredBy, setAnsweredBy] = useState<AnsweredBy | null>(null);
  const [problem, setProblem] = useState<ProblemAnswer | null>(null);
  const [problemWords, setProblemWords] = useState("");
  const [objection, setObjection] = useState<Objection | null>(null);
  const [objectionWords, setObjectionWords] = useState("");
  const [interest, setInterest] = useState<Interest | null>(null);
  const [result, setResult] = useState<CallResult | null>(null);
  const [notes, setNotes] = useState("");
  const [copied, setCopied] = useState(false);

  // The task being worked, kept only for the first call after opening.
  const [active, setActive] = useState<Prospect3DPreset | null>(null);
  const channel: Channel = active?.channel ?? "appel";
  const taskId = active?.taskId ?? null;

  const resetCall = () => {
    setAnsweredBy(null);
    setProblem(null);
    setProblemWords("");
    setObjection(null);
    setObjectionWords("");
    setInterest(null);
    setResult(null);
    setNotes("");
    setError(null);
    setCopied(false);
  };

  const animateStep = useCallback(() => {
    const el = bodyRef.current;
    if (!el || prefersReducedMotion()) return;
    gsap.fromTo(el.querySelectorAll("[data-step-row]"), { y: 10, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.32, ease: "power3.out", stagger: 0.04, clearProps: "transform,opacity,visibility" });
  }, []);

  const go = useCallback(
    (next: Step) => {
      setStep(next);
      requestAnimationFrame(animateStep);
    },
    [animateStep],
  );

  const openProspect = useCallback(
    async (prospectId: string) => {
      setError(null);
      try {
        const body = await callApi<{ history: ProspectHistory }>(`/api/admin/prospects?id=${prospectId}`);
        setHistory(body.history);
        resetCall();
        go("call");
      } catch (err) {
        const message = err instanceof Error ? err.message : "L’entreprise n’a pas pu se charger.";
        if (/migration 111/.test(message)) setReady(false);
        setError(message);
      }
    },
    [go],
  );

  // Open: straight to the call when a follow-up task is worked, else the list.
  useEffect(() => {
    if (!open) return;
    setSaved(null);
    setHistory(null);
    setQuery("");
    setError(null);
    setActive(preset ?? null);
    resetCall();
    if (preset?.prospectId) {
      void openProspect(preset.prospectId);
    } else {
      go("pick");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preset?.prospectId, preset?.taskId]);

  // The list, filtered by name as the caller types.
  useEffect(() => {
    if (!open || step !== "pick") return;
    let alive = true;
    const timer = window.setTimeout(() => {
      callApi<{ ready: boolean; prospects: ProspectView[] }>(`/api/admin/prospects?q=${encodeURIComponent(query)}`)
        .then((body) => {
          if (!alive) return;
          setReady(body.ready);
          setList(body.prospects);
        })
        .catch((err) => alive && setError(err instanceof Error ? err.message : "La liste n’a pas pu se charger."));
    }, query ? 220 : 0);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [open, step, query]);

  // Same number already saved? (PRD 1.3)
  useEffect(() => {
    if (step !== "add") return;
    const digits = phoneDigits(phone);
    if (!digits) {
      setDupes([]);
      return;
    }
    let alive = true;
    const timer = window.setTimeout(() => {
      callApi<{ matches: ProspectView[] }>(`/api/admin/prospects?phone=${encodeURIComponent(phone)}`)
        .then((body) => alive && setDupes(body.matches))
        .catch(() => alive && setDupes([]));
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [step, phone]);

  async function addProspect() {
    setError(null);
    if (!name.trim()) return setError("Écrivez le nom de l’entreprise.");
    if (!kind) return setError("Choisissez le type d’entreprise.");
    setSaving(true);
    try {
      const body = await callApi<{ prospect: ProspectView }>("/api/admin/prospects", {
        method: "POST",
        body: JSON.stringify({ name, kind, phone, quartier, city, mapsUrl, force: dupes.length > 0 }),
      });
      setName("");
      setKind(null);
      setPhone("");
      setQuartier("");
      setMapsUrl("");
      setDupes([]);
      await openProspect(body.prospect.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "L’entreprise n’a pas pu être ajoutée.");
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (!history) return;
    setError(null);
    if (!answeredBy) return setError(channel === "whatsapp" ? "Dites si l’entreprise a répondu." : "Dites qui a répondu.");
    const finalResult = result ?? (answeredBy === "pas_de_reponse" ? "a_rappeler" : null);
    if (!finalResult) return setError("Choisissez le résultat.");
    setSaving(true);
    try {
      const body = await callApi<LoggedCall>("/api/admin/prospects/calls", {
        method: "POST",
        body: JSON.stringify({
          prospectId: history.prospect.id,
          taskId,
          channel,
          answeredBy,
          problemAnswer: problem,
          problemWords,
          objection,
          objectionWords,
          interest,
          result: finalResult,
          notes,
        }),
      });
      setSaved(body);
      announceTasksChanged();
      onSaved();
      go("saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "L’enregistrement a échoué.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const prospect = history?.prospect ?? null;
  const noAnswer = answeredBy === "pas_de_reponse";
  const tel = dialable(prospect?.phone);
  const contactNumber = history?.nextContact ?? 1;
  const whatsappText =
    channel === "whatsapp" && prospect
      ? whatsappMessage(prospect.name, callerName)
      : null;

  const header = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        {(step === "add" || (step === "call" && !active?.prospectId)) && (
          <button
            type="button"
            onClick={() => go("pick")}
            aria-label="Retour à la liste"
            className="-ml-1 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#1F1A16] hover:bg-[#F4EEE6] lg:size-10"
          >
            <ArrowLeftIcon size={18} weight="bold" aria-hidden="true" />
          </button>
        )}
        <span className="flex-1 text-xs font-extrabold uppercase tracking-[0.06em] text-[#C96A2E]">
          {step === "call" ? `Visites 3D · contact ${Math.min(contactNumber, 3)} sur 3` : "Visites 3D"}
        </span>
        <CloseButton onClose={onClose} />
      </div>
      {step === "pick" && <h2 className="m-0 text-xl font-extrabold leading-tight lg:text-[22px]">Nouvel appel 3D</h2>}
      {step === "add" && <h2 className="m-0 text-xl font-extrabold leading-tight lg:text-[22px]">Ajouter une entreprise</h2>}
      {step === "call" && prospect && (
        <>
          <h2 className="m-0 text-xl font-extrabold leading-tight [overflow-wrap:anywhere] lg:text-[22px]">{prospect.name}</h2>
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-[#6B625B]">
            <span>{prospect.kindLabel}</span>
            {prospect.place && <span>· {prospect.place}</span>}
            {prospect.mapsUrl && (
              <a href={prospect.mapsUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 font-extrabold text-[#8A4924] lg:min-h-0">
                <MapPinIcon size={14} weight="bold" aria-hidden="true" />
                Carte
              </a>
            )}
          </span>
          {tel && channel === "appel" && (
            <a
              href={`tel:${tel}`}
              className="inline-flex h-14 items-center justify-center gap-2.5 rounded-[18px] bg-[#2F7A48] px-4 text-base font-extrabold text-white no-underline hover:bg-[#245C33] lg:h-11 lg:self-start lg:rounded-full lg:text-sm"
            >
              <PhoneIcon size={18} weight="bold" aria-hidden="true" />
              Appeler · {prospect.phone}
            </a>
          )}
          {tel && channel === "whatsapp" && (
            <a
              href={`https://wa.me/${tel.replace("+", "")}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-14 items-center justify-center gap-2.5 rounded-[18px] bg-[#2F7A48] px-4 text-base font-extrabold text-white no-underline hover:bg-[#245C33] lg:h-11 lg:self-start lg:rounded-full lg:text-sm"
            >
              <WhatsappLogoIcon size={20} weight="bold" aria-hidden="true" />
              Ouvrir WhatsApp · {prospect.phone}
            </a>
          )}
        </>
      )}
      {step === "saved" && <h2 className="m-0 text-xl font-extrabold leading-tight lg:text-[22px]">Appel enregistré</h2>}
    </div>
  );

  const footer =
    step === "call" ? (
      <div className="flex flex-col gap-2">
        {error && <p role="alert" className="m-0 text-sm font-semibold text-[#8E2A1E]">{error}</p>}
        <button
          type="button"
          onClick={save}
          disabled={saving || !ready}
          className="h-[52px] w-full cursor-pointer rounded-full bg-[#C96A2E] text-base font-extrabold text-white transition-colors hover:bg-[#8A4924] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Enregistrement…" : "Enregistrer l’appel"}
        </button>
        <span className="flex items-center gap-2 text-xs text-[#6B625B]">
          <LockSimpleIcon size={14} aria-hidden="true" />
          Visible par vous, le Directeur et le Fondateur.
        </span>
      </div>
    ) : step === "add" ? (
      <div className="flex flex-col gap-2">
        {error && <p role="alert" className="m-0 text-sm font-semibold text-[#8E2A1E]">{error}</p>}
        <button
          type="button"
          onClick={addProspect}
          disabled={saving || !ready}
          className="h-[52px] w-full cursor-pointer rounded-full bg-[#C96A2E] text-base font-extrabold text-white transition-colors hover:bg-[#8A4924] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Ajout…" : dupes.length ? "Ajouter quand même" : "Ajouter et appeler"}
        </button>
      </div>
    ) : undefined;

  return (
    <Drawer open onClose={onClose} label="Nouvel appel 3D" width={500} z={76} header={header} footer={footer}>
      <div ref={bodyRef} className="flex flex-col gap-5 p-4 lg:px-5">
        {!ready && (
          <p data-step-row role="status" className="m-0 rounded-2xl border border-dashed border-[#D6CBBE] bg-[#FBF7F1] px-4 py-3 text-sm text-[#4A4540]">
            {NOT_READY}
          </p>
        )}

        {step === "pick" && (
          <>
            <button
              data-step-row
              type="button"
              onClick={() => {
                setError(null);
                setName(query);
                go("add");
              }}
              className="inline-flex h-14 cursor-pointer items-center justify-center gap-2 rounded-[18px] bg-[#1F1A16] text-base font-extrabold text-white hover:bg-black lg:h-12 lg:rounded-full lg:text-[15px]"
            >
              <PlusIcon size={18} weight="bold" aria-hidden="true" />
              Ajouter une entreprise
            </button>
            <div data-step-row className="relative">
              <MagnifyingGlassIcon size={18} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B625B]" />
              <label htmlFor={`${id}-q`} className="sr-only">Chercher une entreprise</label>
              <input
                id={`${id}-q`}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Chercher une entreprise déjà appelée"
                className={cn(input, "pl-10")}
              />
            </div>
            {error && <p role="alert" className="m-0 text-sm font-semibold text-[#8E2A1E]">{error}</p>}
            <div className="flex flex-col">
              <span data-step-row className={cn(label, "mb-1")}>Mes entreprises</span>
              {list === null && <span className="py-3 text-sm text-[#6B625B]">Chargement…</span>}
              {list?.length === 0 && ready && (
                <span data-step-row className="py-3 text-sm text-[#6B625B]">
                  {query ? "Aucune entreprise à ce nom. Ajoutez-la." : "Aucune entreprise pour l’instant. Ajoutez la première que vous appelez."}
                </span>
              )}
              {list?.map((p) => (
                <button
                  key={p.id}
                  data-step-row
                  type="button"
                  onClick={() => openProspect(p.id)}
                  className="flex min-h-[60px] cursor-pointer items-center gap-3 border-0 border-b border-solid border-[#F0E8DD] bg-transparent px-0 py-2.5 text-left last:border-b-0"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-extrabold">{p.name}</span>
                    <span className="truncate text-xs text-[#6B625B]">
                      {[p.kindLabel, p.place, p.addedBy ? `ajoutée par ${p.addedBy}` : null].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <StateChip state={p.state}>{p.stateLabel}</StateChip>
                </button>
              ))}
            </div>
          </>
        )}

        {step === "add" && (
          <>
            <div data-step-row className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-name`} className={label}>Nom de l’entreprise</label>
              <input id={`${id}-name`} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className={input} autoComplete="off" />
            </div>
            <div data-step-row>
              <Choice legend="Type" values={PROSPECT_KINDS} labels={PROSPECT_KIND_LABELS} value={kind} onChange={setKind} />
            </div>
            <div data-step-row className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-phone`} className={label}>Téléphone</label>
              <input id={`${id}-phone`} value={phone} inputMode="tel" maxLength={40} onChange={(e) => setPhone(e.target.value)} placeholder="70 12 34 56" className={input} />
              {dupes.length > 0 && (
                <div role="status" className="flex flex-col gap-1.5 rounded-[14px] bg-[#FCEFD4] px-3.5 py-3 text-[13px] text-[#6E4300]">
                  <span className="font-extrabold">Ce numéro est déjà enregistré :</span>
                  {dupes.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => openProspect(d.id)}
                      className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-xl bg-white px-3 text-left font-extrabold text-[#1F1A16]"
                    >
                      <span className="min-w-0 truncate">
                        {d.name}
                        {d.addedBy ? <span className="font-semibold text-[#6B625B]"> · {d.addedBy}</span> : null}
                      </span>
                      <span className="shrink-0 text-[#8A4924]">Appeler celle-ci</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div data-step-row className="grid grid-cols-2 gap-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor={`${id}-q2`} className={label}>Quartier</label>
                <input id={`${id}-q2`} value={quartier} maxLength={80} onChange={(e) => setQuartier(e.target.value)} className={input} />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor={`${id}-city`} className={label}>Ville</label>
                <input id={`${id}-city`} value={city} maxLength={80} onChange={(e) => setCity(e.target.value)} className={input} />
              </div>
            </div>
            <div data-step-row className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-maps`} className={label}>Lien Google Maps (facultatif)</label>
              <input id={`${id}-maps`} value={mapsUrl} inputMode="url" maxLength={500} onChange={(e) => setMapsUrl(e.target.value)} placeholder="https://maps.app.goo.gl/…" className={input} />
            </div>
          </>
        )}

        {step === "call" && history && (
          <>
            {whatsappText && (
              <div data-step-row className="flex flex-col gap-2">
                <span className={label}>Message à envoyer</span>
                <p className="m-0 whitespace-pre-wrap rounded-[14px] bg-[#FBF7F1] p-3 text-[14px] leading-[1.45] text-[#1F1A16]">{whatsappText}</p>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(whatsappText).then(() => setCopied(true))}
                  className="inline-flex h-11 cursor-pointer items-center gap-2 self-start rounded-full border border-[#E2D8CC] bg-white px-3.5 text-[13px] font-extrabold"
                >
                  <CopyIcon size={16} weight="bold" aria-hidden="true" />
                  {copied ? "Copié" : "Copier le message"}
                </button>
              </div>
            )}
            <div data-step-row>
              <Choice
                legend={channel === "whatsapp" ? "Qui a répondu au message ?" : "Qui a répondu ?"}
                values={ANSWERED_BY}
                labels={channel === "whatsapp" ? { ...ANSWERED_BY_LABELS, pas_de_reponse: "Pas encore de réponse" } : ANSWERED_BY_LABELS}
                value={answeredBy}
                onChange={(v) => {
                  setAnsweredBy(v);
                  if (v === "pas_de_reponse") setResult("a_rappeler");
                }}
              />
            </div>
            {!noAnswer && answeredBy && (
              <>
                <div data-step-row className="flex flex-col gap-2">
                  <Choice legend="La question du problème" values={PROBLEM_ANSWERS} labels={PROBLEM_ANSWER_LABELS} value={problem} onChange={setProblem} columns={3} />
                  <label htmlFor={`${id}-pw`} className="sr-only">Leurs mots sur le problème</label>
                  <input id={`${id}-pw`} value={problemWords} maxLength={500} onChange={(e) => setProblemWords(e.target.value)} placeholder="Leurs mots, si vous les avez" className={input} />
                </div>
                <div data-step-row className="flex flex-col gap-2">
                  <Choice legend="L’objection" values={OBJECTIONS} labels={OBJECTION_LABELS} value={objection} onChange={setObjection} />
                  <label htmlFor={`${id}-ow`} className="sr-only">L’objection, mot pour mot</label>
                  <input id={`${id}-ow`} value={objectionWords} maxLength={500} onChange={(e) => setObjectionWords(e.target.value)} placeholder="Mot pour mot" className={input} />
                </div>
                <div data-step-row>
                  <Choice legend="Ce qui les a intéressés" values={INTERESTS} labels={INTEREST_LABELS} value={interest} onChange={setInterest} />
                </div>
              </>
            )}
            <div data-step-row>
              <Choice legend="Résultat" values={CALL_RESULTS} labels={CALL_RESULT_LABELS} value={result} onChange={setResult} columns={3} />
            </div>
            {answeredBy && (
              <div data-step-row className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-notes`} className={label}>Autre chose (facultatif)</label>
                <textarea
                  id={`${id}-notes`}
                  rows={3}
                  maxLength={2000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="resize-y rounded-[14px] border border-[#E2D8CC] bg-[#FBF7F1] p-3 text-[16px] leading-[1.45] outline-none focus-visible:ring-2 focus-visible:ring-[#C96A2E] lg:text-[15px]"
                />
              </div>
            )}
            <section data-step-row aria-label="Historique" className="flex flex-col gap-3 pt-1">
              <span className={label}>Historique</span>
              <CallHistory history={history} />
            </section>
          </>
        )}

        {step === "saved" && saved && (
          <div className="flex flex-col gap-5">
            <div data-step-row className="flex items-start gap-3">
              <CheckCircleIcon size={36} weight="fill" className="shrink-0 text-[#2F7A48]" aria-hidden="true" />
              <div className="flex flex-col gap-1">
                <span className="text-[17px] font-extrabold">Contact {saved.contactNumber} noté. {saved.stateLabel}.</span>
                <span className="text-sm leading-relaxed text-[#4A4540]">
                  {saved.followUp
                    ? `« ${saved.followUp.title} » arrive dans vos tâches ${dueWords(saved.followUp.dueDate)}.`
                    : saved.state === "a_reprendre"
                      ? "Trois contacts sans oui ni non : l’entreprise est mise de côté, sans nouvelle tâche."
                      : "La série est terminée. Il n’y a plus de rappel prévu."}
                </span>
              </div>
            </div>
            {saved.calendarUrl && (
              <a
                data-step-row
                href={saved.calendarUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-14 items-center justify-center gap-2 rounded-[18px] bg-[#2F7A48] text-base font-extrabold text-white no-underline hover:bg-[#245C33] lg:h-12 lg:rounded-full"
              >
                <CalendarPlusIcon size={20} weight="bold" aria-hidden="true" />
                Réserver le tournage dans l’agenda
              </a>
            )}
            <div data-step-row className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  setSaved(null);
                  setHistory(null);
                  setActive(null);
                  setQuery("");
                  go("pick");
                }}
                className="h-[52px] w-full shrink-0 cursor-pointer sm:flex-1 rounded-full bg-[#C96A2E] text-base font-extrabold text-white hover:bg-[#8A4924]"
              >
                Appel suivant
              </button>
              <button type="button" onClick={onClose} className="h-[52px] w-full shrink-0 cursor-pointer sm:flex-1 rounded-full border border-[#E2D8CC] bg-white text-base font-extrabold">
                Fermer
              </button>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}
