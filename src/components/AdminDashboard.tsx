"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "react-hot-toast";
import {
  Plus, FlaskConical, BarChart3, List, LogOut,
  Building2, Trash2, Eye, EyeOff, RefreshCw, X
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { StatusBadge, Badge } from "@/components/ui/Badge";
import type { Lab, LabRequest, AdminMetrics } from "@/lib/types";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type AdminTab = "metrics" | "requests" | "labs";

export function AdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AdminTab>("metrics");
  const [labs, setLabs] = useState<Lab[]>([]);
  const [requests, setRequests] = useState<LabRequest[]>([]);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateLab, setShowCreateLab] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [reqRes, labRes] = await Promise.all([
        fetch("/api/admin/requests"),
        createClient().from("labs").select("*").order("name"),
      ]);
      const reqData = await reqRes.json();
      if (reqData.success) {
        setRequests(reqData.requests ?? []);
        setMetrics(reqData.metrics ?? null);
      }
      if (!labRes.error) setLabs(labRes.data ?? []);
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleSignOut() {
    await createClient().auth.signOut();
    router.push("/admin-login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-medical-950 to-slate-900 text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-white/5 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-medical-600 rounded-xl flex items-center justify-center">
              <FlaskConical className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-white text-sm">Poveon Health</h1>
              <p className="text-xs text-blue-300">Admin Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchData()}
              className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white text-sm transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Tab nav */}
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
                activeTab === tab.key
                  ? "bg-white/15 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── METRICS TAB ── */}
        {activeTab === "metrics" && metrics && (
          <div className="animate-fade-in space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Total Requests", value: metrics.total, color: "from-blue-500/20 to-blue-600/10 border-blue-500/30" },
                { label: "Incoming", value: metrics.incoming, color: "from-blue-400/20 to-blue-500/10 border-blue-400/30" },
                { label: "Patient Seen", value: metrics.seen, color: "from-amber-400/20 to-amber-500/10 border-amber-400/30" },
                { label: "Done", value: metrics.done, color: "from-emerald-400/20 to-emerald-500/10 border-emerald-400/30" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className={`bg-gradient-to-br ${stat.color} border rounded-2xl p-5`}
                >
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">
                    {stat.label}
                  </p>
                  <p className="text-4xl font-bold text-white">{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-4">Requests by Laboratory</h3>
              <div className="space-y-3">
                {metrics.byLab.map((lab) => (
                  <div key={lab.lab_id} className="flex items-center gap-3">
                    <p className="text-sm text-white min-w-[180px] truncate">{lab.lab_name}</p>
                    <div className="flex-1 bg-white/10 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-medical-500 rounded-full"
                        style={{ width: `${metrics.total ? (lab.total / metrics.total) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-sm text-slate-400 font-mono w-8 text-right">{lab.total}</span>
                  </div>
                ))}
                {metrics.byLab.length === 0 && (
                  <p className="text-sm text-slate-500 text-center py-4">No data yet</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── REQUESTS TAB ── */}
        {activeTab === "requests" && (
          <div className="animate-fade-in">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left">
                    {["Code", "Patient", "Doctor", "Tests", "Lab", "Status", "Date"].map((h) => (
                      <th key={h} className="pb-3 px-3 text-xs text-slate-400 font-semibold uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {requests.map((req) => (
                    <tr key={req.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-3 px-3">
                        <span className="font-mono text-medical-400 text-xs">{req.code}</span>
                      </td>
                      <td className="py-3 px-3 text-white font-medium">{req.patient_name}</td>
                      <td className="py-3 px-3 text-slate-300">{req.doctor_name}</td>
                      <td className="py-3 px-3 max-w-[180px]">
                        <p className="text-slate-400 truncate">{req.tests}</p>
                      </td>
                      <td className="py-3 px-3 text-slate-300">
                        {(req.labs as { name: string } | null)?.name ?? "—"}
                      </td>
                      <td className="py-3 px-3">
                        <StatusBadge status={req.status} />
                      </td>
                      <td className="py-3 px-3 text-slate-400 whitespace-nowrap">
                        {format(new Date(req.created_at), "dd MMM yy")}
                      </td>
                    </tr>
                  ))}
                  {requests.length === 0 && !loading && (
                    <tr>
                      <td colSpan={7} className="py-16 text-center text-slate-400">
                        No requests yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── LABS TAB ── */}
        {activeTab === "labs" && (
          <div className="animate-fade-in space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white">
                Registered Laboratories ({labs.length})
              </h2>
              <Button onClick={() => setShowCreateLab(true)}>
                <Plus className="w-4 h-4" />
                Add Laboratory
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {labs.map((lab) => (
                <div
                  key={lab.id}
                  className="bg-white/5 border border-white/10 rounded-2xl p-5"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-medical-700/50 rounded-lg flex items-center justify-center">
                        <Building2 className="w-4 h-4 text-medical-400" />
                      </div>
                      <div>
                        <p className="font-semibold text-white text-sm">{lab.name}</p>
                        <Badge variant="blue" className="mt-0.5">
                          Prefix: {lab.prefix}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 mb-2">{lab.email}</p>
                  {(lab.addresses as string[]).map((addr, i) => (
                    <p key={i} className="text-xs text-slate-500 flex items-start gap-1 mt-1">
                      <span className="text-slate-600">•</span>
                      {addr}
                    </p>
                  ))}
                  <p className="text-xs text-slate-600 mt-3">
                    Added {format(new Date(lab.created_at), "dd MMM yyyy")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create Lab Modal */}
      {showCreateLab && (
        <CreateLabModal
          onClose={() => setShowCreateLab(false)}
          onSuccess={() => {
            setShowCreateLab(false);
            fetchData();
          }}
        />
      )}
    </div>
  );
}

// =============================================================================
// Create Lab Modal
// =============================================================================
function CreateLabModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [addresses, setAddresses] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [createdPassword, setCreatedPassword] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const addressList = addresses
      .split("\n")
      .map((a) => a.trim())
      .filter(Boolean);

    if (!name.trim() || !email.trim() || addressList.length === 0) {
      toast.error("Please fill in all required fields");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/create-lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          addresses: addressList,
          tempPassword: tempPassword.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCreatedPassword(data.tempPassword);
        toast.success(`Lab "${name}" created successfully!`);
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
      <div className="bg-slate-900 border border-white/15 rounded-2xl w-full max-w-md shadow-2xl animate-slide-up">
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <h2 className="font-semibold text-white">Add New Laboratory</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {createdPassword ? (
          <div className="p-5 space-y-4">
            <div className="text-center">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <Building2 className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="font-semibold text-white mb-1">Lab Created!</h3>
              <p className="text-sm text-slate-400">
                The lab has been registered and login credentials sent to their email.
              </p>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
              <p className="text-xs text-amber-400 font-semibold mb-1">Temporary Password</p>
              <p className="font-mono text-lg text-amber-300 font-bold">{createdPassword}</p>
              <p className="text-xs text-amber-500/70 mt-1">This has been sent to the lab's email</p>
            </div>
            <Button fullWidth onClick={onSuccess}>Done</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <Input
              label="Laboratory Name"
              required
              placeholder="e.g. Lagos General Hospital Lab"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-white/10 border-white/20 text-white placeholder-slate-400"
            />
            <Input
              label="Lab Login Email"
              type="email"
              required
              placeholder="lab@hospital.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-white/10 border-white/20 text-white placeholder-slate-400"
            />
            <Textarea
              label="Lab Addresses"
              required
              placeholder={"12 Victoria Island, Lagos\n45 Broad Street, Lagos Island"}
              hint="One address per line"
              rows={3}
              value={addresses}
              onChange={(e) => setAddresses(e.target.value)}
              className="bg-white/10 border-white/20 text-white placeholder-slate-400"
            />
            <div className="relative">
              <Input
                label="Temporary Password"
                type={showPassword ? "text" : "password"}
                placeholder="Leave blank to auto-generate"
                hint="Min 8 characters. Auto-generated if left blank."
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
                className="bg-white/10 border-white/20 text-white placeholder-slate-400 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-[34px] text-slate-400 hover:text-slate-200"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="secondary" fullWidth onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" fullWidth loading={loading}>
                Create Lab
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
