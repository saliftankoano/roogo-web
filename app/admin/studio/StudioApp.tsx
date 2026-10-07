"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { estimateJobCostUsd } from "@/lib/studio/ai-tools";
import {
  DEFAULT_FCFA_PER_USD,
  formatMoney,
  type StudioCurrency,
} from "@/lib/studio/currency";
import { parseSseBuffer } from "@/lib/studio/sse";
import {
  ChatsCircleIcon,
  ClockCounterClockwiseIcon,
  MicrophoneStageIcon,
  PlusIcon,
  TranslateIcon,
} from "@phosphor-icons/react";
import { orderArtifacts } from "./ArtifactsPanel";
import { CloneVoice } from "./CloneVoice";
import { ConversationList } from "./ConversationList";
import { GlossaryPanel } from "./GlossaryPanel";
import { StudioStage, StudioTimeline } from "./StudioStage";
import { Composer, ReadOnlyNote, Thread } from "./Thread";
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

type MobileTab = "history" | "chat" | "artifacts" | "settings";
type RailTab = "chat" | "history" | "glossary" | "clone";

function readStored(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

export function StudioApp() {
  const [rail, setRail] = useState<RailTab>("chat");
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
    setCurrency(
      readStored(CURRENCY_STORAGE_KEY, "FCFA") === "USD" ? "USD" : "FCFA",
    );
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
      setSelectedId(null);
      setMobileTab("chat");
      setRail("chat");
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
  const jobsApi = useJobs(
    detail?.conversation.id ?? null,
    detail?.jobs ?? [],
    reloadActive,
  );

  const getVoiceoverDuration = useCallback(
    (artifactId: string): number => {
      const artifact = detail?.artifacts.find((a) => a.id === artifactId);
      const meta = artifact?.meta ?? {};
      return typeof meta.duration_seconds === "number"
        ? meta.duration_seconds
        : 60;
    },
    [detail?.artifacts],
  );

  const getCaptionsLabel = useCallback(
    (artifactId: string): string => {
      const duration = getVoiceoverDuration(artifactId);
      return ` (environ ${money(estimateJobCostUsd({ tool: "captions", audioSeconds: duration }))})`;
    },
    [getVoiceoverDuration, money],
  );

  function newConversation() {
    activeRef.current = null;
    setActiveId(null);
    setDetail(null);
    setStreamingText("");
    setError(null);
    setSelectedId(null);
    setMobileTab("chat");
    setRail("chat");
  }

  async function createConversation(
    propertyId?: string,
  ): Promise<string | null> {
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
                {
                  id: `local-${Date.now()}`,
                  role: "user",
                  content: text,
                } as ChatMessage,
              ],
            }
          : current,
      );

      try {
        const res = await fetch("/api/admin/studio/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_id: conversationId,
            message: text,
          }),
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
  const ordered = orderArtifacts(artifacts);
  const canWrite = detail ? detail.conversation.isMine : true;

  // One selection drives the stage: a script goes to the script column,
  // anything else to the preview.
  const selected = ordered.find((a) => a.id === selectedId) ?? null;
  const script =
    selected?.kind === "script"
      ? selected
      : (ordered.find((a) => a.kind === "script") ?? null);
  const preview =
    selected && selected.kind !== "script"
      ? selected
      : (ordered.find((a) => a.kind !== "script") ?? null);

  const cardProps = {
    voiceKey: voice,
    voiceLabel,
    currency,
    glossaryVersion,
    conversationId: detail?.conversation.id ?? "",
    onChanged: () => {
      if (detail) void loadDetail(detail.conversation.id);
    },
    onRework: (artifact: Artifact) => void rework(artifact),
    onRates: setRate,
    onCaptions: (artifactId: string) =>
      void jobsApi.start(
        "captions",
        { artifact_id: artifactId },
        estimateJobCostUsd({
          tool: "captions",
          audioSeconds: getVoiceoverDuration(artifactId),
        }),
      ),
    getCaptionsLabel,
    captionsBusy: jobsApi.jobs.some((j) => j.tool === "captions"),
  };

  // Below the lg breakpoint one column shows at a time.
  const panel = (show: boolean) => (show ? "flex" : "hidden lg:flex");

  const railItems: { key: RailTab; label: string; icon: React.ReactNode }[] = [
    {
      key: "chat",
      label: "Chat",
      icon: <ChatsCircleIcon size={20} weight="bold" />,
    },
    {
      key: "history",
      label: "Projets",
      icon: <ClockCounterClockwiseIcon size={20} weight="bold" />,
    },
    {
      key: "glossary",
      label: "Glossaire",
      icon: <TranslateIcon size={20} weight="bold" />,
    },
    ...(cloningEnabled
      ? [
          {
            key: "clone" as const,
            label: "Cloner",
            icon: <MicrophoneStageIcon size={20} weight="bold" />,
          },
        ]
      : []),
  ];

  const leftColumn =
    rail === "history" ? (
      <ConversationList
        conversations={conversations}
        activeId={activeId}
        onSelect={(id) => void open(id)}
        onNew={newConversation}
      />
    ) : rail === "clone" && cloningEnabled ? (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <CloneVoice voices={voices} terms={terms} onChanged={loadVoices} />
      </div>
    ) : booted ? (
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
        hideComposer
      />
    ) : (
      <div className="h-40 animate-pulse rounded-2xl bg-white" />
    );

  const composer = canWrite ? (
    <Composer
      sending={sending}
      showQuickReplies={(detail?.messages.length ?? 0) > 0}
      onSend={(text) => void sendText(text)}
    />
  ) : (
    <ReadOnlyNote />
  );

  return (
    <div className="flex h-[calc(100dvh-11rem)] min-h-[760px] flex-col overflow-hidden rounded-3xl border border-neutral-200 bg-white text-neutral-900 shadow-sm shadow-neutral-900/5">
      <header className="flex min-h-14 flex-wrap items-center gap-3 border-b border-neutral-200 px-4 py-2">
        <span className="size-2.5 rounded-full bg-primary" aria-hidden />
        <h1 className="text-base font-bold tracking-tight">
          Studio de contenu
        </h1>
        {detail?.property && (
          <span className="hidden max-w-64 truncate rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-bold text-neutral-600 sm:inline">
            {detail.property.title}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => chooseCurrency(currency === "FCFA" ? "USD" : "FCFA")}
            aria-label={
              currency === "FCFA"
                ? "Afficher les prix en dollars"
                : "Afficher les prix en FCFA"
            }
            className="min-h-10 rounded-xl border border-neutral-200 px-3 text-xs font-bold text-neutral-600 hover:bg-neutral-100"
          >
            {currency === "FCFA" ? "FCFA | $" : "$ | FCFA"}
          </button>
          <button
            type="button"
            onClick={newConversation}
            className="flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-bold text-white active:scale-[0.985]"
          >
            <PlusIcon size={14} weight="bold" />
            Nouveau
          </button>
        </div>
      </header>

      <div
        role="tablist"
        className="grid grid-cols-4 gap-1 border-b border-neutral-200 p-1.5 lg:hidden"
      >
        {(
          [
            ["history", "Projets"],
            ["chat", "Chat"],
            [
              "artifacts",
              `Résultats${artifacts.length ? ` (${artifacts.length})` : ""}`,
            ],
            ["settings", "Réglages"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mobileTab === key}
            onClick={() => {
              setMobileTab(key);
              if (key === "history") setRail("history");
              if (key === "chat") setRail("chat");
            }}
            className={cn(
              "min-h-11 rounded-xl px-1 text-xs font-bold transition-colors",
              mobileTab === key
                ? "bg-neutral-100 text-neutral-900"
                : "text-neutral-500",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[60px_280px_minmax(0,1fr)_280px]">
        <nav
          aria-label="Outils du Studio"
          className="hidden flex-col items-center gap-1.5 border-r border-neutral-200 py-3 lg:flex"
        >
          {railItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setRail(item.key)}
              aria-pressed={rail === item.key}
              className={cn(
                "flex w-12 flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-bold transition-colors",
                rail === item.key
                  ? "bg-primary/15 text-primary"
                  : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800",
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <aside
          className={cn(
            panel(mobileTab === "chat" || mobileTab === "history"),
            "min-h-0 flex-col gap-3 border-r border-neutral-200 p-3",
          )}
        >
          {leftColumn}
          <div className="lg:hidden">{mobileTab === "chat" && composer}</div>
        </aside>

        <main
          className={cn(
            panel(mobileTab === "artifacts"),
            "min-h-0 flex-col gap-3 bg-[#faf7f4] p-3",
          )}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            {rail === "glossary" ? (
              <div className="mx-auto w-full max-w-2xl">
                <GlossaryPanel
                  voice={voice}
                  currency={currency}
                  rate={rate}
                  scriptText={artifacts
                    .filter((a) => a.kind === "script")
                    .map((a) => a.text)
                    .join("\n")}
                  onChange={() => setGlossaryVersion((v) => v + 1)}
                />
              </div>
            ) : detail && !canWrite ? (
              <p className="m-auto max-w-sm text-center text-sm font-medium text-neutral-500">
                Les résultats d&apos;un collègue se consultent dans sa
                conversation.
              </p>
            ) : (
              <>
                <div className="flex min-h-[300px] flex-1 flex-col">
                  <StudioStage
                    property={detail?.property ?? null}
                    ordered={ordered}
                    preview={preview}
                    script={script}
                    onSelect={setSelectedId}
                    {...cardProps}
                  />
                </div>
                <StudioTimeline
                  ordered={ordered}
                  selectedIds={[preview?.id, script?.id].filter(
                    (id): id is string => !!id,
                  )}
                  onSelect={setSelectedId}
                />
              </>
            )}
          </div>
          <div className="hidden shrink-0 lg:block">{composer}</div>
        </main>

        <aside
          className={cn(
            panel(mobileTab === "settings"),
            "min-h-0 flex-col gap-4 overflow-y-auto border-l border-neutral-200 p-3",
          )}
        >
          <section className="space-y-2">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-500">
              Voix
            </h2>
            <VoicePicker
              voices={voices}
              terms={terms}
              selectedKey={voice}
              onSelect={chooseVoice}
              onChanged={loadVoices}
            />
          </section>
          {detail && canWrite ? (
            <ToolsPanel
              conversationId={detail.conversation.id}
              property={detail.property}
              money={money}
              refreshKey={detail.artifacts.length}
              jobs={jobsApi.jobs}
              message={jobsApi.message}
              start={jobsApi.start}
            />
          ) : (
            <p className="rounded-2xl border border-dashed border-neutral-300 p-4 text-sm font-medium text-neutral-500">
              Les outils (affiche, détourage, voeux) apparaissent quand une
              conversation est ouverte.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
