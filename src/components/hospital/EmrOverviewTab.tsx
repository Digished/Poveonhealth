"use client";

import { useState, useEffect } from "react";
import {
  ClipboardList, Activity, Stethoscope, Pill, FlaskConical, BedDouble,
} from "lucide-react";
import type { EmrDepartment } from "./emrTypes";

const DEPT_ICON: Record<string, React.ReactNode> = {
  onboarding: <ClipboardList className="w-5 h-5" />,
  vitals: <Activity className="w-5 h-5" />,
  consultation: <Stethoscope className="w-5 h-5" />,
  pharmacy: <Pill className="w-5 h-5" />,
  laboratory: <FlaskConical className="w-5 h-5" />,
  ward: <BedDouble className="w-5 h-5" />,
};

export function EmrOverviewTab() {
  const [departments, setDepartments] = useState<EmrDepartment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/hospital/emr/departments")
      .then((r) => r.json())
      .then((d) => { if (d.departments) setDepartments(d.departments); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="grid grid-cols-2 gap-3 animate-pulse">{[1,2,3,4,5,6].map(i => <div key={i} className="h-24 bg-white rounded-2xl border border-slate-100" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {departments.map((d) => (
          <div key={d.id} className={`rounded-2xl border shadow-sm p-3.5 ${d.is_active ? "bg-white border-slate-100" : "bg-slate-50 border-slate-100 opacity-60"}`}>
            <div className="w-10 h-10 rounded-xl bg-medical-50 text-medical-600 flex items-center justify-center mb-2">
              {DEPT_ICON[d.key]}
            </div>
            <p className="text-2xl font-bold text-slate-800 leading-none">{d.queue}</p>
            <p className="text-xs font-semibold text-slate-500 mt-1">{d.name}</p>
            <p className="text-[10px] text-slate-400">in queue</p>
          </div>
        ))}
      </div>

      <div className="bg-medical-50/60 border border-medical-100 rounded-2xl p-4">
        <p className="text-sm font-semibold text-medical-800 mb-1">Staff workspace</p>
        <p className="text-xs text-medical-700/80 leading-relaxed">
          Your team signs in at <a href="/emr-login" className="font-mono font-semibold underline">/emr-login</a> with their
          email/phone and PIN to work their department — onboarding, vitals, consultation, pharmacy, laboratory or the ward.
          Add them under the <span className="font-semibold">Team</span> tab.
        </p>
      </div>
    </div>
  );
}
