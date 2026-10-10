"use client";

import Image from "next/image";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CaretDownIcon,
  CheckCircleIcon,
  FileTextIcon,
  FilmSlateIcon,
  HouseLineIcon,
  ImageSquareIcon,
  PlusIcon,
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
  onView: (view: CenterView) => void;
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

  const steps = [
    { label: "Script", done: !!script },
    { label: "Voix off", done: !!voice },
    { label: images.length ? `Visuels (${images.length})` : "Visuels", done: images.length > 0 },
    { label: "Vidéo", done: !!video },
  ];
  const current = steps.findIndex((s) => !s.done);

  if (!property && canWrite && !artifacts.length) {
    return (
      <div className="mx-auto grid w-full max-w-xl gap-3 px-4 py-10">
        <h2 className="text-center text-lg font-bold text-neutral-900">Pour quel bien ?</h2>
        <p className="text-center text-sm text-neutral-600">Le premier script s&apos;écrit dès que vous choisissez.</p>
        <PropertyPicker disabled={sending} onPick={onPickProperty} />
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-14rem)] flex-col">
      <header className="flex items-center gap-4 border-b border-[rgba(74,52,36,0.10)] px-5 py-5 md:px-7">
        <span className="relative size-14 shrink-0 overflow-hidden rounded-[18px] bg-[linear-gradient(145deg,#c9a58a,#7d5c45)]">
          {property?.image ? (
            <Image src={property.image} alt="" fill sizes="56px" unoptimized className="object-cover" />
          ) : (
            <HouseLineIcon size={24} weight="bold" className="absolute inset-0 m-auto text-white/80" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold tracking-tight text-neutral-900 md:text-xl">
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

      <div className="mx-auto grid w-full max-w-[680px] gap-6 px-4 pb-10 pt-5 md:px-6">
        {/* Where the project stands: the next step to do is highlighted. */}
        <ol className="flex flex-wrap gap-1.5" aria-label="Avancement du projet">
          {steps.map((s, i) => (
            <li
              key={s.label}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold",
                s.done
                  ? "bg-[#e7f3eb] text-[#2f7d4f]"
                  : i === current
                    ? "bg-primary/10 text-[#b45a22] shadow-[0_0_0_1px_rgba(201,106,46,0.35)]"
                    : "bg-white/60 text-neutral-500",
              )}
            >
              {s.done ? <CheckCircleIcon size={14} weight="fill" className="size-3.5" /> : <span className="tabular-nums">{i + 1}</span>}
              {s.label}
            </li>
          ))}
        </ol>

        {/* 1. Script, with the assistant attached */}
        <Section icon={FileTextIcon} title="Script" id={script ? `artifact-${script.id}` : undefined} highlight={highlightId === script?.id}>
          {sending ? (
            <LiveReply text={streamingText} />
          ) : script ? (
            <ArtifactCard artifact={script} {...card} />
          ) : (
            <Empty
              text={property ? "Pas encore de script. Roogo l'écrit à partir de l'annonce." : "Choisissez d'abord un bien."}
              action={canWrite && property ? { label: "Écrire le script", onClick: onAskScript, icon: SparkleIcon } : undefined}
            />
          )}
          {error && (
            <p className="text-sm font-semibold text-red-600" role="alert">
              {error}
            </p>
          )}
          {canWrite && (
            <div className="rounded-[22px] border border-[rgba(74,52,36,0.10)] bg-white/70 p-2.5">
              <p className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-semibold text-neutral-500">
                <SparkleIcon size={13} weight="fill" className="size-3.5 text-primary" />
                Demander à l&apos;assistant
              </p>
              <Composer sending={sending} showQuickReplies={!!script} onSend={onSend} />
            </div>
          )}
          {olderScripts.length > 0 && (
            <Fold label={`Versions précédentes (${olderScripts.length})`}>
              <div className="grid gap-2">
                {olderScripts.map((s) => (
                  <OldScript key={s.id} artifact={s} version={scripts.findIndex((x) => x.id === s.id) + 1} card={card} />
                ))}
              </div>
            </Fold>
          )}
        </Section>

        {/* 2. Voice-over (and its subtitles) */}
        <Section icon={WaveformIcon} title="Voix off" id={voice ? `artifact-${voice.id}` : undefined} highlight={highlightId === voice?.id}
          action={canWrite && script ? { label: voice ? "Nouvelle voix" : "Créer la voix off", onClick: () => onView("voiceover") } : undefined}
        >
          {voice ? (
            <div className="grid gap-3">
              <ArtifactCard artifact={voice} {...card} />
              {captions && (
                <div id={`artifact-${captions.id}`}>
                  <ArtifactCard artifact={captions} {...card} />
                </div>
              )}
            </div>
          ) : (
            <Empty
              text={script ? "Le script est prêt : choisissez la voix et générez-la." : "La voix off se crée à partir du script."}
              action={canWrite && script ? { label: "Créer la voix off", onClick: () => onView("voiceover"), icon: WaveformIcon } : undefined}
            />
          )}
        </Section>

        {/* 3. Visuals */}
        <Section icon={ImageSquareIcon} title="Visuels"
          action={canWrite && property ? { label: "Créer un visuel", onClick: () => onView("visuals") } : undefined}
        >
          {images.length ? (
            <Visuals images={images} card={card} highlightId={highlightId} />
          ) : (
            <Empty
              text="Affiche du bien, affiche de voeux ou photo détourée, chacune avec son prix."
              action={canWrite && property ? { label: "Créer un visuel", onClick: () => onView("visuals"), icon: ImageSquareIcon } : undefined}
            />
          )}
        </Section>

        {/* 4. Video */}
        <Section icon={FilmSlateIcon} title="Vidéo" id={video ? `artifact-${video.id}` : undefined} highlight={highlightId === video?.id}
          action={canWrite && property ? { label: video ? "Nouvelle vidéo" : "Ouvrir l'éditeur", onClick: () => onView("editor") } : undefined}
        >
          {video ? (
            <ArtifactCard artifact={video} {...card} />
          ) : (
            <Empty
              text={voice ? "Photos du bien, voix off et fin Roogo : assemblez-les dans l'éditeur." : "La vidéo utilise la voix off. Vous pouvez déjà créer une fin seule."}
              action={canWrite && property ? { label: "Ouvrir l'éditeur", onClick: () => onView("editor"), icon: FilmSlateIcon } : undefined}
            />
          )}
        </Section>

        {messages.length > 0 && (
          <Fold label={`Demandes à l'assistant (${messages.length})`}>
            <div className="grid gap-4 pt-1">
              {messages.map((m) => (
                <Message key={m.id} message={m} />
              ))}
            </div>
          </Fold>
        )}
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  id,
  highlight,
  action,
  children,
}: {
  icon: typeof FileTextIcon;
  title: string;
  id?: string;
  highlight?: boolean;
  action?: { label: string; onClick: () => void };
  children: React.ReactNode;
}) {
  return (
    <motion.section
      id={id}
      layout="position"
      transition={{ duration: 0.3, ease }}
      className={cn(
        "grid scroll-mt-24 gap-3 rounded-[26px] transition-shadow duration-300",
        highlight && "shadow-[0_0_0_3px_rgba(201,106,46,0.35)]",
      )}
    >
      <div className="flex items-center gap-2 px-1">
        <Icon size={18} weight="bold" className="size-[18px] shrink-0 text-primary" />
        <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="ml-auto inline-flex h-8 cursor-pointer items-center gap-1 rounded-full border border-[rgba(74,52,36,0.12)] bg-white/70 px-3 text-xs font-semibold text-neutral-700 transition-colors hover:bg-white"
          >
            <PlusIcon size={12} weight="bold" className="size-3" />
            {action.label}
          </button>
        )}
      </div>
      {children}
    </motion.section>
  );
}

function Empty({
  text,
  action,
}: {
  text: string;
  action?: { label: string; onClick: () => void; icon: typeof FileTextIcon };
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[22px] border border-dashed border-[rgba(74,52,36,0.18)] bg-white/45 p-4">
      <p className="min-w-0 flex-1 text-sm text-neutral-600">{text}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="inline-flex h-10 cursor-pointer items-center gap-2 whitespace-nowrap rounded-full bg-primary px-4 text-sm font-semibold text-white transition-transform active:scale-[0.985]"
        >
          <action.icon size={16} weight="bold" className="size-4" />
          {action.label}
        </button>
      )}
    </div>
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

/** Thumbnails of every visual; the chosen one opens full size with its actions. */
function Visuals({ images, card, highlightId }: { images: Artifact[]; card: Omit<CardProps, "artifact">; highlightId: string | null }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = images.find((i) => i.id === (highlightId && images.some((x) => x.id === highlightId) ? highlightId : openId)) ?? null;
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {images.map((img) => (
          <button
            key={img.id}
            id={`artifact-${img.id}`}
            type="button"
            onClick={() => setOpenId(openId === img.id ? null : img.id)}
            aria-pressed={opened?.id === img.id}
            title={img.title}
            className={cn(
              "relative aspect-[4/5] scroll-mt-24 cursor-pointer overflow-hidden rounded-2xl border-2 bg-neutral-100 transition-colors",
              opened?.id === img.id ? "border-primary" : "border-transparent hover:border-neutral-300",
            )}
          >
            {img.url && <Image src={img.url} alt={img.title} fill sizes="160px" unoptimized className="object-cover" />}
            <span className="absolute inset-x-1.5 bottom-1.5 truncate rounded-md bg-black/55 px-1.5 py-0.5 text-left text-[10px] font-semibold text-white">
              {img.title}
            </span>
          </button>
        ))}
      </div>
      <AnimatePresence initial={false}>
        {opened && (
          <motion.div
            key={opened.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease }}
          >
            <ArtifactCard artifact={opened} {...card} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
