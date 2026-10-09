"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeftIcon,
  ClockCounterClockwiseIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { estimateJobCostUsd } from "@/lib/studio/ai-tools";
import { DEFAULT_FCFA_PER_USD, formatMoney, type StudioCurrency } from "@/lib/studio/currency";
import { parseSseBuffer } from "@/lib/studio/sse";
import { orderArtifacts } from "./ArtifactsPanel";
import { ChatView } from "./ChatView";
import { CloneVoice } from "./CloneVoice";
import { GlossaryPanel } from "./GlossaryPanel";
import { HistoryPanel } from "./HistoryPanel";
import { ProjectPanel, type CenterView } from "./ProjectPanel";
import { PropertyPicker } from "./PropertyPicker";
import { StudioEditor } from "./StudioEditor";
import { useJobs } from "./StudioTools";
import { StudioVisuals } from "./StudioVisuals";
import { VoicePicker, type TermsInfo, type VoiceInfo } from "./VoicePicker";
import { glass, stage } from "./studio-ui";
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
const PANEL_STORAGE_KEY = "roogo-studio-panel";
const ease = [0.22, 1, 0.36, 1] as const;

const VIEW_TITLE: Record<Exclude<CenterView, "chat">, string> = {
  editor: "Vidéo du bien",
  visuals: "Visuels",
  glossary: "Prononciation",
  voices: "Voix",
  clone: "Cloner une voix",
};

function readStored(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not critical.
  }
}

/**
 * The Studio (layout approved by Salif on 2026-10-09): the team's shared
 * history on the left, the conversation in the centre with every result as a
 * card in the thread, the open project's panel on the right. On a phone the
 * history and the project panel open as sheets.
 */
export function StudioApp() {
  const [view, setView] = useState<CenterView>("chat");
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  // Below 1280 px the open panel floats over the chat instead of squeezing it.
  const [wide, setWide] = useState(true);
  const [sheet, setSheet] = useState<"history" | "project" | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
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
    setCurrency(readStored(CURRENCY_STORAGE_KEY, "FCFA") === "USD" ? "USD" : "FCFA");
    // The panel starts folded on laptops so the chat keeps its width.
    const saved = readStored(PANEL_STORAGE_KEY, "");
    setPanelCollapsed(saved ? saved === "closed" : window.innerWidth < 1360);
    const query = window.matchMedia("(min-width: 1280px)");
    const sync = () => setWide(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const loadVoices = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/studio/voices");
      if (!res.ok) return;
      const data = (await res.json()) as { voices: VoiceInfo[]; terms: TermsInfo; cloningEnabled?: boolean };
      setCloningEnabled(data.cloningEnabled === true);
      setVoices(data.voices);
      setTerms(data.terms);
      setVoice((current) =>
        data.voices.some((v) => v.key === current && v.status === "active") ? current : "sandrine",
      );
    } catch {
      // The default voice still works without the list.
    }
  }, []);

  const loadBudget = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/studio/budget");
      if (!res.ok) return;
      const data = (await res.json()) as Budget;
      setBudget(data);
      setRate(data.fcfaPerUsd);
    } catch {
      // The budget card simply stays hidden.
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

  const loadDetail = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/admin/studio/conversations/${id}`);
        if (!res.ok) throw new Error("detail failed");
        const data = (await res.json()) as ConversationDetail;
        if (activeRef.current === id) setDetail(data);
        void loadBudget();
      } catch {
        setError("Le projet n'a pas pu être chargé.");
      }
    },
    [loadBudget],
  );

  const open = useCallback(
    async (id: string, nextView: CenterView = "chat") => {
      activeRef.current = id;
      setActiveId(id);
      setError(null);
      setStreamingText("");
      setView(nextView);
      setSheet(null);
      await loadDetail(id);
    },
    [loadDetail],
  );

  // First load: voices, budget, the shared history, then your latest project.
  useEffect(() => {
    void (async () => {
      void loadVoices();
      void loadBudget();
      const list = await loadConversations();
      const first = list.find((item) => item.isMine) ?? list[0];
      if (first) await open(first.id, first.kind === "visual" ? "visuals" : "chat");
      setBooted(true);
    })();
  }, [loadVoices, loadBudget, loadConversations, open]);

  const money = useCallback((usd: number) => formatMoney(usd, currency, rate), [currency, rate]);
  const reloadActive = useCallback(() => {
    if (activeRef.current) void loadDetail(activeRef.current);
  }, [loadDetail]);
  const jobsApi = useJobs(detail?.conversation.id ?? null, detail?.jobs ?? [], reloadActive);

  const getVoiceoverDuration = useCallback(
    (artifactId: string): number => {
      const meta = detail?.artifacts.find((a) => a.id === artifactId)?.meta ?? {};
      return typeof meta.duration_seconds === "number" ? meta.duration_seconds : 60;
    },
    [detail?.artifacts],
  );

  const getCaptionsLabel = useCallback(
    (artifactId: string): string =>
      ` (environ ${money(estimateJobCostUsd({ tool: "captions", audioSeconds: getVoiceoverDuration(artifactId) }))})`,
    [getVoiceoverDuration, money],
  );

  function newConversation() {
    activeRef.current = null;
    setActiveId(null);
    setDetail(null);
    setStreamingText("");
    setError(null);
    setView("chat");
    setSheet(null);
  }

  async function createConversation(propertyId?: string, title?: string): Promise<string | null> {
    const res = await fetch("/api/admin/studio/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ property_id: propertyId, voice_key: voice, title }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.id) {
      setError(data.error ?? "Le projet n'a pas pu être créé.");
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
      setView("chat");
      setDetail((current) =>
        current && current.conversation.id === conversationId
          ? {
              ...current,
              messages: [
                ...current.messages,
                { id: `local-${Date.now()}`, role: "user", content: text, createdAt: new Date().toISOString() } as ChatMessage,
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
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parsed = parseSseBuffer(buffer);
          buffer = parsed.rest;
          for (const event of parsed.events) {
            const data = event.data as { text?: string; message?: string };
            if (event.event === "delta" && data.text) {
              setStreamingText((current) => current + data.text);
            } else if (event.event === "error") {
              setError(data.message ?? "La réponse s'est interrompue.");
            }
          }
        }
        await loadDetail(conversationId);
        void loadConversations();
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

  // Choosing a property in an empty project starts the first draft at once.
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

  // From the project panel: change the open project's property, no new draft.
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

  // A visuals-only project (greetings, announcements): its own history entry.
  async function newVisualProject() {
    setCreatingVisual(true);
    setError(null);
    const label = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
    const id = await createConversation(undefined, `Visuels du ${label}`);
    setCreatingVisual(false);
    if (!id) return;
    await open(id, "visuals");
  }

  // "Réutiliser": a new project on the same property, starting from a script.
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
    store(VOICE_STORAGE_KEY, key);
  }

  function toggleCurrency() {
    const next = currency === "FCFA" ? "USD" : "FCFA";
    setCurrency(next);
    store(CURRENCY_STORAGE_KEY, next);
  }

  function togglePanel() {
    setPanelCollapsed((closed) => {
      store(PANEL_STORAGE_KEY, closed ? "open" : "closed");
      return !closed;
    });
  }

  // From "Résultats épinglés": back to the chat, scroll to the card, flash it.
  function jumpTo(artifactId: string) {
    setView("chat");
    setSheet(null);
    window.setTimeout(() => {
      document.getElementById(`artifact-${artifactId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      setHighlightId(artifactId);
      window.setTimeout(() => setHighlightId(null), 1600);
    }, 60);
  }

  useEffect(() => {
    if (!switching && !sheet) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSwitching(false);
      setSheet(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [switching, sheet]);

  const voiceLabel = voices.find((v) => v.key === voice)?.label ?? "Sandrine";
  const artifacts = detail?.artifacts ?? [];
  const ordered = orderArtifacts(artifacts);
  const canWrite = detail ? detail.conversation.isMine : true;
  const activeItem = conversations.find((c) => c.id === activeId) ?? null;

  const cardProps = {
    voiceKey: voice,
    voiceLabel,
    currency,
    glossaryVersion,
    conversationId: detail?.conversation.id ?? "",
    onChanged: reloadActive,
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

  const history = (
    <HistoryPanel
      conversations={conversations}
      activeId={activeId}
      onSelect={(id: string) => {
        const item = conversations.find((c) => c.id === id);
        void open(id, item?.kind === "visual" ? "visuals" : "chat");
      }}
      onNewChat={newConversation}
      onNewVisual={() => void newVisualProject()}
    />
  );

  const projectPanel = (collapsed: boolean) => (
    <ProjectPanel
      detail={detail}
      collapsed={collapsed}
      onToggle={togglePanel}
      view={view}
      onView={(next: CenterView) => {
        setView(next);
        setSheet(null);
      }}
      budget={budget}
      money={money}
      currency={currency}
      onCurrency={toggleCurrency}
      voices={voices}
      voice={voice}
      onVoice={chooseVoice}
      cloningEnabled={cloningEnabled}
      canWrite={canWrite}
      onSwitchProperty={() => setSwitching(true)}
      onJump={jumpTo}
    />
  );

  const center =
    view === "chat" ? (
      booted ? (
        <ChatView
          detail={detail}
          startedBy={activeItem?.author ?? null}
          startedAt={activeItem?.createdAt ?? null}
          streamingText={streamingText}
          sending={sending}
          error={error}
          canWrite={canWrite}
          highlightId={highlightId}
          onSend={(text: string) => void sendText(text)}
          onPickProperty={(p: PropertySummary) => void pickProperty(p)}
          card={cardProps}
        />
      ) : (
        <div className="m-6 h-40 animate-pulse rounded-3xl bg-white/50" />
      )
    ) : (
      <div className="flex flex-col">
        <div className="flex items-center gap-2 border-b border-[rgba(74,52,36,0.10)] px-4 py-3">
          <button
            type="button"
            onClick={() => setView("chat")}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-semibold text-neutral-700 hover:bg-white/70"
          >
            <ArrowLeftIcon size={16} weight="bold" className="size-4 shrink-0" />
            Retour au chat
          </button>
          <h2 className="min-w-0 truncate text-sm font-semibold text-neutral-500">{VIEW_TITLE[view]}</h2>
        </div>
        {view === "editor" && (
          <StudioEditor
            conversationId={detail?.conversation.id ?? null}
            property={detail?.property ?? null}
            ordered={ordered}
            canWrite={canWrite}
          />
        )}
        {view === "visuals" && (
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
        )}
        {view === "glossary" && (
          <div className="p-4 md:p-6">
            <GlossaryPanel
              voice={voice}
              currency={currency}
              rate={rate}
              scriptText={artifacts.filter((a) => a.kind === "script").map((a) => a.text).join("\n")}
              onChange={() => setGlossaryVersion((v) => v + 1)}
            />
          </div>
        )}
        {view === "voices" && (
          <div className="mx-auto w-full max-w-2xl p-4 md:p-6">
            <VoicePicker voices={voices} terms={terms} selectedKey={voice} onSelect={chooseVoice} onChanged={loadVoices} />
          </div>
        )}
        {view === "clone" && cloningEnabled && (
          <div className="mx-auto w-full max-w-2xl p-4 md:p-6">
            <CloneVoice voices={voices} terms={terms} onChanged={loadVoices} />
          </div>
        )}
      </div>
    );

  return (
    // Break out of the admin container so the Studio uses the whole width.
    <div className="relative left-1/2 w-[calc(100vw-1rem)] max-w-[1840px] -translate-x-1/2 md:w-[calc(100vw-3rem)]">
      <div className={cn(stage, "p-2.5 md:p-4")}>
        {/* Phone and tablet: history and project open as sheets. */}
        <div className="mb-2.5 flex items-center gap-2 lg:hidden">
          <button
            type="button"
            onClick={() => setSheet("history")}
            className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-white/80 bg-white/70 px-4 text-sm font-semibold text-neutral-800"
          >
            <ClockCounterClockwiseIcon size={16} weight="bold" className="size-4 shrink-0" />
            Historique
          </button>
          <span className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-neutral-700">
            {detail?.conversation.title ?? "Studio"}
          </span>
          <button
            type="button"
            onClick={() => setSheet("project")}
            className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-white/80 bg-white/70 px-4 text-sm font-semibold text-neutral-800"
          >
            <SlidersHorizontalIcon size={16} weight="bold" className="size-4 shrink-0" />
            Projet
          </button>
        </div>

        <div
          className="grid items-start gap-3.5 transition-[grid-template-columns] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:[grid-template-columns:var(--studio-cols)]"
          style={
            {
              "--studio-cols": `minmax(280px,340px) minmax(0,1fr) ${panelCollapsed || !wide ? "68px" : "minmax(260px,300px)"}`,
            } as React.CSSProperties
          }
        >
          <aside className={cn(glass, "hidden p-3.5 lg:block")}>{history}</aside>

          <main className={cn(glass, "min-w-0 overflow-visible")}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={view === "chat" ? `chat-${activeId ?? "new"}` : view}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2, ease }}
              >
                {center}
              </motion.div>
            </AnimatePresence>
          </main>

          <aside className={cn(glass, "sticky top-24 hidden lg:block", panelCollapsed || !wide ? "px-2 py-3" : "p-3.5")}>
            {projectPanel(panelCollapsed || !wide)}
            <AnimatePresence>
              {!wide && !panelCollapsed && (
                <motion.div
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={{ duration: 0.22, ease }}
                  className="absolute right-0 top-0 z-30 w-[300px] rounded-[26px] border border-white/80 bg-[rgba(252,247,241,0.97)] p-3.5 shadow-[0_24px_60px_-20px_rgba(90,50,26,0.45)] backdrop-blur-xl"
                >
                  {projectPanel(false)}
                </motion.div>
              )}
            </AnimatePresence>
          </aside>
        </div>
      </div>

      <AnimatePresence>
        {sheet && (
          <motion.div
            key="sheet"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-[80] bg-neutral-900/30 lg:hidden"
            onClick={() => setSheet(null)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={sheet === "history" ? "Historique" : "Projet"}
              onClick={(event) => event.stopPropagation()}
              initial={sheet === "history" ? { x: "-100%" } : { y: "100%" }}
              animate={sheet === "history" ? { x: 0 } : { y: 0 }}
              exit={sheet === "history" ? { x: "-100%" } : { y: "100%" }}
              transition={{ duration: 0.3, ease }}
              className={cn(
                "absolute overflow-y-auto bg-[#f7efe5] p-4 shadow-2xl",
                sheet === "history"
                  ? "inset-y-0 left-0 w-[min(92vw,380px)] rounded-r-[28px]"
                  : "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-[28px]",
              )}
            >
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSheet(null)}
                  aria-label="Fermer"
                  className="flex size-10 items-center justify-center rounded-full bg-white/80 text-neutral-600"
                >
                  <XIcon size={18} weight="bold" className="size-[18px] shrink-0" />
                </button>
              </div>
              {sheet === "history" ? history : projectPanel(false)}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {switching && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-[90] flex items-start justify-center bg-neutral-900/30 p-4 pt-24 sm:items-center sm:pt-4"
            onClick={() => setSwitching(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.22, ease }}
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
                  <p className="text-xs text-neutral-500">Le projet garde ses scripts et ses résultats, seul le bien change.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSwitching(false)}
                  aria-label="Fermer"
                  className="flex size-10 items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-100"
                >
                  <XIcon size={18} weight="bold" className="size-[18px] shrink-0" />
                </button>
              </div>
              <div className="min-h-0 overflow-y-auto">
                <PropertyPicker disabled={sending} onPick={(p: PropertySummary) => void switchProperty(p)} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
