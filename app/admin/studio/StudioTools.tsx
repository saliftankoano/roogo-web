"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  ImageSquareIcon,
  MagicWandIcon,
  ScissorsIcon,
  SpinnerGapIcon,
  XIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { JobTool, PropertySummary, RunningJob } from "./studio-types";

type Money = (usd: number) => string;

/* ---------- job polling ---------- */

export type StartResult = { ok: true } | { ok: false; error: string };

export function useJobs(
  conversationId: string | null,
  initial: RunningJob[],
  onChanged: () => void,
) {
  const [jobs, setJobs] = useState<RunningJob[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const changed = useRef(onChanged);
  changed.current = onChanged;

  // Resume jobs that were still running when the page was loaded.
  const initialKey = initial.map((j) => j.id).join(",");
  useEffect(() => {
    setJobs(initial);
    setMessage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, initialKey]);

  const idsKey = jobs.map((j) => j.id).join(",");
  useEffect(() => {
    if (!jobs.length) return;
    let stopped = false;
    const tick = async () => {
      for (const job of jobs) {
        try {
          const res = await fetch(`/api/admin/studio/jobs/${job.id}`);
          const data = await res.json().catch(() => ({}));
          if (stopped) return;
          if (res.ok && data.state === "done") {
            setJobs((current) => current.filter((j) => j.id !== job.id));
            changed.current();
          } else if (res.ok && data.state === "failed") {
            setJobs((current) => current.filter((j) => j.id !== job.id));
            setMessage(data.error ?? "La création a échoué.");
            changed.current();
          } else if (res.status === 404) {
            setJobs((current) => current.filter((j) => j.id !== job.id));
          }
        } catch {
          // Transient network error: try again on the next tick.
        }
      }
    };
    void tick();
    const timer = setInterval(tick, 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const start = useCallback(
    async (
      tool: JobTool,
      params: Record<string, unknown>,
      estimateUsd: number,
    ): Promise<StartResult> => {
      if (!conversationId) return { ok: false, error: "Ouvrez d'abord une conversation." };
      setMessage(null);
      try {
        const res = await fetch("/api/admin/studio/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tool,
            conversation_id: conversationId,
            params,
            acknowledged_cost_usd: estimateUsd,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 409 && data.code === "price_changed") {
          return { ok: false, error: "Le prix a changé. Vérifiez-le puis relancez." };
        }
        if (!res.ok) return { ok: false, error: data.error ?? "La création n'a pas pu démarrer." };
        setJobs((current) => [...current, { id: data.id as string, tool }]);
        return { ok: true };
      } catch {
        return { ok: false, error: "Connexion impossible. Réessayez." };
      }
    },
    [conversationId],
  );

  return { jobs, message, clearMessage: () => setMessage(null), start };
}

/* ---------- estimates ---------- */

type Estimate = {
  available: boolean;
  reason: string | null;
  estimateUsd: number | null;
  remainingUsd: number;
  defaults: {
    headline: string;
    place: string;
    price: string;
    phone: string;
    photos: string[];
  } | null;
};

async function fetchEstimate(
  tool: JobTool,
  conversationId: string,
  params: Record<string, unknown> = {},
): Promise<Estimate | null> {
  try {
    const res = await fetch("/api/admin/studio/jobs/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool, conversation_id: conversationId, params }),
    });
    return res.ok ? ((await res.json()) as Estimate) : null;
  } catch {
    return null;
  }
}

const chip = (active: boolean) =>
  cn(
    "min-h-11 rounded-full px-4 text-sm font-bold transition-colors",
    active ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600",
  );

const fieldClass =
  "w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-base text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-primary";

const FORMATS = [
  ["4x5", "Publication 4:5"],
  ["9x16", "Story 9:16"],
  ["1x1", "Carré"],
] as const;

type Props = {
  conversationId: string;
  property: PropertySummary | null;
  money: Money;
  refreshKey: number;
  jobs: RunningJob[];
  message: string | null;
  start: (tool: JobTool, params: Record<string, unknown>, estimateUsd: number) => Promise<StartResult>;
};

const TOOL_LABEL: Record<JobTool, string> = {
  poster: "Affiche en cours",
  greeting: "Affiche de voeux en cours",
  cutout: "Détourage en cours",
  captions: "Sous-titres en cours",
};

export function ToolsPanel({
  conversationId,
  property,
  money,
  refreshKey,
  jobs,
  message,
  start,
}: Props) {
  const [open, setOpen] = useState<"poster" | "greeting" | "cutout" | null>(null);
  const [estimates, setEstimates] = useState<Partial<Record<JobTool, Estimate>>>({});
  const [busy, setBusy] = useState<JobTool | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [poster, greeting, cutout] = await Promise.all([
        fetchEstimate("poster", conversationId),
        fetchEstimate("greeting", conversationId, { headline: "x" }),
        fetchEstimate("cutout", conversationId),
      ]);
      if (cancelled) return;
      setEstimates({
        ...(poster ? { poster } : {}),
        ...(greeting ? { greeting } : {}),
        ...(cutout ? { cutout } : {}),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, property?.id, refreshKey]);

  async function run(tool: JobTool, params: Record<string, unknown>, usd: number) {
    setBusy(tool);
    setError(null);
    const result = await start(tool, params, usd);
    setBusy(null);
    if (result.ok) setOpen(null);
    else setError(result.error);
  }

  const price = (tool: JobTool) => {
    const e = estimates[tool];
    return e?.estimateUsd != null ? ` (environ ${money(e.estimateUsd)})` : "";
  };
  const posterOk = estimates.poster?.available;
  const cutoutOk = estimates.cutout?.available;
  const defaults = estimates.poster?.defaults ?? estimates.cutout?.defaults ?? null;

  return (
    <section className="space-y-3 rounded-3xl border border-neutral-200 bg-white p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-500">
        <MagicWandIcon size={16} weight="bold" />
        Créer
      </h3>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          disabled={!posterOk || busy !== null}
          onClick={() => {
            const usd = estimates.poster?.estimateUsd;
            if (usd != null) void run("poster", { format: "4x5" }, usd);
          }}
          className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-bold text-white transition-all active:scale-[0.985] disabled:opacity-40"
        >
          {busy === "poster" ? (
            <SpinnerGapIcon size={18} className="animate-spin" />
          ) : (
            <ImageSquareIcon size={18} weight="bold" />
          )}
          Affiche du bien{price("poster")}
        </button>
        {posterOk && (
          <button
            type="button"
            onClick={() => setOpen(open === "poster" ? null : "poster")}
            className="min-h-11 text-sm font-bold text-neutral-500"
          >
            Personnaliser l&apos;affiche
          </button>
        )}
        {!posterOk && estimates.poster?.reason && (
          <p className="text-xs font-medium text-neutral-400">{estimates.poster.reason}</p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!cutoutOk || busy !== null}
            onClick={() => setOpen(open === "cutout" ? null : "cutout")}
            className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-neutral-100 px-3 text-sm font-bold text-neutral-700 disabled:opacity-40"
          >
            <ScissorsIcon size={18} weight="bold" />
            Détourer une photo
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => setOpen(open === "greeting" ? null : "greeting")}
            className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-neutral-100 px-3 text-sm font-bold text-neutral-700 disabled:opacity-40"
          >
            <ImageSquareIcon size={18} weight="bold" />
            Affiche de voeux
          </button>
        </div>
      </div>

      {open === "poster" && defaults && (
        <PosterForm
          conversationId={conversationId}
          defaults={defaults}
          money={money}
          busy={busy === "poster"}
          onSubmit={(params, usd) => run("poster", params, usd)}
        />
      )}
      {open === "cutout" && defaults && (
        <div className="space-y-2">
          <p className="text-sm font-bold text-neutral-700">
            Choisissez la photo{price("cutout")}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {defaults.photos.map((photo, index) => (
              <button
                key={photo}
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  const usd = estimates.cutout?.estimateUsd;
                  if (usd != null) void run("cutout", { photo_index: index }, usd);
                }}
                className="relative aspect-square overflow-hidden rounded-xl bg-neutral-100 disabled:opacity-40"
                aria-label={`Détourer la photo ${index + 1}`}
              >
                <Image src={photo} alt="" fill sizes="110px" unoptimized className="object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
      {open === "greeting" && (
        <GreetingForm
          conversationId={conversationId}
          money={money}
          busy={busy === "greeting"}
          onSubmit={(params, usd) => run("greeting", params, usd)}
        />
      )}

      {jobs.map((job) => (
        <div
          key={job.id}
          className="flex items-center gap-3 rounded-2xl bg-primary/5 px-4 py-3 text-sm font-bold text-primary"
          role="status"
        >
          <SpinnerGapIcon size={18} className="animate-spin" />
          {TOOL_LABEL[job.tool ?? "poster"]}... 20 à 60 secondes.
        </div>
      ))}

      {(error || message) && (
        <p className="flex items-start gap-2 text-sm font-bold text-red-600" role="alert">
          <span className="flex-1">{error ?? message}</span>
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => setError(null)}
            className="flex size-8 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500"
          >
            <XIcon size={14} weight="bold" />
          </button>
        </p>
      )}
    </section>
  );
}

/* ---------- forms ---------- */

function PosterForm({
  conversationId,
  defaults,
  money,
  busy,
  onSubmit,
}: {
  conversationId: string;
  defaults: NonNullable<Estimate["defaults"]>;
  money: Money;
  busy: boolean;
  onSubmit: (params: Record<string, unknown>, usd: number) => void;
}) {
  const [headline, setHeadline] = useState(defaults.headline);
  const [place, setPlace] = useState(defaults.place);
  const [price, setPrice] = useState(defaults.price);
  const [format, setFormat] = useState<(typeof FORMATS)[number][0]>("4x5");
  const [photoIndex, setPhotoIndex] = useState(0);
  const [usd, setUsd] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchEstimate("poster", conversationId, { format }).then((e) => {
      if (!cancelled) setUsd(e?.estimateUsd ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId, format]);

  return (
    <div className="space-y-3 rounded-2xl bg-neutral-50 p-3">
      <div className="grid grid-cols-4 gap-2">
        {defaults.photos.map((photo, index) => (
          <button
            key={photo}
            type="button"
            onClick={() => setPhotoIndex(index)}
            aria-pressed={photoIndex === index}
            aria-label={`Photo ${index + 1}`}
            className={cn(
              "relative aspect-square overflow-hidden rounded-xl bg-neutral-100",
              photoIndex === index && "ring-4 ring-primary",
            )}
          >
            <Image src={photo} alt="" fill sizes="80px" unoptimized className="object-cover" />
          </button>
        ))}
      </div>
      <input className={fieldClass} value={headline} onChange={(e) => setHeadline(e.target.value)} aria-label="Titre" />
      <input className={fieldClass} value={place} onChange={(e) => setPlace(e.target.value)} aria-label="Lieu" />
      <input className={fieldClass} value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Prix" />
      <p className="text-xs font-medium text-neutral-400">
        Le numéro de téléphone de Roogo est ajouté automatiquement.
      </p>
      <div className="flex flex-wrap gap-2">
        {FORMATS.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setFormat(key)} className={chip(format === key)}>
            {label}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={busy || usd === null}
        onClick={() =>
          usd !== null &&
          onSubmit({ format, photo_index: photoIndex, lines: { headline, place, price } }, usd)
        }
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 text-sm font-bold text-white disabled:opacity-40"
      >
        {busy && <SpinnerGapIcon size={18} className="animate-spin" />}
        Créer l&apos;affiche{usd !== null ? ` (environ ${money(usd)})` : ""}
      </button>
    </div>
  );
}

const SCENES = [
  ["sunrise", "Lever de soleil"],
  ["sunset", "Coucher de soleil"],
  ["rain", "Après la pluie"],
  ["calm", "Calme"],
] as const;

function GreetingForm({
  conversationId,
  money,
  busy,
  onSubmit,
}: {
  conversationId: string;
  money: Money;
  busy: boolean;
  onSubmit: (params: Record<string, unknown>, usd: number) => void;
}) {
  const [headline, setHeadline] = useState("");
  const [subline, setSubline] = useState("Roogo vous accompagne");
  const [scene, setScene] = useState<(typeof SCENES)[number][0]>("sunrise");
  const [format, setFormat] = useState<(typeof FORMATS)[number][0]>("4x5");
  const [usd, setUsd] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchEstimate("greeting", conversationId, { headline: "x", format }).then((e) => {
      if (!cancelled) setUsd(e?.estimateUsd ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId, format]);

  return (
    <div className="space-y-3 rounded-2xl bg-neutral-50 p-3">
      <input
        className={fieldClass}
        placeholder="Message principal (ex : Bon mois de novembre)"
        value={headline}
        onChange={(e) => setHeadline(e.target.value)}
        aria-label="Message principal"
      />
      <input
        className={fieldClass}
        placeholder="Deuxième ligne"
        value={subline}
        onChange={(e) => setSubline(e.target.value)}
        aria-label="Deuxième ligne"
      />
      <div className="flex flex-wrap gap-2">
        {SCENES.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setScene(key)} className={chip(scene === key)}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {FORMATS.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setFormat(key)} className={chip(format === key)}>
            {label}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={busy || usd === null || !headline.trim()}
        onClick={() => usd !== null && onSubmit({ headline, subline, scene, format }, usd)}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 text-sm font-bold text-white disabled:opacity-40"
      >
        {busy && <SpinnerGapIcon size={18} className="animate-spin" />}
        Créer l&apos;affiche{usd !== null ? ` (environ ${money(usd)})` : ""}
      </button>
    </div>
  );
}
