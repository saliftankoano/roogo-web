"use client";

// Autosave of the field visit sheet: every change goes to localStorage at once
// (it survives a closed app and no network) and to the server after a short
// pause. Offline, the pill says so and the sheet syncs when the network comes
// back. The newest change wins; when another device saved something newer,
// the server answers 409 with its version and `onConflict` decides.

import { useCallback, useEffect, useRef, useState } from "react";
import { hhmm, type FicheData, type UploadSummary } from "@/lib/field-visits/core";

export type SaveState =
  | { kind: "idle"; at: null }
  | { kind: "saving"; at: string | null }
  | { kind: "saved"; at: string }
  | { kind: "offline"; at: string | null }
  | { kind: "error"; at: string | null; message: string };

export type LocalCopy = { data: FicheData; dirty: boolean; savedAt: string | null };

const PREFIX = "roogo-fiche-visite:";
const SAVE_DELAY_MS = 700;

export function localKey(propertyId: string) {
  return `${PREFIX}${propertyId}`;
}

export function readLocal(propertyId: string): LocalCopy | null {
  try {
    const raw = window.localStorage.getItem(localKey(propertyId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalCopy;
    return parsed?.data?.id ? parsed : null;
  } catch {
    return null;
  }
}

export function writeLocal(copy: LocalCopy) {
  try {
    window.localStorage.setItem(localKey(copy.data.propertyId), JSON.stringify(copy));
  } catch {
    // Private mode or full storage: the server copy still works.
  }
}

export function clearLocal(propertyId: string) {
  try {
    window.localStorage.removeItem(localKey(propertyId));
  } catch {
    // ignore
  }
}

export type ConflictBody = { error?: string; fiche?: FicheData; status?: string; existingId?: string | null };

type Options = {
  initial: FicheData;
  /** True when the sheet already exists on the server. */
  serverKnown: boolean;
  /** Stops all saving (finished sheet, preview of a sheet you cannot edit). */
  readOnly?: boolean;
  onSaved?: (answer: { fiche: FicheData; uploads: UploadSummary; status: string }) => void;
  onConflict?: (body: ConflictBody, httpStatus: number) => void;
};

function nowClock() {
  return hhmm(new Date().toISOString());
}

export function useFicheSync({ initial, serverKnown, readOnly, onSaved, onConflict }: Options) {
  const [data, setData] = useState<FicheData>(initial);
  const [save, setSave] = useState<SaveState>({ kind: "idle", at: null });
  const dataRef = useRef(data);
  dataRef.current = data;
  const knownRef = useRef(serverKnown);
  const dirtyRef = useRef(false);
  const inflight = useRef<Promise<boolean> | null>(null);
  const again = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNext = useRef(true);
  const callbacks = useRef({ onSaved, onConflict });
  callbacks.current = { onSaved, onConflict };
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;

  const push = useCallback(async (): Promise<boolean> => {
    if (readOnlyRef.current) return true;
    if (inflight.current) {
      again.current = true;
      return inflight.current;
    }
    const sending = dataRef.current;
    // Nothing goes to the server before "Commencer": a sheet opened by mistake leaves no row.
    if (sending.step === 0 && !knownRef.current) return true;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setSave((s) => ({ kind: "offline", at: s.at }));
      return false;
    }
    const run = (async () => {
      setSave((s) => ({ kind: "saving", at: s.at }));
      try {
        const res = await fetch(`/api/admin/field-visits/${sending.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sending),
        });
        const body = (await res.json().catch(() => ({}))) as ConflictBody & { fiche?: FicheData; uploads?: UploadSummary; status?: string };
        if (res.ok) {
          knownRef.current = true;
          const unchanged = dataRef.current.updatedAt === sending.updatedAt;
          if (unchanged) dirtyRef.current = false;
          writeLocal({ data: dataRef.current, dirty: !unchanged, savedAt: nowClock() });
          setSave({ kind: "saved", at: nowClock() });
          if (body.fiche) callbacks.current.onSaved?.({ fiche: body.fiche, uploads: body.uploads ?? {}, status: body.status ?? "en_cours" });
          return true;
        }
        if (res.status === 409) {
          callbacks.current.onConflict?.(body, res.status);
          setSave({ kind: "saved", at: nowClock() });
          return false;
        }
        setSave((s) => ({ kind: "error", at: s.at, message: body.error ?? `Erreur ${res.status}` }));
        return false;
      } catch {
        // Network down or the request was cut: keep it on the phone.
        setSave((s) => ({ kind: "offline", at: s.at }));
        return false;
      }
    })();
    inflight.current = run;
    const ok = await run;
    inflight.current = null;
    if (again.current) {
      again.current = false;
      return push();
    }
    return ok;
  }, []);

  // Every change: local copy at once, server after a pause.
  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    if (readOnlyRef.current) return;
    dirtyRef.current = true;
    writeLocal({ data, dirty: true, savedAt: null });
    setSave((s) => ({ kind: "saving", at: s.at }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (data.step === 0 && !knownRef.current) {
        setSave({ kind: "saved", at: nowClock() });
        return;
      }
      void push();
    }, SAVE_DELAY_MS);
  }, [data, push]);

  useEffect(() => {
    const online = () => {
      if (dirtyRef.current) void push();
      else setSave((s) => (s.kind === "offline" ? { kind: "saved", at: s.at ?? nowClock() } : s));
    };
    const offline = () => setSave((s) => ({ kind: "offline", at: s.at }));
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    if (navigator.onLine === false) offline();
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [push]);

  /** A change made by the team: stamps the device time used to order saves. */
  const update = useCallback((change: Partial<FicheData> | ((d: FicheData) => Partial<FicheData>)) => {
    setData((d) => {
      const patch = typeof change === "function" ? change(d) : change;
      return { ...d, ...patch, updatedAt: new Date().toISOString() };
    });
  }, []);

  /** Replaces the sheet (resume, server version) without counting it as a change, unless `dirty`. */
  const replace = useCallback((next: FicheData, options: { dirty?: boolean; serverKnown?: boolean } = {}) => {
    if (options.serverKnown !== undefined) knownRef.current = options.serverKnown;
    skipNext.current = !options.dirty;
    dirtyRef.current = !!options.dirty;
    setData(options.dirty ? { ...next, updatedAt: new Date().toISOString() } : { ...next });
  }, []);

  /** Saves now and says whether the server has the latest version. */
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    if (!dirtyRef.current && knownRef.current) return true;
    return push();
  }, [push]);

  return { data, update, replace, save, flush, isServerKnown: () => knownRef.current };
}
