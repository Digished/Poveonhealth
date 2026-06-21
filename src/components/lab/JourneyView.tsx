"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Search, ArrowRight, Activity, CalendarDays, List, FileText, Clock } from "lucide-react";
import toast from "react-hot-toast";
import { JourneyMap, JourneyTimeline, JourneyEvent } from "@/components/lab/JourneyMap";
import { StatCard } from "@/components/lab/StatCard";
import { ScheduleCalendar } from "@/components/lab/ScheduleCalendar";
import { FullViewModal } from "@/components/ui/FullViewModal";
import { JOURNEY_STAGES, STAGE_LABELS, stageIndex, stageDurations, formatDuration, awaitingPhrase, JourneyStage } from "@/lib/lims-shared";

interface JourneyRequest {
  id: string;
  code: string;
  status: string;
  source: string;
  current_stage: string | null;
  patient_name: string | null;
  patient_phone: string | null;
  tests: string;
  created_at: string;
  journey_events: JourneyEvent[];
}

const SOURCE_LABEL: Record<string, string> = { poveon: "Poveon", walk_in: "Walk-in", qr: "QR" };

/** Lightweight result indicator derived from the request's furthest stage. */
function resultBadge(stage: string | null): { label: string; cls: string } | null {
  if (stage === "reported") return { label: "Results sent", cls: "bg-emerald-500/15 text-emerald-300" };
  if (stage === "verified") return { label: "Results pending", cls: "bg-amber-500/15 text-amber-300" };
  return null;
}

export function JourneyView({ canAdvance }: { canAdvance: boolean }) {
  const [requests, setRequests] = useState<JourneyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<JourneyRequest | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [view, setView] = useState<"list" | "schedule">("list");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/lab/journey", { cache: "no-store" });
      const data = await res.json();
      setRequests(data.requests ?? []);
    } catch {
      toast.error("Failed to load journeys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function advance(req: JourneyRequest, stage: JourneyStage) {
    setAdvancing(true);
    try {
      const res = await fetch("/api/lab/journey/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: req.id, stage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(`Moved to ${STAGE_LABELS[stage]}`);
      await load();
      setSelected((s) => (s && s.id === req.id ? { ...s, current_stage: stage, journey_events: [...s.journey_events, { id: Math.random().toString(), stage, created_at: new Date().toISOString() }] } : s));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to advance");
    } finally {
      setAdvancing(false);
    }
  }

  const filtered = requests.filter((r) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return r.code.toLowerCase().includes(q) || (r.patient_name ?? "").toLowerCase().includes(q) || (r.patient_phone ?? "").includes(q);
  });

  const active = requests.filter((r) => r.current_stage && r.current_stage !== "reported").length;
  const inAnalysis = requests.filter((r) => r.current_stage === "in_analysis").length;
  const reported = requests.filter((r) => r.current_stage === "reported").length;

  function nextStage(current: string | null): JourneyStage | null {
    const idx = current ? stageIndex(current) : -1;
    return idx < JOURNEY_STAGES.length - 1 ? JOURNEY_STAGES[idx + 1] : null;
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total samples" value={requests.length} accent="medical" icon={<Activity className="h-4 w-4" />} />
        <StatCard label="In progress" value={active} accent="amber" />
        <StatCard label="In analysis" value={inAnalysis} accent="violet" />
        <StatCard label="Reported" value={reported} accent="emerald" />
      </div>

      {/* View toggle: timeline list vs schedule calendar */}
      <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
        {([["list", "Timeline", <List key="l" className="h-4 w-4" />], ["schedule", "Schedule", <CalendarDays key="c" className="h-4 w-4" />]] as const).map(([v, label, icon]) => (
          <button key={v} onClick={() => setView(v)} className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition ${view === v ? "bg-medical-600 text-white" : "text-slate-300 hover:text-white"}`}>
            {icon} {label}
          </button>
        ))}
      </div>

      {view === "list" ? (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by code, name or phone"
              className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-medical-400 focus:outline-none"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-medical-400" /></div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 py-16 text-center text-slate-400">No samples to track yet.</div>
          ) : (
            <div className="space-y-3">
              {filtered.map((r) => {
                const rb = resultBadge(r.current_stage);
                const { currentMs } = stageDurations(r.journey_events, r.created_at);
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className="block w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:bg-white/10"
                  >
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{r.patient_name || "Unnamed"} <span className="font-mono text-xs text-slate-400">· {r.code}</span></p>
                        <p className="truncate text-xs text-slate-400">{r.tests}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {rb && <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${rb.cls}`}><FileText className="h-3 w-3" /> {rb.label}</span>}
                        {r.current_stage && r.current_stage !== "reported" && <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-300" title={`${formatDuration(currentMs)} ${awaitingPhrase(r.current_stage ?? "registered")}`}><Clock className="h-3 w-3" /> {formatDuration(currentMs)}</span>}
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-slate-300">{SOURCE_LABEL[r.source] ?? r.source}</span>
                      </div>
                    </div>
                    <JourneyMap currentStage={r.current_stage} events={r.journey_events} compact />
                  </button>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* Schedule calendar — find scheduled scans/tests by date */
        <ScheduleCalendar onSelectRequest={(id) => { const r = requests.find((x) => x.id === id); if (r) setSelected(r); }} />
      )}

      {/* Detail (full view) */}
      {selected && (
        <FullViewModal
          title={selected.patient_name || "Unnamed"}
          subtitle={`${selected.code} · ${SOURCE_LABEL[selected.source] ?? selected.source}`}
          maxWidth="max-w-3xl"
          onClose={() => setSelected(null)}
        >
          <div className="mb-5 rounded-2xl border border-white/10 bg-white/5 p-4">
            <JourneyMap currentStage={selected.current_stage} events={selected.journey_events} />
          </div>

          {canAdvance && (() => {
            const ns = nextStage(selected.current_stage);
            return ns ? (
              <button
                onClick={() => advance(selected, ns)}
                disabled={advancing}
                className="mb-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-medical-600 py-2.5 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50"
              >
                {advancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Advance to {STAGE_LABELS[ns]}
              </button>
            ) : (
              <div className="mb-5 rounded-xl bg-emerald-500/10 py-2.5 text-center text-sm font-medium text-emerald-300">Journey complete</div>
            );
          })()}

          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Timeline</p>
          <JourneyTimeline events={selected.journey_events} />
        </FullViewModal>
      )}
    </div>
  );
}
