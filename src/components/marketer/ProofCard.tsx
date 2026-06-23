"use client";

import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { X, Copy, Award, Clock, Beaker, Users } from "lucide-react";

interface Proof {
  email: string; name: string; patients_served: number; total_requests: number;
  tests_count: number; avg_result_hours: number | null; revenue: number; since: string | null;
}

export function ProofCard({ doctorEmail, onClose }: { doctorEmail: string; onClose: () => void }) {
  const [proof, setProof] = useState<Proof | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/scale/proof?doctor_email=${encodeURIComponent(doctorEmail)}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setProof(d.proof); })
      .finally(() => setLoading(false));
  }, [doctorEmail]);

  function shareText(p: Proof): string {
    const lines = [
      `Dr ${p.name.replace(/^dr\.?\s*/i, "")}, here's your Poveon impact so far:`,
      `• ${p.patients_served} patients served`,
      `• ${p.total_requests} test requests · ${p.tests_count} tests`,
      p.avg_result_hours != null ? `• ~${p.avg_result_hours}h average result time` : "",
      `Thank you for trusting Poveon with your patients.`,
    ].filter(Boolean);
    return lines.join("\n");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <p className="text-sm font-bold text-slate-800">Doctor impact card</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">Loading…</div>
        ) : !proof ? (
          <div className="p-8 text-center text-sm text-slate-400">No data for this doctor yet.</div>
        ) : (
          <div className="p-5">
            <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-5 mb-4">
              <div className="flex items-center gap-2 mb-3"><Award className="w-5 h-5" /><p className="font-bold">Dr {proof.name.replace(/^dr\.?\s*/i, "")}</p></div>
              <div className="grid grid-cols-2 gap-3">
                <Metric icon={<Users className="w-4 h-4" />} value={proof.patients_served} label="patients served" />
                <Metric icon={<Beaker className="w-4 h-4" />} value={proof.tests_count} label="tests ordered" />
                <Metric icon={<Clock className="w-4 h-4" />} value={proof.avg_result_hours != null ? `${proof.avg_result_hours}h` : "—"} label="avg result time" />
                <Metric icon={<Award className="w-4 h-4" />} value={proof.total_requests} label="total requests" />
              </div>
            </div>
            <button
              onClick={() => { navigator.clipboard?.writeText(shareText(proof)).then(() => toast.success("Copied — paste into WhatsApp")); }}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2.5 rounded-xl transition"
            >
              <Copy className="w-4 h-4" /> Copy to share with the doctor
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ icon, value, label }: { icon: React.ReactNode; value: string | number; label: string }) {
  return (
    <div className="bg-white/10 rounded-xl p-2.5">
      <div className="flex items-center gap-1 text-white/80 mb-0.5">{icon}</div>
      <p className="text-xl font-bold leading-none">{value}</p>
      <p className="text-[10px] text-white/70 mt-0.5">{label}</p>
    </div>
  );
}
