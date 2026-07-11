"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search, FlaskConical, FileText, Send, ChevronRight, RefreshCw } from "lucide-react";
import { requestDepartments } from "@/lib/lims-shared";
import { ResultComposer } from "@/components/lab/ResultComposer";

interface PendingResult { id: string; department: string | null; status: string; template_id: string | null; kind: string; updated_at: string }
interface PendingReq {
  id: string;
  code: string;
  status: string;
  current_stage: string | null;
  patient_name: string | null;
  patient_phone: string | null;
  patient_email: string | null;
  patient_age: number | null;
  sex: string | null;
  doctor_name: string | null;
  tests: string;
  test_breakdown: unknown;
  created_at: string;
  results: PendingResult[];
}

type DeptStatus = "none" | "draft" | "verified" | "reported";

const STATUS_META: Record<DeptStatus, { label: string; cls: string }> = {
  none: { label: "Awaiting", cls: "bg-amber-500/15 text-amber-300" },
  draft: { label: "Draft", cls: "bg-sky-500/15 text-sky-300" },
  verified: { label: "Verified", cls: "bg-violet-500/15 text-violet-300" },
  reported: { label: "Sent", cls: "bg-emerald-500/15 text-emerald-300" },
};

function fmtAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function ResultsHub({ canSendResults, memberDepartment }: { canSendResults: boolean; memberDepartment?: string | null }) {
  const [requests, setRequests] = useState<PendingReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "awaiting" | "in_progress">("all");
  const [composerReq, setComposerReq] = useState<PendingReq | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/lab/results/pending", { cache: "no-store" });
      const data = await res.json();
      setRequests(Array.isArray(data.requests) ? data.requests : []);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Per-request derived department worklist.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return requests
      .map((r) => {
        const depts = requestDepartments(r.test_breakdown)
          .map((d) => d.department)
          .filter((d) => !memberDepartment || d === memberDepartment);
        const items = depts.map((dept) => {
          const result = r.results.find((x) => (x.department ?? "") === dept) ?? r.results.find((x) => !x.department);
          const status: DeptStatus = !result ? "none" : (result.status === "reported" ? "reported" : result.status === "verified" ? "verified" : "draft");
          return { dept, status, resultId: result?.id ?? null };
        });
        return { req: r, items };
      })
      .filter(({ req, items }) => {
        if (items.length === 0) return false;
        if (q) {
          const hay = `${req.patient_name ?? ""} ${req.code} ${req.patient_phone ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (filter === "awaiting") return items.some((i) => i.status === "none");
        if (filter === "in_progress") return items.some((i) => i.status === "draft" || i.status === "verified");
        return true;
      });
  }, [requests, query, filter, memberDepartment]);

  const awaitingCount = useMemo(
    () => rows.filter(({ items }) => items.some((i) => i.status === "none")).length,
    [rows],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white"><FlaskConical className="h-5 w-5 text-medical-300" /> Results</h2>
          <p className="mt-1 text-sm text-slate-400">Enter, verify and send results for clients whose specimens are collected. {awaitingCount > 0 && <span className="text-amber-300">{awaitingCount} awaiting entry.</span>}</p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-slate-500" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, code or phone…" className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none" />
        </div>
        <div className="inline-flex overflow-hidden rounded-lg border border-white/10">
          {([["all", "All"], ["awaiting", "Awaiting"], ["in_progress", "In progress"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 text-xs font-medium ${filter === k ? "bg-medical-600 text-white" : "text-slate-300 hover:bg-white/5"}`}>{label}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-medical-400" /></div>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-white/5 py-10 text-center text-sm text-slate-400">No clients awaiting results. Collected specimens appear here once payment and collection are done.</p>
      ) : (
        <div className="space-y-2">
          {rows.map(({ req, items }) => (
            <div key={req.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{req.patient_name || "Unnamed"} <span className="ml-1 font-mono text-xs font-normal text-slate-500">{req.code}</span></p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {[req.patient_age != null ? `${req.patient_age}y` : null, req.sex, req.patient_phone].filter(Boolean).join(" · ")}
                    {req.doctor_name ? ` · Ref: ${req.doctor_name}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500">{fmtAgo(req.created_at)}</span>
                  <button onClick={() => setComposerReq(req)} className="inline-flex items-center gap-1.5 rounded-lg bg-medical-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-medical-700">
                    <Send className="h-3.5 w-3.5" /> Enter results
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {items.map(({ dept, status }) => (
                  <button
                    key={dept}
                    onClick={() => setComposerReq(req)}
                    className="group inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 hover:border-medical-400/40 hover:bg-white/10"
                  >
                    <span className="font-medium">{dept}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_META[status].cls}`}>{STATUS_META[status].label}</span>
                    {status === "reported"
                      ? <FileText className="h-3.5 w-3.5 text-emerald-300" />
                      : status === "none"
                        ? <ChevronRight className="h-3.5 w-3.5 text-slate-500 group-hover:text-medical-300" />
                        : <Send className="h-3.5 w-3.5 text-slate-400 group-hover:text-medical-300" />}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {composerReq && (
        <ResultComposer
          request={{
            id: composerReq.id, code: composerReq.code,
            patient_name: composerReq.patient_name, patient_phone: composerReq.patient_phone,
            patient_age: composerReq.patient_age, sex: composerReq.sex,
            tests: composerReq.tests, test_breakdown: composerReq.test_breakdown,
          }}
          canSendResults={canSendResults}
          onClose={() => setComposerReq(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
