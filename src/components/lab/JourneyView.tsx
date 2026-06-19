"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Search, X, ArrowRight, Activity } from "lucide-react";
import toast from "react-hot-toast";
import { JourneyMap, JourneyTimeline, JourneyEvent } from "@/components/lab/JourneyMap";
import { StatCard } from "@/components/lab/StatCard";
import { JOURNEY_STAGES, STAGE_LABELS, stageIndex, JourneyStage } from "@/lib/lims";

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

export function JourneyView({ canAdvance }: { canAdvance: boolean }) {
  const [requests, setRequests] = useState<JourneyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<JourneyRequest | null>(null);
  const [advancing, setAdvancing] = useState(false);

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
          {filtered.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelected(r)}
              className="block w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:bg-white/10"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{r.patient_name || "Unnamed"} <span className="font-mono text-xs text-slate-400">· {r.code}</span></p>
                  <p className="truncate text-xs text-slate-400">{r.tests}</p>
                </div>
                <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-slate-300">{SOURCE_LABEL[r.source] ?? r.source}</span>
              </div>
              <JourneyMap currentStage={r.current_stage} events={r.journey_events} compact />
            </button>
          ))}
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={() => setSelected(null)}>
          <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-slate-900 p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">{selected.patient_name || "Unnamed"}</h3>
                <p className="font-mono text-xs text-slate-400">{selected.code} · {SOURCE_LABEL[selected.source] ?? selected.source}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>

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
          </div>
        </div>
      )}
    </div>
  );
}
