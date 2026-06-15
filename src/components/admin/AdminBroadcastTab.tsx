"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { Mail, Sparkles, Send, Loader2, Users, Eye, Code, RefreshCw } from "lucide-react";

interface Category { key: string; label: string; emails: string[]; count: number }

export function AdminBroadcastTab() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [exclude, setExclude] = useState("");
  const [loadingRecipients, setLoadingRecipients] = useState(true);

  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; total: number } | null>(null);

  const loadRecipients = useCallback(async () => {
    setLoadingRecipients(true);
    try {
      const r = await fetch("/api/admin/bulk-email/recipients");
      const d = await r.json();
      if (d.success) setCategories(d.categories);
      else toast.error(d.error ?? "Failed to load recipients");
    } catch { toast.error("Network error loading recipients"); } finally { setLoadingRecipients(false); }
  }, []);
  useEffect(() => { loadRecipients(); }, [loadRecipients]);

  const excludeSet = useMemo(
    () => new Set(exclude.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean)),
    [exclude]
  );

  const recipients = useMemo(() => {
    const set = new Set<string>();
    for (const c of categories) {
      if (selected[c.key]) c.emails.forEach((e) => set.add(e));
    }
    excludeSet.forEach((e) => set.delete(e));
    return Array.from(set);
  }, [categories, selected, excludeSet]);

  async function generate() {
    if (prompt.trim().length < 3 || generating) return;
    setGenerating(true);
    try {
      const audience = categories.filter((c) => selected[c.key]).map((c) => c.label).join(", ");
      const res = await fetch("/api/admin/bulk-email/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), audience: audience || undefined }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) { toast.error(d.error ?? "Generation failed"); return; }
      setSubject(d.subject); setBody(d.html); setPreview(true);
      toast.success("Draft ready — review and edit below");
    } catch { toast.error("Network error"); } finally { setGenerating(false); }
  }

  async function send() {
    if (!subject.trim() || !body.trim()) { toast.error("Add a subject and body first."); return; }
    if (recipients.length === 0) { toast.error("Select at least one recipient category."); return; }
    if (!window.confirm(`Send "${subject}" to ${recipients.length} recipient(s)?`)) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/bulk-email/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), html: body, emails: recipients }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) { toast.error(d.error ?? "Send failed"); return; }
      setResult({ sent: d.sent, failed: d.failed, total: d.total });
      toast.success(`Sent to ${d.sent} recipient(s)`);
    } catch { toast.error("Network error"); } finally { setSending(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Bulk Email</h2>
          <p className="text-xs text-slate-400 mt-0.5">Compose with AI and broadcast on the Poveon template.</p>
        </div>
        <button onClick={loadRecipients} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/8 transition" title="Refresh recipients">
          <RefreshCw className={`w-4 h-4 ${loadingRecipients ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Recipients */}
      <div className="rounded-2xl border border-white/8 bg-white/3 p-4 space-y-3">
        <p className="text-sm font-semibold text-white flex items-center gap-2"><Users className="w-4 h-4 text-slate-400" /> Recipients</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {categories.map((c) => (
            <button key={c.key} onClick={() => setSelected((s) => ({ ...s, [c.key]: !s[c.key] }))}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition ${
                selected[c.key] ? "border-medical-500/40 bg-medical-500/15" : "border-white/10 bg-white/5 hover:bg-white/8"
              }`}>
              <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${selected[c.key] ? "bg-medical-500 border-medical-500" : "border-white/20"}`}>
                {selected[c.key] && <span className="w-2 h-2 bg-white rounded-sm" />}
              </span>
              <span className="text-sm text-white flex-1 min-w-0 truncate">{c.label}</span>
              <span className="text-[11px] text-slate-400 shrink-0">{c.count}</span>
            </button>
          ))}
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wide text-slate-500">Exclude addresses (optional)</label>
          <textarea value={exclude} onChange={(e) => setExclude(e.target.value)} rows={2}
            placeholder="comma or newline separated emails to omit"
            className="w-full mt-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-medical-500 transition resize-y" />
        </div>
        <p className="text-xs text-slate-400">
          <span className="text-white font-bold">{recipients.length}</span> unique recipient(s) selected
        </p>
      </div>

      {/* AI compose */}
      <div className="rounded-2xl border border-white/8 bg-white/3 p-4 space-y-3">
        <p className="text-sm font-semibold text-white flex items-center gap-2"><Sparkles className="w-4 h-4 text-medical-300" /> Write with AI</p>
        <div className="flex items-end gap-2">
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2}
            placeholder="e.g. Announce that doctors can now charge per consultation and share a link — encourage them to set their price."
            className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-medical-500 transition resize-y" />
          <button onClick={generate} disabled={prompt.trim().length < 3 || generating}
            className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-medical-600 hover:bg-medical-500 disabled:opacity-40 text-white text-sm font-semibold transition">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate
          </button>
        </div>
      </div>

      {/* Editor + preview */}
      <div className="rounded-2xl border border-white/8 bg-white/3 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-white">Message</p>
          <div className="flex gap-1 bg-white/5 p-1 rounded-lg">
            <button onClick={() => setPreview(true)} className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1 ${preview ? "bg-white/15 text-white" : "text-slate-400"}`}><Eye className="w-3 h-3" /> Preview</button>
            <button onClick={() => setPreview(false)} className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1 ${!preview ? "bg-white/15 text-white" : "text-slate-400"}`}><Code className="w-3 h-3" /> HTML</button>
          </div>
        </div>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject line"
          className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-medical-500 transition" />
        {preview ? (
          <div className="rounded-xl bg-white p-4 max-h-[420px] overflow-y-auto">
            {body
              ? <div dangerouslySetInnerHTML={{ __html: body }} />
              : <p className="text-sm text-slate-400 text-center py-8">Generate or write a message to preview it.</p>}
          </div>
        ) : (
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12}
            placeholder="<p>Your email body HTML…</p>"
            className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-medical-500 transition resize-y" />
        )}
      </div>

      {result && (
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Sent to {result.sent} of {result.total}{result.failed ? ` · ${result.failed} failed` : ""}.
        </div>
      )}

      <button onClick={send} disabled={sending || recipients.length === 0 || !subject.trim() || !body.trim()}
        className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-medical-600 hover:bg-medical-500 disabled:opacity-40 text-white font-bold text-sm transition">
        {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        {sending ? "Sending…" : `Send to ${recipients.length} recipient(s)`}
      </button>
      <p className="text-[11px] text-slate-500 text-center flex items-center justify-center gap-1.5">
        <Mail className="w-3 h-3" /> Each recipient gets an individual email on the Poveon template.
      </p>
    </div>
  );
}
