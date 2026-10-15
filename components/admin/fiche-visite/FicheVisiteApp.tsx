"use client";

// "Fiche de visite": the field visit sheet, built from the approved canvas
// (Main.dc.html on the phone, Bureau.dc.html on a computer). Seven screens:
// Infos, 1 Avant de partir, 2 Départ du bureau, 3 Sur place, 4 Départ du
// site, 5 Retour au bureau, Tournage terminé. Every tick records its time;
// the four time buttons tell the team in Roogo (briefing "Sur le terrain").
// Step 3 is ticks only; step 5 is the only upload step. Autosave goes to the
// phone and to the server, so a sheet started on the phone continues on a
// computer.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowSquareOutIcon,
  CaretLeftIcon,
  ClockIcon,
  MapPinIcon,
  WhatsappLogoIcon,
  CaretDownIcon,
  CheckIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  DELETE_CHECK_ID,
  DELIVERABLES,
  FACTS,
  SHOTS,
  STEPS,
  allUploaded,
  businessDayNote,
  hhmm,
  missingSentence,
  nextOwner,
  noteTick,
  plannedPublications,
  plannedTasks,
  shortDate,
  stepReadiness,
  teamIds,
  toDayKey,
  toggleTeam,
  topFolderFor,
  visitDateLabel,
  visitFolderName,
  whatsappShareUrl,
  whatsappText,
  type DeliverableKey,
  type FicheData,
  type ShotKey,
  type StepIndex,
  type UploadSummary,
} from "@/lib/field-visits/core";
import type { FicheFile, FichePayload, FicheProperty, TaskView } from "@/lib/field-visits/server";
import { announceTasksChanged } from "@/components/admin/team/events";
import { Card, CheckRow, ProgressBar, ResumeDialog, SavePill, Tick } from "./parts";
import { clearLocal, readLocal, useFicheSync, type ConflictBody } from "./useFicheSync";
import { progressFor, useUploads } from "./useUploads";
import { fadeTitle, moveBar, popTick, settle, slideStep, staggerIn } from "./motion";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export type PersonLite = { id: string; firstName: string; fullName: string; initials: string; levelLabel: string };

type Extras = {
  status: "en_cours" | "termine" | "abandonne";
  uploads: UploadSummary;
  files: FicheFile[];
  tasks: TaskView[];
  folderPath: string;
  folderUrl: string | null;
};

type Props = {
  property: FicheProperty;
  people: PersonLite[];
  viewerId: string;
  /** The sheet to show: an unfinished one for this property (offered to resume), or the one opened by its link. */
  server: FichePayload | null;
  openedById: boolean;
  installed: boolean;
};

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ (Math.floor(Math.random() * 256) & (15 >> (Number(c) / 4)))).toString(16),
  );
}

function freshFiche(property: FicheProperty, viewerId: string, people: PersonLite[]): FicheData {
  const isStaff = people.some((p) => p.id === viewerId);
  return {
    id: uuid(),
    propertyId: property.id,
    kind: property.listingKind,
    person1Id: isStaff ? viewerId : null,
    person2Id: null,
    step: 0,
    visitDate: toDayKey(new Date()),
    checks: {},
    times: {},
    shots: {},
    location: null,
    locationSkipped: null,
    facts: { ...property.factsPrefill },
    batchWarnings: [],
    taskOwners: {},
    updatedAt: new Date().toISOString(),
  };
}

function extrasFrom(payload: FichePayload | null, property: FicheProperty, kind: "location" | "vente"): Extras {
  return {
    status: payload?.status ?? "en_cours",
    uploads: payload?.uploads ?? {},
    files: payload?.files ?? [],
    tasks: payload?.tasks ?? [],
    folderPath: payload?.folderPath ?? `${topFolderFor(kind)}/${visitFolderName(property.reference, property.title)}`,
    folderUrl: payload?.folderUrl ?? null,
  };
}

type Offer = { data: FicheData; fromServer: boolean; payload: FichePayload | null; localNewer: boolean; at: string };

export function FicheVisiteApp({ property, people, viewerId, server, openedById, installed }: Props) {
  const router = useRouter();
  const initialFiche = useMemo<FicheData>(() => {
    if (openedById && server) return server.status === "termine" ? { ...server.fiche, step: 6 } : server.fiche;
    return freshFiche(property, viewerId, people);
    // Only once: later changes go through the sync hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [extras, setExtras] = useState<Extras>(() => extrasFrom(openedById ? server : null, property, initialFiche.kind));
  const [offer, setOffer] = useState<Offer | null>(null);
  const [offerBusy, setOfferBusy] = useState(false);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "amber" | "red"; text: string; href?: string } | null>(null);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const locked = extras.status !== "en_cours";

  const onConflict = useCallback(
    (body: ConflictBody) => {
      if (body.existingId) {
        setNotice({ tone: "red", text: "Une autre fiche est déjà en cours pour ce bien. Ouvrez-la plutôt.", href: `/admin/fiche-visite/${body.existingId}` });
        return;
      }
      if (body.fiche) {
        if (body.status === "termine") {
          void refresh(body.fiche.id);
          return;
        }
        replaceRef.current?.(body.fiche, { serverKnown: true });
        setNotice({ tone: "amber", text: "Une version plus récente de la fiche a été reprise (autre appareil)." });
      }
    },
    // refresh is stable (declared below with useCallback and no deps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const { data, update, replace, save, flush } = useFicheSync({
    initial: initialFiche,
    serverKnown: !!(openedById && server),
    readOnly: locked,
    onSaved: ({ uploads, status }) => setExtras((e) => ({ ...e, uploads, status: status as Extras["status"] })),
    onConflict,
  });
  const replaceRef = useRef(replace);
  replaceRef.current = replace;

  const refresh = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/field-visits/${id}`);
      if (!res.ok) return;
      const body = (await res.json()) as FichePayload;
      setExtras(extrasFrom(body, body.property, body.fiche.kind));
      if (body.status === "termine") {
        replaceRef.current({ ...body.fiche, step: 6 }, { serverKnown: true });
        clearLocal(body.fiche.propertyId);
      }
    } catch {
      // offline: keep what we have
    }
  }, []);

  // Resume: local copy (phone) and the server's unfinished sheet, newest first.
  useEffect(() => {
    const local = readLocal(property.id);
    if (openedById) {
      if (server && local && local.data.id === server.fiche.id && server.status === "en_cours" && Date.parse(local.data.updatedAt) > Date.parse(server.fiche.updatedAt)) {
        replace(local.data, { dirty: true, serverKnown: true });
      }
      return;
    }
    const open = server && server.status === "en_cours" ? server : null;
    const localUseful = local && local.data.propertyId === property.id && (local.data.step > 0 || local.dirty);
    if (!open && !localUseful) return;
    if (!open && local && local.data.step === 0) {
      // Only the Infos were filled: put them back quietly.
      replace(local.data, { serverKnown: false });
      return;
    }
    const localNewer = !!local && (!open || (local.data.id === open.fiche.id && Date.parse(local.data.updatedAt) > Date.parse(open.fiche.updatedAt)));
    if (localNewer && local) {
      setOffer({ data: local.data, fromServer: !!open && local.data.id === open.fiche.id, payload: open, localNewer: true, at: hhmm(local.data.updatedAt) });
    } else if (open) {
      setOffer({ data: open.fiche, fromServer: true, payload: open, localNewer: false, at: hhmm(open.fiche.updatedAt) });
    }
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resume = () => {
    if (!offer) return;
    if (offer.payload) setExtras(extrasFrom(offer.payload, property, offer.data.kind));
    replace(offer.data, { dirty: offer.localNewer, serverKnown: offer.fromServer });
    setOffer(null);
  };

  const restart = async () => {
    if (!offer) return;
    setOfferBusy(true);
    setOfferError(null);
    try {
      const serverId = offer.payload?.fiche.id;
      if (serverId) {
        const res = await fetch(`/api/admin/field-visits/${serverId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "abandon" }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `Erreur ${res.status}`);
      }
      clearLocal(property.id);
      replace(freshFiche(property, viewerId, people), { serverKnown: false });
      setExtras(extrasFrom(null, property, property.listingKind));
      setOffer(null);
    } catch (error) {
      setOfferError(error instanceof Error && error.message !== "Failed to fetch" ? error.message : "Pas de connexion : impossible de fermer l’ancienne fiche. Réessayez.");
    } finally {
      setOfferBusy(false);
    }
  };

  // Phone: the sheet is a full-screen app; keep the page behind it still.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const apply = () => {
      document.documentElement.style.overflow = mq.matches ? "hidden" : "";
    };
    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      document.documentElement.style.overflow = "";
    };
  }, []);

  // ------------------------------------------------------------------ steps
  const step = data.step;
  const cur = STEPS[step];
  const dirRef = useRef<1 | -1>(1);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const phoneTitleRef = useRef<HTMLSpanElement>(null);
  const prevStep = useRef(step);
  useIsoLayoutEffect(() => {
    if (prevStep.current === step) return;
    dirRef.current = step > prevStep.current ? 1 : -1;
    prevStep.current = step;
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    slideStep(bodyRef.current, dirRef.current);
    fadeTitle(titleRef.current);
    fadeTitle(phoneTitleRef.current);
  }, [step]);

  const readiness = stepReadiness(data, extras.uploads);
  const team = teamIds(data);
  const names = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const go = (to: number) => update({ step: Math.max(0, Math.min(6, to)) as StepIndex });

  // Tick times; three ticks within 20 s on site shows the red notice.
  const recent = useRef<number[]>([]);
  const [batchWarn, setBatchWarn] = useState(false);
  const noteSiteTick = () => {
    if (step !== 3) return;
    const result = noteTick(recent.current, Date.now());
    recent.current = result.recent;
    if (result.warn) {
      setBatchWarn(true);
      update((d) => ({ batchWarnings: [...d.batchWarnings, new Date().toISOString()] }));
    }
  };
  const flipCheck = (id: string) => {
    if (locked) return;
    const on = !!data.checks[id];
    if (!on) noteSiteTick();
    update((d) => {
      const checks = { ...d.checks };
      if (checks[id]) delete checks[id];
      else checks[id] = new Date().toISOString();
      return { checks };
    });
  };
  const flipShot = (key: ShotKey) => {
    if (locked) return;
    if (!data.shots[key]) noteSiteTick();
    update((d) => {
      const shots = { ...d.shots };
      if (shots[key]) delete shots[key];
      else shots[key] = new Date().toISOString();
      return { shots };
    });
  };

  const pressTime = () => {
    if (!cur.time || locked) return;
    const key = cur.time.key;
    update((d) => (d.times[key] ? {} : { times: { ...d.times, [key]: new Date().toISOString() } }));
  };

  const timeCardRef = useRef<HTMLDivElement>(null);
  const timeDone = cur.time ? data.times[cur.time.key] : undefined;
  const timeWas = useRef(timeDone);
  useEffect(() => {
    if (timeDone && !timeWas.current) settle(timeCardRef.current);
    timeWas.current = timeDone;
  }, [timeDone]);

  // ---------------------------------------------------------------- uploads
  const uploads = useUploads({
    propertyId: property.id,
    fieldVisitId: data.id,
    ensureSaved: flush,
    onReady: (deliverable: DeliverableKey) => {
      setExtras((e) => {
        const count = e.uploads[deliverable] ?? { ready: 0, uploading: 0, failed: 0, bytes: 0, seconds: 0 };
        return { ...e, uploads: { ...e.uploads, [deliverable]: { ...count, ready: count.ready + 1 } } };
      });
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => void refresh(data.id), 1500);
    },
  });
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uploadsDone = allUploaded(extras.uploads);

  // ----------------------------------------------------------------- finish
  const plan = useMemo(
    () => (data.person1Id ? plannedTasks(data.visitDate, { person1Id: data.person1Id, person2Id: data.person2Id }, data.taskOwners) : []),
    [data.person1Id, data.person2Id, data.taskOwners, data.visitDate],
  );
  const pubs = plannedPublications(data.visitDate);

  const confirm = async () => {
    setCompleting(true);
    setCompleteError(null);
    try {
      await flush();
      const res = await fetch(`/api/admin/field-visits/${data.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owners: Object.fromEntries(plan.map((t) => [t.key, t.ownerId])) }),
      });
      const body = (await res.json().catch(() => ({}))) as FichePayload & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Erreur ${res.status}`);
      setExtras(extrasFrom(body, body.property, body.fiche.kind));
      replace({ ...body.fiche, step: 6 }, { serverKnown: true });
      clearLocal(property.id);
      announceTasksChanged();
    } catch (error) {
      setCompleteError(
        error instanceof Error && error.message !== "Failed to fetch" ? error.message : "Pas de connexion. La fiche est gardée sur le téléphone : réessayez dès que le réseau revient.",
      );
    } finally {
      setCompleting(false);
    }
  };

  const doneRef = useRef<HTMLDivElement>(null);
  const wasLocked = useRef(locked);
  useEffect(() => {
    if (locked && !wasLocked.current && doneRef.current) staggerIn(doneRef.current.querySelectorAll("[data-stagger]"), 0.15);
    wasLocked.current = locked;
  }, [locked]);

  // ------------------------------------------------------------ footer copy
  const isLast = step === 6;
  const nextLabel = isLast
    ? locked
      ? "Ouvrir le montage dans le Studio"
      : completing
        ? "Envoi…"
        : "Confirmer et créer les 6 tâches"
    : step === 5
      ? "Envoyer la fiche à l’équipe"
      : step === 0
        ? "Commencer"
        : "Continuer";
  const nextHint = isLast
    ? locked
      ? "La fiche est rangée avec le bien et les tâches sont dans le briefing de chacun."
      : (completeError ?? "Vérifiez qui fait quoi, puis confirmez.")
    : missingSentence(readiness.missing);
  const canNext = isLast ? !completing : readiness.ready && (!locked || step < 6);
  const next = () => {
    if (isLast) {
      if (locked) router.push("/admin/studio");
      else void confirm();
      return;
    }
    if (readiness.ready) go(step + 1);
  };
  const back = () => {
    if (step > 0) go(step - 1);
    else router.push(`/admin/annonces/${property.id}`);
  };

  const code = property.reference ?? "Sans code";
  const place = property.quartier || property.city;
  const offerText = offer
    ? `Vous étiez à l’étape « ${STEPS[offer.data.step].short} », enregistrée à ${offer.at || "l’instant"}. Les heures, les cases cochées et les prises sont gardées.`
    : "";

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#F6F1EA] text-[#1F1A16] lg:static lg:z-auto lg:grid lg:h-[calc(100dvh-220px)] lg:min-h-[640px] lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-4 lg:bg-transparent">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 hidden bg-[#F6F1EA] lg:block" />

      {/* Desktop: property and the stepper (completed steps are clickable). */}
      <aside className="hidden min-h-0 flex-col gap-3 lg:flex">
        <div className="flex items-center gap-3 rounded-[20px] border border-[#EAE1D5] bg-white p-3.5">
          <Thumb src={property.image} size={52} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-xs font-extrabold text-[#8A4924]">Fiche de visite · {code}</span>
            <span className="truncate text-base font-extrabold">{property.title}</span>
            <span className="text-xs text-[#6B625B]">{visitDateLabel(data.visitDate)}</span>
          </span>
        </div>
        <nav aria-label="Étapes de la visite" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto rounded-[20px] border border-[#EAE1D5] bg-white p-2">
          {STEPS.map((s, k) => {
            const done = k < step;
            const current = k === step;
            const tk = s.time?.key;
            return (
              <button
                key={k}
                type="button"
                onClick={() => k <= step && go(k)}
                disabled={k > step}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "flex min-h-11 w-full items-center gap-2.5 rounded-[14px] px-3 py-2.5 text-left transition-colors duration-200",
                  current ? "bg-[#FFF4EA] shadow-[inset_0_0_0_1px_#F0C9A6]" : "bg-transparent hover:bg-[#FBF7F1]",
                  k <= step ? "cursor-pointer" : "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold transition-colors duration-300",
                    done ? "bg-[#2F7A48] text-white" : current ? "bg-[#C96A2E] text-white" : "bg-white text-[#8F867E] shadow-[inset_0_0_0_2px_#E2D8CC]",
                  )}
                >
                  {done ? <CheckIcon size={13} weight="bold" aria-hidden="true" /> : k}
                </span>
                <span className={cn("flex-1 text-sm", current ? "font-extrabold" : "font-bold", done || current ? "text-[#1F1A16]" : "text-[#8F867E]")}>
                  {k === 6 ? "Terminé" : s.short}
                </span>
                {tk && data.times[tk] && <span className="text-xs font-extrabold text-[#245C33]">{hhmm(data.times[tk])}</span>}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="flex min-h-0 flex-1 flex-col lg:overflow-hidden lg:rounded-3xl lg:border lg:border-[#EAE1D5] lg:bg-white">
        <header className="flex flex-none flex-col gap-2.5 bg-[#F6F1EA] px-4 pb-2.5 pt-3.5 lg:gap-2.5 lg:border-b lg:border-[#F0E8DD] lg:bg-white lg:px-7 lg:pb-3.5 lg:pt-5">
          <div className="flex items-center gap-2.5 lg:hidden">
            <button
              type="button"
              onClick={back}
              aria-label={step > 0 ? "Étape précédente" : "Retour à l’annonce"}
              className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[#E2D8CC] bg-white"
            >
              <CaretLeftIcon size={18} weight="bold" aria-hidden="true" />
            </button>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#8A4924]">Fiche de visite · {code}</span>
              <span ref={phoneTitleRef} className="truncate text-lg font-extrabold">
                {cur.title}
              </span>
            </div>
          </div>
          <ProgressBar step={step} />
          <div className="hidden items-center gap-3 lg:flex">
            <h1 ref={titleRef} className="m-0 flex-1 text-[26px] font-extrabold">
              {cur.title}
            </h1>
            <SavePill save={save} />
          </div>
          <div className="flex items-start gap-2 lg:block">
            <span className="min-w-0 flex-1 text-xs text-[#6B625B] lg:text-sm">{cur.sub}</span>
            <span className="lg:hidden">
              <SavePill save={save} />
            </span>
          </div>
        </header>

        {!installed && (
          <p role="status" className="mx-4 my-0 rounded-[14px] bg-[#FCEFD4] px-3 py-2.5 text-[13px] font-bold text-[#6E4300] lg:mx-7 lg:mt-3">
            La fiche n’est pas encore installée sur le serveur (migration 090). Elle reste gardée sur cet appareil.
          </p>
        )}
        {notice && (
          <p role="status" className={cn("mx-4 my-0 flex items-start gap-2 rounded-[14px] px-3 py-2.5 text-[13px] font-bold lg:mx-7 lg:mt-3", notice.tone === "red" ? "bg-[#FBE3DF] text-[#8E2A1E]" : "bg-[#FCEFD4] text-[#6E4300]")}>
            <span className="flex-1">
              {notice.text}{" "}
              {notice.href && (
                <Link href={notice.href} className="font-extrabold text-inherit underline">
                  Ouvrir la fiche
                </Link>
              )}
            </span>
            <button type="button" onClick={() => setNotice(null)} className="h-8 shrink-0 cursor-pointer rounded-full bg-white px-2.5 text-xs font-extrabold text-inherit">
              Compris
            </button>
          </p>
        )}

        <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 pb-4 pt-1 lg:gap-3 lg:px-7 lg:py-[18px]">
          {step === 0 && (
            <InfosStep
              property={property}
              data={data}
              people={people}
              locked={locked}
              onKind={(kind) => update({ kind })}
              onToggle={(id) => update((d) => toggleTeam(d, id))}
            />
          )}

          {cur.time && (
            <div
              ref={timeCardRef}
              className={cn("flex flex-col gap-2 rounded-[18px] p-3", timeDone ? "bg-[#E3F1E6]" : "border border-[#EAE1D5] bg-white")}
            >
              {!timeDone ? (
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-4">
                  <button
                    type="button"
                    onClick={pressTime}
                    disabled={locked}
                    className="flex min-h-16 w-full cursor-pointer items-center justify-center gap-2.5 rounded-[18px] bg-[#C96A2E] px-6 text-[17px] font-extrabold text-white transition-colors hover:bg-[#8A4924] lg:h-[60px] lg:min-h-0 lg:w-auto lg:min-w-[320px]"
                  >
                    <ClockIcon size={22} weight="bold" aria-hidden="true" />
                    {cur.time.button}
                  </button>
                  <span className="text-center text-xs text-[#6B625B] lg:text-left lg:text-[13px]">L’heure est notée et l’équipe est prévenue dans Roogo.</span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[#2F7A48] text-white">
                    <CheckIcon size={18} weight="bold" aria-hidden="true" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-base font-extrabold lg:text-[17px]">
                      {cur.time.done} : {hhmm(timeDone)}
                    </span>
                    <span className="text-xs text-[#245C33] lg:text-[13px]">Équipe prévenue dans Roogo</span>
                  </span>
                  <a
                    href={whatsappShareUrl(whatsappText(cur.time.done, hhmm(timeDone), place, property.reference))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-11 items-center gap-1.5 rounded-full border border-[#CFE3D4] bg-white px-3 text-xs font-extrabold text-[#1F1A16] no-underline lg:h-10 lg:text-[13px]"
                  >
                    <WhatsappLogoIcon size={16} weight="bold" aria-hidden="true" />
                    Aussi sur WhatsApp
                  </a>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <SurPlaceStep
              data={data}
              locked={locked}
              batchWarn={batchWarn}
              onDismissWarn={() => setBatchWarn(false)}
              onLocation={(location) => update({ location, locationSkipped: null })}
              onSkipLocation={(reason) => update({ locationSkipped: reason })}
              onFact={(key, value) => update((d) => ({ facts: { ...d.facts, [key]: value } }))}
              onShot={flipShot}
              renderChecks={() => cur.checks.map((c) => <CheckRow key={c.id} id={c.id} title={c.title} detail={c.detail} at={data.checks[c.id]} disabled={locked} onToggle={() => flipCheck(c.id)} />)}
            />
          )}

          {step === 5 && (
            <RetourStep
              folderPath={extras.folderPath}
              folderUrl={extras.folderUrl}
              summary={extras.uploads}
              items={uploads.items}
              locked={locked}
              online={save.kind !== "offline"}
              onFiles={(d, files) => uploads.add(d, files)}
              onRetry={(d) => uploads.retry(d)}
            />
          )}

          {step !== 3 && cur.checks.length > 0 && (
            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
              {cur.checks.map((c) => {
                const deleteLock = c.id === DELETE_CHECK_ID && !uploadsDone;
                return (
                  <CheckRow
                    key={c.id}
                    id={c.id}
                    title={c.title}
                    detail={deleteLock ? "Pas avant que tout soit dans le Drive." : c.id === DELETE_CHECK_ID ? "Seulement maintenant : tout est bien dans le Drive." : c.detail}
                    at={data.checks[c.id]}
                    locked={deleteLock}
                    disabled={locked}
                    onToggle={() => !deleteLock && flipCheck(c.id)}
                  />
                );
              })}
            </div>
          )}

          {step === 6 && (
            <DoneStep
              ref={doneRef}
              data={data}
              locked={locked}
              plan={plan}
              tasks={extras.tasks}
              pubs={pubs}
              names={names}
              team={team}
              onCycle={(key, current) => update((d) => ({ taskOwners: { ...d.taskOwners, [key]: nextOwner(current, team) } }))}
            />
          )}
        </div>

        <footer className="flex flex-none flex-col gap-1.5 border-t border-[#EAE1D5] bg-white px-4 pb-6 pt-3 lg:flex-row lg:items-center lg:gap-3.5 lg:border-[#F0E8DD] lg:px-7 lg:py-3.5">
          <button
            type="button"
            onClick={back}
            className="hidden h-12 cursor-pointer rounded-full border border-[#E2D8CC] bg-white px-[18px] text-sm font-extrabold lg:inline-flex lg:items-center"
          >
            {step > 0 ? "Retour" : "Retour à l’annonce"}
          </button>
          <span
            role={completeError && isLast ? "alert" : undefined}
            className={cn("order-2 text-center text-xs lg:order-none lg:flex-1 lg:text-right lg:text-[13px]", completeError && isLast ? "font-bold text-[#8E2A1E]" : "text-[#6B625B]")}
          >
            {nextHint}
          </span>
          <button
            type="button"
            onClick={next}
            disabled={!canNext}
            className={cn(
              "order-1 h-[54px] rounded-full px-6 text-base font-extrabold transition-colors duration-200 lg:order-none lg:min-w-[220px]",
              canNext ? "cursor-pointer bg-[#C96A2E] text-white hover:bg-[#8A4924]" : "cursor-not-allowed bg-[#E7E0D7] text-[#8F867E]",
            )}
          >
            {nextLabel}
          </button>
        </footer>
      </main>

      {offer && <ResumeDialog text={offerText} busy={offerBusy} error={offerError} onResume={resume} onRestart={() => void restart()} />}
    </div>
  );
}

function Thumb({ src, size }: { src: string | null; size: number }) {
  return src ? (
    // Listing photos come from several hosts; a plain img keeps this screen light.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} style={{ width: size, height: size }} className="shrink-0 rounded-xl object-cover" />
  ) : (
    <span aria-hidden="true" style={{ width: size, height: size }} className="shrink-0 rounded-xl bg-[linear-gradient(160deg,#D9B38F,#8A5A3A)]" />
  );
}

// ---------------------------------------------------------------------------
// 0. Infos

function InfosStep({
  property,
  data,
  people,
  locked,
  onKind,
  onToggle,
}: {
  property: FicheProperty;
  data: FicheData;
  people: PersonLite[];
  locked: boolean;
  onKind: (kind: "location" | "vente") => void;
  onToggle: (id: string) => void;
}) {
  const team = teamIds(data);
  const full = team.length >= 2;
  const radio = (kind: "location" | "vente", label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={data.kind === kind}
      disabled={locked}
      onClick={() => onKind(kind)}
      className={cn("h-10 cursor-pointer rounded-full text-sm font-extrabold transition-colors", data.kind === kind ? "bg-white text-[#1F1A16] shadow-[0_1px_3px_rgba(31,26,22,0.10)]" : "bg-transparent text-[#6B625B]")}
    >
      {label}
    </button>
  );
  return (
    <>
      <Card className="gap-3 lg:border-0 lg:p-0">
        <div className="flex flex-col gap-1.5 lg:hidden">
          <span className="text-[13px] font-extrabold">Bien</span>
          <div className="flex items-center gap-2.5 rounded-[14px] bg-[#FBF7F1] p-2.5">
            <Thumb src={property.image} size={44} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] font-extrabold">{property.title}</span>
              <span className="text-xs text-[#6B625B]">
                {property.reference ?? "Sans code"} · propriétaire : {property.ownerName ?? "non renseigné"}
              </span>
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
          <div className="flex flex-col gap-1.5 lg:gap-2">
            <span id="fiche-kind" className="text-[13px] font-extrabold lg:text-sm">
              Location ou vente
            </span>
            <div role="radiogroup" aria-labelledby="fiche-kind" className="grid max-w-[360px] grid-cols-2 rounded-full bg-[#EDE4D8] p-1">
              {radio("location", "Location")}
              {radio("vente", "Vente")}
            </div>
          </div>
          <div className="flex flex-col gap-1.5 lg:gap-2">
            <span id="fiche-team" className="text-[13px] font-extrabold lg:text-sm">
              Équipe (deux personnes au maximum)
            </span>
            <div role="group" aria-labelledby="fiche-team" className="flex flex-wrap gap-1.5">
              {people.map((p) => {
                const on = team.includes(p.id);
                const disabled = locked || (full && !on);
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    disabled={disabled}
                    onClick={() => onToggle(p.id)}
                    className={cn(
                      "h-11 cursor-pointer rounded-full px-3.5 text-sm font-extrabold transition-colors lg:h-10",
                      on ? "bg-[#1F1A16] text-white" : "border border-[#E2D8CC] bg-white text-[#1F1A16]",
                      disabled && !on && "cursor-not-allowed opacity-45",
                    )}
                  >
                    {p.firstName}
                    {on && team[0] === p.id && team.length === 2 && <span className="sr-only"> (personne 1)</span>}
                  </button>
                );
              })}
            </div>
            <span className="text-xs text-[#6B625B]">
              {full ? "Deux personnes choisies : c’est le maximum." : "Choisissez une ou deux personnes."}
              {team.length > 0 && ` Personne 1 : ${people.find((p) => p.id === team[0])?.firstName ?? ""}.`}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3 lg:rounded-2xl lg:bg-[#FBF7F1] lg:p-3.5">
          <Fact label="Date" value={visitDateLabel(data.visitDate)} />
          <Fact label="Quartier" value={property.quartier || property.city || "Non renseigné"} />
          <Fact label="Type" value={property.typeLabel} className="hidden lg:flex" />
          <Fact label="Propriétaire" value={property.ownerName ?? "Non renseigné"} className="hidden lg:flex" />
        </div>
      </Card>
      <p className="m-0 text-xs text-[#6B625B] lg:text-[13px]">Le bien, le quartier et le propriétaire viennent de l’annonce. Rien à retaper.</p>
    </>
  );
}

function Fact({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-xs font-extrabold text-[#6B625B]">{label}</span>
      <span className="truncate text-[15px] font-extrabold lg:text-base">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Sur place (ticks only, no uploads)

function SurPlaceStep({
  data,
  locked,
  batchWarn,
  onDismissWarn,
  onLocation,
  onSkipLocation,
  onFact,
  onShot,
  renderChecks,
}: {
  data: FicheData;
  locked: boolean;
  batchWarn: boolean;
  onDismissWarn: () => void;
  onLocation: (l: NonNullable<FicheData["location"]>) => void;
  onSkipLocation: (reason: string) => void;
  onFact: (key: (typeof FACTS)[number]["key"], value: string) => void;
  onShot: (key: ShotKey) => void;
  renderChecks: () => React.ReactNode;
}) {
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<{ text: string; reason: string } | null>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const warnRef = useRef<HTMLDivElement>(null);
  const hadPin = useRef(!!data.location);
  useEffect(() => {
    if (data.location && !hadPin.current) settle(pinRef.current, { y: 6 });
    hadPin.current = !!data.location;
  }, [data.location]);
  useEffect(() => {
    if (batchWarn) settle(warnRef.current, { y: -6 });
  }, [batchWarn]);

  const takePin = () => {
    if (!("geolocation" in navigator)) {
      setGeoError({ text: "Ce navigateur ne donne pas la position.", reason: "Position indisponible sur l’appareil" });
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onLocation({
          lat: Math.round(pos.coords.latitude * 1e6) / 1e6,
          lng: Math.round(pos.coords.longitude * 1e6) / 1e6,
          accuracy: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null,
          at: new Date(pos.timestamp || Date.now()).toISOString(),
        });
      },
      (error) => {
        setLocating(false);
        if (error.code === error.PERMISSION_DENIED) {
          setGeoError({
            text: "Position refusée. Autorisez la localisation pour ce site dans les réglages du navigateur, puis réessayez.",
            reason: "Position refusée sur l’appareil",
          });
        } else if (error.code === error.TIMEOUT) {
          setGeoError({ text: "La position met trop de temps. Sortez à découvert et réessayez.", reason: "Position introuvable (délai dépassé)" });
        } else {
          setGeoError({ text: "Position introuvable. Activez le GPS et réessayez.", reason: "Position introuvable" });
        }
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };

  return (
    <div className="flex flex-col gap-2.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
      <div className="flex flex-col gap-2.5">
        {renderChecks()}
        <Card className="lg:border-0 lg:bg-[#FBF7F1]">
          <span className="text-[13px] font-extrabold lg:text-sm">Position du bien</span>
          {data.location ? (
            <div ref={pinRef} className="flex items-center gap-2.5 rounded-[14px] bg-[#E3F1E6] p-2.5">
              <MapPinIcon size={18} weight="fill" className="text-[#245C33]" aria-hidden="true" />
              <span className="flex-1 text-[13px] font-bold text-[#245C33]">
                Position enregistrée{data.location.accuracy != null ? ` (précision ${data.location.accuracy} m)` : ""}
              </span>
              <a
                href={`https://www.google.com/maps?q=${data.location.lat},${data.location.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center px-1 text-xs font-extrabold text-[#245C33] underline"
              >
                Voir
              </a>
            </div>
          ) : data.locationSkipped ? (
            <div className="flex flex-wrap items-center gap-2.5 rounded-[14px] bg-[#FCEFD4] p-2.5">
              <span className="flex-1 text-[13px] font-bold text-[#6E4300]">{data.locationSkipped}. Continuée sans position.</span>
              <button type="button" disabled={locked} onClick={takePin} className="h-11 cursor-pointer rounded-full bg-white px-3 text-xs font-extrabold text-[#6E4300]">
                Réessayer
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={takePin}
                disabled={locked || locating}
                className="h-12 cursor-pointer rounded-[14px] border border-dashed border-[#C96A2E] bg-[#FFF8F1] text-sm font-extrabold text-[#8A4924] disabled:cursor-wait disabled:opacity-70"
              >
                {locating ? "Recherche de la position…" : "Prendre la position ici"}
              </button>
              {geoError && (
                <div role="alert" className="flex flex-col gap-2 rounded-[14px] bg-[#FBE3DF] p-2.5 text-[13px] font-bold text-[#8E2A1E]">
                  <span>{geoError.text}</span>
                  <button type="button" onClick={() => onSkipLocation(geoError.reason)} className="h-11 cursor-pointer self-start rounded-full bg-white px-3 text-xs font-extrabold text-[#8E2A1E]">
                    Continuer sans position
                  </button>
                </div>
              )}
            </>
          )}

          <span className="mt-1 text-[13px] font-extrabold lg:text-sm">Informations du bien (pour les légendes)</span>
          <div className="grid grid-cols-2 gap-2">
            {FACTS.map((f) => (
              <label key={f.key} className={cn("flex min-w-0 flex-col gap-1 text-xs font-bold text-[#6B625B]", f.wide && "col-span-2")}>
                {f.label}
                <input
                  value={data.facts[f.key] ?? ""}
                  placeholder={f.placeholder}
                  disabled={locked}
                  onChange={(e) => onFact(f.key, e.target.value)}
                  className="h-11 min-w-0 rounded-xl border border-[#E2D8CC] bg-white px-2.5 text-sm text-[#1F1A16] focus:border-[#C96A2E] focus:outline-none"
                />
              </label>
            ))}
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-2.5 lg:gap-2">
        <span className="mt-1 text-[13px] font-extrabold lg:mt-0 lg:text-sm">À filmer, dans cet ordre</span>
        <div className="rounded-[14px] bg-[#FCEFD4] px-3 py-2.5 text-[13px] font-bold leading-[1.4] text-[#6E4300]">
          Cochez chaque prise dès qu’elle est faite : l’heure est notée. Les fichiers s’envoient au retour, à l’étape 5.
        </div>
        {batchWarn && (
          <div ref={warnRef} role="status" className="flex items-start gap-2 rounded-[14px] bg-[#FBE3DF] px-3 py-2.5 text-[13px] font-bold leading-[1.4] text-[#8E2A1E]">
            <span className="flex-1">Plusieurs cases cochées en quelques secondes. Cochez sur place, au moment où chaque chose est faite, pas tout à la fin.</span>
            <button type="button" onClick={onDismissWarn} className="h-8 shrink-0 cursor-pointer rounded-full bg-white px-2.5 text-xs font-extrabold text-[#8E2A1E]">
              Compris
            </button>
          </div>
        )}
        {SHOTS.map((shot, k) => (
          <ShotRow key={shot.key} index={k} title={shot.title} tip={shot.tip} at={data.shots[shot.key]} disabled={locked} onToggle={() => onShot(shot.key)} />
        ))}
      </div>
    </div>
  );
}

function ShotRow({ index, title, tip, at, disabled, onToggle }: { index: number; title: string; tip: string; at?: string; disabled: boolean; onToggle: () => void }) {
  const on = !!at;
  const ref = useRef<HTMLButtonElement>(null);
  const was = useRef(on);
  useEffect(() => {
    if (on && !was.current) {
      settle(ref.current, { backgroundColor: "#E3F1E6" });
      popTick(ref.current?.querySelector("[data-tick]") ?? null);
    }
    was.current = on;
  }, [on]);
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={on}
      aria-label={`${title}. ${on ? "Fait, toucher pour décocher" : "Cocher : fait maintenant"}`}
      disabled={disabled}
      onClick={onToggle}
      className={cn("flex w-full cursor-pointer items-start gap-3 rounded-2xl border bg-white p-3 text-left text-inherit transition-colors duration-300", on ? "border-[#CFE3D4]" : "border-[#EAE1D5]")}
    >
      <Tick on={on} size={30} label={String(index + 1)} />
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="text-[15px] font-extrabold">{title}</span>
        <span className="text-xs leading-[1.4] text-[#6B625B]">{tip}</span>
        {on && <span className="text-xs font-extrabold text-[#245C33]">Fait à {hhmm(at)}</span>}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// 5. Retour au bureau (the only upload step)

function RetourStep({
  folderPath,
  folderUrl,
  summary,
  items,
  locked,
  online,
  onFiles,
  onRetry,
}: {
  folderPath: string;
  folderUrl: string | null;
  summary: UploadSummary;
  items: ReturnType<typeof useUploads>["items"];
  locked: boolean;
  online: boolean;
  onFiles: (d: DeliverableKey, files: FileList) => void;
  onRetry: (d: DeliverableKey) => void;
}) {
  const done = allUploaded(summary);
  return (
    <Card className="lg:border-0 lg:bg-[#FBF7F1] lg:p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1 text-[13px] font-extrabold lg:text-sm">Envoi au Drive de Roogo</span>
        <span className={cn("text-xs font-extrabold lg:text-[13px]", done ? "text-[#245C33]" : "text-[#6E4300]")}>{done ? "Tout est dans le Drive" : "Il reste des fichiers"}</span>
      </div>
      <span className="text-xs text-[#6B625B]">
        Dossier créé tout seul : <b className="break-words">{folderPath}</b>
        {folderUrl && (
          <>
            {" "}
            <a href={folderUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-extrabold text-[#8A4924]">
              Ouvrir <ArrowSquareOutIcon size={12} weight="bold" aria-hidden="true" />
            </a>
          </>
        )}
      </span>
      {!online && (
        <p role="status" className="m-0 rounded-xl bg-[#FCEFD4] px-3 py-2 text-xs font-bold text-[#6E4300]">
          Hors connexion : l’envoi reprendra quand le réseau revient. Wi-Fi du bureau conseillé.
        </p>
      )}
      <div className="flex flex-col lg:grid lg:grid-cols-5 lg:gap-2.5">
        {DELIVERABLES.map((d) => (
          <UploadRow key={d.key} def={d} count={summary[d.key]?.ready ?? 0} items={items} locked={locked} onFiles={onFiles} onRetry={onRetry} />
        ))}
      </div>
      <span className="text-xs text-[#6B625B]">Un bouton par type, plusieurs fichiers à la fois. L’envoi démarre tout seul. Wi-Fi du bureau conseillé.</span>
    </Card>
  );
}

function UploadRow({
  def,
  count,
  items,
  locked,
  onFiles,
  onRetry,
}: {
  def: (typeof DELIVERABLES)[number];
  count: number;
  items: ReturnType<typeof useUploads>["items"];
  locked: boolean;
  onFiles: (d: DeliverableKey, files: FileList) => void;
  onRetry: (d: DeliverableKey) => void;
}) {
  const progress = progressFor(items, def.key);
  const barRef = useRef<HTMLDivElement>(null);
  const pct = progress.active ? progress.pct : count > 0 ? 100 : 0;
  useEffect(() => moveBar(barRef.current, pct), [pct]);
  const word = (n: number) => (n > 1 ? def.many : def.one);
  const state = progress.active
    ? `${count ? `${count} ${word(count)} · ` : ""}envoi de ${progress.active} · ${progress.pct} %`
    : count > 0
      ? `${count} ${word(count)} · dans le Drive`
      : "Rien envoyé";
  const color = progress.active ? "text-[#6E4300]" : count > 0 ? "text-[#245C33]" : "text-[#8E2A1E]";
  const inputId = `fiche-upload-${def.key}`;
  return (
    <div className="flex flex-col gap-1.5 border-t border-[#F0E8DD] pt-2 lg:gap-2 lg:rounded-[14px] lg:border-0 lg:bg-white lg:p-3">
      <div className="flex items-center gap-2 lg:flex-col lg:items-start">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[13px] font-extrabold">{def.label}</span>
          <span className={cn("text-xs font-bold", color)} aria-live="polite">
            {state}
          </span>
        </span>
        <input
          id={inputId}
          type="file"
          multiple
          accept={def.accept}
          disabled={locked}
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) onFiles(def.key, e.target.files);
            e.target.value = "";
          }}
        />
        <label
          htmlFor={inputId}
          className={cn(
            "inline-flex h-11 shrink-0 cursor-pointer items-center rounded-full px-3.5 text-xs font-extrabold lg:h-9",
            count > 0 || progress.active ? "border border-[#E2D8CC] bg-white text-[#1F1A16]" : "bg-[#1F1A16] text-white",
            locked && "pointer-events-none opacity-50",
          )}
        >
          {count > 0 || progress.active ? "+ Ajouter" : "Ajouter"}
          <span className="sr-only"> : {def.label}</span>
        </label>
      </div>
      <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-[#F0E8DD]">
        <div ref={barRef} className={cn("h-full rounded-full transition-colors duration-300", !progress.active && count > 0 ? "bg-[#2F7A48]" : "bg-[#C96A2E]")} style={{ width: 0 }} />
      </div>
      {progress.failed.length > 0 && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#8E2A1E]">
          <span className="min-w-0 flex-1">
            {progress.failed.length > 1 ? `${progress.failed.length} envois ont échoué` : "1 envoi a échoué"} : {progress.failed[progress.failed.length - 1].error}
          </span>
          <button type="button" onClick={() => onRetry(def.key)} className="h-9 cursor-pointer rounded-full border border-[#E3A79C] bg-white px-3 text-xs font-extrabold text-[#8E2A1E]">
            Réessayer
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6. Tournage terminé

type DoneProps = {
  data: FicheData;
  locked: boolean;
  plan: ReturnType<typeof plannedTasks>;
  tasks: TaskView[];
  pubs: ReturnType<typeof plannedPublications>;
  names: Map<string, PersonLite>;
  team: string[];
  onCycle: (key: TaskView["key"], current: string) => void;
  ref: React.Ref<HTMLDivElement>;
};

function DoneStep({ data, locked, plan, tasks, pubs, names, team, onCycle, ref }: DoneProps) {
  const rows = locked && tasks.length
    ? tasks.map((t) => ({ key: t.key, title: t.title, ownerId: t.ownerId, dueDate: t.dueDate, dueTime: t.dueTime, days: plan.find((p) => p.key === t.key)?.days ?? 1, status: t.status }))
    : plan.map((t) => ({ key: t.key, title: t.title, ownerId: t.ownerId, dueDate: t.dueDate, dueTime: t.dueTime, days: t.days, status: "a_faire" as const }));
  const times: [keyof FicheData["times"], string][] = [
    ["depart", "Départ"],
    ["arrivee", "Arrivée"],
    ["departSite", "Fin sur place"],
    ["retour", "Retour"],
  ];
  return (
    <div ref={ref} className="flex flex-col gap-2.5 lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] lg:items-start lg:gap-4">
      <div data-stagger className="flex flex-col gap-3 rounded-[20px] border border-[#EAE1D5] bg-white p-4 lg:border-0 lg:bg-[#FBF7F1] lg:p-[18px]">
        <div className="flex items-center gap-3">
          <span className={cn("inline-flex size-[52px] shrink-0 items-center justify-center rounded-full text-white lg:size-14", locked ? "bg-[#2F7A48]" : "bg-[#C96A2E]")}>
            <CheckIcon size={24} weight="bold" aria-hidden="true" />
          </span>
          <span className="flex flex-col">
            <span className="text-xl font-extrabold lg:text-[22px]">{locked ? "Tournage terminé" : "Presque fini"}</span>
            <span className="text-[13px] text-[#4A4540] lg:text-sm">
              {locked ? "Fiche envoyée à l’équipe. Le montage peut commencer." : "Vérifiez qui fait quoi. Les tâches sont créées quand vous confirmez."}
            </span>
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1.5 lg:gap-2">
          {times.map(([key, label]) => (
            <div key={key} className="flex flex-col items-center gap-0.5 rounded-xl bg-[#FBF7F1] px-1.5 py-2 lg:bg-white lg:py-2.5">
              <span className="text-[15px] font-extrabold lg:text-[17px]">{hhmm(data.times[key]) || "·"}</span>
              <span className="text-center text-[10px] font-bold text-[#6B625B] lg:text-[11px]">{label}</span>
            </div>
          ))}
        </div>
        <div className="hidden rounded-[14px] bg-[#B3392A] px-3.5 py-3 text-sm font-bold text-white lg:block">Rien n’est publié sans l’accord écrit de Salif.</div>
      </div>

      <div className="flex flex-col gap-2.5 lg:gap-3">
        <section data-stagger aria-labelledby="fiche-tasks" className="flex flex-col gap-2 rounded-[20px] border border-[#EAE1D5] bg-white p-3.5 lg:p-[18px]">
          <div className="flex items-center gap-2">
            <h2 id="fiche-tasks" className="m-0 flex-1 text-[13px] font-extrabold">
              {locked ? "Tâches créées dans le briefing" : "Tâches à créer dans le briefing"}
            </h2>
            <span className={cn("inline-flex h-[22px] items-center rounded-full px-2 text-[11px] font-extrabold", locked ? "bg-[#E3F1E6] text-[#245C33]" : "bg-[#EEEBE7] text-[#4A4540]")}>
              {rows.length} tâches
            </span>
          </div>
          {rows.map((t) => {
            const owner = names.get(t.ownerId);
            const canChange = !locked && team.length > 1;
            return (
              <div key={t.key} data-stagger className="flex items-center gap-2.5 border-t border-[#F0E8DD] py-2">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={cn("text-[13px] font-extrabold leading-[1.3]", t.status === "fait" && "text-[#6B625B] line-through")}>{t.title}</span>
                  <span className="text-xs font-bold text-[#8A4924]">
                    J+{t.days} · {shortDate(t.dueDate)}
                    {t.dueTime ? ` · avant ${t.dueTime}` : ""}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => canChange && onCycle(t.key, t.ownerId)}
                  disabled={!canChange}
                  aria-label={canChange ? `${t.title} : ${owner?.firstName ?? "personne"}. Toucher pour changer la personne` : `${t.title} : ${owner?.firstName ?? "personne"}`}
                  className={cn(
                    "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-[#E2D8CC] bg-white pl-1 pr-2.5 text-xs font-extrabold lg:h-9",
                    canChange ? "cursor-pointer" : "cursor-default",
                  )}
                >
                  <span aria-hidden="true" className="inline-flex size-[26px] items-center justify-center rounded-full bg-[#1F1A16] text-[10px] text-white">
                    {owner?.initials ?? "?"}
                  </span>
                  {owner?.firstName ?? "Personne"}
                  {canChange && <CaretDownIcon size={12} weight="bold" aria-hidden="true" />}
                </button>
              </div>
            );
          })}
          <span className="text-xs text-[#6B625B]">
            {businessDayNote(data.visitDate)} {!locked && team.length > 1 ? "Toucher un nom pour changer la personne." : ""} Les jours fériés ne sont pas encore pris en compte.
          </span>
        </section>

        <section data-stagger aria-labelledby="fiche-pubs" className="flex flex-col gap-2 rounded-[20px] border border-[#EAE1D5] bg-white p-3.5 lg:p-[18px]">
          <h2 id="fiche-pubs" className="m-0 text-[13px] font-extrabold">
            Publications prévues dans le calendrier
          </h2>
          {pubs.map((p) => (
            <div key={p.key} className="flex items-start gap-2.5 border-t border-[#F0E8DD] py-2">
              <span className="w-10 shrink-0 text-xs font-extrabold text-[#8A4924]">J+{p.days}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[13px] font-bold leading-[1.3]">{p.title}</span>
                <span className="text-xs text-[#6B625B]">
                  {shortDate(p.date)} · {p.platforms}
                </span>
              </span>
            </div>
          ))}
          <span className="text-xs text-[#6B625B]">Chaque publication part seule après la validation de Salif.</span>
        </section>
        <div data-stagger className="rounded-2xl bg-[#B3392A] px-3.5 py-3 text-[13px] font-bold leading-[1.4] text-white lg:hidden">
          Rien n’est publié sans l’accord écrit de Salif.
        </div>
      </div>
    </div>
  );
}
