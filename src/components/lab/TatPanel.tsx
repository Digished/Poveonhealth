"use client";

import { useEffect, useState } from "react";
import { Loader2, Clock, Timer, AlertTriangle } from "lucide-react";
import { StatCard } from "@/components/lab/StatCard";

interface TatData {
  summary: { completed: number; avg_hours: number; median_hours: number; sla_breaches: number; sla_tracked: number };
  by_test: { name: string; avg_hours: number; count: number }[];
  breaches: { code: string; hours: number; target: number }[];
}

const fmtH = (h: number) => (h >= 48 ? `${Math.round(h / 24)}d` : `${h}h`);

export function TatPanel() {
  const [data, setData] = useState<TatData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/lab/tat", { cache: "no-store" });
        if (res.ok) setData(await res.json());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-medical-400" /></div>;
  if (!data || data.summary.completed === 0) {
    return <div className="rounded-2xl border border-white/10 bg-white/5 py-10 text-center text-sm text-slate-400">No completed requests yet — turnaround times will appear here.</div>;
  }

  const maxAvg = Math.max(...data.by_test.map((t) => t.avg_hours), 1);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Completed" value={data.summary.completed} accent="medical" icon={<Clock className="h-4 w-4" />} />
        <StatCard label="Avg TAT" value={fmtH(data.summary.avg_hours)} accent="violet" icon={<Timer className="h-4 w-4" />} />
        <StatCard label="Median TAT" value={fmtH(data.summary.median_hours)} accent="emerald" />
        <StatCard label="SLA breaches" value={data.summary.sla_breaches} accent={data.summary.sla_breaches > 0 ? "red" : "slate"} icon={<AlertTriangle className="h-4 w-4" />} hint={data.summary.sla_tracked ? `${data.summary.sla_tracked} tests have SLA` : "Set tat_hours on tests"} />
      </div>

      {data.by_test.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="mb-3 text-sm font-semibold text-white">Average turnaround by test</p>
          <div className="space-y-2">
            {data.by_test.map((t) => (
              <div key={t.name} className="flex items-center gap-3">
                <span className="w-32 shrink-0 truncate text-xs text-slate-300" title={t.name}>{t.name}</span>
                <div className="h-5 flex-1 overflow-hidden rounded bg-white/5">
                  <div className="h-full rounded bg-gradient-to-r from-medical-500 to-medical-400" style={{ width: `${Math.max(4, (t.avg_hours / maxAvg) * 100)}%` }} />
                </div>
                <span className="w-14 shrink-0 text-right text-xs font-medium text-slate-300">{fmtH(t.avg_hours)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.breaches.length > 0 && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-red-300"><AlertTriangle className="h-4 w-4" /> SLA breaches</p>
          <div className="flex flex-wrap gap-2">
            {data.breaches.map((b) => (
              <span key={b.code} className="rounded-lg bg-red-500/10 px-2.5 py-1 text-xs text-red-200">
                <span className="font-mono">{b.code}</span> · {fmtH(b.hours)} <span className="text-red-400">(target {fmtH(b.target)})</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
