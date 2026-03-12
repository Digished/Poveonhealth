"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { toast } from "react-hot-toast";
import {
  Plus, FlaskConical, BarChart3, List, LogOut,
  Building2, Trash2, Eye, EyeOff, RefreshCw, X, Pencil,
  Phone, Upload, Check, MapPin, Users, ChevronRight,
  Code2, Key, Copy, TrendingUp, Link,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { StatusBadge, Badge } from "@/components/ui/Badge";
import type { Lab, LabRequest, AdminMetrics, ApiLog, ApiLogSummary, LabApiKey, LabRole, LabMember } from "@/lib/types";
import { SERVICE_CATEGORIES, LAB_CERTIFICATIONS } from "@/lib/constants";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client"; // still used for auth sign-out
import { useRouter } from "next/navigation";

type AdminTab = "metrics" | "requests" | "referrals" | "labs" | "analytics" | "marketers";

interface ReferralGroup {
  key: string;
  referrerName: string;
  hospital: string | null;
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  requests: LabRequest[];
  thisMonthCount: number;
}

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
  const [showCreateMarketer, setShowCreateMarketer] = useState(false);
  const [marketers, setMarketers] = useState<{ id: string; name: string; email: string; phone: string | null; code: string; created_at: string; doctor_count: number; referral_link: string }[]>([]);
  const [editLab, setEditLab] = useState<Lab | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingRequestId, setDeletingRequestId] = useState<string | null>(null);
  const [selectedReferralGroup, setSelectedReferralGroup] = useState<ReferralGroup | null>(null);
  const [apiLogs, setApiLogs] = useState<ApiLog[]>([]);
  const [apiLogSummary, setApiLogSummary] = useState<ApiLogSummary | null>(null);
  const [expandedLabIntegration, setExpandedLabIntegration] = useState<string | null>(null);

  const fetchApiLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/api-logs");
      const data = await res.json();
      if (data.success) {
        setApiLogs(data.logs ?? []);
        setApiLogSummary(data.summary ?? null);
      }
    } catch {
      // non-critical — don't toast on analytics failures
    }
  }, []);

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

  const fetchMarketers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/create-marketer");
      const data = await res.json();
      if (data.success) setMarketers(data.marketers ?? []);
    } catch {
      // non-critical
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [reqRes] = await Promise.all([
        fetch("/api/admin/requests"),
        fetchLabs(),
        fetchApiLogs(),
        fetchMarketers(),
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
  }, [fetchLabs, fetchMarketers]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const referralGroups = useMemo<ReferralGroup[]>(() => {
    const map = new Map<string, ReferralGroup>();
    const now = new Date();
    for (const req of requests) {
      const key = req.doctor_account_number
        ? `acc:${req.doctor_account_number}`
        : `name:${[req.doctor_prefix, req.doctor_name].filter(Boolean).join(" ")}`;
      const d = new Date(req.created_at);
      const isThisMonth = d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      const existing = map.get(key);
      if (existing) {
        existing.requests.push(req);
        if (isThisMonth) existing.thisMonthCount++;
      } else {
        map.set(key, {
          key,
          referrerName: [req.doctor_prefix, req.doctor_name].filter(Boolean).join(" "),
          hospital: req.doctor_hospital ?? null,
          bankName: req.doctor_bank_name,
          accountNumber: req.doctor_account_number,
          accountName: req.doctor_account_name,
          requests: [req],
          thisMonthCount: isThisMonth ? 1 : 0,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.requests.length - a.requests.length);
  }, [requests]);

  async function handleDeleteRequest(req: LabRequest) {
    if (!confirm(`Delete request ${req.code} for "${req.patient_name}"? This permanently removes it from the lab dashboard too.`)) return;
    setDeletingRequestId(req.id);
    try {
      const res = await fetch(`/api/admin/requests/${req.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast.success(`Request ${req.code} deleted`);
        setRequests((prev: LabRequest[]) => prev.filter((r: LabRequest) => r.id !== req.id));
      } else {
        toast.error(data.error ?? "Failed to delete");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setDeletingRequestId(null);
    }
  }

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
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-5 md:py-8">
        <div className="overflow-x-auto -mx-4 px-4 mb-6 md:mb-8">
          <div className="flex gap-1 bg-white/5 rounded-xl p-1 w-max">
            {[
              { key: "metrics" as AdminTab, label: "Metrics", icon: <BarChart3 className="w-4 h-4" /> },
              { key: "requests" as AdminTab, label: "All Requests", icon: <List className="w-4 h-4" /> },
              { key: "referrals" as AdminTab, label: "Referrals", icon: <Users className="w-4 h-4" /> },
              { key: "labs" as AdminTab, label: "Labs", icon: <Building2 className="w-4 h-4" /> },
              { key: "analytics" as AdminTab, label: "API Analytics", icon: <BarChart3 className="w-4 h-4" /> },
              { key: "marketers" as AdminTab, label: "Marketers", icon: <TrendingUp className="w-4 h-4" /> },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shrink-0 ${
                  activeTab === tab.key ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>
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
                        <p className="text-sm text-white flex-1 min-w-0 truncate">{lab.lab_name}</p>
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
              <>
                {/* Mobile card layout */}
                <div className="md:hidden space-y-2">
                  {requests.map((req) => (
                    <div key={req.id} className="bg-white/5 border border-white/8 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <p className="font-medium text-white truncate">{req.patient_name}</p>
                          <span className="font-mono text-medical-400 text-xs">{req.code}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <StatusBadge status={req.status} />
                          <button
                            onClick={() => handleDeleteRequest(req)}
                            disabled={deletingRequestId === req.id}
                            className="p-1.5 rounded-lg hover:bg-red-500/15 text-slate-600 hover:text-red-400 transition-colors disabled:opacity-40"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 truncate">
                        <span className="text-slate-600">Ref: </span>
                        {[req.doctor_prefix, req.doctor_name].filter(Boolean).join(" ")}
                      </p>
                      {(req.doctor_bank_name || req.doctor_account_number) && (
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {[req.doctor_bank_name, req.doctor_account_number].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-xs text-slate-500 truncate flex-1">{(req.lab as { name: string } | null)?.name ?? "—"}</p>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          {req.schedule && (
                            <span className="text-xs bg-emerald-900/40 text-emerald-400 border border-emerald-800/30 px-1.5 py-0.5 rounded-full">
                              {({ today: "Today", this_week: "~1 week", this_month: "~1 month", not_sure: "TBD" } as Record<string, string>)[req.schedule] ?? req.schedule}
                            </span>
                          )}
                          <p className="text-xs text-slate-600">{format(new Date(req.created_at), "dd MMM yy")}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {requests.length === 0 && (
                    <div className="py-16 text-center text-slate-400">No requests yet</div>
                  )}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-left">
                        {["Code", "Patient", "Referred by", "Tests", "Lab", "Status", "Date", ""].map((h) => (
                          <th key={h} className="pb-3 px-3 text-xs text-slate-400 font-semibold uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {requests.map((req) => (
                        <tr key={req.id} className="hover:bg-white/5 transition-colors">
                          <td className="py-3 px-3"><span className="font-mono text-medical-400 text-xs">{req.code}</span></td>
                          <td className="py-3 px-3 text-white font-medium">{req.patient_name}</td>
                          <td className="py-3 px-3">
                            <p className="text-slate-300">{[req.doctor_prefix, req.doctor_name].filter(Boolean).join(" ")}</p>
                            {req.doctor_hospital && (
                              <p className="text-xs text-slate-500 mt-0.5">{req.doctor_hospital}</p>
                            )}
                            {(req.doctor_bank_name || req.doctor_account_number) && (
                              <p className="text-xs text-slate-500 mt-0.5">
                                {[req.doctor_bank_name, req.doctor_account_number].filter(Boolean).join(" · ")}
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-3 max-w-[180px]"><p className="text-slate-400 truncate">{req.tests}</p></td>
                          <td className="py-3 px-3 text-slate-300">{(req.lab as { name: string } | null)?.name ?? "—"}</td>
                          <td className="py-3 px-3"><StatusBadge status={req.status} /></td>
                          <td className="py-3 px-3 text-slate-400 whitespace-nowrap">{format(new Date(req.created_at), "dd MMM yy")}</td>
                          <td className="py-3 px-3">
                            <button
                              onClick={() => handleDeleteRequest(req)}
                              disabled={deletingRequestId === req.id}
                              className="p-1.5 rounded-lg hover:bg-red-500/15 text-slate-600 hover:text-red-400 transition-colors disabled:opacity-40"
                              title="Delete request"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {requests.length === 0 && (
                        <tr><td colSpan={8} className="py-16 text-center text-slate-400">No requests yet</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── REFERRALS ── */}
        {activeTab === "referrals" && (
          <div className="animate-fade-in space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-white">Referral Tracking</h2>
                <p className="text-xs text-slate-500 mt-0.5">Grouped by unique bank account</p>
              </div>
              <span className="text-xs text-slate-500 bg-white/5 px-3 py-1.5 rounded-full">{referralGroups.length} referrer{referralGroups.length !== 1 ? "s" : ""}</span>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-5 animate-pulse h-32" />
                ))}
              </div>
            ) : referralGroups.length === 0 ? (
              <div className="text-center py-20 text-slate-500">No referrals yet</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {referralGroups.map((group) => (
                  <button
                    key={group.key}
                    onClick={() => setSelectedReferralGroup(group)}
                    className="bg-white/5 border border-white/10 hover:border-white/20 rounded-2xl p-5 text-left transition-all hover:bg-white/8 group"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-9 h-9 bg-medical-700/40 rounded-xl flex items-center justify-center shrink-0">
                        <Users className="w-4 h-4 text-medical-400" />
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors mt-1" />
                    </div>
                    <p className="font-semibold text-white text-sm truncate">{group.referrerName || "—"}</p>
                    {group.hospital && (
                      <p className="text-xs text-slate-400 truncate mt-0.5">{group.hospital}</p>
                    )}
                    {group.accountName && (
                      <p className="text-xs text-slate-400 truncate mt-0.5">{group.accountName}</p>
                    )}
                    {group.bankName && (
                      <p className="text-xs text-slate-500 truncate">{group.bankName}{group.accountNumber ? ` · ${group.accountNumber}` : ""}</p>
                    )}
                    <div className="flex items-center gap-3 mt-4 pt-3 border-t border-white/5">
                      <div>
                        <p className="text-2xl font-bold text-white">{group.requests.length}</p>
                        <p className="text-xs text-slate-500">total</p>
                      </div>
                      <div className="border-l border-white/10 pl-3">
                        <p className="text-2xl font-bold text-medical-400">{group.thisMonthCount}</p>
                        <p className="text-xs text-slate-500">this month</p>
                      </div>
                    </div>
                  </button>
                ))}
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
                <span className="hidden sm:inline">Add Laboratory</span>
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
                    {lab.notification_email && (
                      <p className="text-xs text-emerald-400 flex items-center gap-1 mb-1" title="Custom notification email configured">
                        <span>✉</span> {lab.notification_email}
                      </p>
                    )}
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
                    {(lab.service_categories as string[]).length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs text-slate-600 mb-1.5">Services</p>
                        <div className="flex flex-wrap gap-1">
                          {(lab.service_categories as string[]).slice(0, 4).map((c) => (
                            <span key={c} className="text-xs bg-medical-900/50 text-medical-300 border border-medical-800/40 px-2 py-0.5 rounded-full">{c}</span>
                          ))}
                          {(lab.service_categories as string[]).length > 4 && (
                            <span className="text-xs text-slate-500 px-1">+{(lab.service_categories as string[]).length - 4} more</span>
                          )}
                        </div>
                      </div>
                    )}
                    {(lab.certifications as string[]).length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-slate-600 mb-1.5">Certifications</p>
                        <div className="flex flex-wrap gap-1">
                          {(lab.certifications as string[]).map((c) => (
                            <span key={c} className="text-xs bg-amber-900/20 text-amber-400 border border-amber-800/30 px-2 py-0.5 rounded-full">{c}</span>
                          ))}
                        </div>
                      </div>
                    )}
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
                        onClick={() => setExpandedLabIntegration(lab.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 text-xs transition-colors"
                      >
                        <Code2 className="w-3 h-3" />Dev
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
        {/* ── API ANALYTICS ── */}
        {activeTab === "analytics" && (
          <div className="animate-fade-in space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-white">API Analytics</h2>
                <p className="text-xs text-slate-500 mt-0.5">Live API call tracking — last 200 calls</p>
              </div>
              <button onClick={fetchApiLogs} className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {/* Summary cards */}
            {apiLogSummary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Calls Today", value: apiLogSummary.today, color: "from-blue-500/20 to-blue-600/10 border-blue-500/30" },
                  { label: "Calls This Week", value: apiLogSummary.week, color: "from-medical-500/20 to-medical-600/10 border-medical-500/30" },
                  { label: "Success (2xx)", value: apiLogSummary.byStatus.filter(s => s.status >= 200 && s.status < 300).reduce((a, b) => a + b.count, 0), color: "from-emerald-400/20 to-emerald-500/10 border-emerald-400/30" },
                  { label: "Errors (4xx/5xx)", value: apiLogSummary.byStatus.filter(s => s.status >= 400).reduce((a, b) => a + b.count, 0), color: "from-red-400/20 to-red-500/10 border-red-400/30" },
                ].map((stat) => (
                  <div key={stat.label} className={`bg-gradient-to-br ${stat.color} border rounded-2xl p-5`}>
                    <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">{stat.label}</p>
                    <p className="text-3xl font-bold text-white">{stat.value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Top endpoints */}
            {apiLogSummary && apiLogSummary.topEndpoints.length > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-slate-300 mb-4">Top Endpoints (last 7 days)</h3>
                <div className="space-y-2.5">
                  {apiLogSummary.topEndpoints.map((ep) => {
                    const max = apiLogSummary.topEndpoints[0]?.count ?? 1;
                    return (
                      <div key={ep.path} className="flex items-center gap-3">
                        <code className="text-xs font-mono text-medical-300 w-64 shrink-0 truncate">{ep.path}</code>
                        <div className="flex-1 bg-white/8 rounded-full h-2 overflow-hidden">
                          <div className="h-full bg-medical-500 rounded-full transition-all" style={{ width: `${(ep.count / max) * 100}%` }} />
                        </div>
                        <span className="text-xs text-slate-400 font-mono w-10 text-right shrink-0">{ep.count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent calls table */}
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-white/10">
                <h3 className="text-sm font-semibold text-slate-300">Recent API Calls</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/8">
                      {["Time", "Method", "Endpoint", "Status", "Duration"].map((h) => (
                        <th key={h} className="pb-2 pt-3 px-4 text-left text-xs text-slate-500 font-semibold uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {apiLogs.length === 0 && (
                      <tr><td colSpan={5} className="py-12 text-center text-slate-500 text-sm">No API calls recorded yet. Calls will appear here as the API is used.</td></tr>
                    )}
                    {apiLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-white/4 transition-colors">
                        <td className="py-2.5 px-4 text-xs text-slate-500 whitespace-nowrap">{format(new Date(log.created_at), "dd MMM HH:mm:ss")}</td>
                        <td className="py-2.5 px-4">
                          <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${
                            log.method === "GET" ? "text-emerald-400 bg-emerald-400/10" :
                            log.method === "POST" ? "text-blue-400 bg-blue-400/10" :
                            log.method === "DELETE" ? "text-red-400 bg-red-400/10" :
                            "text-slate-400 bg-white/10"
                          }`}>{log.method}</span>
                        </td>
                        <td className="py-2.5 px-4"><code className="text-xs font-mono text-slate-300">{log.path}</code></td>
                        <td className="py-2.5 px-4">
                          <span className={`text-xs font-mono font-bold ${
                            log.status >= 200 && log.status < 300 ? "text-emerald-400" :
                            log.status >= 400 ? "text-red-400" : "text-slate-400"
                          }`}>{log.status}</span>
                        </td>
                        <td className="py-2.5 px-4 text-xs text-slate-500 font-mono">{log.duration_ms != null ? `${log.duration_ms}ms` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Security notice */}
            <div className="bg-amber-500/8 border border-amber-500/20 rounded-2xl p-4">
              <p className="text-xs font-semibold text-amber-400 mb-1">Security Notice</p>
              <p className="text-xs text-amber-200/70 leading-relaxed">
                IP addresses are not stored. Lab IDs are logged only for authenticated lab endpoints.
                Logs older than 90 days should be purged periodically to comply with data minimisation principles.
              </p>
            </div>
          </div>
        )}

        {/* ── MARKETERS ── */}
        {activeTab === "marketers" && (
          <div className="animate-fade-in space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white">Marketers ({marketers.length})</h2>
              <Button onClick={() => setShowCreateMarketer(true)}>
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Add Marketer</span>
              </Button>
            </div>

            {marketers.length === 0 && !loading ? (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
                <TrendingUp className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-400">No marketers yet</p>
                <p className="text-xs text-slate-500 mt-1">Add a marketer to generate their referral link.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {marketers.map((m) => (
                  <div key={m.id} className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-emerald-700/40 rounded-lg flex items-center justify-center shrink-0">
                        <TrendingUp className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-white text-sm truncate">{m.name}</p>
                        <p className="text-xs text-slate-400 truncate">{m.email}</p>
                      </div>
                    </div>
                    {m.phone && (
                      <p className="text-xs text-slate-500 flex items-center gap-1">
                        <Phone className="w-3 h-3 text-slate-600 shrink-0" />{m.phone}
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-emerald-900/40 text-emerald-400 border border-emerald-800/30 px-2 py-0.5 rounded-full font-mono">
                        {m.code}
                      </span>
                      <span className="text-xs text-slate-500">{m.doctor_count} doctor{m.doctor_count !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="bg-white/5 rounded-xl border border-white/10 px-3 py-2 flex items-center gap-2">
                      <Link className="w-3 h-3 text-slate-500 shrink-0" />
                      <span className="text-xs text-slate-500 flex-1 truncate font-mono">{m.referral_link}</span>
                      <button
                        type="button"
                        onClick={() => { navigator.clipboard.writeText(m.referral_link); toast.success("Referral link copied!"); }}
                        className="shrink-0 text-slate-400 hover:text-white transition-colors"
                        title="Copy referral link"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-xs text-slate-600">Added {format(new Date(m.created_at), "dd MMM yyyy")}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {showCreateMarketer && (
        <CreateMarketerModal onClose={() => setShowCreateMarketer(false)} onSuccess={() => { setShowCreateMarketer(false); fetchMarketers(); }} />
      )}
      {showCreateLab && (
        <CreateLabModal onClose={() => setShowCreateLab(false)} onSuccess={() => { setShowCreateLab(false); fetchLabs(); }} />
      )}
      {editLab && (
        <EditLabModal lab={editLab} onClose={() => setEditLab(null)} onSuccess={() => { setEditLab(null); fetchLabs(); }} />
      )}
      {selectedReferralGroup && (
        <ReferralDetailModal group={selectedReferralGroup} onClose={() => setSelectedReferralGroup(null)} />
      )}
      {expandedLabIntegration && (() => {
        const lab = labs.find((l) => l.id === expandedLabIntegration);
        return lab ? (
          <LabIntegrationModal lab={lab} onClose={() => setExpandedLabIntegration(null)} />
        ) : null;
      })()}
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
  const [notificationEmail, setNotificationEmail] = useState("");
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
        body: JSON.stringify({ name: name.trim(), email: email.trim(), address: address.trim(), description: description.trim() || undefined, phones: phoneList, notification_email: notificationEmail.trim() || undefined, tempPassword: tempPassword.trim() || undefined }),
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
            <div>
              <label className="text-sm font-medium text-slate-300 block mb-1">
                Notification Email <span className="text-xs text-slate-500">(optional)</span>
              </label>
              <input type="email" className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 ${whiteInput}`} placeholder="no-reply@foremost.com" value={notificationEmail} onChange={(e) => setNotificationEmail(e.target.value)} />
              <p className="text-xs text-slate-500 mt-1">
                Emails to doctors &amp; patients will come from this address. Must be verified in Resend first. Leave blank to use notifications@poveon.com.
              </p>
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
  const [notificationEmail, setNotificationEmail] = useState(lab.notification_email ?? "");
  const [selectedCategories, setSelectedCategories] = useState<string[]>((lab.service_categories as string[]) ?? []);
  const [selectedCerts, setSelectedCerts] = useState<string[]>((lab.certifications as string[]) ?? []);
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
        body: JSON.stringify({ name: name.trim(), address: address.trim(), description: description.trim(), phones: phoneList, notification_email: notificationEmail.trim() || null, service_categories: selectedCategories, certifications: selectedCerts }),
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
            <label className="text-sm font-medium text-slate-300 block mb-1">
              Notification Email <span className="text-xs text-slate-500">(optional)</span>
            </label>
            <input type="email" className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 ${whiteInput}`} placeholder="no-reply@foremost.com" value={notificationEmail} onChange={(e) => setNotificationEmail(e.target.value)} />
            <p className="text-xs text-slate-500 mt-1">
              When set, all patient &amp; doctor emails for this lab will come from this address and display the lab&apos;s name. Must be verified in Resend. Leave blank to use notifications@poveon.com.
            </p>
          </div>

          <SearchableCheckboxGroup
            label="Service Categories"
            groups={SERVICE_CATEGORIES}
            selected={selectedCategories}
            onChange={setSelectedCategories}
          />
          <SearchableCheckboxGroup
            label="Certifications"
            flatItems={LAB_CERTIFICATIONS}
            selected={selectedCerts}
            onChange={setSelectedCerts}
          />

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

// =============================================================================
// Referral Detail Modal
// =============================================================================
function ReferralDetailModal({ group, onClose }: { group: ReferralGroup; onClose: () => void }) {
  const [monthFilter, setMonthFilter] = useState<string>("all");

  // Build unique month options from the group's requests
  const monthOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { value: string; label: string }[] = [];
    for (const req of group.requests) {
      const d = new Date(req.created_at);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!seen.has(val)) {
        seen.add(val);
        opts.push({ value: val, label: format(d, "MMMM yyyy") });
      }
    }
    return opts.sort((a, b) => b.value.localeCompare(a.value));
  }, [group.requests]);

  const filtered = useMemo(() => {
    if (monthFilter === "all") return group.requests;
    return group.requests.filter((r) => {
      const d = new Date(r.created_at);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` === monthFilter;
    });
  }, [group.requests, monthFilter]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-white/15 rounded-2xl w-full max-w-lg shadow-2xl animate-slide-up max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-white/10 shrink-0">
          <div>
            <h2 className="font-semibold text-white">{group.referrerName || "Unknown Referrer"}</h2>
            {group.hospital && <p className="text-xs text-slate-400 mt-0.5">{group.hospital}</p>}
            {group.accountName && <p className="text-sm text-slate-400 mt-0.5">{group.accountName}</p>}
            {group.bankName && (
              <p className="text-xs text-slate-500 mt-0.5">
                {group.bankName}{group.accountNumber ? ` · ${group.accountNumber}` : ""}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 transition-colors mt-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stats bar */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 bg-white/3 border-b border-white/5 shrink-0">
          <div>
            <span className="text-lg font-bold text-white">{group.requests.length}</span>
            <span className="text-xs text-slate-500 ml-1.5">total referrals</span>
          </div>
          <div>
            <span className="text-lg font-bold text-medical-400">{group.thisMonthCount}</span>
            <span className="text-xs text-slate-500 ml-1.5">this month</span>
          </div>
          {/* Month filter */}
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="ml-auto text-xs bg-white/8 border border-white/10 text-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-medical-500"
          >
            <option value="all">All months</option>
            {monthOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Referral list */}
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {filtered.length === 0 && (
            <p className="text-center text-slate-500 py-10 text-sm">No referrals for this period</p>
          )}
          {filtered.map((req) => (
            <div key={req.id} className="bg-white/5 border border-white/8 rounded-xl px-4 py-3">
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="text-sm text-white font-medium truncate">{req.patient_name}</p>
                <StatusBadge status={req.status} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-slate-500 truncate flex-1">{req.tests}</p>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-xs text-medical-400">{req.code}</span>
                  <span className="text-xs text-slate-600">{format(new Date(req.created_at), "dd MMM")}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Lab Integration Panel — shown inline on each lab card when "Dev" is clicked
// =============================================================================
const API_BASE = "https://poveon.com/api";

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <div className="flex items-center gap-2 bg-slate-950/60 border border-white/8 rounded-lg px-3 py-2">
        <code className="text-xs font-mono text-slate-300 flex-1 break-all">{value}</code>
        <button onClick={copy} className="shrink-0 p-1 rounded hover:bg-white/10 text-slate-500 hover:text-white transition-colors">
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

type IntegrationTab = "developer" | "team";

function LabIntegrationModal({ lab, onClose }: { lab: Lab; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<IntegrationTab>("developer");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-white/15 rounded-2xl w-full max-w-lg shadow-2xl animate-slide-up max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-blue-400" />
            <div>
              <h2 className="font-semibold text-white text-sm">{lab.name}</h2>
              <p className="text-xs text-slate-500">Developer & Team Setup</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white/5 rounded-lg p-0.5 mx-5 mt-4 shrink-0 w-fit">
          {([
            { key: "developer" as IntegrationTab, label: "Developer", icon: <Code2 className="w-3 h-3" /> },
            { key: "team" as IntegrationTab, label: "Team & Roles", icon: <Users className="w-3 h-3" /> },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === t.key ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          {activeTab === "developer" && <LabDeveloperTab lab={lab} />}
          {activeTab === "team" && <LabTeamTab lab={lab} />}
        </div>
      </div>
    </div>
  );
}

// ── Developer Tab ──────────────────────────────────────────────────────────
function LabDeveloperTab({ lab }: { lab: Lab }) {
  const [keys, setKeys] = useState<LabApiKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [newKeyName, setNewKeyName] = useState("");
  const [generatingKey, setGeneratingKey] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [revealedKeyCopied, setRevealedKeyCopied] = useState(false);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/labs/${lab.id}/api-keys`);
      const data = await res.json();
      if (data.success) setKeys(data.keys ?? []);
    } finally {
      setLoadingKeys(false);
    }
  }, [lab.id]);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  async function handleGenerateKey() {
    if (!newKeyName.trim()) { toast.error("Enter a name for this key"); return; }
    setGeneratingKey(true);
    try {
      const res = await fetch(`/api/admin/labs/${lab.id}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setRevealedKey(data.key);
        setRevealedKeyCopied(false);
        setNewKeyName("");
        await fetchKeys();
        toast.success("API key generated — copy it now!");
      } else {
        toast.error(data.error ?? "Failed to generate key");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setGeneratingKey(false);
    }
  }

  async function handleRevokeKey(keyId: string, keyName: string) {
    if (!confirm(`Revoke "${keyName}"? Any LIMS using this key will stop working immediately.`)) return;
    try {
      const res = await fetch(`/api/admin/labs/${lab.id}/api-keys/${keyId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) { toast.success("Key revoked"); await fetchKeys(); }
      else toast.error(data.error ?? "Failed to revoke");
    } catch { toast.error("Network error"); }
  }

  const snippet = `curl -X POST ${API_BASE}/requests/create \\
  -H "Content-Type: application/json" \\
  -H "X-Poveon-Api-Key: <your-api-key>" \\
  -d '{
    "lab_id": "${lab.id}",
    "patient_name": "Ada Okonkwo",
    "dob": "1990-05-12",
    "sex": "female",
    "doctor_name": "Dr. James",
    "doctor_email": "james@clinic.com",
    "tests": "FBC, LFT"
  }'`;

  return (
    <div className="space-y-4">
      <div className="space-y-2.5">
        <CopyField label="Lab ID" value={lab.id} />
        <CopyField label="API Base URL" value={API_BASE} />
      </div>

      <div>
        <p className="text-xs text-slate-500 mb-1">Sample request (create lab request)</p>
        <div className="relative bg-slate-950/70 border border-white/8 rounded-lg p-3 overflow-x-auto">
          <pre className="text-xs font-mono text-slate-300 whitespace-pre">{snippet}</pre>
          <button
            onClick={() => { navigator.clipboard.writeText(snippet); toast.success("Snippet copied!"); }}
            className="absolute top-2 right-2 p-1 rounded bg-white/5 hover:bg-white/15 text-slate-500 hover:text-white transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {revealedKey && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 space-y-2">
          <p className="text-xs font-semibold text-emerald-400">New key generated — copy it now. It will never be shown again.</p>
          <div className="flex items-center gap-2 bg-slate-950/60 border border-emerald-500/20 rounded-lg px-3 py-2">
            <code className="text-xs font-mono text-emerald-300 flex-1 break-all">{revealedKey}</code>
            <button
              onClick={() => { navigator.clipboard.writeText(revealedKey); setRevealedKeyCopied(true); }}
              className="shrink-0 p-1 rounded hover:bg-white/10 text-emerald-500 hover:text-white transition-colors"
            >
              {revealedKeyCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <button onClick={() => setRevealedKey(null)} className="text-xs text-slate-500 hover:text-white transition-colors">Dismiss</button>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1.5">
          <Key className="w-3.5 h-3.5" />API Keys
        </p>
        {loadingKeys ? (
          <p className="text-xs text-slate-600 py-2">Loading…</p>
        ) : keys.length === 0 ? (
          <p className="text-xs text-slate-600 py-2">No API keys yet. Generate one below.</p>
        ) : (
          <div className="space-y-1.5 mb-3">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center gap-2 bg-slate-950/40 border border-white/6 rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-300 truncate">{k.name}</p>
                  <p className="text-xs text-slate-600 font-mono">
                    {k.key_prefix}…
                    {k.last_used ? ` · last used ${format(new Date(k.last_used), "dd MMM yyyy")}` : " · never used"}
                    {k.expires_at ? ` · expires ${format(new Date(k.expires_at), "dd MMM yyyy")}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => handleRevokeKey(k.id, k.name)}
                  className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs transition-colors"
                >
                  <Trash2 className="w-3 h-3" />Revoke
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleGenerateKey()}
            placeholder="Key name (e.g. LIMS Production)"
            className="flex-1 bg-slate-950/40 border border-white/10 text-slate-200 placeholder-slate-600 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={handleGenerateKey}
            disabled={generatingKey}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
          >
            {generatingKey ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Key className="w-3 h-3" />}
            Generate
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-600">
        Authenticate LIMS requests with <code className="font-mono text-slate-500">X-Poveon-Api-Key</code>. Keys are hashed — only the prefix is stored for display.
      </p>
    </div>
  );
}

// ── Team & Roles Tab ───────────────────────────────────────────────────────

const PERMISSION_LABELS: { key: keyof LabRole; label: string }[] = [
  { key: "can_view_requests",   label: "View requests"   },
  { key: "can_mark_seen",       label: "Mark seen"       },
  { key: "can_mark_done",       label: "Mark done"       },
  { key: "can_send_results",    label: "Send results"    },
  { key: "can_manage_team",     label: "Manage team"     },
  { key: "can_manage_api_keys", label: "Manage API keys" },
  { key: "can_view_referrals",  label: "View referrals"  },
];

type DraftRole = {
  name: string;
  can_view_requests:   boolean;
  can_mark_seen:       boolean;
  can_mark_done:       boolean;
  can_send_results:    boolean;
  can_manage_team:     boolean;
  can_manage_api_keys: boolean;
  can_view_referrals:  boolean;
};

function blankRole(): DraftRole {
  return { name: "", can_view_requests: true, can_mark_seen: false, can_mark_done: false, can_send_results: false, can_manage_team: false, can_manage_api_keys: false, can_view_referrals: false };
}

function LabTeamTab({ lab }: { lab: Lab }) {
  const [roles, setRoles]     = useState<LabRole[]>([]);
  const [members, setMembers] = useState<LabMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Role editing state
  const [editingRole, setEditingRole] = useState<LabRole | null>(null);
  const [showNewRole, setShowNewRole] = useState(false);
  const [draftRole, setDraftRole]     = useState<DraftRole>(blankRole());
  const [savingRole, setSavingRole]   = useState(false);

  // Member invite state
  const [showInvite, setShowInvite]     = useState(false);
  const [inviteEmail, setInviteEmail]   = useState("");
  const [inviteRoleId, setInviteRoleId] = useState("");
  const [inviting, setInviting]         = useState(false);
  const [newMemberPass, setNewMemberPass] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [rolesRes, membersRes] = await Promise.all([
        fetch(`/api/admin/labs/${lab.id}/roles`),
        fetch(`/api/admin/labs/${lab.id}/members`),
      ]);
      const [rd, md] = await Promise.all([rolesRes.json(), membersRes.json()]);
      if (rd.success) setRoles(rd.roles ?? []);
      if (md.success) setMembers(md.members ?? []);
    } finally {
      setLoading(false);
    }
  }, [lab.id]);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Role save (create or update) ──
  async function handleSaveRole() {
    if (!draftRole.name.trim()) { toast.error("Role name is required"); return; }
    setSavingRole(true);
    try {
      const url  = editingRole ? `/api/admin/labs/${lab.id}/roles/${editingRole.id}` : `/api/admin/labs/${lab.id}/roles`;
      const method = editingRole ? "PATCH" : "POST";
      const res  = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(draftRole) });
      const data = await res.json();
      if (data.success) {
        toast.success(editingRole ? "Role updated" : "Role created");
        setShowNewRole(false);
        setEditingRole(null);
        setDraftRole(blankRole());
        await refresh();
      } else {
        toast.error(data.error ?? "Failed to save role");
      }
    } catch { toast.error("Network error"); }
    finally { setSavingRole(false); }
  }

  function startEditRole(role: LabRole) {
    setEditingRole(role);
    setDraftRole({
      name: role.name,
      can_view_requests:   role.can_view_requests,
      can_mark_seen:       role.can_mark_seen,
      can_mark_done:       role.can_mark_done,
      can_send_results:    role.can_send_results,
      can_manage_team:     role.can_manage_team,
      can_manage_api_keys: role.can_manage_api_keys,
      can_view_referrals:  role.can_view_referrals,
    });
    setShowNewRole(true);
  }

  async function handleDeleteRole(role: LabRole) {
    if (!confirm(`Delete role "${role.name}"?${(role._count?.members ?? 0) > 0 ? ` It still has ${role._count?.members} member(s) — reassign them first.` : ""}`)) return;
    try {
      const res  = await fetch(`/api/admin/labs/${lab.id}/roles/${role.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) { toast.success("Role deleted"); await refresh(); }
      else toast.error(data.error ?? "Failed to delete");
    } catch { toast.error("Network error"); }
  }

  // ── Member invite ──
  async function handleInvite() {
    if (!inviteEmail.trim() || !inviteRoleId) { toast.error("Email and role are required"); return; }
    setInviting(true);
    try {
      const res  = await fetch(`/api/admin/labs/${lab.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role_id: inviteRoleId }),
      });
      const data = await res.json();
      if (data.success) {
        setNewMemberPass(data.tempPassword);
        setInviteEmail("");
        setInviteRoleId("");
        setShowInvite(false);
        await refresh();
        toast.success("Member invited!");
      } else {
        toast.error(data.error ?? "Failed to invite");
      }
    } catch { toast.error("Network error"); }
    finally { setInviting(false); }
  }

  async function handleRemoveMember(member: LabMember) {
    if (!confirm(`Remove this member? Their login will be deleted.`)) return;
    try {
      const res  = await fetch(`/api/admin/labs/${lab.id}/members/${member.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) { toast.success("Member removed"); await refresh(); }
      else toast.error(data.error ?? "Failed to remove");
    } catch { toast.error("Network error"); }
  }

  if (loading) return <p className="text-xs text-slate-600 py-4 text-center">Loading…</p>;

  return (
    <div className="space-y-5">

      {/* ── Roles section ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5" />Roles ({roles.length})
          </p>
          <button
            onClick={() => { setEditingRole(null); setDraftRole(blankRole()); setShowNewRole(true); }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs transition-colors"
          >
            <Plus className="w-3 h-3" />New Role
          </button>
        </div>

        {roles.length === 0 && !showNewRole && (
          <p className="text-xs text-slate-600 py-2">No roles yet. Create one to start inviting team members.</p>
        )}

        <div className="space-y-1.5">
          {roles.map((r) => (
            <div key={r.id} className="bg-slate-950/40 border border-white/6 rounded-lg px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-slate-300">{r.name}</p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {PERMISSION_LABELS.filter((p) => r[p.key as keyof LabRole]).map((p) => p.label).join(" · ") || "No permissions"}
                    {(r._count?.members ?? 0) > 0 && <span className="ml-2 text-slate-500">· {r._count?.members} member{(r._count?.members ?? 0) !== 1 ? "s" : ""}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => startEditRole(r)} className="p-1.5 rounded hover:bg-white/10 text-slate-500 hover:text-white transition-colors">
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button onClick={() => handleDeleteRole(r)} className="p-1.5 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Role editor */}
        {showNewRole && (
          <div className="mt-3 bg-slate-950/60 border border-blue-500/20 rounded-xl p-3 space-y-3">
            <p className="text-xs font-semibold text-blue-300">{editingRole ? `Edit: ${editingRole.name}` : "New Role"}</p>
            <input
              value={draftRole.name}
              onChange={(e) => setDraftRole((d) => ({ ...d, name: e.target.value }))}
              placeholder="Role name (e.g. Front Desk, Lab Scientist)"
              className="w-full bg-slate-900 border border-white/10 text-slate-200 placeholder-slate-600 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="grid grid-cols-2 gap-1.5">
              {PERMISSION_LABELS.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={!!draftRole[key as keyof DraftRole]}
                    onChange={(e) => setDraftRole((d) => ({ ...d, [key]: e.target.checked }))}
                    className="accent-blue-500 w-3.5 h-3.5 shrink-0"
                  />
                  <span className="text-xs text-slate-400 group-hover:text-slate-200 transition-colors">{label}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setShowNewRole(false); setEditingRole(null); setDraftRole(blankRole()); }}
                className="flex-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 text-xs transition-colors">
                Cancel
              </button>
              <button onClick={handleSaveRole} disabled={savingRole}
                className="flex-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors disabled:opacity-50">
                {savingRole ? "Saving…" : editingRole ? "Save Changes" : "Create Role"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Members section ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />Members ({members.length})
          </p>
          {roles.length > 0 && (
            <button
              onClick={() => setShowInvite((v) => !v)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs transition-colors"
            >
              <Plus className="w-3 h-3" />Invite
            </button>
          )}
        </div>

        {roles.length === 0 && (
          <p className="text-xs text-slate-600 py-1">Create at least one role before inviting members.</p>
        )}

        {members.length === 0 && roles.length > 0 && (
          <p className="text-xs text-slate-600 py-1">No members yet.</p>
        )}

        <div className="space-y-1.5">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-2 bg-slate-950/40 border border-white/6 rounded-lg px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-300 truncate">{m.email ?? m.user_id}</p>
                <p className="text-xs text-slate-600">
                  Role: <span className="text-slate-400">{m.role.name}</span>
                  {m.last_sign_in_at
                    ? <span className="ml-2 text-slate-600">· last login {format(new Date(m.last_sign_in_at), "dd MMM yyyy")}</span>
                    : <span className="ml-2 text-slate-600">· never logged in</span>}
                </p>
              </div>
              <button onClick={() => handleRemoveMember(m)}
                className="shrink-0 p-1.5 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>

        {/* Invite form */}
        {showInvite && (
          <div className="mt-3 bg-slate-950/60 border border-blue-500/20 rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold text-blue-300">Invite Team Member</p>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="member@lab.com"
              className="w-full bg-slate-900 border border-white/10 text-slate-200 placeholder-slate-600 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <select
              value={inviteRoleId}
              onChange={(e) => setInviteRoleId(e.target.value)}
              className="w-full bg-slate-900 border border-white/10 text-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select role…</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <div className="flex gap-2">
              <button onClick={() => setShowInvite(false)}
                className="flex-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 text-xs transition-colors">
                Cancel
              </button>
              <button onClick={handleInvite} disabled={inviting}
                className="flex-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors disabled:opacity-50">
                {inviting ? "Inviting…" : "Send Invite"}
              </button>
            </div>
          </div>
        )}

        {/* Temp password reveal */}
        {newMemberPass && (
          <div className="mt-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold text-amber-400">Member created — share this temporary password</p>
            <div className="flex items-center gap-2 bg-slate-950/60 rounded-lg px-3 py-2">
              <code className="text-xs font-mono text-amber-300 flex-1">{newMemberPass}</code>
              <button
                onClick={() => { navigator.clipboard.writeText(newMemberPass); toast.success("Copied!"); }}
                className="p-1 rounded hover:bg-white/10 text-amber-500 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
            <button onClick={() => setNewMemberPass(null)} className="text-xs text-slate-500 hover:text-white transition-colors">Dismiss</button>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Searchable Checkbox Group — used in EditLabModal
// =============================================================================
function SearchableCheckboxGroup({
  label,
  groups,
  flatItems,
  selected,
  onChange,
}: {
  label: string;
  groups?: { group: string; items: string[] }[];
  flatItems?: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const q = search.toLowerCase();

  const toggle = (item: string) => {
    onChange(selected.includes(item) ? selected.filter((s) => s !== item) : [...selected, item]);
  };

  // Build flat filtered list with optional group headers
  const rendered: ({ type: "group"; label: string } | { type: "item"; value: string })[] = [];
  if (groups) {
    for (const { group, items } of groups) {
      const filtered = items.filter((i) => i.toLowerCase().includes(q));
      if (filtered.length) {
        rendered.push({ type: "group", label: group });
        filtered.forEach((i) => rendered.push({ type: "item", value: i }));
      }
    }
  } else if (flatItems) {
    flatItems.filter((i) => i.toLowerCase().includes(q)).forEach((i) => rendered.push({ type: "item", value: i }));
  }

  return (
    <div>
      <label className="text-sm font-medium text-slate-300 block mb-1">
        {label}
        {selected.length > 0 && (
          <span className="ml-2 text-xs text-medical-400 font-normal">{selected.length} selected</span>
        )}
      </label>
      <input
        type="text"
        placeholder={`Search ${label.toLowerCase()}…`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className={`w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 mb-2 ${whiteInput}`}
      />
      <div className="max-h-44 overflow-y-auto bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        {rendered.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-4">No matches</p>
        )}
        {rendered.map((entry, i) =>
          entry.type === "group" ? (
            <p key={i} className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-1.5 bg-slate-50 sticky top-0">
              {entry.label}
            </p>
          ) : (
            <label key={entry.value} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(entry.value)}
                onChange={() => toggle(entry.value)}
                className="accent-blue-600 w-4 h-4 shrink-0"
              />
              <span className="text-sm text-slate-700">{entry.value}</span>
            </label>
          )
        )}
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {selected.map((s) => (
            <span key={s} className="flex items-center gap-1 text-xs bg-medical-900/60 text-medical-300 border border-medical-800/40 px-2 py-0.5 rounded-full">
              {s}
              <button type="button" onClick={() => toggle(s)} className="hover:text-white ml-0.5">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Create Marketer Modal
// =============================================================================
function CreateMarketerModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<{ code: string; referral_link: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) { toast.error("Name and email are required"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/create-marketer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), phone: phone.trim() || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        setCreated({ code: data.marketer.code, referral_link: data.referral_link });
        toast.success(`Marketer "${name}" created!`);
      } else {
        toast.error(data.error ?? "Failed to create marketer");
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
          <h2 className="font-semibold text-white">Add New Marketer</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 transition-colors"><X className="w-4 h-4" /></button>
        </div>
        {created ? (
          <div className="p-5 space-y-4">
            <div className="text-center">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <TrendingUp className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="font-semibold text-white mb-1">Marketer Created!</h3>
              <p className="text-sm text-slate-400">Share the referral link below with them.</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
              <div>
                <p className="text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wider">Referral Code</p>
                <p className="font-mono text-lg text-emerald-400 font-bold">{created.code}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wider">Referral Link</p>
                <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
                  <span className="text-xs text-slate-300 flex-1 truncate font-mono">{created.referral_link}</span>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(created.referral_link); toast.success("Copied!"); }}
                    className="text-slate-400 hover:text-white transition-colors shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              The marketer can log in at <span className="text-slate-300 font-mono">/scale</span> using their email address (OTP-based, no password needed).
            </p>
            <Button fullWidth onClick={onSuccess}>Done</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-300 block mb-1">Full Name <span className="text-red-400">*</span></label>
              <input className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${whiteInput}`} placeholder="e.g. Amaka Johnson" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300 block mb-1">Email Address <span className="text-red-400">*</span></label>
              <input type="email" className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${whiteInput}`} placeholder="marketer@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <p className="text-xs text-slate-500 mt-1">They&apos;ll use this to log in at /scale.</p>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300 block mb-1">Phone Number <span className="text-xs text-slate-500">(optional)</span></label>
              <input className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${whiteInput}`} placeholder="+234 800 000 0000" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="secondary" fullWidth onClick={onClose}>Cancel</Button>
              <Button type="submit" fullWidth loading={loading}>Create Marketer</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
