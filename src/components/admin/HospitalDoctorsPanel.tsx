"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Plus, RefreshCw, Stethoscope, Trash2, X } from "lucide-react";
import { format } from "date-fns";

// =============================================================================
// HospitalDoctorsPanel — admin view of the doctors registered under a hospital
// (the doctors allowed to send referrals from that hospital). List / add /
// remove backed by /api/admin/hospitals/[id]/doctors.
// =============================================================================

interface HospitalDoctor {
  id: string;
  doctor_email: string;
  doctor_name: string | null;
  specialty: string | null;
  phone: string | null;
  has_profile: boolean;
  added_by: string | null;
  created_at: string;
}

export function HospitalDoctorsPanel({
  hospitalId,
  hospitalName,
  onClose,
  onChanged,
}: {
  hospitalId: string;
  hospitalName: string;
  onClose: () => void;
  /** Called after a doctor is added or removed so the caller can refresh counts. */
  onChanged?: () => void;
}) {
  const [doctors, setDoctors] = useState<HospitalDoctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/hospitals/${hospitalId}/doctors`);
      const d = await res.json();
      if (d.success) setDoctors(d.doctors);
      else toast.error(d.error ?? "Failed to load doctors");
    } catch {
      toast.error("Network error loading doctors");
    } finally {
      setLoading(false);
    }
  }, [hospitalId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/admin/hospitals/${hospitalId}/doctors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), name: name.trim() || undefined }),
      });
      const d = await res.json();
      if (d.success) {
        toast.success("Doctor registered");
        setEmail("");
        setName("");
        load();
        onChanged?.();
      } else {
        toast.error(d.error ?? "Failed to add doctor");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(doc: HospitalDoctor) {
    if (!confirm(`Remove ${doc.doctor_name || doc.doctor_email} from ${hospitalName}? They will no longer be able to send referrals from this hospital.`)) return;
    setRemovingId(doc.id);
    try {
      const res = await fetch(`/api/admin/hospitals/${hospitalId}/doctors?doctorId=${encodeURIComponent(doc.id)}`, {
        method: "DELETE",
      });
      const d = await res.json();
      if (d.success) {
        toast.success("Doctor removed");
        setDoctors((prev) => prev.filter((x) => x.id !== doc.id));
        onChanged?.();
      } else {
        toast.error(d.error ?? "Failed to remove doctor");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setRemovingId(null);
    }
  }

  const inputCls =
    "w-full px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-slate-900 border border-white/15 rounded-2xl w-full max-w-lg shadow-2xl animate-slide-up max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div className="min-w-0">
            <h2 className="font-semibold text-white text-base flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="truncate">Doctors — {hospitalName}</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Doctors registered here can send referrals from this hospital
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 transition-colors shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-5 space-y-4">
          {/* Add form */}
          <form onSubmit={handleAdd} className="bg-white/5 border border-white/10 rounded-2xl p-3 space-y-2">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Register a doctor</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="email"
                placeholder="Doctor email *"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
                required
              />
              <input
                type="text"
                placeholder="Name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputCls}
              />
            </div>
            <button
              type="submit"
              disabled={adding || !email.trim()}
              className="w-full flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold py-2 rounded-xl transition"
            >
              {adding ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add Doctor
            </button>
          </form>

          {/* List */}
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-white/5 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : doctors.length === 0 ? (
            <div className="py-8 text-center text-slate-500 rounded-2xl border border-white/8">
              <Stethoscope className="w-7 h-7 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No doctors registered yet</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/8 overflow-hidden divide-y divide-white/5">
              {doctors.map((doc) => (
                <div key={doc.id} className="px-4 py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-white truncate">
                        {doc.doctor_name || doc.doctor_email}
                      </p>
                      {!doc.has_profile && (
                        <span className="text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/20 rounded-full px-1.5 py-0.5 shrink-0">
                          no Poveon profile yet
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap text-xs text-slate-400">
                      {doc.doctor_name && <span className="truncate">{doc.doctor_email}</span>}
                      {doc.specialty && <span className="text-slate-500">{doc.specialty}</span>}
                      {doc.phone && <span className="text-slate-500">{doc.phone}</span>}
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Added {format(new Date(doc.created_at), "d MMM yyyy")}
                      {doc.added_by ? ` by ${doc.added_by.replace(/^admin:/, "")}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRemove(doc)}
                    disabled={removingId === doc.id}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition shrink-0"
                    title="Remove doctor"
                  >
                    {removingId === doc.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-slate-500">
            {doctors.length} doctor{doctors.length !== 1 ? "s" : ""} registered
          </p>
        </div>
      </div>
    </div>
  );
}
