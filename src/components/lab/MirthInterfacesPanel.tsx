"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plug, RefreshCw, Save, Send, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";

interface MirthConfig { enabled: boolean; url: string; has_token: boolean }
interface HL7Msg {
  id: string;
  request_id: string | null;
  result_id: string | null;
  direction: string;
  message_type: string;
  control_id: string;
  status: string;
  ack_text: string | null;
  attempts: number;
  created_at: string;
}

const inputCls = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-medical-400 focus:outline-none";

function statusBadge(status: string): string {
  switch (status) {
    case "ack": return "bg-emerald-500/15 text-emerald-300";
    case "sent": return "bg-sky-500/15 text-sky-300";
    case "error": return "bg-red-500/15 text-red-300";
    default: return "bg-white/10 text-slate-300";
  }
}

function fmt(iso: string): string {
  try { return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

export function MirthInterfacesPanel({ canManage }: { canManage: boolean }) {
  const [cfg, setCfg] = useState<MirthConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [tokenDirty, setTokenDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [messages, setMessages] = useState<HL7Msg[]>([]);
  const [logLoading, setLogLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);

  const loadCfg = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/lab/mirth", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data: MirthConfig = await res.json();
      setCfg(data); setEnabled(data.enabled); setUrl(data.url); setToken(""); setTokenDirty(false);
    } catch {
      toast.error("Failed to load Mirth config");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLog = useCallback(async () => {
    setLogLoading(true);
    try {
      const res = await fetch("/api/lab/hl7", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch {
      /* log is best-effort */
    } finally {
      setLogLoading(false);
    }
  }, []);

  useEffect(() => { loadCfg(); loadLog(); }, [loadCfg, loadLog]);

  async function save() {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { enabled, url };
      if (tokenDirty) payload.token = token; // only send when changed
      const res = await fetch("/api/lab/mirth", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setCfg(data); setEnabled(data.enabled); setUrl(data.url); setToken(""); setTokenDirty(false);
      toast.success("Mirth settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function resend(id: string) {
    setResending(id);
    try {
      const res = await fetch(`/api/lab/hl7/${id}/resend`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Resend failed");
      toast.success(data.status === "ack" ? "Delivered" : `Status: ${data.status}`);
      await loadLog();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Resend failed");
    } finally {
      setResending(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold text-white"><Plug className="h-4 w-4 text-medical-300" /> Mirth Connect (HL7)</p>
        <p className="mt-1 text-xs text-slate-400">Push reported results to your Mirth (NextGen Connect) channel as HL7 ORU messages. Enter the HTTP Listener URL your channel exposes; Mirth handles delivery to analyzers / EMRs on your network.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-medical-400" /></div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input type="checkbox" checked={enabled} disabled={!canManage} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 rounded border-white/20 bg-white/5" />
            Enable Mirth integration
          </label>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Mirth HTTP Listener URL</label>
            <input className={inputCls} placeholder="https://mirth.yourlab.com:8443/results" value={url} disabled={!canManage} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Bearer token (optional)</label>
            <input className={inputCls} type="password" placeholder={cfg?.has_token ? "•••••••• (leave blank to keep)" : "Sent as Authorization: Bearer …"} value={token} disabled={!canManage} onChange={(e) => { setToken(e.target.value); setTokenDirty(true); }} />
          </div>
          {canManage && (
            <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-medical-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-medical-700 disabled:opacity-50">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save settings
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Message log</p>
        <button onClick={loadLog} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/5"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
      </div>

      {logLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-medical-400" /></div>
      ) : messages.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-white/5 py-6 text-center text-sm text-slate-400">No HL7 messages yet. Reported results will appear here once Mirth is enabled.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10">
          {messages.map((m) => (
            <div key={m.id} className="border-b border-white/5 last:border-b-0">
              <div className="flex items-center gap-2 px-3 py-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadge(m.status)}`}>{m.status}</span>
                <span className="text-xs text-slate-300">{m.message_type}</span>
                <span className="hidden font-mono text-[10px] text-slate-500 sm:inline">{m.control_id}</span>
                <span className="ml-auto text-[11px] text-slate-500">{fmt(m.created_at)}</span>
                {m.attempts > 1 && <span className="text-[10px] text-slate-500">×{m.attempts}</span>}
                {m.ack_text && (
                  <button onClick={() => setExpanded(expanded === m.id ? null : m.id)} className="rounded p-1 text-slate-400 hover:bg-white/5" title="Show response">
                    <ChevronDown className={`h-3.5 w-3.5 transition ${expanded === m.id ? "rotate-180" : ""}`} />
                  </button>
                )}
                {canManage && m.direction === "outbound" && (
                  <button onClick={() => resend(m.id)} disabled={resending === m.id} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-medical-300 hover:bg-white/5 disabled:opacity-50">
                    {resending === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Resend
                  </button>
                )}
              </div>
              {expanded === m.id && m.ack_text && (
                <pre className="max-h-40 overflow-auto border-t border-white/5 bg-black/30 px-3 py-2 text-[11px] text-slate-300 whitespace-pre-wrap break-words">{m.ack_text}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
