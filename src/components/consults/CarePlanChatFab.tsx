"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowLeft, ImagePlus, Loader2, MessageSquareText, Send, UserRound, X,
} from "lucide-react";

/**
 * The care-plan conversation, wherever you are in the dashboard.
 *
 * Patients have one doctor, so their button opens straight into the thread.
 * Doctors have many members, so theirs opens a list first — and only of the
 * conversations that are actually live: anyone unanswered, plus anyone they
 * answered in the last day. A thread they have dealt with leaves the button
 * and lives on in the member's record.
 */

type Message = {
  id: string;
  sender: string;
  body: string;
  has_image?: boolean;
  created_at: string;
};

type Thread = {
  id: string;
  full_name: string;
  code: string | null;
  unread: number;
  last: { sender: string; preview: string; has_image: boolean; created_at: string };
};

const POLL_MS = 60_000;

function formatWhen(iso: string) {
  const then = new Date(iso);
  const mins = Math.round((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)}h ago`;
  return then.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function CarePlanChatFab({
  role,
  enabled = true,
  onOpenMember,
}: {
  role: "patient" | "doctor";
  /** Patients who haven't joined yet have nothing to chat about. */
  enabled?: boolean;
  /** Doctors jump from a conversation to that member's record. */
  onOpenMember?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [unread, setUnread] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeName, setActiveName] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLeft, setMessagesLeft] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  // ── Badge: how much is waiting, whether or not the panel is open ──────────
  const refreshBadge = useCallback(async () => {
    if (!enabled) return;
    try {
      if (role === "doctor") {
        const res = await fetch("/api/doc-login/consults/threads", { cache: "no-store" });
        const d = await res.json();
        if (d.success) {
          setThreads(d.threads);
          setUnread(d.unread_total);
        }
      }
    } catch {
      /* a badge is not worth an error message */
    }
  }, [enabled, role]);

  useEffect(() => {
    void refreshBadge();
    const t = setInterval(refreshBadge, POLL_MS);
    return () => clearInterval(t);
  }, [refreshBadge]);

  // ── The thread itself ────────────────────────────────────────────────────
  const loadThread = useCallback(
    async (id: string | null) => {
      setLoading(true);
      setError("");
      try {
        const url =
          role === "patient" ? "/api/consults/messages" : `/api/doc-login/consults/patients/${id}/messages`;
        const res = await fetch(url, { cache: "no-store" });
        const d = await res.json();
        if (!res.ok || !d.success) {
          setError(d.error ?? "Could not open that conversation.");
          return;
        }
        setMessages(d.messages ?? []);
        if (role === "patient") {
          setMessagesLeft(d.messages_left ?? null);
          setActiveName(d.doctor?.name || "Your doctor");
        } else {
          setActiveName(d.patient?.full_name ?? "");
        }
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [role]
  );

  function openPanel() {
    setOpen(true);
    if (role === "patient") {
      setActiveId("me");
      void loadThread(null);
    } else {
      void refreshBadge();
    }
  }

  function closePanel() {
    setOpen(false);
    setActiveId(null);
    setMessages([]);
    setBody("");
    setFile(null);
    setError("");
  }

  useEffect(() => {
    if (open && activeId) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, open, activeId]);

  async function send() {
    const text = body.trim();
    if (sending || (!text && !file)) return;
    setSending(true);
    setError("");
    try {
      const url =
        role === "patient" ? "/api/consults/messages" : `/api/doc-login/consults/patients/${activeId}/messages`;

      let res: Response;
      if (file) {
        const form = new FormData();
        form.append("body", text);
        form.append("file", file);
        res = await fetch(url, { method: "POST", body: form });
      } else {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: text }),
        });
      }

      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) {
        setError(d?.error ?? "Could not send that.");
        return;
      }
      setMessages((prev) => [...prev, d.message]);
      setBody("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      if (typeof d.messages_left === "number") setMessagesLeft(d.messages_left);
      if (role === "doctor") void refreshBadge();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (!enabled) return null;

  const showList = role === "doctor" && !activeId;

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-4 z-[160] flex h-[min(78vh,560px)] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl animate-slide-up sm:right-6 sm:w-96">
          {/* Header */}
          <div className="flex items-center gap-2 bg-gradient-to-br from-medical-600 to-medical-800 px-4 py-3 text-white">
            {role === "doctor" && activeId && (
              <button
                onClick={() => {
                  setActiveId(null);
                  setMessages([]);
                  void refreshBadge();
                }}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25"
                aria-label="Back to conversations"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">
                {showList ? "Care plan messages" : activeName || "Your doctor"}
              </p>
              <p className="truncate text-[11px] text-white/80">
                {showList
                  ? threads.length
                    ? `${threads.length} live conversation${threads.length === 1 ? "" : "s"}`
                    : "Nothing waiting"
                  : role === "patient" && messagesLeft != null
                    ? `${messagesLeft} message${messagesLeft === 1 ? "" : "s"} left this year`
                    : "Replies clear the thread from your list"}
              </p>
            </div>
            {role === "doctor" && activeId && onOpenMember && (
              <button
                onClick={() => {
                  onOpenMember(activeId);
                  closePanel();
                }}
                className="flex h-7 items-center gap-1 rounded-full bg-white/15 px-2.5 text-[11px] font-semibold transition hover:bg-white/25"
              >
                <UserRound className="h-3.5 w-3.5" /> Profile
              </button>
            )}
            <button
              onClick={closePanel}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          {showList ? (
            <div className="flex-1 overflow-y-auto">
              {threads.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">
                  <MessageSquareText className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                  No one is waiting on you. New messages appear here, and a thread drops off a day
                  after you reply.
                </div>
              ) : (
                threads.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setActiveId(t.id);
                      setActiveName(t.full_name);
                      void loadThread(t.id);
                    }}
                    className="flex w-full items-center gap-3 border-b border-slate-50 px-4 py-3 text-left transition hover:bg-slate-50"
                  >
                    <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-medical-50 text-sm font-bold text-medical-600">
                      {t.full_name.slice(0, 1).toUpperCase()}
                      {t.unread > 0 && (
                        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                          {t.unread}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-slate-800">{t.full_name}</p>
                        <span className="shrink-0 text-[10px] text-slate-400">
                          {formatWhen(t.last.created_at)}
                        </span>
                      </div>
                      <p className="truncate text-xs text-slate-500">
                        {t.last.sender === "doctor" ? "You: " : ""}
                        {t.last.preview}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-4">
                {loading ? (
                  <div className="flex h-full items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
                  </div>
                ) : messages.length === 0 ? (
                  <p className="pt-8 text-center text-sm text-slate-400">
                    {role === "patient"
                      ? "Ask your doctor anything about your plan."
                      : "No messages yet."}
                  </p>
                ) : (
                  messages.map((m) => {
                    const mine = role === "patient" ? m.sender === "patient" : m.sender === "doctor";
                    return (
                      <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                            mine
                              ? "rounded-br-sm bg-medical-600 text-white"
                              : "rounded-bl-sm bg-white text-slate-700 shadow-sm"
                          }`}
                        >
                          {m.has_image && (
                            <a
                              href={`/api/consults/chat-image?id=${m.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="mb-1.5 block overflow-hidden rounded-xl"
                            >
                              {/* Signed and short-lived, so it is loaded unoptimised. */}
                              <Image
                                src={`/api/consults/chat-image?id=${m.id}`}
                                alt="Attached photo"
                                width={260}
                                height={200}
                                unoptimized
                                className="h-auto w-full max-w-[240px] object-cover"
                              />
                            </a>
                          )}
                          {m.body && <p className="whitespace-pre-wrap">{m.body}</p>}
                          <p className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-slate-400"}`}>
                            {formatWhen(m.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={endRef} />
              </div>

              <div className="border-t border-slate-100 bg-white p-3">
                {error && <p className="mb-2 text-xs font-medium text-red-600">{error}</p>}
                {file && (
                  <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
                    <span className="truncate text-xs text-slate-600">{file.name}</span>
                    <button
                      onClick={() => {
                        setFile(null);
                        if (fileRef.current) fileRef.current.value = "";
                      }}
                      className="text-slate-400 transition hover:text-slate-600"
                      aria-label="Remove photo"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-medical-600"
                    aria-label="Attach a photo"
                  >
                    <ImagePlus className="h-5 w-5" />
                  </button>
                  <textarea
                    rows={1}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                    placeholder={role === "patient" ? "Write to your doctor…" : "Write a reply…"}
                    className="max-h-24 flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-medical-400"
                  />
                  <button
                    onClick={send}
                    disabled={sending || (!body.trim() && !file)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-medical-600 text-white transition hover:bg-medical-700 disabled:opacity-40"
                    aria-label="Send"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* The button itself — sticky bottom-right on every screen size. */}
      <button
        onClick={() => (open ? closePanel() : openPanel())}
        className="fixed bottom-6 right-4 z-[160] flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-medical-600 to-medical-800 text-white shadow-xl transition hover:scale-105 active:scale-95 sm:right-6"
        aria-label={open ? "Close messages" : "Open messages"}
      >
        {open ? <X className="h-6 w-6" /> : <MessageSquareText className="h-6 w-6" />}
        {!open && unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white ring-2 ring-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    </>
  );
}
