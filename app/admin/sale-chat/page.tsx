"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  ChatCircleTextIcon,
  PaperPlaneRightIcon,
  FileTextIcon,
  BankIcon,
  HouseSimpleIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type Kind = "seller" | "buyer";

type ConvUser = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  user_type: string | null;
};

type ConvProperty = {
  id: string;
  property_type: string;
  price: number | null;
  quartier: string | null;
  city: string | null;
  cover_url: string | null;
};

type ConversationSummary = {
  id: string;
  kind: Kind;
  property_id: string;
  status: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_for_staff: number;
  property: ConvProperty | null;
  user: ConvUser | null;
};

type Attachment = {
  id: string;
  url: string | null;
  mime_type?: string | null;
  file_name?: string | null;
};

// A non-image attachment on a text message is a document (PDF, Word, ...).
function isDocumentAttachment(a: Attachment) {
  return !!a.mime_type && !a.mime_type.startsWith("image/");
}

type Message = {
  id: string;
  sender_id: string | null;
  sender_name?: string | null;
  sender_type: "user" | "staff" | "system";
  message_type:
    | "text"
    | "voice"
    | "visit_request"
    | "visit_confirmation"
    | "mandate_offer"
    | "mandate_signed"
    | "notary_meeting";
  body: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  read_at: string | null;
  attachments?: Attachment[];
};

const LIST_POLL_MS = 10000;
const THREAD_POLL_MS = 5000;

// Deterministic per-sender name colors (WhatsApp-group style), readable on both
// the terracotta staff bubble and the neutral user bubble backdrop.
const SENDER_NAME_COLORS = [
  "#FDE68A",
  "#BFDBFE",
  "#BBF7D0",
  "#FBCFE8",
  "#DDD6FE",
  "#99F6E4",
];

function senderNameColor(senderId: string | null) {
  if (!senderId) return SENDER_NAME_COLORS[0];
  let hash = 0;
  for (let i = 0; i < senderId.length; i++) {
    hash = (hash * 31 + senderId.charCodeAt(i)) >>> 0;
  }
  return SENDER_NAME_COLORS[hash % SENDER_NAME_COLORS.length];
}

function fmtFCFA(n: unknown) {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return "—";
  return `${Math.round(v).toLocaleString("fr-FR")} FCFA`;
}

function convTitle(c: ConversationSummary | null) {
  if (!c?.property) return "Bien à vendre";
  return `${c.property.property_type} · ${c.property.quartier ?? ""}`;
}

export default function AdminSaleChatPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [filter, setFilter] = useState<"all" | "seller" | "buyer">("all");
  const [selected, setSelected] = useState<ConversationSummary | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Action panels
  const [showMandate, setShowMandate] = useState(false);
  const [desired, setDesired] = useState("");
  const [days, setDays] = useState("90");
  // Live sale commission (decimal fractions) for the computed preview line.
  const [saleBasePct, setSaleBasePct] = useState<number | null>(null);
  const [saleSplitPct, setSaleSplitPct] = useState<number | null>(null);
  const [showNotary, setShowNotary] = useState(false);
  const [notaryAt, setNotaryAt] = useState("");
  const [notaryName, setNotaryName] = useState("");

  const threadRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/sale-chat/conversations");
      if (!res.ok) throw new Error("Échec du chargement");
      const data = await res.json();
      setConversations((data.conversations ?? []) as ConversationSummary[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }, []);

  const loadThread = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/sale-chat/conversations/${id}`);
      if (!res.ok) throw new Error("Échec du chargement");
      const data = await res.json();
      setMessages((data.messages ?? []) as Message[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }, []);

  useEffect(() => {
    loadConversations();
    const interval = setInterval(loadConversations, LIST_POLL_MS);
    return () => clearInterval(interval);
  }, [loadConversations]);

  // Current sale commission settings (null until migration 050 has run).
  useEffect(() => {
    fetch("/api/pricing")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (typeof d?.saleBaseCommissionPercentage === "number") {
          setSaleBasePct(d.saleBaseCommissionPercentage);
        }
        if (typeof d?.saleSurplusSplitPercentage === "number") {
          setSaleSplitPct(d.saleSurplusSplitPercentage);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selected) return;
    loadThread(selected.id);
    const interval = setInterval(() => loadThread(selected.id), THREAD_POLL_MS);
    return () => clearInterval(interval);
  }, [selected, loadThread]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages]);

  const handleSelect = (c: ConversationSummary) => {
    setSelected(c);
    setMessages([]);
    setShowMandate(false);
    setShowNotary(false);
    setConversations((prev) =>
      prev.map((x) => (x.id === c.id ? { ...x, unread_for_staff: 0 } : x)),
    );
  };

  const handleSend = async () => {
    if (!selected || !draft.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/sale-chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: selected.id, body: draft.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Échec de l'envoi");
      }
      setDraft("");
      await loadThread(selected.id);
      await loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSending(false);
    }
  };

  const postAction = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      if (!selected) return false;
      setError(null);
      try {
        const res = await fetch(
          `/api/sale-chat/conversations/${selected.id}/${path}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Échec");
        }
        await loadThread(selected.id);
        await loadConversations();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur");
        return false;
      }
    },
    [selected, loadThread, loadConversations],
  );

  const handleSendMandate = async () => {
    const ok = await postAction("mandate", {
      desiredPrice: Number(desired),
      exclusivityDays: Number(days) || 90,
    });
    if (ok) {
      setShowMandate(false);
      setDesired("");
      setDays("90");
    }
  };

  const handleScheduleNotary = async () => {
    if (!notaryAt) return;
    const ok = await postAction("notary", {
      scheduledAt: new Date(notaryAt).toISOString(),
      notaryName: notaryName.trim() || undefined,
    });
    if (ok) {
      setShowNotary(false);
      setNotaryAt("");
      setNotaryName("");
    }
  };

  const handleConfirmVisit = (
    visitRequestId: string,
    slot: { date: string; time: string },
  ) => postAction("confirm-visit", { visitRequestId, slot });

  const visible = conversations.filter(
    (c) => filter === "all" || c.kind === filter,
  );

  return (
    <div className="flex flex-col">
      <h1 className="text-2xl font-bold text-neutral-900 mb-2 flex items-center gap-2">
        <ChatCircleTextIcon size={26} weight="bold" /> Conversations ventes
      </h1>
      <p className="text-sm text-neutral-500 mb-4">
        Roogo est le seul interlocuteur. Répondez aux vendeurs et acheteurs,
        envoyez les mandats, confirmez les visites et planifiez les rendez-vous
        notaire.
      </p>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="flex gap-2 mb-3">
        {(["all", "seller", "buyer"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm font-semibold border",
              filter === f
                ? "bg-[#C96A2E] text-white border-[#C96A2E]"
                : "bg-white text-neutral-600 border-neutral-200",
            )}
          >
            {f === "all" ? "Tous" : f === "seller" ? "Vendeurs" : "Acheteurs"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4 h-[70vh]">
        {/* List */}
        <div className="border border-neutral-200 rounded-2xl overflow-y-auto bg-white">
          {visible.length === 0 ? (
            <p className="p-6 text-sm text-neutral-500">Aucune conversation.</p>
          ) : (
            visible.map((c) => (
              <button
                key={c.id}
                onClick={() => handleSelect(c)}
                className={cn(
                  "w-full text-left px-4 py-3 border-b border-neutral-100 hover:bg-neutral-50 transition",
                  selected?.id === c.id && "bg-neutral-50",
                )}
              >
                <div className="flex items-start gap-3">
                  {c.property?.cover_url ? (
                    <Image
                      src={c.property.cover_url}
                      alt=""
                      width={40}
                      height={40}
                      className="shrink-0 h-10 w-10 rounded-lg object-cover"
                      unoptimized
                    />
                  ) : (
                    <span className="shrink-0 h-10 w-10 rounded-lg bg-neutral-100 flex items-center justify-center">
                      <HouseSimpleIcon size={18} className="text-neutral-400" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-neutral-900 truncate">
                        {convTitle(c)}
                      </span>
                      {c.unread_for_staff > 0 && (
                        <span className="shrink-0 bg-[#C96A2E] text-white text-xs font-bold rounded-full px-2 py-0.5">
                          {c.unread_for_staff}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className={cn(
                          "text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5",
                          c.kind === "seller"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-sky-100 text-sky-700",
                        )}
                      >
                        {c.kind === "seller" ? "Vendeur" : "Acheteur"}
                      </span>
                      <span className="text-xs text-neutral-500 truncate">
                        {c.user?.full_name || "—"}
                      </span>
                    </div>
                    <p className="text-sm text-neutral-500 truncate mt-0.5">
                      {c.last_message_preview || "—"}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Thread */}
        <div className="border border-neutral-200 rounded-2xl flex flex-col bg-white overflow-hidden">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-neutral-400 text-sm">
              Sélectionnez une conversation
            </div>
          ) : (
            <>
              <div className="px-5 py-3 border-b border-neutral-100 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-neutral-900 truncate">
                    {convTitle(selected)}
                  </p>
                  <p className="text-xs text-neutral-500 truncate">
                    {selected.kind === "seller" ? "Vendeur" : "Acheteur"} ·{" "}
                    {selected.user?.full_name || "—"}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {selected.kind === "seller" && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowMandate((v) => !v);
                        setShowNotary(false);
                      }}
                      className="gap-1.5"
                    >
                      <FileTextIcon size={16} /> Mandat
                    </Button>
                  )}
                  {selected.kind === "buyer" && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowNotary((v) => !v);
                        setShowMandate(false);
                      }}
                      className="gap-1.5"
                    >
                      <BankIcon size={16} /> Notaire
                    </Button>
                  )}
                </div>
              </div>

              {/* Mandate form (v2: commission on the seller's desired price) */}
              {showMandate && (
                <div className="px-5 py-3 border-b border-neutral-100 bg-neutral-50 space-y-2">
                  <div className="grid grid-cols-2 gap-2 items-end">
                    <Field
                      label="Prix désiré (FCFA)"
                      value={desired}
                      onChange={setDesired}
                    />
                    <Field
                      label="Exclusivité (j)"
                      value={days}
                      onChange={setDays}
                    />
                  </div>
                  {saleBasePct != null && Number(desired) > 0 && (
                    <p className="text-xs text-neutral-600">
                      Commission Roogo: {(saleBasePct * 100).toFixed(1)}% ={" "}
                      {fmtFCFA(Number(desired) * saleBasePct)} · Le vendeur
                      reçoit au minimum{" "}
                      {fmtFCFA(Number(desired) * (1 - saleBasePct))}
                      {saleSplitPct != null &&
                        ` · Surplus au-dessus du prix désiré: ${(
                          saleSplitPct * 100
                        ).toFixed(0)}% Roogo / ${(
                          (1 - saleSplitPct) *
                          100
                        ).toFixed(0)}% vendeur`}
                    </p>
                  )}
                  <div className="flex justify-end">
                    <Button
                      onClick={handleSendMandate}
                      disabled={!(Number(desired) > 0)}
                    >
                      Envoyer le mandat
                    </Button>
                  </div>
                </div>
              )}

              {/* Notary form */}
              {showNotary && (
                <div className="px-5 py-3 border-b border-neutral-100 bg-neutral-50 flex flex-wrap gap-2 items-end">
                  <label className="flex flex-col text-xs font-semibold text-neutral-500">
                    Date et heure
                    <input
                      type="datetime-local"
                      value={notaryAt}
                      onChange={(e) => setNotaryAt(e.target.value)}
                      className="mt-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="flex flex-col text-xs font-semibold text-neutral-500 flex-1">
                    Notaire (optionnel)
                    <input
                      value={notaryName}
                      onChange={(e) => setNotaryName(e.target.value)}
                      className="mt-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <Button onClick={handleScheduleNotary} disabled={!notaryAt}>
                    Planifier
                  </Button>
                </div>
              )}

              <div
                ref={threadRef}
                className="flex-1 overflow-y-auto px-5 py-4 space-y-3"
              >
                {messages.map((m) => (
                  <MessageRow
                    key={m.id}
                    message={m}
                    onConfirmVisit={handleConfirmVisit}
                  />
                ))}
              </div>

              <div className="border-t border-neutral-100 p-3 flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Répondre…"
                  rows={1}
                  className="flex-1 resize-none rounded-xl border border-neutral-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C96A2E]/30 max-h-32"
                />
                <Button
                  onClick={handleSend}
                  disabled={sending || !draft.trim()}
                  className="shrink-0"
                >
                  <PaperPlaneRightIcon size={18} weight="fill" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col text-xs font-semibold text-neutral-500">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        className="mt-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm"
      />
    </label>
  );
}

function MessageRow({
  message,
  onConfirmVisit,
}: {
  message: Message;
  onConfirmVisit: (
    visitRequestId: string,
    slot: { date: string; time: string },
  ) => void;
}) {
  const meta = (message.metadata ?? {}) as Record<string, unknown>;

  if (message.message_type === "text" || message.message_type === "voice") {
    const isVoice = message.message_type === "voice";
    const isStaff = message.sender_type === "staff";
    const isSystem = message.sender_type === "system";
    if (isSystem) {
      return (
        <div className="mx-auto max-w-[80%] rounded-xl bg-neutral-100 px-4 py-2 text-center text-xs text-neutral-600">
          {message.body}
        </div>
      );
    }
    const voiceDuration =
      typeof meta.duration_seconds === "number" ? meta.duration_seconds : null;
    return (
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-4 py-2",
          isStaff
            ? "ml-auto bg-[#C96A2E] text-white"
            : "mr-auto bg-neutral-100 text-neutral-900",
        )}
      >
        {isStaff && message.sender_name && (
          <p
            className="mb-0.5 text-xs font-bold"
            style={{ color: senderNameColor(message.sender_id) }}
          >
            {message.sender_name}
          </p>
        )}
        {isVoice ? (
          <div className="py-1">
            {(message.attachments ?? []).map((a) =>
              a.url ? (
                <audio key={a.id} controls preload="metadata" src={a.url} className="max-w-full" />
              ) : (
                <p key={a.id} className="text-sm italic opacity-80">
                  Note vocale indisponible
                </p>
              ),
            )}
            <p
              className={cn(
                "mt-1 text-[11px]",
                isStaff ? "text-white/70" : "text-neutral-500",
              )}
            >
              Note vocale
              {voiceDuration != null ? ` · ${fmtDuration(voiceDuration)}` : ""}
            </p>
          </div>
        ) : (
          (message.attachments ?? []).map((a) => {
            if (!a.url) return null;
            if (isDocumentAttachment(a)) {
              return (
                <a
                  key={a.id}
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    "mb-2 flex items-center gap-2 rounded-lg px-3 py-2",
                    isStaff ? "bg-white/15" : "bg-white border border-neutral-200",
                  )}
                >
                  <FileTextIcon size={20} className="shrink-0" />
                  <span className="truncate text-sm font-semibold underline">
                    {a.file_name || "Document"}
                  </span>
                </a>
              );
            }
            return (
              <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="block mb-2">
                <Image
                  src={a.url}
                  alt="pièce jointe"
                  width={200}
                  height={200}
                  className="rounded-lg object-cover"
                  unoptimized
                />
              </a>
            );
          })
        )}
        {message.body && (
          <p className="whitespace-pre-wrap text-sm">{message.body}</p>
        )}
        {isStaff && (
          <p className="mt-1 text-right text-[11px] text-white/70">
            {message.read_at ? "✓✓ Lu" : "✓ Envoyé"}
          </p>
        )}
      </div>
    );
  }

  // Cards (centered)
  const slots = (meta.proposed_slots ?? []) as { date: string; time: string }[];
  const scheduledSlot = meta.scheduled_slot as
    | { date: string; time: string }
    | undefined;
  const visitRequestId =
    typeof meta.visit_request_id === "string" ? meta.visit_request_id : null;

  return (
    <div className="mx-auto w-[85%] rounded-xl bg-[#FBF1EA] border border-[#EAD9CC] px-4 py-3 text-center">
      <p className="text-sm font-bold text-neutral-800">
        {cardTitle(message.message_type)}
      </p>

      {message.message_type === "visit_request" && (
        <div className="mt-2 space-y-2">
          {slots.map((s, i) => (
            <button
              key={i}
              onClick={() => visitRequestId && onConfirmVisit(visitRequestId, s)}
              className="block w-full rounded-lg border border-[#C96A2E] py-2 text-sm font-bold text-[#C96A2E] hover:bg-[#C96A2E] hover:text-white transition"
            >
              Confirmer {s.date} · {s.time}
            </button>
          ))}
        </div>
      )}

      {message.message_type === "visit_confirmation" && scheduledSlot && (
        <p className="mt-1 text-sm text-neutral-700">
          {scheduledSlot.date} · {scheduledSlot.time}
        </p>
      )}

      {message.message_type === "mandate_offer" &&
        (typeof meta.desired_price === "number" ? (
          <div className="mt-2 text-sm text-neutral-700 space-y-0.5">
            <p>Prix désiré : {fmtFCFA(meta.desired_price)}</p>
            {typeof meta.base_commission_pct === "number" && (
              <>
                <p>
                  Commission Roogo : {(meta.base_commission_pct * 100).toFixed(1)}
                  % = {fmtFCFA(meta.desired_price * meta.base_commission_pct)}
                </p>
                <p>
                  Minimum vendeur :{" "}
                  {fmtFCFA(meta.desired_price * (1 - meta.base_commission_pct))}
                </p>
              </>
            )}
            {typeof meta.surplus_split_pct === "number" && (
              <p>
                Surplus au-dessus du prix désiré :{" "}
                {(meta.surplus_split_pct * 100).toFixed(0)}% Roogo /{" "}
                {((1 - meta.surplus_split_pct) * 100).toFixed(0)}% vendeur
              </p>
            )}
            <p>Exclusivité : {String(meta.exclusivity_days ?? 90)} jours</p>
          </div>
        ) : (
          // Legacy spread-model card (pre-050 test mandates).
          <div className="mt-2 text-sm text-neutral-700 space-y-0.5">
            <p>Net vendeur : {fmtFCFA(meta.seller_net_price)}</p>
            <p>Prix de vente : {fmtFCFA(meta.list_price)}</p>
            <p>Exclusivité : {String(meta.exclusivity_days ?? 90)} jours</p>
          </div>
        ))}

      {message.message_type === "mandate_signed" && (
        <div className="mt-2 text-sm text-neutral-700 space-y-0.5">
          {typeof meta.desired_price === "number" ? (
            <p>Prix désiré : {fmtFCFA(meta.desired_price)}</p>
          ) : (
            <p>Prix de vente : {fmtFCFA(meta.list_price)}</p>
          )}
          {typeof meta.signed_typed_name === "string" && (
            <p>Signé par : {meta.signed_typed_name}</p>
          )}
        </div>
      )}

      {message.message_type === "notary_meeting" && (
        <div className="mt-2 text-sm text-neutral-700 space-y-0.5">
          {typeof meta.scheduled_at === "string" && (
            <p>{new Date(meta.scheduled_at).toLocaleString("fr-FR")}</p>
          )}
          {typeof meta.location_label === "string" && (
            <p>{meta.location_label}</p>
          )}
        </div>
      )}
    </div>
  );
}

function fmtDuration(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function cardTitle(type: Message["message_type"]) {
  switch (type) {
    case "visit_request":
      return "📅 Demande de visite";
    case "visit_confirmation":
      return "✅ Visite confirmée";
    case "mandate_offer":
      return "📄 Proposition de mandat";
    case "mandate_signed":
      return "✍️ Mandat signé";
    case "notary_meeting":
      return "🏛 Rendez-vous notaire";
    default:
      return "Mise à jour";
  }
}
