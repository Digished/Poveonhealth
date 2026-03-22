"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { toast } from "react-hot-toast";
import {
  Plus, FlaskConical, BarChart3, List, LogOut,
  Building2, Trash2, Eye, EyeOff, RefreshCw, X, Pencil,
  Phone, Upload, Check, MapPin, Users, ChevronRight, ChevronDown, ChevronUp,
  Code2, Key, Copy, TrendingUp, Link, Sun, Moon, Star, GitBranch,
} from "lucide-react";
import { useDashTheme } from "@/hooks/useDashTheme";
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

const COUNTRY_CODES = [
  { code: "+234", label: "🇳🇬 NG +234" },
  { code: "+1",   label: "🇺🇸 US +1" },
  { code: "+44",  label: "🇬🇧 UK +44" },
  { code: "+27",  label: "🇿🇦 ZA +27" },
  { code: "+233", label: "🇬🇭 GH +233" },
  { code: "+254", label: "🇰🇪 KE +254" },
  { code: "+256", label: "🇺🇬 UG +256" },
  { code: "+255", label: "🇹🇿 TZ +255" },
  { code: "+251", label: "🇪🇹 ET +251" },
  { code: "+212", label: "🇲🇦 MA +212" },
  { code: "+20",  label: "🇪🇬 EG +20" },
  { code: "+971", label: "🇦🇪 UAE +971" },
  { code: "+91",  label: "🇮🇳 IN +91" },
  { code: "+86",  label: "🇨🇳 CN +86" },
];

function parseWaCode(full: string): { dial: string; local: string } {
  for (const c of COUNTRY_CODES) {
    if (full.startsWith(c.code)) {
      return { dial: c.code, local: full.slice(c.code.length).trimStart() };
    }
  }
  return { dial: "+234", local: full.startsWith("+") ? full.replace(/^\+\d{1,4}/, "").trimStart() : full };
}

function WhatsAppNumberInput({
  value,
  onChange,
  inputClass,
}: {
  value: string;
  onChange: (v: string) => void;
  inputClass: string;
}) {
  const { dial, local } = parseWaCode(value);
  return (
    <div className="flex gap-1 flex-1">
      <select
        value={dial}
        onChange={(e) => onChange(e.target.value + (local ? " " + local : ""))}
        className={`shrink-0 rounded-xl border px-2 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 ${inputClass}`}
        style={{ minWidth: "7rem" }}
      >
        {COUNTRY_CODES.map((c) => (
          <option key={c.code} value={c.code}>{c.label}</option>
        ))}
      </select>
      <input
        value={local}
        onChange={(e) => onChange(dial + " " + e.target.value)}
        placeholder="800 000 0000"
        className={`flex-1 min-w-0 rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 ${inputClass}`}
        type="tel"
      />
    </div>
  );
}

function refLink(code: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/?ref=${code}`;
}

export function AdminDashboard() {
  const router = useRouter();
  const { isLight, toggle, themeClass } = useDashTheme("admin_dash_theme");
  const [activeTab, setActiveTab] = useState<AdminTab>("metrics");
  const [labs, setLabs] = useState<Lab[]>([]);
  const [requests, setRequests] = useState<LabRequest[]>([]);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateLab, setShowCreateLab] = useState(false);
  const [showCreateMarketer, setShowCreateMarketer] = useState(false);
  const [marketers, setMarketers] = useState<{ id: string; name: string; email: string; phone: string | null; code: string; suspended: boolean; created_at: string; doctor_count: number; referral_link: string }[]>([]);
  const [selectedMarketerId, setSelectedMarketerId] = useState<string | null>(null);
  const [togglingMarketerId, setTogglingMarketerId] = useState<string | null>(null);
  const [deletingMarketerId, setDeletingMarketerId] = useState<string | null>(null);
  const [editLab, setEditLab] = useState<Lab | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingRequestId, setDeletingRequestId] = useState<string | null>(null);
  const [selectedReferralGroup, setSelectedReferralGroup] = useState<ReferralGroup | null>(null);
  const [apiLogs, setApiLogs] = useState<ApiLog[]>([]);
  const [apiLogSummary, setApiLogSummary] = useState<ApiLogSummary | null>(null);
  const [expandedLabIntegration, setExpandedLabIntegration] = useState<string | null>(null);
  const [branchModalLabId, setBranchModalLabId] = useState<string | null>(null);

  // Per-lab analytics modal
  type LabAnalytics = {
    total: number; done: number; seen: number; incoming: number; completionRate: number;
    monthlyStatus: Record<string, { incoming: number; seen: number; done: number; total: number }>;
    topTests: { name: string; total: number; done: number }[];
    topDoctors: { name: string; email: string; prefix: string | null; total: number; done: number }[];
    sexCounts: Record<string, number>;
    schedCounts: Record<string, number>;
    availableMonths: string[];
    availableTests: string[];
  };
  const [labAnalyticsLabId, setLabAnalyticsLabId] = useState<string | null>(null);
  const [labAnalyticsLabName, setLabAnalyticsLabName] = useState<string>("");
  const [labAnalytics, setLabAnalytics] = useState<LabAnalytics | null>(null);
  const [labAnalyticsLoading, setLabAnalyticsLoading] = useState(false);
  const [labAnalyticsMonth, setLabAnalyticsMonth] = useState("");
  const [labAnalyticsStatus, setLabAnalyticsStatus] = useState("");
  const [labAnalyticsTest, setLabAnalyticsTest] = useState("");

  const fetchLabAnalytics = useCallback(async (labId: string, month = "", status = "", test = "") => {
    setLabAnalyticsLoading(true);
    try {
      const p = new URLSearchParams();
      if (month) p.set("month", month);
      if (status) p.set("status", status);
      if (test) p.set("test", test);
      const res = await fetch(`/api/admin/labs/${labId}/analytics?${p}`);
      const data = await res.json();
      if (data.success) setLabAnalytics(data);
    } catch { /* non-critical */ } finally {
      setLabAnalyticsLoading(false);
    }
  }, []);

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

  async function handleToggleMarketerSuspended(m: typeof marketers[number]) {
    setTogglingMarketerId(m.id);
    try {
      const res = await fetch(`/api/admin/marketers/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suspended: !m.suspended }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(m.suspended ? `${m.name} unsuspended` : `${m.name} suspended`);
        await fetchMarketers();
      } else {
        toast.error(data.error ?? "Failed to update");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setTogglingMarketerId(null);
    }
  }

  async function handleDeleteMarketer(m: typeof marketers[number]) {
    if (!confirm(`Delete marketer "${m.name}"? This removes all their referral links. Cannot be undone.`)) return;
    setDeletingMarketerId(m.id);
    try {
      const res = await fetch(`/api/admin/marketers/${m.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast.success(`"${m.name}" deleted`);
        await fetchMarketers();
      } else {
        toast.error(data.error ?? "Failed to delete");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setDeletingMarketerId(null);
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
    <div className={`min-h-screen bg-gradient-to-br from-slate-900 via-medical-950 to-slate-900 text-white transition-colors duration-300 ${themeClass}`}>
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
            <button
              onClick={toggle}
              className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
              title={isLight ? "Switch to dark mode" : "Switch to light mode"}
            >
              {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
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
                    {(lab.slug || lab.whatsapp || lab.request_email) && (
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        {lab.slug && (
                          <a
                            href={`/${lab.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2 font-mono"
                            title={`Direct URL: poveon.com/${lab.slug}`}
                          >
                            /{lab.slug}
                          </a>
                        )}
                        {lab.whatsapp && (
                          <span className="inline-flex items-center gap-1 text-xs bg-green-900/30 text-green-400 border border-green-800/30 px-1.5 py-0.5 rounded-full" title={`WhatsApp: ${lab.whatsapp}`}>
                            <Phone className="w-2.5 h-2.5" />WA
                          </span>
                        )}
                        {lab.request_email && (
                          <span className="inline-flex items-center gap-1 text-xs bg-blue-900/30 text-blue-400 border border-blue-800/30 px-1.5 py-0.5 rounded-full" title={`Request email: ${lab.request_email}`}>
                            <span>✉</span> Requests
                          </span>
                        )}
                      </div>
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
                    <div className="flex items-center justify-between mt-3">
                      <p className="text-xs text-slate-600">Added {format(new Date(lab.created_at), "dd MMM yyyy")}</p>
                      {lab.rating_avg != null ? (
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <Star key={i} className={`w-3 h-3 ${i <= Math.round(lab.rating_avg!) ? "text-amber-400 fill-amber-400" : "text-slate-600"}`} />
                          ))}
                          <span className="text-xs text-amber-400 font-semibold ml-0.5">{lab.rating_avg.toFixed(1)}</span>
                          <span className="text-xs text-slate-600">({lab.rating_count})</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-600 italic">No ratings</span>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-white/5">
                      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                        <button
                          onClick={() => setEditLab(lab)}
                          className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs transition-colors"
                        >
                          <Pencil className="w-3 h-3" />Edit
                        </button>
                        <button
                          onClick={() => setBranchModalLabId(lab.id)}
                          className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs transition-colors"
                        >
                          <GitBranch className="w-3 h-3" />Branches
                        </button>
                        <button
                          onClick={() => handleToggleHidden(lab)}
                          disabled={togglingId === lab.id}
                          className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs transition-colors"
                        >
                          {lab.hidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          {lab.hidden ? "Show" : "Hide"}
                        </button>
                        <button
                          onClick={() => {
                            setLabAnalyticsLabId(lab.id);
                            setLabAnalyticsLabName(lab.name);
                            setLabAnalytics(null);
                            setLabAnalyticsMonth("");
                            setLabAnalyticsStatus("");
                            setLabAnalyticsTest("");
                            fetchLabAnalytics(lab.id);
                          }}
                          className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 text-xs transition-colors"
                        >
                          <BarChart3 className="w-3 h-3" />Stats
                        </button>
                        <button
                          onClick={() => setExpandedLabIntegration(lab.id)}
                          className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 text-xs transition-colors"
                        >
                          <Code2 className="w-3 h-3" />Dev
                        </button>
                        <button
                          onClick={() => handleDeleteLab(lab)}
                          disabled={deletingId === lab.id}
                          className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 text-xs transition-colors sm:ml-auto"
                        >
                          <Trash2 className="w-3 h-3" />Delete
                        </button>
                      </div>
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
                <div className="space-y-3">
                  {apiLogSummary.topEndpoints.map((ep) => {
                    const max = apiLogSummary.topEndpoints[0]?.count ?? 1;
                    return (
                      <div key={ep.path} className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <code className="text-xs font-mono text-medical-300 truncate min-w-0">{ep.path}</code>
                          <span className="text-xs text-slate-400 font-mono shrink-0">{ep.count}</span>
                        </div>
                        <div className="bg-white/8 rounded-full h-1.5 overflow-hidden">
                          <div className="h-full bg-medical-500 rounded-full transition-all" style={{ width: `${(ep.count / max) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent calls */}
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-white/10">
                <h3 className="text-sm font-semibold text-slate-300">Recent API Calls</h3>
              </div>

              {apiLogs.length === 0 && (
                <p className="py-12 text-center text-slate-500 text-sm">No API calls recorded yet. Calls will appear here as the API is used.</p>
              )}

              {/* Mobile card list */}
              {apiLogs.length > 0 && (
                <div className="md:hidden divide-y divide-white/5">
                  {apiLogs.map((log) => (
                    <div key={log.id} className="px-4 py-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${
                          log.method === "GET" ? "text-emerald-400 bg-emerald-400/10" :
                          log.method === "POST" ? "text-blue-400 bg-blue-400/10" :
                          log.method === "DELETE" ? "text-red-400 bg-red-400/10" :
                          "text-slate-400 bg-white/10"
                        }`}>{log.method}</span>
                        <span className={`text-xs font-mono font-bold ${
                          log.status >= 200 && log.status < 300 ? "text-emerald-400" :
                          log.status >= 400 ? "text-red-400" : "text-slate-400"
                        }`}>{log.status}</span>
                        <span className="text-xs text-slate-500 font-mono ml-auto">{log.duration_ms != null ? `${log.duration_ms}ms` : "—"}</span>
                      </div>
                      <code className="text-xs font-mono text-slate-400 block truncate">{log.path}</code>
                      <p className="text-xs text-slate-600">{format(new Date(log.created_at), "dd MMM HH:mm:ss")}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Desktop table */}
              {apiLogs.length > 0 && (
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/8">
                        {["Time", "Method", "Endpoint", "Status", "Duration"].map((h) => (
                          <th key={h} className="pb-2 pt-3 px-4 text-left text-xs text-slate-500 font-semibold uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
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
              )}
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
                  <div key={m.id} className={`bg-white/5 border rounded-2xl p-5 space-y-3 transition-opacity ${m.suspended ? "border-white/5 opacity-60" : "border-white/10"}`}>
                    {/* Header — clickable to open detail */}
                    <button
                      type="button"
                      onClick={() => setSelectedMarketerId(m.id)}
                      className="w-full flex items-center gap-2 text-left hover:opacity-80 transition-opacity"
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${m.suspended ? "bg-slate-700/40" : "bg-emerald-700/40"}`}>
                        <TrendingUp className={`w-4 h-4 ${m.suspended ? "text-slate-500" : "text-emerald-400"}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-white text-sm truncate">{m.name}</p>
                          {m.suspended && <span className="text-xs bg-red-900/40 text-red-400 border border-red-800/30 px-1.5 py-0.5 rounded-full">Suspended</span>}
                        </div>
                        <p className="text-xs text-slate-400 truncate">{m.email}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                    </button>
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
                      <span className="text-xs text-slate-500 flex-1 truncate font-mono">{refLink(m.code)}</span>
                      <button
                        type="button"
                        onClick={() => { navigator.clipboard.writeText(refLink(m.code)); toast.success("Referral link copied!"); }}
                        className="shrink-0 text-slate-400 hover:text-white transition-colors"
                        title="Copy referral link"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <p className="text-xs text-slate-600">Added {format(new Date(m.created_at), "dd MMM yyyy")}</p>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleToggleMarketerSuspended(m)}
                          disabled={togglingMarketerId === m.id}
                          title={m.suspended ? "Unsuspend" : "Suspend"}
                          className={`p-1.5 rounded-lg text-xs transition-colors disabled:opacity-40 ${m.suspended ? "hover:bg-emerald-500/15 text-slate-500 hover:text-emerald-400" : "hover:bg-amber-500/15 text-slate-500 hover:text-amber-400"}`}
                        >
                          {togglingMarketerId === m.id ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : m.suspended ? (
                            <Eye className="w-3.5 h-3.5" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteMarketer(m)}
                          disabled={deletingMarketerId === m.id}
                          title="Delete marketer"
                          className="p-1.5 rounded-lg hover:bg-red-500/15 text-slate-500 hover:text-red-400 transition-colors disabled:opacity-40"
                        >
                          {deletingMarketerId === m.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
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
      {selectedMarketerId && (
        <MarketerDetailModal
          marketerId={selectedMarketerId}
          onClose={() => setSelectedMarketerId(null)}
          onSuspendToggle={() => fetchMarketers()}
          onDelete={() => { setSelectedMarketerId(null); fetchMarketers(); }}
        />
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
      {branchModalLabId && (() => {
        const lab = labs.find((l) => l.id === branchModalLabId);
        return lab ? (
          <LabBranchModal lab={lab} onClose={() => setBranchModalLabId(null)} allLabs={labs} />
        ) : null;
      })()}

      {/* Per-lab analytics modal */}
      {labAnalyticsLabId && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ backgroundColor: "rgba(2,6,23,0.85)", backdropFilter: "blur(6px)" }}
          onClick={() => setLabAnalyticsLabId(null)}
        >
          <div
            className="w-full max-w-2xl bg-slate-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 pt-5 pb-4 border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <BarChart3 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <p className="font-bold text-white truncate">{labAnalyticsLabName}</p>
                  <p className="text-xs text-slate-500">Lab Analytics</p>
                </div>
              </div>
              <button type="button" onClick={() => setLabAnalyticsLabId(null)} className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filters */}
            <div className="px-5 py-3 border-b border-white/5 flex flex-wrap gap-2 shrink-0">
              <select
                value={labAnalyticsMonth}
                onChange={(e) => {
                  setLabAnalyticsMonth(e.target.value);
                  fetchLabAnalytics(labAnalyticsLabId, e.target.value, labAnalyticsStatus, labAnalyticsTest);
                }}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-200 outline-none cursor-pointer"
              >
                <option value="" className="bg-slate-800">All months</option>
                {(labAnalytics?.availableMonths ?? []).map((m) => {
                  const [y, mo] = m.split("-");
                  const lbl = new Date(Number(y), Number(mo) - 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
                  return <option key={m} value={m} className="bg-slate-800">{lbl}</option>;
                })}
              </select>
              <select
                value={labAnalyticsStatus}
                onChange={(e) => {
                  setLabAnalyticsStatus(e.target.value);
                  fetchLabAnalytics(labAnalyticsLabId, labAnalyticsMonth, e.target.value, labAnalyticsTest);
                }}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-200 outline-none cursor-pointer"
              >
                <option value="" className="bg-slate-800">All statuses</option>
                <option value="incoming" className="bg-slate-800">Incoming</option>
                <option value="seen" className="bg-slate-800">Patient Seen</option>
                <option value="done" className="bg-slate-800">Completed</option>
              </select>
              <select
                value={labAnalyticsTest}
                onChange={(e) => {
                  setLabAnalyticsTest(e.target.value);
                  fetchLabAnalytics(labAnalyticsLabId, labAnalyticsMonth, labAnalyticsStatus, e.target.value);
                }}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-200 outline-none cursor-pointer min-w-[140px]"
              >
                <option value="" className="bg-slate-800">All tests</option>
                {(labAnalytics?.availableTests ?? []).map((t) => (
                  <option key={t} value={t} className="bg-slate-800">{t}</option>
                ))}
              </select>
              {(labAnalyticsMonth || labAnalyticsStatus || labAnalyticsTest) && (
                <button
                  type="button"
                  onClick={() => { setLabAnalyticsMonth(""); setLabAnalyticsStatus(""); setLabAnalyticsTest(""); fetchLabAnalytics(labAnalyticsLabId); }}
                  className="text-xs text-slate-400 hover:text-white px-2.5 py-1.5 rounded-xl hover:bg-white/10 border border-white/10 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
              {labAnalyticsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
                </div>
              ) : labAnalytics ? (
                <>
                  {/* Summary stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: "Total", value: labAnalytics.total, color: "text-white" },
                      { label: "Completed", value: labAnalytics.done, color: "text-emerald-400" },
                      { label: "Patient Seen", value: labAnalytics.seen, color: "text-blue-400" },
                      { label: "Completion %", value: `${labAnalytics.completionRate}%`, color: "text-medical-300" },
                    ].map((s) => (
                      <div key={s.label} className="bg-white/5 border border-white/10 rounded-2xl p-4">
                        <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">{s.label}</p>
                        <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Monthly Status stacked bar chart */}
                  {(() => {
                    const months6: { key: string; label: string }[] = [];
                    for (let i = 5; i >= 0; i--) {
                      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
                      months6.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString("en-GB", { month: "short" }) });
                    }
                    const maxVal = Math.max(1, ...months6.map(({ key }) => labAnalytics.monthlyStatus[key]?.total ?? 0));
                    const barW = 36; const gap = 14; const colW = barW + gap; const chartH = 70; const labelY = chartH + 14;
                    const svgW = months6.length * colW + gap;
                    return (
                      <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Monthly Activity</p>
                          <div className="flex gap-3">
                            {[{ l: "Incoming", c: "#f59e0b" }, { l: "Seen", c: "#60a5fa" }, { l: "Done", c: "#10b981" }].map((s) => (
                              <div key={s.l} className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: s.c }} />
                                <span className="text-xs text-slate-500">{s.l}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          <svg viewBox={`0 0 ${svgW} ${labelY + 4}`} style={{ minWidth: `${Math.max(svgW, 220)}px`, height: `${labelY + 8}px`, width: "100%" }} preserveAspectRatio="none">
                            {months6.map(({ key, label }, mi) => {
                              const ms = labAnalytics.monthlyStatus[key] ?? { incoming: 0, seen: 0, done: 0, total: 0 };
                              const x = mi * colW + gap / 2;
                              let y = chartH;
                              const segs = [
                                { h: (ms.incoming / maxVal) * chartH, color: "#f59e0b", v: ms.incoming },
                                { h: (ms.seen / maxVal) * chartH, color: "#60a5fa", v: ms.seen },
                                { h: (ms.done / maxVal) * chartH, color: "#10b981", v: ms.done },
                              ];
                              const totalH = segs.reduce((a, s) => a + s.h, 0);
                              return (
                                <g key={key}>
                                  {segs.map((seg, si) => { y -= seg.h; return seg.h > 0 ? <rect key={si} x={x} y={y} width={barW} height={seg.h} fill={seg.color} opacity="0.85" /> : null; })}
                                  {ms.total > 0 && <text x={x + barW / 2} y={chartH - totalH - 2} textAnchor="middle" fill="white" fontSize="8">{ms.total}</text>}
                                  <text x={x + barW / 2} y={labelY} textAnchor="middle" fill="#94a3b8" fontSize="9">{label}</text>
                                </g>
                              );
                            })}
                          </svg>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Top tests */}
                  {labAnalytics.topTests.length > 0 && (
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Top Tests</p>
                      <div className="space-y-2">
                        {labAnalytics.topTests.slice(0, 12).map((t, idx) => {
                          const maxT = labAnalytics.topTests[0].total;
                          const pct = Math.round((t.total / maxT) * 100);
                          const donePct = t.total > 0 ? Math.round((t.done / t.total) * 100) : 0;
                          return (
                            <div key={t.name} className="flex items-center gap-3">
                              <span className="text-xs text-slate-600 w-4 text-right shrink-0">{idx + 1}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex justify-between text-xs mb-0.5">
                                  <span className="text-slate-300 truncate">{t.name}</span>
                                  <span className="text-slate-500 ml-2 shrink-0">{t.total} req · <span className="text-emerald-400">{t.done} done</span></span>
                                </div>
                                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden relative">
                                  <div className="h-full rounded-full absolute left-0 top-0 bg-white/20" style={{ width: `${pct}%` }} />
                                  <div className="h-full rounded-full absolute left-0 top-0 bg-emerald-500" style={{ width: `${Math.round((t.done / labAnalytics.topTests[0].total) * 100)}%` }} />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Top doctors */}
                  {labAnalytics.topDoctors.length > 0 && (
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Top Referring Doctors</p>
                      <div className="space-y-2">
                        {labAnalytics.topDoctors.map((doc, idx) => (
                          <div key={doc.email} className="flex items-center gap-3">
                            <span className="text-xs text-slate-600 w-4 text-right shrink-0">{idx + 1}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-300 truncate">{[doc.prefix, doc.name].filter(Boolean).join(" ")}</span>
                                <span className="text-slate-500 shrink-0 ml-2">{doc.total} · <span className="text-emerald-400">{doc.done} done</span></span>
                              </div>
                              <p className="text-xs text-slate-600 truncate">{doc.email}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Demographics 2-col */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Sex */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Sex</p>
                      {Object.entries(labAnalytics.sexCounts).map(([s, count]) => {
                        const tot = Object.values(labAnalytics.sexCounts).reduce((a, b) => a + b, 0) || 1;
                        const pct = Math.round((count / tot) * 100);
                        return (
                          <div key={s} className="mb-2">
                            <div className="flex justify-between text-xs mb-0.5">
                              <span className="text-slate-300 capitalize">{s}</span>
                              <span className="text-slate-500">{count} ({pct}%)</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                              <div className="h-full rounded-full bg-medical-500" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Schedule */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Schedule Preference</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(labAnalytics.schedCounts).map(([key, cnt]) => {
                          const lblMap: Record<string, string> = { today: "Today", this_week: "This Week", this_month: "This Month", not_sure: "Not Sure" };
                          return (
                            <div key={key} className="flex flex-col items-center bg-white/5 border border-white/10 rounded-xl px-3 py-2 min-w-[70px]">
                              <span className="text-lg font-bold text-white">{cnt}</span>
                              <span className="text-xs text-slate-500 text-center mt-0.5">{lblMap[key] ?? key}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
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
  const [notificationEmail, setNotificationEmail] = useState("");
  const [slug, setSlug] = useState("");
  const [slugError, setSlugError] = useState("");
  const [whatsappNumbers, setWhatsappNumbers] = useState<string[]>([""]);
  const [requestEmail, setRequestEmail] = useState("");
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
    if (slug.trim() && !/^[a-z0-9-]+$/.test(slug.trim())) {
      setSlugError("Only lowercase letters, numbers, and hyphens allowed");
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
          address: address.trim(),
          description: description.trim() || undefined,
          phones: phoneList,
          notification_email: notificationEmail.trim() || undefined,
          slug: slug.trim() || undefined,
          whatsapp: JSON.stringify(whatsappNumbers.map((n) => n.trim()).filter(Boolean)) || undefined,
          request_email: requestEmail.trim() || undefined,
          tempPassword: tempPassword.trim() || undefined,
        }),
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
            <div>
              <label className="text-sm font-medium text-slate-300 block mb-1">
                Lab URL Slug <span className="text-xs text-slate-500">(optional)</span>
              </label>
              <input
                className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 ${whiteInput} ${slugError ? "border-red-400" : ""}`}
                placeholder="e.g. apexlabs"
                value={slug}
                onChange={(e) => { setSlug(e.target.value); setSlugError(""); }}
              />
              {slugError ? (
                <p className="text-xs text-red-400 mt-1">{slugError}</p>
              ) : (
                <p className="text-xs text-slate-500 mt-1">Creates a direct URL: poveon.com/[slug]. Lowercase letters, numbers, hyphens only.</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300 block mb-1">
                WhatsApp Numbers <span className="text-xs text-slate-500">(optional)</span>
              </label>
              <div className="space-y-2">
                {whatsappNumbers.map((num, i) => (
                  <div key={i} className="flex gap-2">
                    <WhatsAppNumberInput
                      value={num}
                      onChange={(v) => { const next = [...whatsappNumbers]; next[i] = v; setWhatsappNumbers(next); }}
                      inputClass={whiteInput}
                    />
                    {whatsappNumbers.length > 1 && (
                      <button type="button" onClick={() => setWhatsappNumbers(whatsappNumbers.filter((_, j) => j !== i))}
                        className="px-3 py-2 rounded-xl bg-red-900/30 text-red-400 hover:bg-red-900/50 transition-colors text-xs font-bold shrink-0">✕</button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={() => setWhatsappNumbers([...whatsappNumbers, "+234 "])}
                  className="text-xs text-medical-400 hover:text-medical-300 font-medium transition-colors">+ Add another number</button>
              </div>
              <p className="text-xs text-slate-500 mt-1">Select country code then enter the local number.</p>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300 block mb-1">
                New Request Notification Email <span className="text-xs text-slate-500">(optional)</span>
              </label>
              <input
                type="email"
                className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 ${whiteInput}`}
                placeholder="requests@apexlabs.com"
                value={requestEmail}
                onChange={(e) => setRequestEmail(e.target.value)}
              />
              <p className="text-xs text-slate-500 mt-1">New test requests will be emailed to this address.</p>
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
  const [slug, setSlug] = useState(lab.slug ?? "");
  const [slugError, setSlugError] = useState("");
  const [whatsappNumbers, setWhatsappNumbers] = useState<string[]>(() => {
    try {
      const p = JSON.parse(lab.whatsapp ?? "[]");
      return Array.isArray(p) ? (p.length ? p : ["+234 "]) : lab.whatsapp ? [lab.whatsapp] : ["+234 "];
    } catch {
      return lab.whatsapp ? [lab.whatsapp] : ["+234 "];
    }
  });
  const [requestEmail, setRequestEmail] = useState(lab.request_email ?? "");
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
    if (slug.trim() && !/^[a-z0-9-]+$/.test(slug.trim())) {
      setSlugError("Only lowercase letters, numbers, and hyphens allowed");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/labs/${lab.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), address: address.trim(), description: description.trim(), phones: phoneList, notification_email: notificationEmail.trim() || null, service_categories: selectedCategories, certifications: selectedCerts, slug: slug.trim() || null, whatsapp: JSON.stringify(whatsappNumbers.map(n => n.trim()).filter(Boolean)) || null, request_email: requestEmail.trim() || null }),
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
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1">
              Lab URL Slug <span className="text-xs text-slate-500">(optional)</span>
            </label>
            <input
              className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 ${whiteInput} ${slugError ? "border-red-400" : ""}`}
              placeholder="e.g. apexlabs"
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setSlugError(""); }}
            />
            {slugError ? (
              <p className="text-xs text-red-400 mt-1">{slugError}</p>
            ) : (
              <p className="text-xs text-slate-500 mt-1">Creates a direct URL: poveon.com/[slug]. Lowercase letters, numbers, hyphens only.</p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1">
              WhatsApp Numbers <span className="text-xs text-slate-500">(optional)</span>
            </label>
            <div className="space-y-2">
              {whatsappNumbers.map((num, i) => (
                <div key={i} className="flex gap-2">
                  <WhatsAppNumberInput
                    value={num}
                    onChange={(v) => { const next = [...whatsappNumbers]; next[i] = v; setWhatsappNumbers(next); }}
                    inputClass={whiteInput}
                  />
                  {whatsappNumbers.length > 1 && (
                    <button type="button" onClick={() => setWhatsappNumbers(whatsappNumbers.filter((_, j) => j !== i))}
                      className="px-3 py-2 rounded-xl bg-red-900/30 text-red-400 hover:bg-red-900/50 transition-colors text-sm">✕</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setWhatsappNumbers([...whatsappNumbers, "+234 "])}
                className="text-xs text-medical-400 hover:text-medical-300 transition-colors">+ Add another number</button>
            </div>
            <p className="text-xs text-slate-500 mt-1">Select country code then enter the local number.</p>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1">
              New Request Notification Email <span className="text-xs text-slate-500">(optional)</span>
            </label>
            <input
              type="email"
              className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 ${whiteInput}`}
              placeholder="requests@apexlabs.com"
              value={requestEmail}
              onChange={(e) => setRequestEmail(e.target.value)}
            />
            <p className="text-xs text-slate-500 mt-1">New test requests will be emailed to this address.</p>
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

// ── Lab Branch Management Modal ──────────────────────────────────────────────

interface BranchRecord {
  id: string;
  branch_lab_id: string;
  is_main: boolean;
  branch_lab: { id: string; name: string; address: string; phones: unknown; whatsapp?: string | null };
}

function LabBranchModal({ lab, onClose, allLabs }: { lab: Lab; onClose: () => void; allLabs: Lab[] }) {
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [selectedLabId, setSelectedLabId] = useState("");
  const [isMain, setIsMain] = useState(false);
  const [search, setSearch] = useState("");

  const fetchBranches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/labs/${lab.id}/branches`);
      const data = await res.json();
      if (data.success) setBranches(data.branches ?? []);
    } finally { setLoading(false); }
  }, [lab.id]);

  useEffect(() => { fetchBranches(); }, [fetchBranches]);

  // Labs that can still be added: exclude self, already-linked, and labs that ARE the parent themselves
  const linkedIds = new Set(branches.map((b) => b.branch_lab_id));
  const availableLabs = allLabs.filter(
    (l) => l.id !== lab.id && !linkedIds.has(l.id)
  );
  const filteredAvailable = search.trim()
    ? availableLabs.filter((l) => l.name.toLowerCase().includes(search.toLowerCase()) || l.address.toLowerCase().includes(search.toLowerCase()))
    : availableLabs;

  async function handleLink() {
    if (!selectedLabId) { toast.error("Select a lab to add as a branch"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/labs/${lab.id}/branches`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch_lab_id: selectedLabId, is_main: isMain }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Branch linked");
        setShowPicker(false); setSelectedLabId(""); setIsMain(false); setSearch("");
        await fetchBranches();
      } else { toast.error(data.error ?? "Failed"); }
    } catch { toast.error("Network error"); }
    finally { setSaving(false); }
  }

  async function handleToggleMain(b: BranchRecord) {
    const newMain = !b.is_main;
    try {
      const res = await fetch(`/api/admin/labs/${lab.id}/branches/${b.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_main: newMain }),
      });
      const data = await res.json();
      if (data.success) { await fetchBranches(); }
      else toast.error(data.error ?? "Failed");
    } catch { toast.error("Network error"); }
  }

  async function handleUnlink(b: BranchRecord) {
    if (!confirm(`Unlink "${b.branch_lab.name}" as a branch of ${lab.name}?`)) return;
    try {
      const res = await fetch(`/api/admin/labs/${lab.id}/branches/${b.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) { toast.success("Branch unlinked"); await fetchBranches(); }
      else toast.error(data.error ?? "Failed");
    } catch { toast.error("Network error"); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="sticky top-0 bg-slate-900 border-b border-white/10 px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <h2 className="font-semibold text-white text-base flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-medical-400" />
              Branch Setup — {lab.name}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Link existing labs as branches of this lab</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Lab picker panel */}
          {showPicker && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-white">Select a Lab to Add as Branch</h3>
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search labs by name or address…"
                className="w-full text-sm rounded-xl border border-white/15 bg-white/5 text-white placeholder-slate-500 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-medical-500/50"
              />
              <div className="max-h-52 overflow-y-auto space-y-1">
                {filteredAvailable.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">{availableLabs.length === 0 ? "All labs are already linked" : "No labs match your search"}</p>
                ) : filteredAvailable.map((l) => (
                  <button key={l.id} onClick={() => setSelectedLabId(l.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors ${selectedLabId === l.id ? "bg-medical-600 text-white" : "hover:bg-white/8 text-slate-300"}`}>
                    <p className="font-semibold">{l.name}</p>
                    {l.address && <p className={`text-xs ${selectedLabId === l.id ? "text-medical-200" : "text-slate-500"}`}>{l.address}</p>}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isMain} onChange={(e) => setIsMain(e.target.checked)}
                  className="rounded border-white/20 bg-white/5 text-medical-500" />
                <span className="text-sm text-slate-300">Mark as the main branch</span>
              </label>
              <div className="flex gap-2 pt-1">
                <button onClick={handleLink} disabled={saving || !selectedLabId}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-medical-600 hover:bg-medical-500 text-white text-sm font-semibold disabled:opacity-50 transition-colors">
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Link as Branch
                </button>
                <button onClick={() => { setShowPicker(false); setSelectedLabId(""); setSearch(""); }}
                  className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-sm transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Linked branches list */}
          {loading ? (
            <div className="flex justify-center py-8"><RefreshCw className="w-5 h-5 text-slate-500 animate-spin" /></div>
          ) : branches.length === 0 && !showPicker ? (
            <div className="text-center py-10">
              <GitBranch className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-400 font-medium">No branches linked</p>
              <p className="text-xs text-slate-500 mt-1">Link existing labs as physical branches of {lab.name}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {branches.map((b) => {
                const phones = b.branch_lab.phones as string[];
                return (
                  <div key={b.id} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-semibold text-white text-sm truncate">{b.branch_lab.name}</p>
                          {b.is_main && <span className="text-xs bg-medical-600/30 text-medical-300 border border-medical-600/30 px-2 py-0.5 rounded-full font-medium shrink-0">Main</span>}
                        </div>
                        {b.branch_lab.address && <p className="text-xs text-slate-400 flex items-center gap-1"><MapPin className="w-3 h-3 shrink-0" />{b.branch_lab.address}</p>}
                        {phones.slice(0, 2).map((ph, i) => <p key={i} className="text-xs text-slate-500 flex items-center gap-1"><Phone className="w-3 h-3 shrink-0" />{ph}</p>)}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => handleToggleMain(b)} title={b.is_main ? "Remove main status" : "Set as main"}
                          className={`p-1.5 rounded-lg transition-colors ${b.is_main ? "text-medical-400 hover:bg-medical-500/20" : "text-slate-500 hover:text-medical-400 hover:bg-white/10"}`}>
                          <Star className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleUnlink(b)} title="Unlink branch"
                          className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!showPicker && (
            <button onClick={() => setShowPicker(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-white/15 text-slate-400 hover:text-white hover:border-white/30 text-sm transition-colors">
              <Plus className="w-4 h-4" />Link Existing Lab as Branch
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

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

const PAGE_PERMISSIONS: { key: keyof LabRole; label: string; description: string }[] = [
  { key: "can_view_requests",   label: "Requests",   description: "View and search patient requests" },
  { key: "can_view_referrals",  label: "Referrals",  description: "View doctor referral stats" },
  { key: "can_view_clients",    label: "Clients",    description: "Browse the patient/client list" },
  { key: "can_view_analytics",  label: "Analytics",  description: "View lab performance analytics" },
  { key: "can_view_activity",   label: "Activity",   description: "View team activity log" },
  { key: "can_view_feedback",   label: "Feedback",   description: "View patient and doctor feedback" },
];

const ACTION_PERMISSIONS: { key: keyof LabRole; label: string; description: string }[] = [
  { key: "can_mark_seen",       label: "Mark as Seen",     description: "Confirm patient arrived at lab" },
  { key: "can_mark_done",       label: "Mark as Done",     description: "Mark tests as completed" },
  { key: "can_send_results",    label: "Send Results",     description: "Email results to doctors" },
  { key: "can_manage_team",     label: "Manage Team",      description: "Invite/remove staff members" },
  { key: "can_manage_api_keys", label: "Manage API Keys",  description: "Create and revoke API keys" },
];

const ALL_PERMISSION_LABELS = [...PAGE_PERMISSIONS, ...ACTION_PERMISSIONS];

type DraftRole = {
  name: string;
  can_view_requests:   boolean;
  can_mark_seen:       boolean;
  can_mark_done:       boolean;
  can_send_results:    boolean;
  can_manage_team:     boolean;
  can_manage_api_keys: boolean;
  can_view_referrals:  boolean;
  can_view_clients:    boolean;
  can_view_analytics:  boolean;
  can_view_activity:   boolean;
  can_view_feedback:   boolean;
};

function blankRole(): DraftRole {
  return { name: "", can_view_requests: true, can_mark_seen: false, can_mark_done: false, can_send_results: false, can_manage_team: false, can_manage_api_keys: false, can_view_referrals: false, can_view_clients: false, can_view_analytics: false, can_view_activity: false, can_view_feedback: false };
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
      can_view_clients:    (role as DraftRole).can_view_clients ?? false,
      can_view_analytics:  (role as DraftRole).can_view_analytics ?? false,
      can_view_activity:   (role as DraftRole).can_view_activity ?? false,
      can_view_feedback:   (role as DraftRole).can_view_feedback ?? false,
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
                    {ALL_PERMISSION_LABELS.filter((p) => r[p.key as keyof LabRole]).map((p) => p.label).join(" · ") || "No permissions"}
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
          <div className="mt-3 bg-slate-950/60 border border-blue-500/20 rounded-xl p-4 space-y-4">
            <p className="text-xs font-semibold text-blue-300">{editingRole ? `Edit: ${editingRole.name}` : "New Role"}</p>
            <input
              value={draftRole.name}
              onChange={(e) => setDraftRole((d) => ({ ...d, name: e.target.value }))}
              placeholder="Role name (e.g. Front Desk, Lab Scientist)"
              className="w-full bg-slate-900 border border-white/10 text-slate-200 placeholder-slate-600 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            />

            {/* Pages section */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Pages visible</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PAGE_PERMISSIONS.map(({ key, label, description }) => {
                  const checked = !!draftRole[key as keyof DraftRole];
                  return (
                    <label
                      key={key}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        checked
                          ? "bg-blue-500/10 border-blue-500/40 text-slate-200"
                          : "bg-white/3 border-white/8 text-slate-500 hover:border-white/20"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setDraftRole((d) => ({ ...d, [key]: e.target.checked }))}
                        className="accent-blue-500 w-3.5 h-3.5 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-medium leading-tight">{label}</p>
                        <p className="text-xs text-slate-600 mt-0.5 leading-tight">{description}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Actions section */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Actions allowed</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ACTION_PERMISSIONS.map(({ key, label, description }) => {
                  const checked = !!draftRole[key as keyof DraftRole];
                  return (
                    <label
                      key={key}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        checked
                          ? "bg-emerald-500/10 border-emerald-500/30 text-slate-200"
                          : "bg-white/3 border-white/8 text-slate-500 hover:border-white/20"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setDraftRole((d) => ({ ...d, [key]: e.target.checked }))}
                        className="accent-emerald-500 w-3.5 h-3.5 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-medium leading-tight">{label}</p>
                        <p className="text-xs text-slate-600 mt-0.5 leading-tight">{description}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => { setShowNewRole(false); setEditingRole(null); setDraftRole(blankRole()); }}
                className="flex-1 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 text-xs transition-colors">
                Cancel
              </button>
              <button onClick={handleSaveRole} disabled={savingRole}
                className="flex-1 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors disabled:opacity-50">
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
  const [created, setCreated] = useState<{ code: string } | null>(null);

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
        setCreated({ code: data.marketer.code });
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
                  <span className="text-xs text-slate-300 flex-1 truncate font-mono">{refLink(created.code)}</span>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(refLink(created.code)); toast.success("Copied!"); }}
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

// =============================================================================
// Marketer Detail Modal
// =============================================================================
interface MarketerDetail {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  code: string;
  suspended: boolean;
  created_at: string;
  referral_link: string;
}
interface MarketerDoctorDetail {
  doctor_email: string;
  doctor_name: string;
  doctor_phone: string | null;
  doctor_hospital: string | null;
  total_requests: number;
  linked_since: string;
  requests: {
    id: string;
    code: string;
    patient_name: string;
    tests: string;
    status: string;
    created_at: string;
    seen_at: string | null;
    completed_at: string | null;
  }[];
}

const MSTATUS: Record<string, { label: string; color: string }> = {
  incoming: { label: "Pending", color: "bg-amber-400/15 text-amber-300 border border-amber-400/25" },
  seen: { label: "Arrived", color: "bg-blue-400/15 text-blue-300 border border-blue-400/25" },
  done: { label: "Completed", color: "bg-emerald-400/15 text-emerald-300 border border-emerald-400/25" },
};

function MarketerDetailModal({
  marketerId,
  onClose,
  onSuspendToggle,
  onDelete,
}: {
  marketerId: string;
  onClose: () => void;
  onSuspendToggle: () => void;
  onDelete: () => void;
}) {
  const [data, setData] = useState<{ marketer: MarketerDetail; doctors: MarketerDoctorDetail[]; stats: { total_doctors: number; total_requests: number; pending: number; seen: number; done: number } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/admin/marketers/${marketerId}`);
        const json = await res.json();
        if (json.success) setData(json);
        else setError(json.error ?? "Failed to load");
      } catch {
        setError("Network error");
      } finally {
        setLoading(false);
      }
    })();
  }, [marketerId]);

  async function handleSuspendToggle() {
    if (!data) return;
    setToggling(true);
    try {
      const res = await fetch(`/api/admin/marketers/${marketerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suspended: !data.marketer.suspended }),
      });
      const json = await res.json();
      if (json.success) {
        setData((d) => d ? { ...d, marketer: { ...d.marketer, suspended: !d.marketer.suspended } } : d);
        toast.success(data.marketer.suspended ? "Marketer unsuspended" : "Marketer suspended");
        onSuspendToggle();
      } else {
        toast.error(json.error ?? "Failed to update");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setToggling(false);
    }
  }

  async function handleDelete() {
    if (!data) return;
    if (!confirm(`Delete marketer "${data.marketer.name}"? This removes all their referral links. Cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/marketers/${marketerId}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        toast.success(`"${data.marketer.name}" deleted`);
        onDelete();
      } else {
        toast.error(json.error ?? "Failed to delete");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-white/15 rounded-2xl w-full max-w-2xl shadow-2xl animate-slide-up max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${data?.marketer.suspended ? "bg-slate-700/40" : "bg-emerald-700/40"}`}>
              <TrendingUp className={`w-4 h-4 ${data?.marketer.suspended ? "text-slate-500" : "text-emerald-400"}`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-semibold text-white text-sm truncate">{data?.marketer.name ?? "Loading…"}</h2>
                {data?.marketer.suspended && <span className="text-xs bg-red-900/40 text-red-400 border border-red-800/30 px-1.5 py-0.5 rounded-full">Suspended</span>}
              </div>
              {data && <p className="text-xs text-slate-400">{data.marketer.email}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {data && (
              <>
                <button
                  type="button"
                  onClick={handleSuspendToggle}
                  disabled={toggling}
                  title={data.marketer.suspended ? "Unsuspend" : "Suspend"}
                  className={`p-2 rounded-lg transition-colors disabled:opacity-40 text-xs ${data.marketer.suspended ? "hover:bg-emerald-500/15 text-slate-400 hover:text-emerald-400" : "hover:bg-amber-500/15 text-slate-400 hover:text-amber-400"}`}
                >
                  {toggling ? <RefreshCw className="w-4 h-4 animate-spin" /> : data.marketer.suspended ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  title="Delete marketer"
                  className="p-2 rounded-lg hover:bg-red-500/15 text-slate-400 hover:text-red-400 transition-colors disabled:opacity-40"
                >
                  {deleting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </>
            )}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-slate-400 transition-colors ml-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="bg-white/5 rounded-xl h-12 animate-pulse" />)}
            </div>
          )}
          {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>}
          {data && (
            <>
              {/* Info + referral link */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Details</p>
                  {data.marketer.phone && (
                    <p className="text-xs text-slate-300 flex items-center gap-1.5"><Phone className="w-3 h-3 text-slate-500" />{data.marketer.phone}</p>
                  )}
                  <p className="text-xs text-slate-400">Code: <span className="font-mono text-emerald-400">{data.marketer.code}</span></p>
                  <p className="text-xs text-slate-600">Joined {format(new Date(data.marketer.created_at), "dd MMM yyyy")}</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Referral Link</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 flex-1 truncate font-mono">{refLink(data.marketer.code)}</span>
                    <button
                      type="button"
                      onClick={() => { navigator.clipboard.writeText(refLink(data.marketer.code)); toast.success("Copied!"); }}
                      className="shrink-0 text-slate-400 hover:text-white transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Doctors", value: data.stats.total_doctors, color: "text-emerald-400" },
                  { label: "Requests", value: data.stats.total_requests, color: "text-white" },
                  { label: "Pending", value: data.stats.pending, color: "text-amber-400" },
                  { label: "Completed", value: data.stats.done, color: "text-emerald-400" },
                ].map((s) => (
                  <div key={s.label} className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Doctor list */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Referred Doctors</p>
                {data.doctors.length === 0 ? (
                  <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center">
                    <Users className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">No doctors referred yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.doctors.map((doc) => (
                      <div key={doc.doctor_email} className="bg-white/5 border border-white/8 rounded-xl overflow-hidden">
                        {/* Doctor row */}
                        <button
                          type="button"
                          onClick={() => setExpandedEmail(expandedEmail === doc.doctor_email ? null : doc.doctor_email)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
                        >
                          <div className="w-7 h-7 rounded-lg bg-slate-700/50 flex items-center justify-center shrink-0">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{doc.doctor_name}</p>
                            <div className="flex items-center gap-2 flex-wrap mt-0.5">
                              {doc.doctor_hospital && <span className="text-xs text-slate-500 truncate">{doc.doctor_hospital}</span>}
                              {doc.doctor_phone && <span className="text-xs text-slate-600">· {doc.doctor_phone}</span>}
                            </div>
                          </div>
                          <div className="shrink-0 flex items-center gap-2">
                            <span className="text-xs text-slate-400">{doc.total_requests} req</span>
                            {expandedEmail === doc.doctor_email ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
                          </div>
                        </button>

                        {/* Expanded requests */}
                        {expandedEmail === doc.doctor_email && (
                          <div className="border-t border-white/8 px-4 py-3 space-y-2 bg-slate-950/30">
                            {doc.requests.length === 0 ? (
                              <p className="text-xs text-slate-500 py-2 text-center">No requests yet</p>
                            ) : (
                              doc.requests.map((req) => {
                                const st = MSTATUS[req.status] ?? MSTATUS.incoming;
                                return (
                                  <div key={req.id} className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-mono text-xs text-medical-400">{req.code}</span>
                                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                                      </div>
                                      <p className="text-xs text-slate-500 mt-0.5">Patient: <span className="text-slate-300 font-medium">{req.patient_name}</span></p>
                                      <p className="text-xs text-slate-600 mt-0.5 line-clamp-2 leading-relaxed">{req.tests}</p>
                                    </div>
                                    <span className="text-xs text-slate-600 whitespace-nowrap shrink-0 mt-0.5">{format(new Date(req.created_at), "dd MMM yy")}</span>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
