"use client";

// Step 5 uploads: one queue for the whole sheet, two files at a time. Each
// file goes through the Studio field-media upload (resumable session opened
// by the server, bytes sent by the browser straight to Google Drive), into
// the sheet's subfolder for its deliverable.

import { useCallback, useEffect, useRef, useState } from "react";
import { uploadFieldFile } from "@/app/admin/studio/field-upload";
import type { DeliverableKey } from "@/lib/field-visits/core";

export type UploadItem = {
  key: string;
  deliverable: DeliverableKey;
  name: string;
  size: number;
  sent: number;
  state: "queued" | "uploading" | "ready" | "failed";
  error: string | null;
};

const PARALLEL = 2;

type Options = {
  propertyId: string;
  fieldVisitId: string;
  /** Saves the sheet first so the server knows it (returns false when offline). */
  ensureSaved: () => Promise<boolean>;
  onReady: (deliverable: DeliverableKey) => void;
  /** Replaces the network part in the mocked preview. */
  uploader?: typeof uploadFieldFile;
};

export function useUploads({ propertyId, fieldVisitId, ensureSaved, onReady, uploader = uploadFieldFile }: Options) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const files = useRef(new Map<string, File>());
  const running = useRef(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const opts = useRef({ propertyId, fieldVisitId, ensureSaved, onReady, uploader });
  opts.current = { propertyId, fieldVisitId, ensureSaved, onReady, uploader };

  const patch = useCallback((key: string, change: Partial<UploadItem>) => {
    setItems((list) => list.map((item) => (item.key === key ? { ...item, ...change } : item)));
  }, []);

  const pump = useCallback(async () => {
    while (running.current < PARALLEL) {
      const next = itemsRef.current.find((i) => i.state === "queued");
      if (!next) return;
      const file = files.current.get(next.key);
      if (!file) return;
      running.current += 1;
      next.state = "uploading"; // claim it before the state update lands
      patch(next.key, { state: "uploading", error: null });
      void (async () => {
        try {
          const saved = await opts.current.ensureSaved();
          if (!saved) throw new Error("Pas de connexion : la fiche doit être enregistrée avant l’envoi. Réessayez au bureau.");
          const media = await opts.current.uploader(
            file,
            opts.current.propertyId,
            (sent) => patch(next.key, { sent: Math.min(sent, file.size) }),
            undefined,
            { fieldVisitId: opts.current.fieldVisitId, deliverable: next.deliverable },
          );
          if (media.status === "failed") throw new Error(media.error ?? "Envoi échoué.");
          patch(next.key, { state: "ready", sent: file.size });
          files.current.delete(next.key);
          opts.current.onReady(next.deliverable);
        } catch (error) {
          patch(next.key, { state: "failed", error: error instanceof Error ? error.message : "Envoi échoué." });
        } finally {
          running.current -= 1;
          setTimeout(() => void pump(), 0);
        }
      })();
    }
  }, [patch]);

  const add = useCallback(
    (deliverable: DeliverableKey, list: FileList | File[]) => {
      const added: UploadItem[] = [];
      for (const file of Array.from(list)) {
        const key = `${deliverable}:${file.name}:${file.size}:${file.lastModified}:${Math.random().toString(36).slice(2, 7)}`;
        files.current.set(key, file);
        added.push({ key, deliverable, name: file.name, size: file.size, sent: 0, state: "queued", error: null });
      }
      if (!added.length) return;
      itemsRef.current = [...itemsRef.current, ...added];
      setItems(itemsRef.current);
      void pump();
    },
    [pump],
  );

  const retry = useCallback(
    (deliverable: DeliverableKey) => {
      itemsRef.current = itemsRef.current.map((i) =>
        i.deliverable === deliverable && i.state === "failed" && files.current.has(i.key) ? { ...i, state: "queued", error: null, sent: 0 } : i,
      );
      setItems(itemsRef.current);
      void pump();
    },
    [pump],
  );

  // Leaving the page while files are still going up: ask first.
  useEffect(() => {
    const busy = items.some((i) => i.state === "uploading" || i.state === "queued");
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [items]);

  return { items, add, retry };
}

export type DeliverableProgress = {
  active: number;
  failed: UploadItem[];
  /** 0 to 100 over the files still going up (and those just done in the same batch). */
  pct: number;
};

export function progressFor(items: UploadItem[], deliverable: DeliverableKey): DeliverableProgress {
  const mine = items.filter((i) => i.deliverable === deliverable);
  const live = mine.filter((i) => i.state === "queued" || i.state === "uploading");
  const failed = mine.filter((i) => i.state === "failed");
  if (!live.length) return { active: 0, failed, pct: 0 };
  // The batch: everything since the oldest file still going up.
  const firstLive = mine.indexOf(live[0]);
  const batch = mine.slice(firstLive).filter((i) => i.state !== "failed");
  const total = batch.reduce((n, i) => n + i.size, 0) || 1;
  const sent = batch.reduce((n, i) => n + (i.state === "ready" ? i.size : i.sent), 0);
  return { active: live.length, failed, pct: Math.min(99, Math.floor((sent / total) * 100)) };
}
