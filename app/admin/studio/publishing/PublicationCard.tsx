"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowSquareOutIcon, CheckIcon, InfoIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { notifyApprovalsChanged } from "@/components/admin/useStudioApprovals";
import {
  NETWORK_LABELS,
  networksLabel,
  publicationStage,
  slotLabel,
  stageLabel,
  stageStep,
  type Network,
  type PublicationStage,
  type Role,
  type SlotOption,
} from "@/lib/studio/publishing";
import { NetworkIcons } from "../calendrier/NetworkIcons";
import { TONE, readError, type Post } from "../calendrier/calendar-types";
import { CALENDAR_HREF } from "../StudioHeader";
import { ApprovalPreview } from "./ApprovalPreview";
import { PlanSheet } from "./PlanSheet";
import { Toast, type ToastMessage } from "./Toast";
import type { TikTokPublishInfo } from "@/lib/social/tiktok-publish";
import { popDots, popPill, riseIn } from "./motion";

type Data = {
  publication: Post | null;
  slots: SlotOption[];
  daySlots: string[];
  me: { id: string; role: Role };
  tiktok?: TikTokPublishInfo | null;
};

const STAGE_TONE: Record<PublicationStage, (typeof TONE)[keyof typeof TONE]> = {
  pret: TONE.grey,
  renvoye: TONE.red,
  propose: TONE.amber,
  programme: TONE.blue,
  publie: TONE.green,
  echec: TONE.red,
};

const SEEN_KEY = (id: string) => `roogo-studio-pub-seen-${id}`;

function readSeen(id: string): string | null {
  try {
    return window.localStorage.getItem(SEEN_KEY(id));
  } catch {
    return null;
  }
}

function writeSeen(id: string, value: string) {
  try {
    window.localStorage.setItem(SEEN_KEY(id), value);
  } catch {
    // Only used to say "Salif a validé" once.
  }
}

const lower = (text: string) => text.replace(/^./, (c) => c.toLowerCase());

/**
 * The video's publication in its Studio project (design steps 1, 6, 9b, 10):
 * the status pill, the four-step stepper and the one action that fits the
 * stage and the viewer's role.
 */
export function PublicationCard({ artifactId, madeBy }: { artifactId: string; madeBy: string | null }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | { mode: "plan" | "reschedule"; phase?: "when" | "describe" }>(null);
  const [preview, setPreview] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const pillRef = useRef<HTMLSpanElement | null>(null);
  const stepsRef = useRef<HTMLOListElement | null>(null);
  const noteRef = useRef<HTMLDivElement | null>(null);
  const lastStage = useRef<PublicationStage | null>(null);

  const clearToast = useCallback(() => setToast(null), []);
  const say = useCallback((text: string, tone: ToastMessage["tone"] = "ok") => setToast({ id: Date.now(), text, tone }), []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/studio/publications/for-artifact?artifactId=${artifactId}`);
      if (!res.ok) throw new Error(await readError(res));
      setData((await res.json()) as Data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publication indisponible");
    }
  }, [artifactId]);

  useEffect(() => {
    setData(null);
    lastStage.current = null;
    void load();
  }, [load]);

  const post = data?.publication ?? null;
  const role: Role = data?.me.role ?? "staff";
  const stage = publicationStage(post ? { status: post.status, returnedAt: post.returnedAt } : null);

  // While Salif decides, look again every 30 s and when the tab comes back.
  useEffect(() => {
    if (stage !== "propose" || role === "founder") return;
    const id = window.setInterval(load, 30_000);
    window.addEventListener("focus", load);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", load);
    };
  }, [stage, role, load]);

  // Status change: pill and dots pop, the note rises, and the team hears Salif's answer once.
  useEffect(() => {
    if (!data) return;
    const before = lastStage.current;
    lastStage.current = stage;
    if (before && before !== stage) {
      popPill(pillRef.current);
      popDots(stepsRef.current?.querySelectorAll("[data-step-dot]") ?? null);
      riseIn(noteRef.current);
    }
    if (!post) return;
    const seen = readSeen(post.id);
    if (role !== "founder" && seen === "propose") {
      if (stage === "programme") say(`${post.approvedByName ?? "Salif"} a validé. Part ${lower(slotLabel(post.scheduledAt))}.`);
      if (stage === "renvoye") say(`${post.returnedByName ?? "Salif"} a renvoyé la vidéo. Voyez son commentaire.`, "warn");
    }
    writeSeen(post.id, stage);
  }, [data, stage, post, role, say]);

  const tone = STAGE_TONE[stage];
  const at = stageStep(stage);
  const when = post ? slotLabel(post.scheduledAt) : null;
  const nets = post?.networks ?? [];
  const steps = [
    { title: "Vidéo prête", detail: madeBy ? `Rendue et vérifiée par ${madeBy}` : "Rendue dans le Studio" },
    {
      title: "Proposée à Salif",
      detail:
        stage === "pret"
          ? "Date, réseaux, description générée, puis envoi"
          : stage === "renvoye"
            ? `Renvoyée par ${post?.returnedByName ?? "Salif"}, à corriger`
            : `${when}, ${networksLabel(nets)}`,
    },
    {
      title: "Validée et programmée",
      detail: at >= 2 && post?.approvedByName ? `Validée par ${post.approvedByName} · part ${lower(when ?? "")}` : "Salif valide depuis son téléphone ou son ordinateur",
    },
    { title: "Publiée", detail: stage === "publie" ? `En ligne sur ${networksLabel(nets)}` : "Automatique à l’heure prévue" },
  ];

  const primary = "h-12 w-full rounded-full bg-[#C96A2E] text-[15px] font-bold text-white transition-colors hover:bg-[#B85E26] active:scale-[0.99]";

  let action: React.ReactNode = null;
  if (stage === "pret") {
    action = (
      <button type="button" onClick={() => setSheet({ mode: "plan", phase: post?.caption ? "describe" : "when" })} className={primary}>
        Planifier la publication
      </button>
    );
  } else if (stage === "propose" && role === "founder") {
    action = (
      <button type="button" onClick={() => setPreview(true)} className={primary}>
        Voir et valider
      </button>
    );
  } else if (stage === "propose") {
    action = (
      <div ref={noteRef} className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-[13px] font-semibold text-[#6E4300]">En attente de la validation de Salif. Vous serez prévenu.</p>
        <button
          type="button"
          onClick={() => setSheet({ mode: "reschedule" })}
          className="h-11 shrink-0 rounded-full bg-white px-4 text-[13px] font-bold text-[#1F1A16] ring-1 ring-[rgba(74,52,36,0.18)] hover:bg-[#F6F1EA]"
        >
          Changer la date
        </button>
      </div>
    );
  } else if (stage === "renvoye") {
    action = (
      <div ref={noteRef} className="grid gap-3">
        <div className="rounded-2xl bg-[#FCEFD4] px-3.5 py-3 text-[13px] text-[#6E4300]">
          <p className="font-bold">{post?.returnedByName ?? "Salif"} a renvoyé la vidéo</p>
          <p>« {post?.reviewComment} »</p>
          {post && post.reviewTags.length > 0 && (
            <p className="mt-1.5 flex flex-wrap gap-1.5">
              {post.reviewTags.map((t) => (
                <span key={t} className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-bold">
                  {t}
                </span>
              ))}
            </p>
          )}
        </div>
        <button type="button" onClick={() => setSheet({ mode: "plan", phase: "describe" })} className={primary}>
          Corriger puis reproposer
        </button>
      </div>
    );
  } else if (stage === "programme") {
    action = (
      <div ref={noteRef} className="flex items-center gap-2 rounded-2xl bg-[#E1EFF8] px-3.5 py-3 text-[13px] font-semibold text-[#1F5F80]">
        <InfoIcon size={16} weight="bold" className="shrink-0" />
        Partira seule à l&apos;heure prévue. Rien à faire.
      </div>
    );
  } else if (stage === "publie" && post) {
    action = (
      <div ref={noteRef} className="grid gap-1.5">
        {(Object.keys(post.results) as Network[])
          .filter((n) => post.results[n]?.permalink)
          .map((n) => (
            <a
              key={n}
              href={post.results[n]!.permalink!}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[#A8521D]"
            >
              Voir sur {NETWORK_LABELS[n]} <ArrowSquareOutIcon size={14} weight="bold" />
            </a>
          ))}
      </div>
    );
  } else if (stage === "echec" && post) {
    action = (
      <div ref={noteRef} className="grid gap-2 rounded-2xl bg-[#FBE3DF] px-3.5 py-3 text-[13px] text-[#8E2A1E]">
        <p className="flex items-start gap-1.5 font-semibold">
          <WarningCircleIcon size={16} weight="bold" className="mt-0.5 shrink-0" />
          {post.lastError ?? "La publication a échoué."}
        </p>
        <Link href={CALENDAR_HREF} className="inline-flex min-h-11 items-center font-bold underline underline-offset-2">
          Ouvrir le calendrier
        </Link>
      </div>
    );
  }

  return (
    <section aria-labelledby={`pub-${artifactId}`} className="grid gap-3">
      <div className="grid gap-2 rounded-[22px] border border-[rgba(74,52,36,0.10)] bg-white/80 p-3.5">
        <h3 id={`pub-${artifactId}`} className="text-[15px] font-bold text-[#1F1A16]">
          Publication
        </h3>
        {!data && !error ? (
          <span className="studio-skeleton h-7 w-48 rounded-full" />
        ) : error ? (
          <p className="text-[13px] text-red-700">{error}</p>
        ) : (
          <>
            <span
              ref={pillRef}
              aria-live="polite"
              className="inline-flex h-7 w-max max-w-full items-center rounded-full px-3 text-[12px] font-bold"
              style={{ background: tone.bg, color: tone.fg }}
            >
              {stageLabel(stage, role)}
            </span>
            {post && stage !== "pret" && stage !== "renvoye" && (
              <p className="flex flex-wrap items-center gap-2 text-[13px] font-bold text-[#1F1A16]">
                {stage === "programme" ? "Part" : stage === "publie" ? "Publiée" : "Prévue"} {lower(when ?? "")}
                <NetworkIcons networks={nets} size={16} />
              </p>
            )}
          </>
        )}
      </div>

      <ol ref={stepsRef} aria-label="Étapes de publication" className="grid rounded-[22px] border border-[rgba(74,52,36,0.10)] bg-white/80 p-3.5">
        {steps.map((s, k) => {
          const isDone = k === 0 || k < at || (k === at && stage === "publie");
          const isCurrent = k === at && stage !== "publie";
          return (
            <li key={s.title} className="flex gap-3" aria-current={isCurrent ? "step" : undefined}>
              <span className="flex flex-col items-center">
                <span
                  data-step-dot
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold",
                    isDone
                      ? "bg-[#2F7A48] text-white"
                      : isCurrent
                        ? "bg-white text-[#C96A2E] shadow-[inset_0_0_0_2px_#C96A2E]"
                        : "bg-white text-[#8F867E] shadow-[inset_0_0_0_2px_#D6CBBE]",
                  )}
                >
                  {isDone ? <CheckIcon size={13} weight="bold" aria-label="Fait" /> : k + 1}
                </span>
                {k < steps.length - 1 && <span className={cn("my-0.5 min-h-4 w-0.5 flex-1", k < at ? "bg-[#2F7A48]" : "bg-[#E2D8CC]")} />}
              </span>
              <span className="min-w-0 pb-3">
                <span className={cn("block text-[14px] font-extrabold", isDone || isCurrent ? "text-[#1F1A16]" : "text-[#8F867E]")}>{s.title}</span>
                <span className="block text-xs text-neutral-600">{s.detail}</span>
              </span>
            </li>
          );
        })}
      </ol>

      {data && action}

      {sheet && data && (
        <PlanSheet
          mode={sheet.mode}
          startPhase={sheet.phase}
          artifactId={artifactId}
          publication={post}
          slots={data.slots}
          daySlots={data.daySlots}
          tiktok={data.tiktok}
          onClose={() => setSheet(null)}
          onDone={(saved) => {
            setData((cur) => (cur ? { ...cur, publication: saved } : cur));
            notifyApprovalsChanged();
            if (sheet.mode === "plan") {
              writeSeen(saved.id, "propose");
              say("Envoyée à Salif pour validation");
            } else {
              say(`Nouvelle date : ${lower(slotLabel(saved.scheduledAt))}`);
            }
            void load();
          }}
        />
      )}
      {preview && post && data && (
        <ApprovalPreview
          queue={[post]}
          daySlots={data.daySlots}
          tiktok={data.tiktok}
          onClose={() => {
            setPreview(false);
            void load();
          }}
          onChanged={(saved) => setData((cur) => (cur ? { ...cur, publication: saved } : cur))}
        />
      )}
      <Toast toast={toast} onDone={clearToast} />
    </section>
  );
}
