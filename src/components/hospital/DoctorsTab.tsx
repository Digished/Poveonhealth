"use client";

import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import {
  UserPlus, Users, Trash2, Loader2, Info, Stethoscope, Phone, Mail,
} from "lucide-react";
import { HospitalDoctor } from "./types";

export function DoctorsTab({ onCountsChange }: { onCountsChange: () => void }) {
  const [doctors, setDoctors] = useState<HospitalDoctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/hospital/doctors");
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to load doctors.");
        return;
      }
      setDoctors(data.doctors ?? []);
    } catch {
      toast.error("Network error loading doctors.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!email) { toast.error("Please enter the doctor's email."); return; }
    setAdding(true);
    try {
      const res = await fetch("/api/hospital/doctors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name: newName.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(res.status === 409 ? "This doctor is already on your list." : data.error ?? "Failed to add doctor.");
        return;
      }
      toast.success("Doctor added.");
      setNewEmail("");
      setNewName("");
      load(true);
      onCountsChange();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(id: string) {
    setRemovingId(id);
    try {
      const res = await fetch(`/api/hospital/doctors?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to remove doctor.");
        return;
      }
      toast.success("Doctor removed.");
      setDoctors((prev) => prev.filter((d) => d.id !== id));
      onCountsChange();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setRemovingId(null);
      setConfirmRemoveId(null);
    }
  }

  const inputCls = "w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-medical-400 focus:border-transparent transition";

  return (
    <div className="space-y-4">
      {/* Explainer */}
      <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 leading-relaxed">
          Doctors must be added here before they can send referrals on behalf of your hospital from poveon.com.
          Add each doctor&apos;s email address below.
        </p>
      </div>

      {/* Add doctor form */}
      <form onSubmit={handleAdd} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
        <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-medical-600" /> Add a Doctor
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Email <span className="text-red-400">*</span>
            </label>
            <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
              placeholder="doctor@hospital.com" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Name (optional)</label>
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder="Dr. Jane Doe" className={inputCls} />
          </div>
        </div>
        <button type="submit" disabled={adding || !newEmail.trim()}
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-medical-600 hover:bg-medical-700 disabled:opacity-60 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition shadow-sm">
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          Add Doctor
        </button>
      </form>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4 animate-pulse">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-100 rounded w-1/2" />
                  <div className="h-3 bg-slate-100 rounded w-2/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && doctors.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
          <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-600">No doctors added yet</p>
          <p className="text-xs text-slate-400 mt-1">Add your doctors above so they can refer patients to other hospitals.</p>
        </div>
      )}

      {/* Doctor list */}
      {!loading && doctors.map((d) => (
        <div key={d.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3.5 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-medical-50 border border-medical-100 flex items-center justify-center shrink-0">
            <Stethoscope className="w-5 h-5 text-medical-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800 truncate">{d.doctor_name ?? d.doctor_email}</p>
            <p className="text-xs text-slate-500 truncate flex items-center gap-1">
              <Mail className="w-3 h-3 text-slate-300 shrink-0" />{d.doctor_email}
            </p>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {d.specialty && (
                <span className="text-[10px] font-semibold text-medical-700 bg-medical-50 border border-medical-100 px-2 py-0.5 rounded-full">
                  {d.specialty}
                </span>
              )}
              {d.phone && (
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Phone className="w-3 h-3" />{d.phone}
                </span>
              )}
              {!d.has_profile && (
                <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                  No Poveon profile yet
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0">
            {confirmRemoveId === d.id ? (
              <div className="flex items-center gap-1.5">
                <button onClick={() => handleRemove(d.id)} disabled={removingId === d.id}
                  className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 px-2.5 py-1.5 rounded-lg transition flex items-center gap-1">
                  {removingId === d.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  Remove
                </button>
                <button onClick={() => setConfirmRemoveId(null)} disabled={removingId === d.id}
                  className="text-xs font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg transition">
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmRemoveId(d.id)}
                className="p-2 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50 transition"
                title="Remove doctor">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
