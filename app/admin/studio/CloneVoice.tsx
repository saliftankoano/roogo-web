"use client";

import { useEffect, useRef, useState } from "react";
import {
  MicrophoneIcon,
  SpinnerGapIcon,
  StopIcon,
  XIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { recordingToWav } from "./wav-client";
import type { TermsInfo, VoiceInfo } from "./VoicePicker";

type Challenge = {
  id: string;
  sentence: string;
  paragraph: string;
  minSeconds: number;
  maxSeconds: number;
};

type Step = "idle" | "terms" | "record" | "sending" | "done";

type Props = {
  voices: VoiceInfo[];
  terms: TermsInfo | null;
  onChanged: () => void;
};

function formatClock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function CloneVoice({ voices, terms, onChanged }: Props) {
  const ownVoice = voices.find((v) => v.isMine && v.status !== "revoked") ?? null;
  const [step, setStep] = useState<Step>("idle");
  const [agreed, setAgreed] = useState(false);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [clip, setClip] = useState<Blob | null>(null);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  function reset() {
    setStep("idle");
    setAgreed(false);
    setChallenge(null);
    setClip(null);
    if (clipUrl) URL.revokeObjectURL(clipUrl);
    setClipUrl(null);
    setSeconds(0);
    setMessage(null);
  }

  async function beginRecordingStep() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/studio/voices/challenge", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error ?? "Le défi n'a pas pu être créé.");
        return;
      }
      setChallenge(data as Challenge);
      setClip(null);
      setClipUrl(null);
      setSeconds(0);
      setStep("record");
    } catch {
      setMessage("Connexion impossible. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  async function startRecording() {
    if (!challenge) return;
    setMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        setRecording(false);
        try {
          const wav = await recordingToWav(
            new Blob(chunksRef.current, { type: recorder.mimeType }),
          );
          setClip(wav);
          setClipUrl(URL.createObjectURL(wav));
        } catch {
          setMessage("L'enregistrement n'a pas pu être lu. Recommencez.");
        }
      };
      recorder.start();
      setRecording(true);
      setSeconds(0);
      const startedAt = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startedAt) / 1000;
        setSeconds(elapsed);
        if (elapsed >= challenge.maxSeconds) stopRecording();
      }, 250);
    } catch {
      setMessage("Le micro n'est pas accessible. Autorisez-le dans le navigateur.");
    }
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }

  async function send() {
    if (!clip || !challenge || !terms) return;
    setBusy(true);
    setStep("sending");
    setMessage(null);
    try {
      const form = new FormData();
      form.append("clip", clip, "voice.wav");
      form.append("challenge_id", challenge.id);
      form.append("accepted", "true");
      form.append("terms_version", terms.version);
      const res = await fetch("/api/admin/studio/voices/clone", {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error ?? "La voix n'a pas pu être créée.");
        setStep("record");
        // A used challenge cannot be retried: fetch a fresh one.
        if (res.status === 409 || res.status === 422) setChallenge(null);
        return;
      }
      setStep("done");
      onChanged();
    } catch {
      setMessage("Connexion impossible. Réessayez.");
      setStep("record");
    } finally {
      setBusy(false);
    }
  }

  if (!terms) return null;

  // Someone who already has a voice cannot clone another: they must remove it
  // first (the "Retirer ma voix" action in the voice picker).
  if (ownVoice && step !== "done") {
    return (
      <p className="rounded-2xl bg-neutral-50 px-4 py-3 text-sm font-medium text-neutral-600">
        Vous avez déjà une voix ({ownVoice.label}). Pour la remplacer, retirez-la
        d&apos;abord avec « Retirer ma voix », puis créez-en une nouvelle.
      </p>
    );
  }

  if (step === "done") {
    return (
      <div className="space-y-2 rounded-3xl border border-primary/30 bg-primary/5 p-4">
        <p className="font-bold text-primary">Votre voix est prête.</p>
        <p className="text-sm font-medium text-neutral-600">
          Elle apparaît dans la liste des voix pour toute l&apos;équipe. Vous
          pouvez la retirer à tout moment.
        </p>
        <button
          type="button"
          onClick={reset}
          className="min-h-11 rounded-xl bg-white px-4 text-sm font-bold text-primary"
        >
          Fermer
        </button>
      </div>
    );
  }

  if (step === "idle") {
    return (
      <button
        type="button"
        onClick={() => setStep("terms")}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-neutral-100 px-4 text-sm font-bold text-neutral-700"
      >
        <MicrophoneIcon size={18} weight="bold" />
        Cloner ma voix
      </button>
    );
  }

  return (
    <section className="space-y-3 rounded-3xl border border-neutral-200 bg-white p-4">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500">
          Cloner ma voix
        </h2>
        <button
          type="button"
          onClick={reset}
          aria-label="Fermer"
          className="flex size-11 items-center justify-center rounded-xl bg-neutral-100 text-neutral-500"
        >
          <XIcon size={18} weight="bold" />
        </button>
      </header>

      {step === "terms" && (
        <>
          <h3 className="font-bold text-neutral-900">{terms.title}</h3>
          <div className="space-y-2 text-sm text-neutral-700">
            {terms.paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          <label className="flex min-h-11 items-start gap-3 text-sm font-bold text-neutral-900">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 size-5 shrink-0 accent-[#C96A2E]"
            />
            {terms.checkboxLabel}
          </label>
          <button
            type="button"
            disabled={!agreed || busy}
            onClick={beginRecordingStep}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 text-sm font-bold text-white disabled:opacity-40"
          >
            {busy && <SpinnerGapIcon size={18} className="animate-spin" />}
            Continuer vers l&apos;enregistrement
          </button>
        </>
      )}

      {(step === "record" || step === "sending") && (
        <>
          {!challenge ? (
            <button
              type="button"
              onClick={beginRecordingStep}
              disabled={busy}
              className="min-h-12 w-full rounded-2xl bg-primary px-6 text-sm font-bold text-white disabled:opacity-40"
            >
              Obtenir une nouvelle phrase
            </button>
          ) : (
            <>
              <p className="text-sm font-medium text-neutral-600">
                Dans un endroit calme, lisez à voix haute <strong>d&apos;abord la
                phrase</strong>, <strong>puis le texte</strong>, d&apos;une voix naturelle.
                Comptez entre {challenge.minSeconds} et {challenge.maxSeconds}{" "}
                secondes.
              </p>
              <blockquote className="rounded-2xl bg-amber-50 p-3 text-[15px] font-bold leading-relaxed text-amber-900">
                {challenge.sentence}
              </blockquote>
              <p className="rounded-2xl bg-neutral-50 p-3 text-[15px] leading-relaxed text-neutral-700">
                {challenge.paragraph}
              </p>

              <div className="flex items-center gap-3">
                {recording ? (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-red-600 px-6 text-sm font-bold text-white"
                  >
                    <StopIcon size={18} weight="fill" />
                    Arrêter ({formatClock(seconds)})
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={step === "sending"}
                    className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-6 text-sm font-bold text-white disabled:opacity-40"
                  >
                    <MicrophoneIcon size={18} weight="fill" />
                    {clip ? "Recommencer" : "Enregistrer"}
                  </button>
                )}
              </div>

              {clipUrl && (
                <>
                  <audio controls src={clipUrl} className="w-full" />
                  <button
                    type="button"
                    onClick={send}
                    disabled={busy || seconds < challenge.minSeconds - 0.5}
                    className={cn(
                      "flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-neutral-900 px-6 text-sm font-bold text-white",
                      (busy || seconds < challenge.minSeconds - 0.5) && "opacity-40",
                    )}
                  >
                    {busy && <SpinnerGapIcon size={18} className="animate-spin" />}
                    Créer ma voix
                  </button>
                  {seconds < challenge.minSeconds - 0.5 && (
                    <p className="text-sm font-bold text-red-600">
                      Trop court : {challenge.minSeconds} secondes au minimum.
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      {message && (
        <p className="text-sm font-bold text-red-600" role="alert">
          {message}
        </p>
      )}
    </section>
  );
}
