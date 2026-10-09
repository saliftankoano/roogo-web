"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { estimateJobCostUsd } from "@/lib/studio/ai-tools";
import {
  DEFAULT_FCFA_PER_USD,
  formatMoney,
  type StudioCurrency,
} from "@/lib/studio/currency";
import { parseSseBuffer } from "@/lib/studio/sse";
import {
  ArrowsLeftRightIcon,
  CaretDownIcon,
  ChatsCircleIcon,
  ClockCounterClockwiseIcon,
  ImageSquareIcon,
  FilmSlateIcon,
  HouseLineIcon,
  MicrophoneStageIcon,
  PlusIcon,
  TranslateIcon,
  XIcon,
} from "@phosphor-icons/react";
import { orderArtifacts } from "./ArtifactsPanel";
import { CloneVoice } from "./CloneVoice";
import { ConversationList } from "./ConversationList";
import { GlossaryPanel } from "./GlossaryPanel";
import { PropertyPicker } from "./PropertyPicker";
import { StudioEditor } from "./StudioEditor";
import { StudioVisuals } from "./StudioVisuals";
import { StudioWorkspace, type ArtifactKind } from "./StudioWorkspace";
import { Thread } from "./Thread";
import { useJobs } from "./StudioTools";
import { VoicePicker, type TermsInfo, type VoiceInfo } from "./VoicePicker";
import {
  FIRST_DRAFT_REQUEST,
  type Artifact,
  type Budget,
  type ChatMessage,
  type ConversationDetail,
  type ConversationItem,
  type PropertySummary,
} from "./studio-types";

const VOICE_STORAGE_KEY = "roogo-studio-voice";
const CURRENCY_STORAGE_KEY = "roogo-studio-currency";

type MobileTab = "chat" | "results";
type RailTab = "chat" | "editor" | "visuals" | "history" | "glossary" | "clone";

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
  const [budget, setBudget] = useState<Budget | null>(null);
  const [creatingVisual, setCreatingVisual] = useState(false);
  const [switching, setSwitching] = useState(false);

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

  // Monthly budget for the header pill. Refreshed after every generation.
  const loadBudget = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/studio/budget");
      if (!res.ok) return;
      const data = (await res.json()) as Budget;
      setBudget(data);
      setRate(data.fcfaPerUsd);
    } catch {
      // The pill simply stays hidden.
    }
  }, []);

  // all=1: a founder sees the whole team's projects, staff still get their own.
  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/studio/conversations?all=1");
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
      void loadBudget();
    } catch {
      setError("La conversation n'a pas pu être chargée.");
    }
  }, [loadBudget]);

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
      void loadBudget();
      const list = await loadConversations();
      // Open the person's own latest project first; a founder's list also
      // holds the team's projects, which are read-only.
      const first = list.find((item) => item.isMine) ?? list[0];
      if (first) await open(first.id);
      setBooted(true);
    })();
  }, [loadVoices, loadBudget, loadConversations, open]);

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
    title?: string,
  ): Promise<string | null> {
    const res = await fetch("/api/admin/studio/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ property_id: propertyId, voice_key: voice, title }),
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

  // From the header chip: change the property of the open project without
  // asking for a new draft. With no project open, it behaves like the picker
  // in the conversation and starts the first draft.
  async function switchProperty(property: PropertySummary) {
    setSwitching(false);
    if (!activeId) {
      await pickProperty(property);
      return;
    }
    setError(null);
    const res = await fetch(`/api/admin/studio/conversations/${activeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ property_id: property.id }),
    });
    if (!res.ok) {
      setError("Le bien n'a pas pu être changé.");
      return;
    }
    await loadDetail(activeId);
    void loadConversations();
  }

  // A visuals-only project (greetings, announcements): no property, its own
  // entry in Projets so the team sees who made it and when.
  async function newVisualProject() {
    setCreatingVisual(true);
    setError(null);
    const label = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
    const id = await createConversation(undefined, `Visuels du ${label}`);
    setCreatingVisual(false);
    if (!id) return;
    activeRef.current = id;
    setActiveId(id);
    setSelectedId(null);
    await loadDetail(id);
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


  // Escape closes the property switcher.
  useEffect(() => {
    if (!switching) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSwitching(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [switching]);

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
    { key: "visuals", label: "Visuels", icon: <ImageSquareIcon size={22} weight="bold" /> },
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
    ) : kind === "image" ? (
      <button
        type="button"
        onClick={() => setRail("visuals")}
        className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
      >
        <ImageSquareIcon size={16} weight="bold" className="size-4 shrink-0" />
        Créer dans Visuels
      </button>
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
        <button
          type="button"
          onClick={() => setSwitching(true)}
          disabled={!canWrite}
          aria-haspopup="dialog"
          aria-expanded={switching}
          title={detail?.property ? "Changer de bien" : "Choisir un bien"}
          className="flex min-h-9 min-w-0 items-center gap-2 rounded-full border border-neutral-200 bg-white py-1 pl-1 pr-3 text-sm font-medium text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50 disabled:cursor-default disabled:hover:bg-white"
        >
          <span className="relative flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 text-neutral-500">
            {detail?.property?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={detail.property.image} alt="" className="size-full object-cover" />
            ) : (
              <HouseLineIcon size={14} weight="bold" />
            )}
          </span>
          <span className="max-w-64 truncate">
            {detail?.property?.title ?? "Choisir un bien"}
          </span>
          {canWrite && <CaretDownIcon size={14} weight="bold" className="shrink-0 text-neutral-400" />}
        </button>
        <div className="ml-auto flex items-center gap-2">
          {budget && (
            <span
              className="hidden min-w-68 shrink-0 items-center justify-end whitespace-nowrap text-xs font-medium tabular-nums text-neutral-500 sm:flex"
              title="Votre plafond du mois pour le Studio"
            >
              Reste ce mois : <strong className="ml-1 text-neutral-800">{money(budget.remainingUsd)}</strong>
              <span className="ml-1">sur {money(budget.capUsd)}</span>
            </span>
          )}
          <button
            type="button"
            onClick={() => chooseCurrency(currency === "FCFA" ? "USD" : "FCFA")}
            aria-label={currency === "FCFA" ? "Afficher les prix en dollars" : "Afficher les prix en FCFA"}
            title={currency === "FCFA" ? "Passer en dollars" : "Passer en FCFA"}
            className="inline-flex min-h-10 w-22 shrink-0 items-center justify-between rounded-xl border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-600 hover:bg-neutral-50"
          >
            <span className="tabular-nums">{currency === "FCFA" ? "FCFA" : "USD"}</span>
            <ArrowsLeftRightIcon size={14} weight="bold" className="text-neutral-400" />
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

      {/* Every tab takes the height its content needs; the page scrolls, never a box inside it. */}
      <div className="flex flex-col gap-3 lg:min-h-[600px] lg:flex-row lg:items-start">
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

        <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={rail}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="min-w-0 flex-1"
        >
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
              <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
                <section
                  className={cn(
                    card,
                    mobileTab === "chat" ? "flex" : "hidden lg:flex",
                    "min-h-[520px] min-w-0 flex-col p-3",
                  )}
                >
                  {chatPanel}
                </section>
                <section
                  className={cn(
                    card,
                    mobileTab === "results" ? "flex" : "hidden lg:flex",
                    "min-h-[520px] min-w-0 flex-col overflow-hidden",
                  )}
                >
                  {resultsPanel}
                </section>
              </div>
            </>
          )}

          {rail === "editor" && (
            <section className={cn(card, "flex flex-col overflow-hidden")}>
              <StudioEditor
                conversationId={detail?.conversation.id ?? null}
                property={detail?.property ?? null}
                ordered={ordered}
                canWrite={canWrite}
              />
            </section>
          )}

          {rail === "visuals" && (
            <section className={cn(card, "flex min-h-[560px] flex-col overflow-hidden")}>
              <StudioVisuals
                detail={detail}
                canWrite={canWrite}
                money={money}
                jobs={jobsApi.jobs}
                message={jobsApi.message}
                start={jobsApi.start}
                onNewVisualProject={() => void newVisualProject()}
                creating={creatingVisual}
                card={cardProps}
              />
            </section>
          )}

          {rail === "history" && (
            <section className={cn(card, "mx-auto flex max-w-3xl flex-col p-4")}>
              <ConversationList
                conversations={conversations}
                activeId={activeId}
                onSelect={(id) => void open(id)}
                onNew={newConversation}
              />
            </section>
          )}

          {rail === "glossary" && (
            <section className={cn(card, "mx-auto max-w-3xl p-4")}>
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
            <section className={cn(card, "mx-auto max-w-2xl p-4")}>
              <CloneVoice voices={voices} terms={terms} onChanged={loadVoices} />
            </section>
          )}
        </motion.div>
        </AnimatePresence>
      </div>

      <AnimatePresence>
      {switching && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-[80] flex items-start justify-center bg-neutral-900/30 p-4 pt-24 sm:items-center sm:pt-4"
          onClick={() => setSwitching(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="studio-switch-title"
            onClick={(event) => event.stopPropagation()}
            className="flex max-h-[80dvh] w-full max-w-lg flex-col gap-3 overflow-hidden rounded-3xl bg-white p-4 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 id="studio-switch-title" className="text-base font-semibold text-neutral-900">
                  {detail?.property ? "Changer de bien" : "Choisir un bien"}
                </h2>
                <p className="text-xs text-neutral-500">
                  {activeId
                    ? "Le projet garde ses scripts et ses résultats, seul le bien change."
                    : "Un nouveau projet démarre avec un premier script."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSwitching(false)}
                aria-label="Fermer"
                className="flex size-10 items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-100"
              >
                <XIcon size={18} weight="bold" />
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto">
              <PropertyPicker disabled={sending} onPick={(p) => void switchProperty(p)} />
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
