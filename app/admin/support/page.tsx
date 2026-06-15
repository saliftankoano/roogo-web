"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  ChatCircleTextIcon,
  PaperPlaneRightIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type ConversationUser = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  user_type: string | null;
  phone?: string | null;
};

type ConversationSummary = {
  id: string;
  status: "open" | "resolved" | "closed";
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_for_staff: number;
  assigned_to_staff_id: string | null;
  user: ConversationUser | null;
};

type Attachment = {
  id: string;
  storage_path: string;
  mime_type: string | null;
  url: string | null;
};

type Message = {
  id: string;
  sender_type: "user" | "staff";
  body: string | null;
  created_at: string;
  attachments?: Attachment[];
};

// Staff inbox polls because the browser Supabase client is anonymous; the mobile
// side uses Realtime. Intervals are gentle (admin-only traffic).
const LIST_POLL_MS = 10000;
const THREAD_POLL_MS = 5000;

function displayName(user: ConversationUser | null) {
  return user?.full_name || user?.email || "Utilisateur Roogo";
}

export default function AdminSupportPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<ConversationUser | null>(
    null,
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const threadRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/support/admin/conversations");
      if (!res.ok) throw new Error("Échec du chargement");
      const data = await res.json();
      setConversations(data.conversations ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }, []);

  const loadThread = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/support/admin/conversation?id=${id}`);
      if (!res.ok) throw new Error("Échec du chargement");
      const data = await res.json();
      setMessages(data.messages ?? []);
      setSelectedUser(data.conversation?.user ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }, []);

  useEffect(() => {
    loadConversations();
    const interval = setInterval(loadConversations, LIST_POLL_MS);
    return () => clearInterval(interval);
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedId) return;
    loadThread(selectedId);
    const interval = setInterval(() => loadThread(selectedId), THREAD_POLL_MS);
    return () => clearInterval(interval);
  }, [selectedId, loadThread]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages]);

  const handleSelect = (conversation: ConversationSummary) => {
    setSelectedId(conversation.id);
    setSelectedUser(conversation.user);
    setMessages([]);
    // Optimistically clear the unread badge.
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversation.id ? { ...c, unread_for_staff: 0 } : c,
      ),
    );
  };

  const handleSend = async () => {
    if (!selectedId || !draft.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/support/admin/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: selectedId, body: draft.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Échec de l'envoi");
      }
      setDraft("");
      await loadThread(selectedId);
      await loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col">
      <h1 className="text-2xl font-bold text-neutral-900 mb-6 flex items-center gap-2">
        <ChatCircleTextIcon size={26} weight="bold" /> Support
      </h1>

      {error && (
        <p className="text-sm text-red-600 mb-4">{error}</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4 h-[70vh]">
        {/* Conversation list */}
        <div className="border border-neutral-200 rounded-2xl overflow-y-auto bg-white">
          {conversations.length === 0 ? (
            <p className="p-6 text-sm text-neutral-500">Aucune conversation.</p>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => handleSelect(c)}
                className={cn(
                  "w-full text-left px-4 py-3 border-b border-neutral-100 hover:bg-neutral-50 transition",
                  selectedId === c.id && "bg-neutral-50",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-neutral-900 truncate">
                    {displayName(c.user)}
                  </span>
                  {c.unread_for_staff > 0 && (
                    <span className="shrink-0 bg-[#C96A2E] text-white text-xs font-bold rounded-full px-2 py-0.5">
                      {c.unread_for_staff}
                    </span>
                  )}
                </div>
                <p className="text-sm text-neutral-500 truncate mt-0.5">
                  {c.last_message_preview || "—"}
                </p>
                <span className="text-[11px] uppercase tracking-wide text-neutral-400">
                  {c.status}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Thread */}
        <div className="border border-neutral-200 rounded-2xl flex flex-col bg-white overflow-hidden">
          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center text-neutral-400 text-sm">
              Sélectionnez une conversation
            </div>
          ) : (
            <>
              <div className="px-5 py-3 border-b border-neutral-100">
                <p className="font-semibold text-neutral-900">
                  {displayName(selectedUser)}
                </p>
                {selectedUser?.email && (
                  <p className="text-xs text-neutral-500">
                    {selectedUser.email}
                  </p>
                )}
              </div>

              <div ref={threadRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {messages.map((m) => {
                  const isStaff = m.sender_type === "staff";
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "max-w-[75%] rounded-2xl px-4 py-2",
                        isStaff
                          ? "ml-auto bg-[#C96A2E] text-white"
                          : "mr-auto bg-neutral-100 text-neutral-900",
                      )}
                    >
                      {(m.attachments ?? []).map((a) =>
                        a.url ? (
                          <a
                            key={a.id}
                            href={a.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block mb-2"
                          >
                            <Image
                              src={a.url}
                              alt="pièce jointe"
                              width={220}
                              height={220}
                              className="rounded-lg object-cover"
                              unoptimized
                            />
                          </a>
                        ) : null,
                      )}
                      {m.body && (
                        <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                      )}
                    </div>
                  );
                })}
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
