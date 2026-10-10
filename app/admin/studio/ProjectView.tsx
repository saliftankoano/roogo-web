"use client";

import Image from "next/image";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRightIcon,
  CaretDownIcon,
  FileTextIcon,
  FilmSlateIcon,
  HouseLineIcon,
  ImageSquareIcon,
  SparkleIcon,
  WaveformIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { ArtifactCard, type CardProps } from "./ArtifactsPanel";
import { Composer, LiveReply, Message, OldScript } from "./ChatView";
import { PropertyPicker } from "./PropertyPicker";
import type { Artifact, ConversationDetail, PropertySummary } from "./studio-types";
import type { CenterView } from "./ProjectPanel";

const ease = [0.22, 1, 0.36, 1] as const;

const newestFirst = (a: Artifact, b: Artifact) => b.createdAt.localeCompare(a.createdAt);

/**
 * The centre of the Studio is the project, not a chat (council option B, approved
 * by Salif 2026-10-10): the property's work in order, script, voice-over,
 * visuals, video, one card each. The assistant lives on the script card; past
 * requests stay folded at the bottom.
 */
export function ProjectView({
  detail,
  startedBy,
  startedAt,
  streamingText,
  sending,
  error,
  canWrite,
  highlightId,
  onSend,
  onAskScript,
  onPickProperty,
  onView,
  card,
}: {
  detail: ConversationDetail | null;
  startedBy: string | null;
  startedAt: string | null;
  streamingText: string;
  sending: boolean;
  error: string | null;
  canWrite: boolean;
  highlightId: string | null;
  onSend: (text: string) => void;
  onAskScript: () => void;
  onPickProperty: (property: PropertySummary) => void;
  onView: (view: CenterView, from?: HTMLElement) => void;
  card: Omit<CardProps, "artifact">;
}) {
  const property = detail?.property ?? null;
  const artifacts = detail?.artifacts ?? [];
  const messages = (detail?.messages ?? []).filter((m) => m.content.trim());

  const scripts = artifacts.filter((a) => a.kind === "script").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const script = scripts.find((s) => s.pinned && s.id === scripts[scripts.length - 1]?.id) ?? scripts[scripts.length - 1] ?? null;
  const olderScripts = scripts.filter((s) => s.id !== script?.id).reverse();
  const voice = artifacts.filter((a) => a.kind === "voiceover").sort(newestFirst)[0] ?? null;
  const captions = artifacts.filter((a) => a.kind === "captions").sort(newestFirst)[0] ?? null;
  const images = artifacts.filter((a) => a.kind === "image").sort(newestFirst);
  const video = artifacts.filter((a) => a.kind === "video").sort(newestFirst)[0] ?? null;

  if (!property && canWrite && !artifacts.length) {
    return (
      <div className="mx-auto grid w-full max-w-xl gap-3 px-4 py-10">
        <h2 className="text-center text-lg font-bold text-neutral-900">Pour quel bien ?</h2>
        <p className="text-center text-sm text-neutral-600">Le premier script s&apos;écrit dès que vous choisissez.</p>
        <PropertyPicker disabled={sending} onPick={onPickProperty} />
      </div>
    );
  }

  const open = (view: CenterView) => (event: React.MouseEvent<HTMLElement>) =>
    onView(view, (event.currentTarget.closest("[data-tile]") as HTMLElement | null) ?? event.currentTarget);
  const seconds = (a: Artifact | null) =>
    a && typeof a.meta.duration_seconds === "number" ? clockOf(a.meta.duration_seconds) : null;

  return (
    <div className="flex min-h-[calc(100dvh-14rem)] flex-col @container">
      <header className="flex items-center gap-4 border-b border-[rgba(74,52,36,0.10)] px-5 py-4 md:px-7">
        <span className="relative size-12 shrink-0 overflow-hidden rounded-[16px] bg-[linear-gradient(145deg,#c9a58a,#7d5c45)]">
          {property?.image ? (
            <Image src={property.image} alt="" fill sizes="48px" unoptimized className="object-cover" />
          ) : (
            <HouseLineIcon size={22} weight="bold" className="absolute inset-0 m-auto text-white/80" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold tracking-tight text-neutral-900">
            {property?.title ?? detail?.conversation.title ?? "Projet"}
          </h1>
          <p className="truncate text-sm text-neutral-600">
            {property ? (
              <>
                {property.place} · <span className="tabular-nums">{property.price}</span>
              </>
            ) : null}
            {startedAt && (
              <span className="text-neutral-400">
                {property ? " · " : ""}
                {startedBy ?? "Équipe"}, {new Date(startedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
              </span>
            )}
          </p>
        </div>
      </header>

      {/* Layout A (council, approved 2026-10-10): the script and the assistant on the left,
          the three results as compact tiles on the right. A tile opens its tool full size.
          Narrow centre: the tiles drop under the script, three across. */}
      <div className="grid w-full gap-4 p-4 md:p-5 @4xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,1fr)] @4xl:items-start">
        <div className="grid min-w-0 gap-3">
          <div
            id={script ? `artifact-${script.id}` : undefined}
            className={cn("grid scroll-mt-24 gap-3 rounded-[24px] transition-shadow", highlightId === script?.id && "shadow-[0_0_0_3px_rgba(201,106,46,0.35)]")}
          >
            <TileHead icon={FileTextIcon} title="Script" meta={script ? `v${scripts.length}` : null} />
            {sending ? (
              <LiveReply text={streamingText} />
            ) : script ? (
              <ArtifactCard artifact={script} {...card} />
            ) : (
              <div className="grid gap-3 rounded-[22px] border border-dashed border-[rgba(74,52,36,0.18)] bg-white/45 p-4">
                <p className="text-sm text-neutral-600">
                  {property ? "Roogo écrit le script à partir de l'annonce." : "Choisissez d'abord un bien."}
                </p>
                {canWrite && property && (
                  <button
                    type="button"
                    onClick={onAskScript}
                    className="inline-flex h-10 w-max cursor-pointer items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-white transition-transform active:scale-[0.985]"
                  >
                    <SparkleIcon size={16} weight="fill" className="size-4" />
                    Écrire le script
                  </button>
                )}
              </div>
            )}
          </div>
          {error && (
            <p className="text-sm font-semibold text-red-600" role="alert">
              {error}
            </p>
          )}
          {canWrite && (
            <div className="rounded-[22px] border border-[rgba(74,52,36,0.10)] bg-white/70 p-2.5">
              <p className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-semibold text-neutral-500">
                <SparkleIcon size={13} weight="fill" className="size-3.5 text-primary" />
                {script ? "Demander une modification" : "Ou demandez autre chose"}
              </p>
              <Composer sending={sending} showQuickReplies={!!script} onSend={onSend} />
            </div>
          )}
          {olderScripts.length > 0 && (
            <Fold label={`Versions précédentes du script (${olderScripts.length})`}>
              <div className="grid gap-2">
                {olderScripts.map((s) => (
                  <OldScript key={s.id} artifact={s} version={scripts.findIndex((x) => x.id === s.id) + 1} card={card} />
                ))}
              </div>
            </Fold>
          )}
        </div>

        <div className="grid min-w-0 gap-3 @xl:grid-cols-3 @4xl:grid-cols-1">
          {/* Voice-over */}
          <Tile
            id={voice ? `artifact-${voice.id}` : undefined}
            highlight={highlightId === voice?.id}
            icon={WaveformIcon}
            title="Voix off"
            meta={voice ? [voice.title.replace(/^Voix off \(|\)$/g, ""), seconds(voice)].filter(Boolean).join(" · ") : null}
            muted={!voice && !script}
            action={canWrite && property ? { label: voice ? "Ouvrir" : "Créer", onClick: open("voiceover") } : undefined}
          >
            {voice?.url ? (
              <div className="grid gap-2">
                <audio controls src={voice.url} preload="none" className="h-9 w-full" />
                {captions && <span className="text-xs font-medium text-[#2f7d4f]">Sous-titres prêts</span>}
              </div>
            ) : (
              <p className="text-xs text-neutral-500">{script ? "Choisissez la voix et générez." : "Après le script."}</p>
            )}
          </Tile>

          {/* Visuals */}
          <Tile
            icon={ImageSquareIcon}
            title="Visuels"
            meta={images.length ? String(images.length) : null}
            action={canWrite && property ? { label: images.length ? "Ouvrir" : "Créer", onClick: open("visuals") } : undefined}
          >
            {images.length ? (
              <button type="button" onClick={open("visuals")} className="grid cursor-pointer grid-cols-3 gap-1.5" aria-label="Ouvrir les visuels">
                {images.slice(0, 3).map((img, i) => (
                  <span key={img.id} id={`artifact-${img.id}`} className="relative aspect-[4/5] overflow-hidden rounded-xl bg-neutral-100">
                    {img.url && <Image src={img.url} alt={img.title} fill sizes="110px" unoptimized className="object-cover" />}
                    {i === 2 && images.length > 3 && (
                      <span className="absolute inset-0 grid place-items-center bg-black/45 text-sm font-bold text-white">+{images.length - 3}</span>
                    )}
                  </span>
                ))}
              </button>
            ) : (
              <p className="text-xs text-neutral-500">Affiche du bien, voeux ou photo détourée.</p>
            )}
          </Tile>

          {/* Video */}
          <Tile
            id={video ? `artifact-${video.id}` : undefined}
            highlight={highlightId === video?.id}
            icon={FilmSlateIcon}
            title="Vidéo"
            meta={video ? [video.title, seconds(video)].filter(Boolean).join(" · ") : null}
            action={canWrite && property ? { label: "Éditeur", onClick: open("editor") } : undefined}
          >
            {video?.url ? (
              <video controls playsInline preload="metadata" src={video.url} className="mx-auto aspect-[9/16] max-h-56 rounded-xl bg-neutral-900" />
            ) : (
              <p className="text-xs text-neutral-500">
                {voice ? "Photos, voix off et fin Roogo, assemblées dans l'éditeur." : "Une fin seule est possible dès maintenant."}
              </p>
            )}
          </Tile>
        </div>
      </div>

      {messages.length > 0 && (
        <div className="px-4 pb-6 md:px-5">
          <Fold label={`Demandes à l'assistant (${messages.length})`}>
            <div className="grid gap-4 pt-1">
              {messages.map((m) => (
                <Message key={m.id} message={m} />
              ))}
            </div>
          </Fold>
        </div>
      )}
    </div>
  );
}

function clockOf(totalSeconds: number) {
  const s = Math.round(totalSeconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function TileHead({ icon: Icon, title, meta }: { icon: typeof FileTextIcon; title: string; meta: string | null }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <Icon size={18} weight="bold" className="size-[18px] shrink-0 text-primary" />
      <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
      {meta && <span className="truncate text-xs font-medium text-neutral-500">{meta}</span>}
    </div>
  );
}

/** One result type, compact: what exists, and one button that opens its tool full size. */
function Tile({
  id,
  highlight,
  icon: Icon,
  title,
  meta,
  muted,
  action,
  children,
}: {
  id?: string;
  highlight?: boolean;
  icon: typeof FileTextIcon;
  title: string;
  meta: string | null;
  muted?: boolean;
  action?: { label: string; onClick: (event: React.MouseEvent<HTMLElement>) => void };
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      data-tile
      className={cn(
        "grid min-w-0 scroll-mt-24 content-start gap-2.5 rounded-[22px] border bg-white/75 p-3.5 transition-[box-shadow,opacity]",
        muted ? "border-dashed border-[rgba(74,52,36,0.18)] bg-white/40" : "border-[rgba(74,52,36,0.10)]",
        highlight && "shadow-[0_0_0_3px_rgba(201,106,46,0.35)]",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-xl", muted ? "bg-neutral-100 text-neutral-400" : "bg-primary/10 text-primary")}>
          <Icon size={16} weight="bold" className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-neutral-900">{title}</span>
          {meta && <span className="block truncate text-xs text-neutral-500">{meta}</span>}
        </span>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-full bg-primary px-3 text-xs font-semibold text-white transition-transform active:scale-[0.97]"
          >
            {action.label}
            <ArrowRightIcon size={12} weight="bold" className="size-3" />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function Fold({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-[20px] border border-white/80 bg-white/45">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-neutral-600 hover:text-neutral-900"
      >
        <span className="min-w-0 flex-1">{label}</span>
        <CaretDownIcon size={14} weight="bold" className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease }}
            className="overflow-hidden px-3 pb-3"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
