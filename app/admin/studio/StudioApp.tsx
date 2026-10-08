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
  FilmSlateIcon,
  MicrophoneStageIcon,
  PlusIcon,
  TranslateIcon,
} from "@phosphor-icons/react";
import { orderArtifacts } from "./ArtifactsPanel";
import { CloneVoice } from "./CloneVoice";
import { ConversationList } from "./ConversationList";
import { GlossaryPanel } from "./GlossaryPanel";
import { StudioEditor } from "./StudioEditor";
import { StudioWorkspace, type ArtifactKind } from "./StudioWorkspace";
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

type MobileTab = "chat" | "results";
type RailTab = "chat" | "editor" | "history" | "glossary" | "clone";

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
  const [kind, setKind] = useState<ArtifactKind>("script");
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
        if (gotScript) {
          setKind("script");
          setSelectedId(null);
          setMobileTab("results");
        }
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
  const activeVoices = voices.filter((v) => v.status === "active");

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
        estimateJobCostUsd({ tool: "captions", audioSeconds: getVoiceoverDuration(artifactId) }),
      ),
    getCaptionsLabel,
    captionsBusy: jobsApi.jobs.some((j) => j.tool === "captions"),
  };

  function showKind(next: ArtifactKind) {
    setKind(next);
    setSelectedId(null);
  }

  const railItems: { key: RailTab; label: string; icon: React.ReactNode }[] = [
    { key: "chat", label: "Chat", icon: <ChatsCircleIcon size={22} weight="bold" /> },
    { key: "editor", label: "Éditeur", icon: <FilmSlateIcon size={22} weight="bold" /> },
    { key: "history", label: "Projets", icon: <ClockCounterClockwiseIcon size={22} weight="bold" /> },
    { key: "glossary", label: "Glossaire", icon: <TranslateIcon size={22} weight="bold" /> },
    ...(cloningEnabled
      ? [{ key: "clone" as const, label: "Cloner", icon: <MicrophoneStageIcon size={22} weight="bold" /> }]
      : []),
  ];

  const card = "rounded-2xl border border-neutral-200 bg-white";

  const voiceSelect = (
    <label className="flex items-center gap-2 text-sm text-neutral-600">
      Voix
      <select
        value={voice}
        onChange={(e) => chooseVoice(e.target.value)}
        className="min-h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-900 outline-none focus:border-primary"
      >
        {activeVoices.map((v) => (
          <option key={v.key} value={v.key}>
            {v.label}
          </option>
        ))}
      </select>
    </label>
  );

  const workspaceAside =
    kind === "voiceover" ? (
      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-neutral-500">Voix utilisée pour les scripts</h3>
        <VoicePicker voices={voices} terms={terms} selectedKey={voice} onSelect={chooseVoice} onChanged={loadVoices} />
      </section>
    ) : kind === "image" && detail && canWrite ? (
      <ToolsPanel
        conversationId={detail.conversation.id}
        property={detail.property}
        money={money}
        refreshKey={detail.artifacts.length}
        jobs={jobsApi.jobs}
        message={jobsApi.message}
        start={jobsApi.start}
      />
    ) : null;

  const chatPanel = booted ? (
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
    <div className="h-40 animate-pulse rounded-2xl bg-neutral-100" />
  );

  const resultsPanel =
    detail && !canWrite ? (
      <p className="m-auto max-w-sm p-6 text-center text-sm text-neutral-500">
        Les résultats d&apos;un collègue se consultent en lecture seule dans la conversation.
      </p>
    ) : (
      <StudioWorkspace
        kind={kind}
        onKind={showKind}
        ordered={ordered}
        selectedId={selectedId}
        onSelect={setSelectedId}
        aside={workspaceAside}
        scriptHeader={activeVoices.length > 1 ? voiceSelect : null}
        {...cardProps}
      />
    );

  return (
    // Break out of the admin container so the Studio uses the whole screen width.
    <div className="relative left-1/2 flex w-[calc(100vw-2rem)] max-w-[1840px] -translate-x-1/2 flex-col gap-3 md:w-[calc(100vw-4rem)]">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Studio de contenu</h1>
        {detail?.property && (
          <span className="flex min-w-0 items-center gap-2 rounded-full border border-neutral-200 bg-white py-1 pl-1 pr-3 text-sm font-medium text-neutral-700">
            {detail.property.image && (
              <span className="relative size-6 shrink-0 overflow-hidden rounded-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={detail.property.image} alt="" className="size-full object-cover" />
              </span>
            )}
            <span className="max-w-64 truncate">{detail.property.title}</span>
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => chooseCurrency(currency === "FCFA" ? "USD" : "FCFA")}
            aria-label={currency === "FCFA" ? "Afficher les prix en dollars" : "Afficher les prix en FCFA"}
            className="min-h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-600 hover:bg-neutral-50"
          >
            {currency === "FCFA" ? "FCFA | $" : "$ | FCFA"}
          </button>
          <button
            type="button"
            onClick={newConversation}
            className="flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-white active:scale-[0.985]"
          >
            <PlusIcon size={16} weight="bold" />
            Nouveau projet
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-3 lg:h-[calc(100dvh-15rem)] lg:min-h-[600px] lg:flex-row">
        <nav
          aria-label="Modes du Studio"
          className={cn(card, "flex shrink-0 gap-1 overflow-x-auto p-1.5 lg:w-[76px] lg:flex-col lg:overflow-visible")}
        >
          {railItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setRail(item.key)}
              aria-pressed={rail === item.key}
              className={cn(
                "flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-semibold transition-colors lg:flex-col lg:gap-1 lg:px-0 lg:py-2.5",
                rail === item.key ? "bg-primary/10 text-primary" : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800",
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="min-h-0 min-w-0 flex-1">
          {rail === "chat" && (
            <>
              <div role="tablist" className="mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-neutral-100 p-1 lg:hidden">
                {(
                  [
                    ["chat", "Conversation"],
                    ["results", `Résultats${artifacts.length ? ` (${artifacts.length})` : ""}`],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={mobileTab === key}
                    onClick={() => setMobileTab(key)}
                    className={cn(
                      "min-h-11 rounded-xl text-sm font-semibold",
                      mobileTab === key ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="grid h-full min-h-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
                <section
                  className={cn(
                    card,
                    mobileTab === "chat" ? "flex" : "hidden lg:flex",
                    "h-[calc(100dvh-16rem)] min-h-[480px] min-w-0 flex-col p-3 lg:h-auto lg:min-h-0",
                  )}
                >
                  {chatPanel}
                </section>
                <section
                  className={cn(
                    card,
                    mobileTab === "results" ? "flex" : "hidden lg:flex",
                    "min-h-[520px] min-w-0 flex-col overflow-hidden lg:min-h-0",
                  )}
                >
                  {resultsPanel}
                </section>
              </div>
            </>
          )}

          {rail === "editor" && (
            <section className={cn(card, "flex h-full min-h-[560px] flex-col overflow-hidden lg:min-h-0")}>
              <StudioEditor
                property={detail?.property ?? null}
                ordered={ordered}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </section>
          )}

          {rail === "history" && (
            <section className={cn(card, "mx-auto flex h-full max-w-3xl flex-col p-4")}>
              <ConversationList
                conversations={conversations}
                activeId={activeId}
                onSelect={(id) => void open(id)}
                onNew={newConversation}
              />
            </section>
          )}

          {rail === "glossary" && (
            <section className={cn(card, "mx-auto h-full max-w-3xl overflow-y-auto p-4")}>
              <GlossaryPanel
                voice={voice}
                currency={currency}
                rate={rate}
                scriptText={artifacts.filter((a) => a.kind === "script").map((a) => a.text).join("\n")}
                onChange={() => setGlossaryVersion((v) => v + 1)}
              />
            </section>
          )}

          {rail === "clone" && cloningEnabled && (
            <section className={cn(card, "mx-auto h-full max-w-2xl overflow-y-auto p-4")}>
              <CloneVoice voices={voices} terms={terms} onChanged={loadVoices} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
