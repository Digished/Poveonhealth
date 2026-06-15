"use client";

import { useState } from "react";
import { toast } from "react-hot-toast";
import { MessageCircle, X, Send, Loader2, Check } from "lucide-react";

type Category = "question" | "feedback" | "issue";

/**
 * Floating help button for the doctor & patient dashboards. Messages are routed
 * to the configurable support email (admin Settings → support_email).
 */
export function SupportFab() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>("question");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    const text = message.trim();
    if (text.length < 3 || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/support/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, category }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) { toast.error(d.error ?? "Couldn't send. Please try again."); return; }
      setSent(true);
      setMessage("");
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  }

  function close() {
    setOpen(false);
    setTimeout(() => setSent(false), 250);
  }

  return (
    <>
      {/* Panel */}
      {open && (
        <div className="fixed bottom-24 right-4 sm:right-6 z-[160] w-[calc(100vw-2rem)] sm:w-80 bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden animate-slide-up">
          <div className="bg-gradient-to-br from-medical-600 to-medical-800 px-5 py-4 text-white flex items-center justify-between">
            <div>
              <p className="text-sm font-bold">Need help?</p>
              <p className="text-[11px] text-white/80">Ask a question or share feedback</p>
            </div>
            <button onClick={close} className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>

          {sent ? (
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                <Check className="w-6 h-6 text-emerald-600" />
              </div>
              <p className="text-sm font-bold text-slate-800">Message sent</p>
              <p className="text-xs text-slate-500 mt-1">Our team will get back to you shortly.</p>
              <button onClick={close} className="mt-4 text-xs font-semibold text-medical-600 hover:text-medical-700">Done</button>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              <div className="flex gap-1.5">
                {([["question", "Question"], ["feedback", "Feedback"], ["issue", "Issue"]] as const).map(([key, label]) => (
                  <button key={key} onClick={() => setCategory(key)}
                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold border transition ${
                      category === key ? "bg-medical-600 border-medical-600 text-white" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                    }`}>{label}</button>
                ))}
              </div>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4}
                placeholder="How can we help?"
                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-400 transition" />
              <button onClick={submit} disabled={message.trim().length < 3 || sending}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-medical-600 hover:bg-medical-700 disabled:opacity-40 text-white text-sm font-bold transition">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? "Sending…" : "Send message"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Floating button */}
      <button onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-4 sm:right-6 z-[160] w-14 h-14 rounded-2xl bg-gradient-to-br from-medical-600 to-medical-800 text-white shadow-xl shadow-medical-600/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        aria-label="Help and feedback">
        {open ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
      </button>
    </>
  );
}
