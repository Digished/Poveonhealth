"use client";

import { useState, useEffect } from "react";
import { MapPin, Building2 } from "lucide-react";

interface Group { hospital: string; doctor_count: number; active_count: number; dormant_count: number; revenue: number }

const fmtNaira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

export function MarketerTerritory() {
  const [groups, setGroups] = useState<Group[] | null>(null);

  useEffect(() => {
    fetch("/api/scale/territory").then((r) => r.json()).then((d) => { if (d.success) setGroups(d.territory); }).catch(() => setGroups([]));
  }, []);

  if (!groups) return <div className="space-y-3 animate-pulse">{[1,2,3].map(i => <div key={i} className="h-16 bg-white rounded-2xl border border-slate-100" />)}</div>;
  if (groups.length === 0) return <p className="text-center text-sm text-slate-400 py-8">No hospitals yet — add doctors with their hospital to plan your visits.</p>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 px-1">Your doctors grouped by hospital — plan efficient visits and spot clusters going quiet.</p>
      {groups.map((g) => (
        <div key={g.hospital} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3.5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0"><Building2 className="w-4 h-4" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate flex items-center gap-1"><MapPin className="w-3 h-3 text-slate-400" />{g.hospital}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px]">
                <span className="text-slate-500">{g.doctor_count} doctor{g.doctor_count === 1 ? "" : "s"}</span>
                <span className="text-emerald-600">{g.active_count} active</span>
                {g.dormant_count > 0 && <span className="text-amber-600">{g.dormant_count} dormant</span>}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-semibold text-slate-800">{fmtNaira(g.revenue)}</p>
              <p className="text-[10px] text-slate-400">revenue</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
