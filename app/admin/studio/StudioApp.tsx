"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { estimateJobCostUsd } from "@/lib/studio/ai-tools";
import { DEFAULT_FCFA_PER_USD, formatMoney, type StudioCurrency } from "@/lib/studio/currency";
import { parseSseBuffer } from "@/lib/studio/sse";
import { ArtifactsPanel } from "./ArtifactsPanel";
import { CloneVoice } from "./CloneVoice";
import { ConversationList } from "./ConversationList";
import { GlossaryPanel } from "./GlossaryPanel";
import { Thread } from "./Thread";
import { ToolsPanel, useJobs } from "./StudioTools";
import { VoicePicker, type TermsInfo, type VoiceInfo } from "./VoicePicker";
import {
  FIRST_DRAFT_REQUEST,
  type Artifact,
  type ChatMessage,
  type ConversationDetail,
  type ConversationItem,
  type PropertySummary,
} from "./studio-types";

const VOICE_STORAGE_KEY = "roogo-studio-voice";
const CURRENCY_STORAGE_KEY = "roogo-studio-currency";

type MobileTab = "history" | "chat" | "artifacts";

function readStored(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

export function StudioApp() {
  const [tab, setTab] = useState<"chat" | "glossary">("chat");
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");
  const [currency, setCurrency] = useState<StudioCurrency>("FCFA");
  const [rate, setRate] = useState(DEFAULT_FCFA_PER_USD);
  const [glossaryVersion, setGlossaryVersion] = useState(0);

  const [voice, setVoice] = useState("sandrine");
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [terms, setTerms] = useState<TermsInfo | null>(null);
  const [cloningEnabled, setCloningEnabled] = useState(false);

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [booted, setBooted] = useState(false);
  const activeRef = useRef<string | null>(null);

  useEffect(() => {
    setVoice(readStored(VOICE_STORAGE_KEY, "sandrine"));
    setCurrency(readStored(CURRENCY_STORAGE_KEY, "FCFA") === "USD" ? "USD" : "FCFA");
  }, []);

  const loadVoices = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/studio/voices");
      if (!res.ok) return;
      const data = (await res.json()) as {
        voices: VoiceInfo[];
        terms: TermsInfo;
        cloningEnabled?: boolean;
      };
      setCloningEnabled(data.cloningEnabled === true);
      setVoices(data.voices);
      setTerms(data.terms);
      setVoice((current) =>
        data.voices.some((v) => v.key === current && v.status === "active")
          ? current
          : "sandrine",
      );
    } catch {
      // The default voice still works without the list.
    }
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/studio/conversations");
      if (!res.ok) return [];
      const data = (await res.json()) as { conversations: ConversationItem[] };
      setConversations(data.conversations);
      return data.conversations;
    } catch {
      return [];
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/studio/conversations/${id}`);
      if (!res.ok) throw new Error("detail failed");
      const data = (await res.json()) as ConversationDetail;
      if (activeRef.current === id) setDetail(data);
    } catch {
      setError("La conversation n'a pas pu être chargée.");
    }
  }, []);

  const open = useCallback(
    async (id: string) => {
      activeRef.current = id;
      setActiveId(id);
      setError(null);
      setStreamingText("");
      setMobileTab("chat");
      await loadDetail(id);
    },
    [loadDetail],
  );

  // First load: voices, history, then the most recent conversation if any.
  useEffect(() => {
    void (async () => {
      void loadVoices();
      const list = await loadConversations();
      if (list[0]) await open(list[0].id);
      setBooted(true);
    })();
  }, [loadVoices, loadConversations, open]);

  const money = useCallback(
    (usd: number) => formatMoney(usd, currency, rate),
    [currency, rate],
  );
  const reloadActive = useCallback(() => {
    if (activeRef.current) void loadDetail(activeRef.current);
  }, [loadDetail]);
  const jobsApi = useJobs(detail?.conversation.id ?? null, detail?.jobs ?? [], reloadActive);

  const getVoiceoverDuration = useCallback((artifactId: string): number => {
    const artifact = detail?.artifacts.find(a => a.id === artifactId);
    const meta = artifact?.meta ?? {};
    return typeof meta.duration_seconds === "number" ? meta.duration_seconds : 60;
  }, [detail?.artifacts]);

  const getCaptionsLabel = useCallback((artifactId: string): string => {
    const duration = getVoiceoverDuration(artifactId);
    return ` (environ ${money(estimateJobCostUsd({ tool: "captions", audioSeconds: duration }))})`;
  }, [getVoiceoverDuration, money]);

    function newConversation() {
    activeRef.current = null;
    setActiveId(null);
    setDetail(null);
    setStreamingText("");
    setError(null);
    setMobileTab("chat");
  }

  async function createConversation(propertyId?: string): Promise<string | null> {
    const res = await fetch("/api/admin/studio/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ property_id: propertyId, voice_key: voice }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.id) {
      setError(data.error ?? "La conversation n'a pas pu être créée.");
      return null;
    }
    await loadConversations();
    return data.id as string;
  }

  // Sends one message and streams the reply. Shows the user's message at once.
  const send = useCallback(
    async (conversationId: string, text: string) => {
      setSending(true);
      setError(null);
      setStreamingText("");
      setDetail((current) =>
        current && current.conversation.id === conversationId
          ? {
              ...current,
              messages: [
                ...current.messages,
                { id: `local-${Date.now()}`, role: "user", content: text } as ChatMessage,
              ],
            }
          : current,
      );

      try {
        const res = await fetch("/api/admin/studio/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversation_id: conversationId, message: text }),
        });
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "L'assistant n'a pas répondu.");
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let gotScript = false;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parsed = parseSseBuffer(buffer);
          buffer = parsed.rest;
          for (const event of parsed.events) {
            const data = event.data as {
              text?: string;
              message?: string;
              artifact?: unknown;
            };
            if (event.event === "delta" && data.text) {
              setStreamingText((current) => current + data.text);
            } else if (event.event === "error") {
              setError(data.message ?? "La réponse s'est interrompue.");
            } else if (event.event === "done" && data.artifact) {
              gotScript = true;
            }
          }
        }

        await loadDetail(conversationId);
        void loadConversations();
        // On a phone, jump to the script so "Générer la voix" is right there.
        if (gotScript) setMobileTab("artifacts");
      } catch {
        setError("Connexion impossible. Réessayez.");
      } finally {
        setSending(false);
        setStreamingText("");
      }
    },
    [loadDetail, loadConversations],
  );

  async function sendText(text: string) {
    let id = activeId;
    if (!id) {
      id = await createConversation();
      if (!id) return;
      activeRef.current = id;
      setActiveId(id);
      await loadDetail(id);
    }
    await send(id, text);
  }

  // Choosing a property starts the first draft straight away.
  async function pickProperty(property: PropertySummary) {
    setError(null);
    let id = activeId;
    if (!id) {
      id = await createConversation(property.id);
      if (!id) return;
      activeRef.current = id;
      setActiveId(id);
    } else {
      const res = await fetch(`/api/admin/studio/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property_id: property.id }),
      });
      if (!res.ok) {
        setError("Le bien n'a pas pu être choisi.");
        return;
      }
    }
    await loadDetail(id);
    await send(id, FIRST_DRAFT_REQUEST);
  }

  // "Réutiliser": start a new conversation on the same property from a script.
  async function rework(artifact: Artifact) {
    const id = await createConversation(detail?.property?.id);
    if (!id) return;
    activeRef.current = id;
    setActiveId(id);
    await loadDetail(id);
    await send(
      id,
      `Voici un script existant. Reprends-le tel quel dans un bloc script, puis j'indiquerai les changements.\n\n${artifact.text}`,
    );
  }

  function chooseVoice(key: string) {
    setVoice(key);
    try {
      window.localStorage.setItem(VOICE_STORAGE_KEY, key);
    } catch {
      // Not critical.
    }
  }

  function chooseCurrency(next: StudioCurrency) {
    setCurrency(next);
    try {
      window.localStorage.setItem(CURRENCY_STORAGE_KEY, next);
    } catch {
      // Not critical.
    }
  }

  const voiceLabel = voices.find((v) => v.key === voice)?.label ?? "Sandrine";
  const artifacts = detail?.artifacts ?? [];
  const canWrite = detail ? detail.conversation.isMine : true;

  const panel = (show: boolean) => (show ? "block" : "hidden lg:block");

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
          Studio de contenu
        </h1>
        <div className="flex items-center gap-2">
          <div role="tablist" className="grid grid-cols-2 gap-1 rounded-2xl bg-neutral-100 p-1">
            {(
              [
                ["chat", "Conversations"],
                ["glossary", "Glossaire"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  "min-h-11 rounded-xl px-4 text-sm font-bold transition-colors",
                  tab === key ? "bg-white text-primary shadow-sm" : "text-neutral-500",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => chooseCurrency(currency === "FCFA" ? "USD" : "FCFA")}
            aria-label={currency === "FCFA" ? "Afficher les prix en dollars" : "Afficher les prix en FCFA"}
            className="min-h-11 rounded-2xl bg-neutral-100 px-4 text-sm font-bold text-neutral-600"
          >
            {currency === "FCFA" ? "FCFA | $" : "$ | FCFA"}
          </button>
        </div>
      </div>

      <div hidden={tab !== "chat"} className="space-y-3">
        <div role="tablist" className="grid grid-cols-3 gap-1 rounded-2xl bg-neutral-100 p-1 lg:hidden">
          {(
            [
              ["history", "Historique"],
              ["chat", "Chat"],
              ["artifacts", `Artefacts${artifacts.length ? ` (${artifacts.length})` : ""}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={mobileTab === key}
              onClick={() => setMobileTab(key)}
              className={cn(
                "min-h-11 rounded-xl px-2 text-sm font-bold transition-colors",
                mobileTab === key ? "bg-white text-primary shadow-sm" : "text-neutral-500",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)_360px] lg:gap-4">
          <aside className={cn(panel(mobileTab === "history"), "lg:h-[calc(100dvh-15rem)] lg:min-h-[520px]")}>
            <ConversationList
              conversations={conversations}
              activeId={activeId}
              onSelect={(id) => void open(id)}
              onNew={newConversation}
            />
          </aside>

          <section
            className={cn(
              panel(mobileTab === "chat"),
              "h-[calc(100dvh-17rem)] min-h-[480px] lg:h-[calc(100dvh-15rem)] lg:min-h-[520px]",
            )}
          >
            {booted ? (
              <Thread
                property={detail?.property ?? null}
                messages={detail?.messages ?? []}
                streamingText={streamingText}
                sending={sending}
                error={error}
                canWrite={canWrite}
                hasConversation={activeId !== null}
                onSend={(text) => void sendText(text)}
                onPickProperty={(p) => void pickProperty(p)}
              />
            ) : (
              <div className="h-40 animate-pulse rounded-3xl bg-neutral-100" />
            )}
          </section>

          <aside
            className={cn(
              panel(mobileTab === "artifacts"),
              "space-y-3 lg:h-[calc(100dvh-15rem)] lg:min-h-[520px] lg:overflow-y-auto",
            )}
          >
            <VoicePicker
              voices={voices}
              terms={terms}
              selectedKey={voice}
              onSelect={chooseVoice}
              onChanged={loadVoices}
            />
            {cloningEnabled && (
              <CloneVoice voices={voices} terms={terms} onChanged={loadVoices} />
            )}
            {detail && canWrite && (
              <ToolsPanel
                conversationId={detail.conversation.id}
                property={detail.property}
                money={money}
                refreshKey={detail.artifacts.length}
                jobs={jobsApi.jobs}
                message={jobsApi.message}
                start={jobsApi.start}
              />
            )}
            {detail && canWrite ? (
              <ArtifactsPanel
                artifacts={artifacts}
                voiceKey={voice}
                voiceLabel={voiceLabel}
                currency={currency}
                glossaryVersion={glossaryVersion}
                conversationId={detail.conversation.id}
                onChanged={() => void loadDetail(detail.conversation.id)}
                onRework={(artifact) => void rework(artifact)}
                onRates={setRate}
                onCaptions={(artifactId) => void jobsApi.start("captions", { artifact_id: artifactId }, estimateJobCostUsd({ tool: "captions", audioSeconds: getVoiceoverDuration(artifactId) }))}
                getCaptionsLabel={getCaptionsLabel}
                captionsBusy={jobsApi.jobs.some((j) => j.tool === "captions")}
              />
            ) : (
              <p className="rounded-3xl border border-dashed border-neutral-300 p-6 text-center text-sm font-medium text-neutral-500">
                Choisissez un bien pour obtenir un script. Il sera épinglé ici.
              </p>
            )}
          </aside>
        </div>
      </div>

      <div hidden={tab !== "glossary"} className="mx-auto max-w-2xl">
        <GlossaryPanel
          voice={voice}
          currency={currency}
          rate={rate}
          scriptText={artifacts.filter((a) => a.kind === "script").map((a) => a.text).join("\n")}
          onChange={() => setGlossaryVersion((v) => v + 1)}
        />
      </div>
    </div>
  );
}
