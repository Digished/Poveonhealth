"use client";

import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import {
  ClipboardList, Activity, Stethoscope, Pill, FlaskConical, BedDouble, Check, X, Pencil,
} from "lucide-react";
import type { EmrDepartment } from "./emrTypes";

const DEPT_ICON: Record<string, React.ReactNode> = {
  onboarding: <ClipboardList className="w-4 h-4" />,
  vitals: <Activity className="w-4 h-4" />,
  consultation: <Stethoscope className="w-4 h-4" />,
  pharmacy: <Pill className="w-4 h-4" />,
  laboratory: <FlaskConical className="w-4 h-4" />,
  ward: <BedDouble className="w-4 h-4" />,
};

export function DepartmentsTab() {
  const [departments, setDepartments] = useState<EmrDepartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/hospital/emr/departments");
      const data = await res.json();
      if (res.ok) setDepartments(data.departments);
      else toast.error(data.error ?? "Failed to load departments.");
    } catch {
      toast.error("Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch("/api/hospital/emr/departments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error ?? "Update failed."); return; }
    await load();
  }

  async function saveName(d: EmrDepartment) {
    if (!draftName.trim()) { setEditing(null); return; }
    await patch(d.id, { name: draftName.trim() });
    setEditing(null);
    toast.success("Department renamed.");
  }

  if (loading) {
    return <div className="space-y-3 animate-pulse">{[1,2,3,4,5,6].map(i => <div key={i} className="h-16 bg-white rounded-2xl border border-slate-100" />)}</div>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 px-1">
        The six core departments patients flow through. Rename or pause any of them — paused departments stop receiving new work.
      </p>
      {departments.map((d) => (
        <div key={d.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3.5 flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${d.is_active ? "bg-medical-50 text-medical-600" : "bg-slate-100 text-slate-400"}`}>
            {DEPT_ICON[d.key] ?? <ClipboardList className="w-4 h-4" />}
          </div>
          <div className="flex-1 min-w-0">
            {editing === d.id ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus value={draftName} onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveName(d)}
                  className="flex-1 min-w-0 rounded-lg border border-slate-200 px-2 py-1 text-sm focus:ring-2 focus:ring-medical-500/30 outline-none"
                />
                <button onClick={() => saveName(d)} className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600"><Check className="w-4 h-4" /></button>
                <button onClick={() => setEditing(null)} className="p-1.5 rounded-lg bg-slate-50 text-slate-400"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-slate-800 truncate">{d.name}</p>
                <button onClick={() => { setEditing(d.id); setDraftName(d.name); }} className="text-slate-300 hover:text-slate-500"><Pencil className="w-3 h-3" /></button>
              </div>
            )}
            <p className="text-[11px] text-slate-400 mt-0.5">{d.queue} in queue</p>
          </div>
          <button
            onClick={() => patch(d.id, { is_active: !d.is_active })}
            className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition shrink-0 ${
              d.is_active ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {d.is_active ? "Active" : "Paused"}
          </button>
        </div>
      ))}
    </div>
  );
}
