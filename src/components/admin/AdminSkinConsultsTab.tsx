"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import {
  RefreshCw, Search, X, Stethoscope, MessageCircle, Mail, Save, ExternalLink,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type SkinStatus = "new" | "in_review" | "responded" | "closed";

interface SkinConsultMessage {
  role: "assistant" | "user";
  content: string;
}

interface SkinConsult {
  id: string;
  code: string;
  patient_name: string;
  patient_email: string;
  patient_whatsapp: string;
  patient_age: number | null;
  patient_sex: string | null;
  image_urls: string[];
  conversation: SkinConsultMessage[];
  ai_summary: string | null;
  status: SkinStatus;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  responded_at: string | null;
}

type StatusCounts = Partial<Record<SkinStatus, number>>;

// ─────────────────────────────────────────────────────────────────────────────
// Status helpers
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_META: Record<SkinStatus, { label: string; pill: string }> = {
  new:       { label: "New",        pill: "bg-blue-500/15 text-blue-300 border-blue-500/25" },
  in_review: { label: "In review",  pill: "bg-amber-500/15 text-amber-300 border-amber-500/25" },
  responded: { label: "Responded",  pill: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25" },
  closed:    { label: "Closed",     pill: "bg-slate-500/15 text-slate-300 border-slate-500/25" },
};

const STATUS_ORDER: SkinStatus[] = ["new", "in_review", "responded", "closed"];

const FILTERS: { key: "all" | SkinStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "in_review", label: "In review" },
  { key: "responded", label: "Responded" },
  { key: "closed", label: "Closed" },
];

function waLink(whatsapp: string | null | undefined): string | null {
  if (!whatsapp) return null;
  const digits = whatsapp.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

function relTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

function StatusPill({ status }: { status: SkinStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`text-[10px] font-medium border rounded-full px-2 py-0.5 shrink-0 ${meta.pill}`}>
      {meta.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main tab
// ─────────────────────────────────────────────────────────────────────────────
export function AdminSkinConsultsTab() {
  const [consults, setConsults] = useState<SkinConsult[]>([]);
  const [counts, setCounts] = useState<StatusCounts>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | SkinStatus>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  // Debounce search input
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("status", filter);
      if (search) params.set("q", search);
      const res = await fetch(`/api/admin/skin?${params.toString()}`);
      const d = await res.json();
      if (res.ok && d.success) {
        setConsults(d.consults ?? []);
        setCounts(d.counts ?? {});
      } else {
        setError(d.error ?? "Failed to load consults");
      }
    } catch {
      setError("Network error while loading consults");
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => { load(); }, [load]);

  // Keep the active consult in sync after refreshes
  const activeConsult = useMemo(
    () => consults.find((c) => c.id === activeId) ?? null,
    [consults, activeId]
  );

  // Apply a patched consult locally and refresh counts via reload
  const handlePatched = useCallback((updated: SkinConsult) => {
    setConsults((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    // Reload to refresh status counts and respect the active filter
    load();
  }, [load]);

  const totalAll = STATUS_ORDER.reduce((sum, s) => sum + (counts[s] ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-white">Skin Consults</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Async dermatology consultations
            {!loading && ` · ${consults.length} shown`}
          </p>
        </div>
        <button
          onClick={load}
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/8 transition"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Status filter pills */}
      <div className="flex gap-1 bg-white/5 p-1 rounded-xl w-fit max-w-full overflow-x-auto">
        {FILTERS.map((f) => {
          const count = f.key === "all" ? totalAll : (counts[f.key] ?? 0);
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
                active ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              {f.label}
              <span className={`text-[10px] rounded-full px-1.5 ${active ? "bg-white/15 text-white" : "bg-white/5 text-slate-500"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by code, name, email, or WhatsApp…"
          className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-medical-500 transition"
        />
        {searchInput && (
          <button
            onClick={() => setSearchInput("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Body */}
      {loading ? (
        <SkeletonList />
      ) : error ? (
        <div className="text-center py-12 text-slate-400">
          <Stethoscope className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">{error}</p>
          <button onClick={load} className="mt-3 text-xs text-medical-400 hover:underline">
            Try again
          </button>
        </div>
      ) : consults.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <Stethoscope className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No skin consults found</p>
          {(filter !== "all" || search) && (
            <p className="text-xs text-slate-600 mt-1">Try adjusting the filter or search.</p>
          )}
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {consults.map((c) => (
            <ConsultCard key={c.id} consult={c} onOpen={() => setActiveId(c.id)} />
          ))}
        </div>
      )}

      {/* Detail modal */}
      {activeConsult && (
        <ConsultDetailModal
          consult={activeConsult}
          onClose={() => setActiveId(null)}
          onPatched={handlePatched}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeletons
// ─────────────────────────────────────────────────────────────────────────────
function SkeletonList() {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-white/8 bg-white/3 p-4 animate-pulse">
          <div className="flex gap-3">
            <div className="w-14 h-14 rounded-xl bg-white/8 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-24 bg-white/8 rounded" />
              <div className="h-3 w-32 bg-white/6 rounded" />
              <div className="h-3 w-20 bg-white/5 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Consult card
// ─────────────────────────────────────────────────────────────────────────────
function ConsultCard({ consult, onOpen }: { consult: SkinConsult; onOpen: () => void }) {
  const thumb = consult.image_urls?.[0] ?? null;
  const wa = waLink(consult.patient_whatsapp);
  const meta = [
    consult.patient_age != null ? `${consult.patient_age}y` : null,
    consult.patient_sex || null,
  ].filter(Boolean).join(" · ");

  return (
    <button
      onClick={onOpen}
      className="text-left rounded-2xl border border-white/8 bg-white/3 hover:bg-white/5 transition-colors p-4 w-full"
    >
      <div className="flex gap-3">
        {/* Thumbnail */}
        <div className="w-14 h-14 rounded-xl bg-white/8 overflow-hidden shrink-0 flex items-center justify-center">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="w-full h-full object-cover" />
          ) : (
            <Stethoscope className="w-5 h-5 text-slate-500" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-slate-400">{consult.code}</span>
            <StatusPill status={consult.status} />
          </div>
          <p className="text-sm font-semibold text-white truncate mt-1">
            {consult.patient_name || <span className="text-slate-500 font-normal italic">No name</span>}
          </p>
          {meta && <p className="text-[11px] text-slate-500">{meta}</p>}
          <p className="text-[10px] text-slate-600 mt-1">{relTime(consult.created_at)}</p>
        </div>

        {/* WhatsApp quick action */}
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="self-start p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition shrink-0"
            title="Open WhatsApp"
          >
            <MessageCircle className="w-4 h-4" />
          </a>
        )}
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail modal
// ─────────────────────────────────────────────────────────────────────────────
function ConsultDetailModal({
  consult,
  onClose,
  onPatched,
}: {
  consult: SkinConsult;
  onClose: () => void;
  onPatched: (updated: SkinConsult) => void;
}) {
  const [note, setNote] = useState(consult.admin_note ?? "");
  const [savingNote, setSavingNote] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Reset local note when switching to a different consult
  useEffect(() => { setNote(consult.admin_note ?? ""); }, [consult.id, consult.admin_note]);

  const wa = waLink(consult.patient_whatsapp);

  async function patch(body: { status?: SkinStatus; admin_note?: string }): Promise<SkinConsult | null> {
    const res = await fetch(`/api/admin/skin/${consult.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    if (res.ok && d.success) return d.consult as SkinConsult;
    toast.error(d.error ?? "Update failed");
    return null;
  }

  async function handleStatusChange(status: SkinStatus) {
    if (status === consult.status) return;
    setUpdatingStatus(true);
    try {
      const updated = await patch({ status });
      if (updated) {
        toast.success(`Marked as ${STATUS_META[status].label}`);
        onPatched(updated);
      }
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleSaveNote() {
    setSavingNote(true);
    try {
      const updated = await patch({ admin_note: note });
      if (updated) {
        toast.success("Note saved");
        onPatched(updated);
      }
    } finally {
      setSavingNote(false);
    }
  }

  const noteDirty = (note ?? "") !== (consult.admin_note ?? "");

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full sm:max-w-2xl bg-slate-900 border border-white/10 sm:rounded-3xl rounded-t-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[90vh] animate-slide-up">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-white/8 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-mono text-slate-400">{consult.code}</span>
              <StatusPill status={consult.status} />
            </div>
            <h3 className="text-base font-bold text-white truncate mt-0.5">
              {consult.patient_name || "Unnamed patient"}
            </h3>
            <p className="text-[11px] text-slate-500">{relTime(consult.created_at)}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/8 transition shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {/* Patient details */}
          <section className="space-y-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Detail label="Age" value={consult.patient_age != null ? `${consult.patient_age}` : "—"} />
              <Detail label="Sex" value={consult.patient_sex || "—"} />
            </div>
            <div className="flex flex-wrap gap-2">
              {consult.patient_email && (
                <a
                  href={`mailto:${consult.patient_email}`}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-slate-200 hover:bg-white/8 transition"
                >
                  <Mail className="w-3.5 h-3.5" />
                  {consult.patient_email}
                </a>
              )}
              {wa && (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 transition font-medium"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  WhatsApp
                </a>
              )}
            </div>
          </section>

          {/* Photos */}
          {consult.image_urls?.length > 0 && (
            <section>
              <h4 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Photos</h4>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {consult.image_urls.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative aspect-square rounded-xl overflow-hidden bg-white/8 group"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                    <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center">
                      <ExternalLink className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition" />
                    </span>
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* AI summary */}
          {consult.ai_summary && (
            <section>
              <h4 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">AI Intake Summary</h4>
              <div className="rounded-xl bg-medical-500/10 border border-medical-500/20 p-3 text-sm text-slate-200 whitespace-pre-wrap">
                {consult.ai_summary}
              </div>
            </section>
          )}

          {/* Conversation transcript */}
          {consult.conversation?.length > 0 && (
            <section>
              <h4 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Conversation</h4>
              <div className="space-y-2">
                {consult.conversation.map((m, i) => {
                  const isPatient = m.role === "user";
                  return (
                    <div key={i} className={`flex ${isPatient ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                          isPatient
                            ? "bg-medical-600/30 border border-medical-500/30 text-white rounded-br-sm"
                            : "bg-white/8 border border-white/10 text-slate-200 rounded-bl-sm"
                        }`}
                      >
                        <span className="block text-[10px] uppercase tracking-wide opacity-60 mb-0.5">
                          {isPatient ? "Patient" : "Assistant"}
                        </span>
                        {m.content}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Status selector */}
          <section>
            <h4 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Status</h4>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_ORDER.map((s) => {
                const active = consult.status === s;
                return (
                  <button
                    key={s}
                    disabled={updatingStatus}
                    onClick={() => handleStatusChange(s)}
                    className={`text-xs font-medium border rounded-xl px-3 py-1.5 transition disabled:opacity-60 ${
                      active
                        ? STATUS_META[s].pill
                        : "bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/8"
                    }`}
                  >
                    {STATUS_META[s].label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Internal note */}
          <section>
            <h4 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Internal Note</h4>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Add an internal note (only visible to admins)…"
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-medical-500 transition resize-y"
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={handleSaveNote}
                disabled={savingNote || !noteDirty}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl bg-medical-600 text-white hover:bg-medical-500 transition disabled:opacity-50"
              >
                {savingNote ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save note
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/4 border border-white/8 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm text-white">{value}</p>
    </div>
  );
}
