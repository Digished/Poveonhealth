"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "react-hot-toast";
import {
  Plus, FlaskConical, BarChart3, List, LogOut,
  Building2, Trash2, Eye, EyeOff, RefreshCw, X, Pencil,
  Phone, Upload, Check, MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { StatusBadge, Badge } from "@/components/ui/Badge";
import type { Lab, LabRequest, AdminMetrics } from "@/lib/types";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client"; // still used for auth sign-out
import { useRouter } from "next/navigation";

type AdminTab = "metrics" | "requests" | "labs";

// Shared white input class for dark-background modals
const whiteInput = "bg-white border-slate-200 text-slate-800 placeholder-slate-300";

export function AdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AdminTab>("metrics");
  const [labs, setLabs] = useState<Lab[]>([]);
  const [requests, setRequests] = useState<LabRequest[]>([]);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateLab, setShowCreateLab] = useState(false);
  const [editLab, setEditLab] = useState<Lab | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchLabs = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/labs");
      const data = await res.json();
      if (data.success) setLabs(data.labs ?? []);
      else toast.error(data.error ?? "Failed to load labs");
    } catch {
      toast.error("Failed to load labs");
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [reqRes] = await Promise.all([
        fetch("/api/admin/requests"),
        fetchLabs(),
      ]);
      const reqData = await reqRes.json();
      if (reqData.success) {
        setRequests(reqData.requests ?? []);
        setMetrics(reqData.metrics ?? null);
      }
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [fetchLabs]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleSignOut() {
    await createClient().auth.signOut();
    router.push("/admin-login");
    router.refresh();
  }

  async function handleToggleHidden(lab: Lab) {
    setTogglingId(lab.id);
    try {
      const res = await fetch(`/api/admin/labs/${lab.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden: !lab.hidden }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(lab.hidden ? "Lab is now visible" : "Lab hidden from form");
        await fetchLabs();
      } else {
        toast.error(data.error ?? "Failed to update");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDeleteLab(lab: Lab) {
    if (!confirm(`Delete "${lab.name}"? This removes all associated data and the lab login. Cannot be undone.`)) return;
    setDeletingId(lab.id);
    try {
      const res = await fetch(`/api/admin/labs/${lab.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast.success(`"${lab.name}" deleted`);
        await fetchLabs();
      } else {
        toast.error(data.error ?? "Failed to delete");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-medical-950 to-slate-900 text-white">
      <header className="border-b border-white/10 bg-white/5 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-medical-600 rounded-xl flex items-center justify-center">
              <FlaskConical className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-white text-sm">Poveon</h1>
              <p className="text-xs text-blue-300">Admin Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => fetchData()} className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button onClick={handleSignOut} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white text-sm transition-colors">
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex gap-1 mb-8 bg-white/5 rounded-xl p-1 w-fit">
          {[
            { key: "metrics" as AdminTab, label: "Metrics", icon: <BarChart3 className="w-4 h-4" /> },
            { key: "requests" as AdminTab, label: "All Requests", icon: <List className="w-4 h-4" /> },
            { key: "labs" as AdminTab, label: "Labs", icon: <Building2 className="w-4 h-4" /> },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        {/* ── METRICS ── */}
        {activeTab === "metrics" && (
          <div className="animate-fade-in space-y-6">
            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-5 animate-pulse h-24" />
                ))}
              </div>
            ) : metrics ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "Total", value: metrics.total, color: "from-blue-500/20 to-blue-600/10 border-blue-500/30" },
                    { label: "Incoming", value: metrics.incoming, color: "from-blue-400/20 to-blue-500/10 border-blue-400/30" },
                    { label: "Seen", value: metrics.seen, color: "from-amber-400/20 to-amber-500/10 border-amber-400/30" },
                    { label: "Done", value: metrics.done, color: "from-emerald-400/20 to-emerald-500/10 border-emerald-400/30" },
                  ].map((stat) => (
                    <div key={stat.label} className={`bg-gradient-to-br ${stat.color} border rounded-2xl p-5`}>
                      <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">{stat.label}</p>
                      <p className="text-4xl font-bold text-white">{stat.value}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                  <h3 className="text-sm font-semibold text-slate-300 mb-4">By Laboratory</h3>
                  <div className="space-y-3">
                    {metrics.byLab.map((lab) => (
                      <div key={lab.lab_id} className="flex items-center gap-3">
                        <p className="text-sm text-white min-w-[180px] truncate">{lab.lab_name}</p>
                        <div className="flex-1 bg-white/10 rounded-full h-2 overflow-hidden">
                          <div className="h-full bg-medical-500 rounded-full" style={{ width: `${metrics.total ? (lab.total / metrics.total) * 100 : 0}%` }} />
                        </div>
                        <span className="text-sm text-slate-400 font-mono w-8 text-right">{lab.total}</span>
                      </div>
                    ))}
                    {metrics.byLab.length === 0 && <p className="text-sm text-slate-500 text-center py-4">No data yet</p>}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-slate-500 text-center py-16">No data available</p>
            )}
          </div>
        )}

        {/* ── REQUESTS ── */}
        {activeTab === "requests" && (
          <div className="animate-fade-in">
            {loading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4 animate-pulse h-14" />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left">
                      {["Code", "Patient", "Doctor", "Tests", "Lab", "Status", "Date"].map((h) => (
                        <th key={h} className="pb-3 px-3 text-xs text-slate-400 font-semibold uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {requests.map((req) => (
                      <tr key={req.id} className="hover:bg-white/5 transition-colors">
                        <td className="py-3 px-3"><span className="font-mono text-medical-400 text-xs">{req.code}</span></td>
                        <td className="py-3 px-3 text-white font-medium">{req.patient_name}</td>
                        <td className="py-3 px-3 text-slate-300">
                          {[req.doctor_prefix, req.doctor_name].filter(Boolean).join(" ")}
                        </td>
                        <td className="py-3 px-3 max-w-[180px]"><p className="text-slate-400 truncate">{req.tests}</p></td>
                        <td className="py-3 px-3 text-slate-300">{(req.labs as { name: string } | null)?.name ?? "—"}</td>
                        <td className="py-3 px-3"><StatusBadge status={req.status} /></td>
                        <td className="py-3 px-3 text-slate-400 whitespace-nowrap">{format(new Date(req.created_at), "dd MMM yy")}</td>
                      </tr>
                    ))}
                    {requests.length === 0 && (
                      <tr><td colSpan={7} className="py-16 text-center text-slate-400">No requests yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── LABS ── */}
        {activeTab === "labs" && (
          <div className="animate-fade-in space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white">Registered Laboratories ({labs.length})</h2>
              <Button onClick={() => setShowCreateLab(true)}>
                <Plus className="w-4 h-4" />
                Add Laboratory
              </Button>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-5 animate-pulse h-40" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {labs.map((lab) => (
                  <div key={lab.id} className={`bg-white/5 border rounded-2xl p-5 transition-opacity ${lab.hidden ? "border-white/5 opacity-60" : "border-white/10"}`}>
                    <div className="flex items-center gap-2 mb-3">
                      {lab.logo_url ? (
                        <img src={lab.logo_url} alt={lab.name} className="w-8 h-8 rounded-lg object-cover" />
                      ) : (
                        <div className="w-8 h-8 bg-medical-700/50 rounded-lg flex items-center justify-center">
                          <Building2 className="w-4 h-4 text-medical-400" />
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-white text-sm">{lab.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Badge variant="blue">Prefix: {lab.prefix}</Badge>
                          {lab.hidden && <span className="text-xs text-slate-500">hidden</span>}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 mb-1">{lab.email}</p>
                    {lab.address && (
                      <p className="text-xs text-slate-500 flex items-start gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-slate-600 mt-0.5 shrink-0" />{lab.address}
                      </p>
                    )}
                    {(lab.phones as string[]).length > 0 && (lab.phones as string[]).map((ph, i) => (
                      <p key={i} className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3 text-slate-600 shrink-0" />{ph}
                      </p>
                    ))}
                    <p className="text-xs text-slate-600 mt-3">Added {format(new Date(lab.created_at), "dd MMM yyyy")}</p>

                    <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/5">
                      <button
                        onClick={() => setEditLab(lab)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs transition-colors"
                      >
                        <Pencil className="w-3 h-3" />Edit
                      </button>
                      <button
                        onClick={() => handleToggleHidden(lab)}
                        disabled={togglingId === lab.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs transition-colors"
                      >
                        {lab.hidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        {lab.hidden ? "Show" : "Hide"}
                      </button>
                      <button
                        onClick={() => handleDeleteLab(lab)}
                        disabled={deletingId === lab.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 text-xs transition-colors ml-auto"
                      >
                        <Trash2 className="w-3 h-3" />Delete
                      </button>
                    </div>
                  </div>
                ))}
                {labs.length === 0 && (
                  <div className="col-span-3 text-center py-16 text-slate-500">No laboratories yet.</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {showCreateLab && (
        <CreateLabModal onClose={() => setShowCreateLab(false)} onSuccess={() => { setShowCreateLab(false); fetchLabs(); }} />
      )}
      {editLab && (
        <EditLabModal lab={editLab} onClose={() => setEditLab(null)} onSuccess={() => { setEditLab(null); fetchLabs(); }} />
      )}
    </div>
  );
}

// =============================================================================
// Create Lab Modal
// =============================================================================
function CreateLabModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [phones, setPhones] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [createdPassword, setCreatedPassword] = useState("");
  const [createdLabId, setCreatedLabId] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoUploaded, setLogoUploaded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUploadLogo(file: File) {
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append("logo", file);
      const res = await fetch(`/api/admin/labs/${createdLabId}/logo`, { method: "POST", body: fd });
      const data = await res.json();
      if (data.success) { setLogoUploaded(true); toast.success("Logo uploaded!"); }
      else toast.error(data.error ?? "Upload failed");
    } catch {
      toast.error("Network error");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const phoneList = phones.split("\n").map((p) => p.trim()).filter(Boolean);
    if (!name.trim() || !email.trim() || !address.trim()) {
      toast.error("Name, email and address are required");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/create-lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), address: address.trim(), description: description.trim() || undefined, phones: phoneList, tempPassword: tempPassword.trim() || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        setCreatedPassword(data.tempPassword);
        setCreatedLabId(data.lab.id);
        toast.success(`Lab "${name}" created!`);
      } else {
        toast.error(data.error ?? "Failed to create lab");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-white/15 rounded-2xl w-full max-w-md shadow-2xl animate-slide-up max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <h2 className="font-semibold text-white">Add New Laboratory</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 transition-colors"><X className="w-4 h-4" /></button>
        </div>
        {createdPassword ? (
          <div className="p-5 space-y-4">
            <div className="text-center">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <Building2 className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="font-semibold text-white mb-1">Lab Created!</h3>
              <p className="text-sm text-slate-400">Credentials sent to their email.</p>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
              <p className="text-xs text-amber-400 font-semibold mb-1">Temporary Password</p>
              <p className="font-mono text-lg text-amber-300 font-bold">{createdPassword}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-300 mb-2">Lab Logo <span className="text-xs text-slate-500">(optional)</span></p>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                onChange={(e) => { const file = e.target.files?.[0]; if (file) handleUploadLogo(file); }} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploadingLogo || logoUploaded}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-slate-300 text-sm transition-colors disabled:opacity-60">
                {uploadingLogo ? <RefreshCw className="w-4 h-4 animate-spin" /> : logoUploaded ? <Check className="w-4 h-4 text-emerald-400" /> : <Upload className="w-4 h-4" />}
                {uploadingLogo ? "Uploading…" : logoUploaded ? "Logo uploaded!" : "Upload Logo"}
              </button>
            </div>
            <Button fullWidth onClick={onSuccess}>Done</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-300 block mb-1">Laboratory Name <span className="text-red-400">*</span></label>
              <input className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 ${whiteInput}`} placeholder="e.g. Lagos General Hospital Lab" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300 block mb-1">Lab Login Email <span className="text-red-400">*</span></label>
              <input type="email" className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 ${whiteInput}`} placeholder="lab@hospital.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300 block mb-1">Lab Address <span className="text-red-400">*</span></label>
              <input className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 ${whiteInput}`} placeholder="12 Victoria Island, Lagos" value={address} onChange={(e) => setAddress(e.target.value)} required />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300 block mb-1">Description <span className="text-xs text-slate-500">(optional)</span></label>
              <textarea rows={2} className={`w-full rounded-xl border px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-medical-500 ${whiteInput}`} placeholder="e.g. Specialist diagnostic lab offering 200+ tests" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300 block mb-1">Contact Phone Numbers <span className="text-xs text-slate-500">(optional)</span></label>
              <textarea rows={2} className={`w-full rounded-xl border px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-medical-500 ${whiteInput}`} placeholder={"+234 800 000 0000\n+234 801 000 0001"} value={phones} onChange={(e) => setPhones(e.target.value)} />
              <p className="text-xs text-slate-500 mt-1">One per line</p>
            </div>
            <div className="relative">
              <label className="text-sm font-medium text-slate-300 block mb-1">Temporary Password <span className="text-xs text-slate-500">(optional)</span></label>
              <input type={showPassword ? "text" : "password"} className={`w-full rounded-xl border px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 ${whiteInput}`} placeholder="Leave blank to auto-generate" value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} />
              <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-[34px] text-slate-400 hover:text-slate-600">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <p className="text-xs text-slate-500 mt-1">Min 8 characters</p>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="secondary" fullWidth onClick={onClose}>Cancel</Button>
              <Button type="submit" fullWidth loading={loading}>Create Lab</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Edit Lab Modal
// =============================================================================
function EditLabModal({ lab, onClose, onSuccess }: { lab: Lab; onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState(lab.name);
  const [address, setAddress] = useState(lab.address);
  const [description, setDescription] = useState(lab.description ?? "");
  const [phones, setPhones] = useState((lab.phones as string[]).join("\n"));
  const [loading, setLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoUploaded, setLogoUploaded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUploadLogo(file: File) {
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append("logo", file);
      const res = await fetch(`/api/admin/labs/${lab.id}/logo`, { method: "POST", body: fd });
      const data = await res.json();
      if (data.success) {
        setLogoUploaded(true);
        toast.success("Logo uploaded!");
      } else {
        toast.error(data.error ?? "Upload failed");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const phoneList = phones.split("\n").map((p) => p.trim()).filter(Boolean);
    if (!name.trim() || !address.trim()) {
      toast.error("Name and address are required");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/labs/${lab.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), address: address.trim(), description: description.trim(), phones: phoneList }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Lab updated!");
        onSuccess();
      } else {
        toast.error(data.error ?? "Failed to update");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-white/15 rounded-2xl w-full max-w-md shadow-2xl animate-slide-up max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <h2 className="font-semibold text-white">Edit: {lab.name}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1">Laboratory Name <span className="text-red-400">*</span></label>
            <input className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 ${whiteInput}`} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1">Address <span className="text-red-400">*</span></label>
            <input className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 ${whiteInput}`} placeholder="Lab street address" value={address} onChange={(e) => setAddress(e.target.value)} required />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1">Description <span className="text-xs text-slate-500">(optional)</span></label>
            <textarea rows={2} className={`w-full rounded-xl border px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-medical-500 ${whiteInput}`} placeholder="e.g. Specialist diagnostic lab offering 200+ tests" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1">Contact Phone Numbers <span className="text-xs text-slate-500">(optional, one per line)</span></label>
            <textarea rows={2} className={`w-full rounded-xl border px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-medical-500 ${whiteInput}`} value={phones} onChange={(e) => setPhones(e.target.value)} />
          </div>

          <div>
            <p className="text-sm font-medium text-slate-300 mb-2">Lab Logo</p>
            <div className="flex items-center gap-3">
              {lab.logo_url && !logoUploaded && (
                <img src={lab.logo_url} alt="Current logo" className="w-10 h-10 rounded-lg object-cover border border-white/10" />
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => { const file = e.target.files?.[0]; if (file) handleUploadLogo(file); }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploadingLogo}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-slate-300 text-sm transition-colors"
              >
                {uploadingLogo ? <RefreshCw className="w-4 h-4 animate-spin" /> :
                 logoUploaded ? <Check className="w-4 h-4 text-emerald-400" /> :
                 <Upload className="w-4 h-4" />}
                {uploadingLogo ? "Uploading…" : logoUploaded ? "Uploaded!" : lab.logo_url ? "Replace Logo" : "Upload Logo"}
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" fullWidth onClick={onClose}>Cancel</Button>
            <Button type="submit" fullWidth loading={loading}>Save Changes</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
