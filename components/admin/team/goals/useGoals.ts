"use client";

import { useCallback, useState } from "react";
import type { GoalsPayload } from "@/lib/team-goals/server";
import { announceTasksChanged, callApi } from "../ui";

/** Goals state shared by the strip on Mon espace and /admin/objectifs. Every action reloads from the server. */
export function useGoals(initial: GoalsPayload) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const body = await callApi<{ goals: GoalsPayload }>("/api/admin/goals");
      setData(body.goals);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Les objectifs n’ont pas pu se recharger.");
    }
  }, []);

  const run = useCallback(
    async <T,>(key: string, request: () => Promise<T>): Promise<T | null> => {
      setError(null);
      setBusy((b) => ({ ...b, [key]: true }));
      try {
        const result = await request();
        await refresh();
        announceTasksChanged();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : "L’action a échoué.");
        return null;
      } finally {
        setBusy((b) => {
          const next = { ...b };
          delete next[key];
          return next;
        });
      }
    },
    [refresh],
  );

  const api = {
    archive: (id: string) => run(`goal:${id}`, () => callApi(`/api/admin/goals/${id}`, { method: "PATCH", body: JSON.stringify({ action: "archive" }) })),
    restore: (id: string) => run(`goal:${id}`, () => callApi(`/api/admin/goals/${id}`, { method: "PATCH", body: JSON.stringify({ action: "restore" }) })),
    setTarget: (id: string, target: number) =>
      run(`goal:${id}`, () => callApi(`/api/admin/goals/${id}`, { method: "PATCH", body: JSON.stringify({ action: "target", target }) })),
    tick: (leverId: string, action: "tick" | "untick") =>
      run(`lever:${leverId}`, () => callApi(`/api/admin/goals/levers/${leverId}`, { method: "PATCH", body: JSON.stringify({ action }) })),
    addLever: (goalId: string, lever: { ownerId: string; title: string; rhythm: string; weeklyTarget: number }) =>
      run(`levers:${goalId}`, () => callApi("/api/admin/goals/levers", { method: "POST", body: JSON.stringify({ goalId, ...lever }) })),
    editLever: (leverId: string, lever: { ownerId: string; title: string; rhythm: string; weeklyTarget: number }) =>
      run(`lever:${leverId}`, () => callApi(`/api/admin/goals/levers/${leverId}`, { method: "PATCH", body: JSON.stringify({ action: "edit", ...lever }) })),
    archiveLever: (leverId: string) =>
      run(`lever:${leverId}`, () => callApi(`/api/admin/goals/levers/${leverId}`, { method: "PATCH", body: JSON.stringify({ action: "archive" }) })),
    addReading: (body: { metric: string; value: number; measuredOn: string; note: string; proof: { data: string; ext: string } | null }) =>
      run(`reading:${body.metric}`, () => callApi("/api/admin/goals/readings", { method: "POST", body: JSON.stringify(body) })),
    create: (body: unknown) => run("create", () => callApi<{ id: string }>("/api/admin/goals", { method: "POST", body: JSON.stringify(body) })),
  };

  return { data, busy, error, setError, refresh, api };
}

export type GoalsApi = ReturnType<typeof useGoals>["api"];
