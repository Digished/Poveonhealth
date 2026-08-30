"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { toast } from "react-hot-toast";
import {
  AlertCircle, ArrowDownRight, ArrowDownToLine, ArrowUpRight, BarChart3, Building2, Check, ChevronDown, ChevronUp, Code2, Copy, CreditCard, Download, Eye, EyeOff, FileText, Filter, FlaskConical, Gift, GitBranch, HeartHandshake, HeartPulse, Key, Link, List, LogOut, Mail, MapPin, MessageCircle, Moon, Pencil, Phone, Pill, Plus, QrCode, RefreshCw, Search, Settings, ShieldPlus, Sparkles, Star, Stethoscope, Sun, Trash2, Upload, UserCircle, Users, Wallet, X, Menu,
} from "lucide-react";
import { Modal } from "@/components/ui/Overlay";
import { useDashTheme } from "@/hooks/useDashTheme";
import { renderLabSla, EMPTY_LAB_SLA, type LabSlaData } from "@/lib/labSlaTemplate";
import { serializeAgreementToText } from "@/lib/agreement/content";
import { CreateLabForm } from "@/components/admin/CreateLabForm";
import { EditLabForm } from "@/components/admin/EditLabForm";
import { AdminProfessionalsTab } from "@/components/admin/AdminProfessionalsTab";
import { AdminNav, type AdminNavGroup } from "@/components/admin/AdminNav";
import { AdminEncountersTab } from "@/components/admin/AdminEncountersTab";
import { AdminBroadcastTab } from "@/components/admin/AdminBroadcastTab";
import { AdminHmoTab } from "@/components/admin/AdminHmoTab";
import { AdminClientsTab } from "@/components/admin/AdminClientsTab";
import { AdminPerksTab } from "@/components/admin/AdminPerksTab";
import { AdminCarePlanTab } from "@/components/admin/AdminCarePlanTab";
import { AdminPharmaciesTab } from "@/components/admin/AdminPharmaciesTab";
import { AdminMetricsTab } from "@/components/admin/AdminMetricsTab";
import { AdminLabPartnersModal } from "@/components/admin/AdminLabPartnersModal";
import { SpecialtyTreePicker } from "@/components/admin/SpecialtyTreePicker";
import { HospitalDoctorsPanel } from "@/components/admin/HospitalDoctorsPanel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { StatusBadge, Badge } from "@/components/ui/Badge";
import type { Lab, LabRequest, LabApiKey, LabRole, LabMember } from "@/lib/types";
import { parsePhones } from "@/lib/phones";
import { format } from "date-fns";
import {
  createClient } from "@/lib/supabase/client"; // still used for auth sign-out
import { useRouter,
} from "next/navigation";
import { labUrl, labHost, LAB_SUBDOMAINS_ENABLED } from "@/lib/lab-urls";
import { AdminOverlay } from "@/components/admin/AdminOverlay";

/**
 * The admin sections.
 *
 * Six were retired with the redesign — Referrals, Marketers, Lab Marketers,
 * Skin Consults, Knowledge Base and API Analytics — because the features behind
 * them are hidden elsewhere in the product (doctor-portal referrals, Fast Mode)
 * or were engineering tooling rather than operations. Their panels, fetchers
 * and state went with them; the APIs are untouched.
 */
type AdminTab =
  | "metrics" | "clients" | "requests" | "encounters" | "transactions"
  | "labs" | "hospitals" | "pharmacies" | "hmo"
  | "care-plan" | "professionals"
  | "perks" | "broadcast"
  | "users" | "agreements" | "settings";

/** The order and grouping the sidebar renders. */
const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: "Overview",
    items: [{ key: "metrics", label: "Metrics", icon: BarChart3, hint: "platform numbers, trends" }],
  },
  {
    label: "Operations",
    items: [
      { key: "requests", label: "All Requests", icon: List, hint: "lab requests, orders" },
      { key: "clients", label: "Clients", icon: Users, hint: "patients, people" },
      { key: "encounters", label: "Doctor Encounters", icon: Stethoscope, hint: "consultations" },
      { key: "transactions", label: "Transactions", icon: CreditCard, hint: "money, payments, revenue" },
    ],
  },
  {
    label: "Partners",
    items: [
      { key: "labs", label: "Labs", icon: FlaskConical, hint: "laboratories, catalogue" },
      { key: "hospitals", label: "Hospitals", icon: Building2, hint: "clinics" },
      { key: "pharmacies", label: "Pharmacies", icon: Pill, hint: "chemists, dispensing" },
      { key: "hmo", label: "HMOs", icon: HeartPulse, hint: "insurers, health plans" },
    ],
  },
  {
    label: "Care",
    items: [
      { key: "care-plan", label: "Care Plan", icon: ShieldPlus, hint: "members, subscription, pricing" },
      { key: "professionals", label: "Professionals", icon: UserCircle, hint: "doctors, credentials" },
    ],
  },
  {
    label: "Growth",
    items: [
      { key: "perks", label: "Perks & Rides", icon: Gift, hint: "referrals, rewards, logistics" },
      { key: "broadcast", label: "Bulk Email", icon: Mail, hint: "campaigns, messaging" },
    ],
  },
  {
    label: "Platform",
    items: [
      { key: "users", label: "Users", icon: Users, hint: "accounts, access" },
      { key: "agreements", label: "Agreements", icon: FileText, hint: "contracts, signatures" },
      { key: "settings", label: "Settings", icon: Settings, hint: "configuration" },
    ],
  },
];

/** Valid `?tab=` values, so a stale or hand-typed link falls back cleanly. */
const ADMIN_KEYS = new Set(ADMIN_NAV.flatMap((g) => g.items).map((i) => i.key));


/** Per-test aggregate across a set of requests (for robust admin test tracking). */
interface TestStat { name: string; total: number; done: number; fast: number }
function testStatsFor(requests: LabRequest[]): TestStat[] {
  const m = new Map<string, TestStat>();
  for (const r of requests) {
    const names = (r.tests || "")
      .split(/[\n,]+/)
      .map((s) => s.replace(/\s*\(.*?\)\s*/g, " ").trim())
      .filter(Boolean);
    for (const raw of names) {
      const name = raw.length > 60 ? raw.slice(0, 60) + "…" : raw;
      const key = name.toLowerCase();
      const s = m.get(key) ?? { name, total: 0, done: 0, fast: 0 };
      s.total++;
      if (r.status === "done") s.done++;
      if (r.fast_mode) s.fast++;
      m.set(key, s);
    }
  }
  return Array.from(m.values()).sort((a, b) => b.total - a.total);
}

/** Request/referral timestamps carry the time — "when today" matters for triage. */
const REQ_DATE_TIME = "dd MMM yy · HH:mm";

// Shared white input class for dark-background modals
const whiteInput = "bg-white border-slate-400 text-slate-800 placeholder-slate-500";


function refLink(code: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/?ref=${code}`;
}

/** A square header button. Token-coloured, so it is legible in both themes. */
function IconAction({
  onClick,
  label,
  icon,
}: {
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="dash-ring dash-hover rounded-xl p-2 transition-colors"
      style={{ color: "var(--dash-muted)" }}
    >
      {icon}
    </button>
  );
}

export function AdminDashboard() {
  const router = useRouter();
  const { isLight, toggle, themeClass } = useDashTheme("admin_dash_theme");
  /**
   * The open section, mirrored into `?tab=` so a refresh, a bookmark or a link
   * to "the pharmacies page" all land where they should. Read once on mount
   * rather than through useSearchParams, which would force the whole dashboard
   * into a Suspense boundary for one string.
   */
  const [activeTab, setActiveTabState] = useState<AdminTab>(() => {
    if (typeof window === "undefined") return "metrics";
    const want = new URLSearchParams(window.location.search).get("tab");
    return ADMIN_KEYS.has(want ?? "") ? (want as AdminTab) : "metrics";
  });

  const setActiveTab = useCallback((key: AdminTab) => {
    setActiveTabState(key);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("tab", key);
    window.history.replaceState(null, "", url);
  }, []);

  // Back/forward should move between sections, not out of the dashboard.
  useEffect(() => {
    const onPop = () => {
      const want = new URLSearchParams(window.location.search).get("tab");
      setActiveTabState(ADMIN_KEYS.has(want ?? "") ? (want as AdminTab) : "metrics");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // The header names the section you are in, which is what the old horizontal
  // strip used to do by highlighting a pill you often could not see.
  //
  // Must sit below `activeTab`: `.find()` runs its callback synchronously, so
  // reading the binding from above its own declaration is a live temporal dead
  // zone, not a deferred closure. tsc does not flag it — a reference inside an
  // arrow function looks deferrable to it — and it only surfaced as
  // "Cannot access 'c' before initialization" from the minified production
  // build.
  const currentSection = ADMIN_NAV.flatMap((g) => g.items).find((i) => i.key === activeTab);
  const [mobileTabOpen, setMobileTabOpen] = useState(false);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [requests, setRequests] = useState<LabRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateLab, setShowCreateLab] = useState(false);
  const [editLab, setEditLab] = useState<Lab | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [togglingSearchHiddenId, setTogglingSearchHiddenId] = useState<string | null>(null);
  const [togglingFreeTrialId, setTogglingFreeTrialId] = useState<string | null>(null);
  const [tempPasswordLab, setTempPasswordLab] = useState<Lab | null>(null);
  const [settingTempPassword, setSettingTempPassword] = useState(false);
  const [deleteConfirmLab, setDeleteConfirmLab] = useState<Lab | null>(null);
  const [deletingRequestId, setDeletingRequestId] = useState<string | null>(null);
  const [expandedLabIntegration, setExpandedLabIntegration] = useState<string | null>(null);
  const [expandedLabIds, setExpandedLabIds] = useState<Set<string>>(new Set());
  const [branchModalLabId, setBranchModalLabId] = useState<string | null>(null);
  const [sendAgreementLab, setSendAgreementLab] = useState<Lab | null>(null);
  const [transferEmailLab, setTransferEmailLab] = useState<Lab | null>(null);
  const [catalogLab, setCatalogLab] = useState<Lab | null>(null);
  // The lab whose care-plan flyer and QR poster are being shown.
  const [promoLab, setPromoLab] = useState<{ id: string; name: string; slug: string | null } | null>(null);
  const [partnersLab, setPartnersLab] = useState<Lab | null>(null);
  type AgreementRecord = { id: string; version: string; signed_at: string; signer_name: string; signer_email: string; signer_title: string | null; pdf_hash: string; lab: { id: string; name: string; email: string } };
  const [agreements, setAgreements] = useState<AgreementRecord[]>([]);
  const [agreementsLoading, setAgreementsLoading] = useState(false);
  const [defaultRequestPrice, setDefaultRequestPrice] = useState<string>("500");
  const [supportEmail, setSupportEmail] = useState<string>("spendbox@gmail.com");
  const [savingSettings, setSavingSettings] = useState(false);

  // Admin → assign a marketer to a lab




  // Per-lab analytics modal
  type LabAnalytics = {
    total: number; done: number; seen: number; incoming: number; completionRate: number;
    monthlyStatus: Record<string, { incoming: number; seen: number; done: number; total: number }>;
    topTests: { name: string; total: number; done: number }[];
    topDoctors: { name: string; email: string; prefix: string | null; total: number; done: number }[];
    sexCounts: Record<string, number>;
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




  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings");
      const data = await res.json();
      if (data.success) {
        setDefaultRequestPrice(data.settings.default_request_price ?? "500");
        setSupportEmail(data.settings.support_email ?? "spendbox@gmail.com");
      }
    } catch { /* non-critical */ }
  }, []);

  async function handleSaveSettings() {
    if (isNaN(parseFloat(defaultRequestPrice)) || parseFloat(defaultRequestPrice) < 0) {
      toast.error("Enter a valid default request price");
      return;
    }
    if (supportEmail.trim() && !supportEmail.includes("@")) {
      toast.error("Enter a valid support email");
      return;
    }
    setSavingSettings(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          default_request_price: defaultRequestPrice,
          support_email: supportEmail.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Settings saved");
        setDefaultRequestPrice(data.settings.default_request_price);
        setSupportEmail(data.settings.support_email ?? supportEmail);
      } else {
        toast.error(data.error ?? "Failed to update");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSavingSettings(false);
    }
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [reqRes] = await Promise.all([
        fetch("/api/admin/requests"),
        fetchLabs(),
        fetchSettings(),
      ]);
      const reqData = await reqRes.json();
      if (reqData.success) {
        setRequests(reqData.requests ?? []);
      }
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [fetchLabs]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Referral tracking aggregated over ALL requests (server-side) so counts are
  // accurate rather than limited to the latest page loaded on the dashboard.


  // ── All Requests tab: searchable, paginated back to the very first request ──
  const [allReqs, setAllReqs] = useState<LabRequest[]>([]);
  const [allReqTotal, setAllReqTotal] = useState(0);
  const [allReqPage, setAllReqPage] = useState(1);
  const [allReqSearch, setAllReqSearch] = useState("");
  const [allReqLoading, setAllReqLoading] = useState(false);
  const [allReqMore, setAllReqMore] = useState(false);

  const loadAllRequests = useCallback(async (opts: { reset?: boolean; page?: number; q?: string }) => {
    const page = opts.page ?? 1;
    const q = opts.q ?? "";
    if (opts.reset) setAllReqLoading(true); else setAllReqMore(true);
    try {
      const res = await fetch(`/api/admin/requests?limit=50&page=${page}&q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.success) {
        setAllReqs((prev) => (opts.reset ? data.requests : [...prev, ...data.requests]));
        setAllReqTotal(data.total ?? 0);
        setAllReqPage(page);
      }
    } catch {
      toast.error("Failed to load requests");
    } finally {
      setAllReqLoading(false); setAllReqMore(false);
    }
  }, []);

  // Load on entering the tab; debounce search.
  useEffect(() => {
    if (activeTab !== "requests") return;
    const t = setTimeout(() => loadAllRequests({ reset: true, page: 1, q: allReqSearch }), 300);
    return () => clearTimeout(t);
  }, [activeTab, allReqSearch, loadAllRequests]);


  async function handleDeleteRequest(req: LabRequest) {
    if (!confirm(`Delete request ${req.code} for "${req.patient_name}"? This permanently removes it from the lab dashboard too.`)) return;
    setDeletingRequestId(req.id);
    try {
      const res = await fetch(`/api/admin/requests/${req.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast.success(`Request ${req.code} deleted`);
        setRequests((prev: LabRequest[]) => prev.filter((r: LabRequest) => r.id !== req.id));
        setAllReqs((prev: LabRequest[]) => prev.filter((r: LabRequest) => r.id !== req.id));
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

  async function handleToggleSearchHidden(lab: Lab) {
    setTogglingSearchHiddenId(lab.id);
    try {
      const res = await fetch(`/api/admin/labs/${lab.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search_hidden: !lab.search_hidden }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(lab.search_hidden ? "Lab restored to search" : "Lab hidden from search");
        await fetchLabs();
      } else {
        toast.error(data.error ?? "Failed to update");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setTogglingSearchHiddenId(null);
    }
  }

  async function handleToggleFreeTrial(lab: Lab) {
    const newStatus = !(lab.free_trial ?? false);
    if (newStatus && !window.confirm(`Enable free trial for "${lab.name}"? This lab won't record commission.\n\nContinue?`)) {
      return;
    }
    setTogglingFreeTrialId(lab.id);
    try {
      const res = await fetch(`/api/admin/labs/${lab.id}/free-trial`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(newStatus ? "Free trial enabled" : "Free trial disabled");
        await fetchLabs();
      } else {
        toast.error(data.error ?? "Failed to update");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setTogglingFreeTrialId(null);
    }
  }

  async function handleSetTempPassword(lab: Lab) {
    setSettingTempPassword(true);
    try {
      const res = await fetch(`/api/admin/labs/${lab.id}/set-temp-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: lab.email }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Temporary password sent to ${lab.email}`);
        setTempPasswordLab(null);
      } else {
        toast.error(data.error ?? "Failed to set temporary password");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSettingTempPassword(false);
    }
  }

  async function handleDeleteLab(lab: Lab) {
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
    <div
      className={`dash min-h-screen transition-colors duration-300 ${themeClass}`}
      style={{
        background: "linear-gradient(160deg, var(--dash-bg) 0%, var(--dash-bg-2) 55%, var(--dash-bg) 100%)",
        color: "var(--dash-text)",
      }}
    >
      <header
        className="sticky top-0 z-30 backdrop-blur-xl"
        style={{
          background: "color-mix(in srgb, var(--dash-bg) 82%, transparent)",
          borderBottom: "1px solid var(--dash-border)",
        }}
      >
        <div className="mx-auto flex max-w-[1600px] items-center gap-2 px-3 py-2.5 sm:px-5 sm:py-3">
          {/* Below lg the sections live in a sheet, opened from here. */}
          <button
            onClick={() => setMobileTabOpen(true)}
            aria-label="Open sections"
            className="dash-ring lg:hidden shrink-0 rounded-xl p-2"
            style={{ background: "var(--dash-surface-2)", color: "var(--dash-text-2)" }}
          >
            <Menu className="h-[18px] w-[18px]" />
          </button>

          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-medical-600 shadow-lg shadow-medical-600/25">
              <FlaskConical className="h-[18px] w-[18px] text-white" />
            </div>
            {/*
              Below lg the sidebar is hidden, so the header is the only thing
              that says where you are. From lg up the sidebar says it and the
              page says it again in its own heading, so the header steps back
              to the brand rather than making it three times.
            */}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold leading-tight" style={{ color: "var(--dash-text)" }}>
                <span className="lg:hidden">{currentSection?.label ?? "Poveon"}</span>
                <span className="hidden lg:inline">Poveon</span>
              </p>
              <p className="dash-muted truncate text-[11px] leading-tight">Admin dashboard</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <IconAction
              onClick={toggle}
              label={isLight ? "Switch to dark mode" : "Switch to light mode"}
              icon={isLight ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            />
            <IconAction
              onClick={() => fetchData()}
              label="Refresh"
              icon={<RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />}
            />
            <button
              onClick={handleSignOut}
              className="dash-ring flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors"
              style={{ color: "var(--dash-muted)" }}
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] gap-5 px-3 py-4 sm:px-5 sm:py-6 lg:flex">
        <AdminNav
          groups={ADMIN_NAV}
          activeKey={activeTab}
          onSelect={(k) => setActiveTab(k as AdminTab)}
          open={mobileTabOpen}
          onOpenChange={setMobileTabOpen}
        />

        <main className="min-w-0 flex-1">

        {/* ── METRICS ── */}
        {activeTab === "metrics" && <AdminMetricsTab />}

        {/* ── REQUESTS ── */}
        {activeTab === "requests" && (
          <div className="animate-fade-in space-y-4">
            {/* Search + count header */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                <input
                  value={allReqSearch}
                  onChange={(e) => setAllReqSearch(e.target.value)}
                  placeholder="Search patient, test, code, doctor or lab…"
                  className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-white/8 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-white/25"
                />
                {allReqSearch && (
                  <button onClick={() => setAllReqSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
                )}
              </div>
              <span className="text-xs text-slate-400 bg-white/5 px-3 py-2 rounded-xl shrink-0 whitespace-nowrap">
                {allReqLoading ? "Loading…" : `Showing ${allReqs.length} of ${allReqTotal}`}
              </span>
            </div>

            {allReqLoading ? (
              <div className="space-y-2">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4 animate-pulse h-14" />
                ))}
              </div>
            ) : (
              <>
                {/* Mobile card layout */}
                <div className="md:hidden space-y-2">
                  {allReqs.map((req) => (
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
                      {(req.patient_phone || req.patient_email || req.patient_age != null || req.sex) && (
                        <p className="text-xs text-slate-400 truncate">
                          <span className="text-slate-600">Patient: </span>
                          {[req.patient_phone, req.patient_email, req.patient_age != null ? `${req.patient_age}y` : null, req.sex].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      <p className="text-xs text-slate-400 truncate mt-1">
                        <span className="text-slate-600">Ref: </span>
                        {[req.doctor_prefix, req.doctor_name].filter(Boolean).join(" ") || "—"}
                      </p>
                      {req.doctor_hospital && (
                        <p className="text-xs text-slate-400 truncate">
                          <span className="text-slate-600">Hospital: </span>{req.doctor_hospital}
                        </p>
                      )}
                      {(req.doctor_email || req.doctor_phone) && (
                        <p className="text-xs text-slate-500 truncate">
                          {[req.doctor_email, req.doctor_phone].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      {req.tests && (
                        <p className="text-xs text-slate-300 mt-1 line-clamp-2">
                          <span className="text-slate-600">Tests: </span>{req.tests}
                        </p>
                      )}
                      {(req.doctor_bank_name || req.doctor_account_number) && (
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {[req.doctor_bank_name, req.doctor_account_number].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-xs text-slate-500 truncate flex-1">{(req.lab as { name: string } | null)?.name ?? "—"}</p>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <p className="text-xs text-slate-600">{format(new Date(req.created_at), REQ_DATE_TIME)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {allReqs.length === 0 && (
                    <div className="py-16 text-center text-slate-400">{allReqSearch ? "No requests match your search" : "No requests yet"}</div>
                  )}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-left">
                        {["Code", "Patient", "Referred by", "Tests", "Lab", "Status", "Date", ""].map((h) => (
                          <th key={h} className={`pb-3 px-3 text-xs text-slate-400 font-semibold uppercase tracking-wider${h === "Date" || h === "" ? " w-px whitespace-nowrap" : ""}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {allReqs.map((req) => (
                        <tr key={req.id} className="hover:bg-white/5 transition-colors">
                          <td className="py-3 px-3"><span className="font-mono text-medical-400 text-xs">{req.code}</span></td>
                          <td className="py-3 px-3">
                            <p className="text-white font-medium">{req.patient_name}</p>
                            {(req.patient_phone || req.patient_age != null || req.sex) && (
                              <p className="text-xs text-slate-500 mt-0.5">
                                {[req.patient_phone, req.patient_age != null ? `${req.patient_age}y` : null, req.sex].filter(Boolean).join(" · ")}
                              </p>
                            )}
                            {req.patient_email && <p className="text-xs text-slate-500 mt-0.5">{req.patient_email}</p>}
                          </td>
                          <td className="py-3 px-3">
                            <p className="text-slate-300">{[req.doctor_prefix, req.doctor_name].filter(Boolean).join(" ") || "—"}</p>
                            {req.doctor_hospital && (
                              <p className="text-xs text-medical-300/80 mt-0.5">{req.doctor_hospital}</p>
                            )}
                            {(req.doctor_email || req.doctor_phone) && (
                              <p className="text-xs text-slate-500 mt-0.5">
                                {[req.doctor_email, req.doctor_phone].filter(Boolean).join(" · ")}
                              </p>
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
                          <td className="py-3 px-3 text-slate-400 whitespace-nowrap">{format(new Date(req.created_at), REQ_DATE_TIME)}</td>
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
                      {allReqs.length === 0 && (
                        <tr><td colSpan={8} className="py-16 text-center text-slate-400">{allReqSearch ? "No requests match your search" : "No requests yet"}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Load more — pages back to the very first request */}
                {allReqs.length < allReqTotal && (
                  <div className="flex justify-center pt-2">
                    <button
                      onClick={() => loadAllRequests({ page: allReqPage + 1, q: allReqSearch })}
                      disabled={allReqMore}
                      className="px-5 py-2.5 rounded-xl bg-white/8 hover:bg-white/12 border border-white/10 text-sm text-slate-200 font-medium disabled:opacity-50"
                    >
                      {allReqMore ? "Loading…" : `Load more (${allReqTotal - allReqs.length} older)`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── REFERRALS ── */}

        {/* ── LABS ── */}
        {activeTab === "labs" && (
          <div className="animate-fade-in space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white">Registered Laboratories <span className="text-slate-500 font-normal text-sm">({labs.length})</span></h2>
              <Button onClick={() => setShowCreateLab(true)}>
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Add Laboratory</span>
              </Button>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-4 animate-pulse h-16" />
                ))}
              </div>
            ) : labs.length === 0 ? (
              <div className="text-center py-16 text-slate-500">No laboratories yet.</div>
            ) : (
              <div className="border border-white/10 rounded-2xl overflow-hidden divide-y divide-white/5">
                {labs.map((lab) => {
                  const isExpanded = expandedLabIds.has(lab.id);
                  const phones     = parsePhones(lab.phones);
                  const services   = lab.service_categories as string[];
                  const certs      = lab.certifications as string[];
                  const outstanding = lab.poveon_outstanding ?? 0;

                  const toggleExpand = () => setExpandedLabIds((prev) => {
                    const next = new Set(prev);
                    isExpanded ? next.delete(lab.id) : next.add(lab.id);
                    return next;
                  });

                  const openStats = () => {
                    setLabAnalyticsLabId(lab.id);
                    setLabAnalyticsLabName(lab.name);
                    setLabAnalytics(null);
                    setLabAnalyticsMonth("");
                    setLabAnalyticsStatus("");
                    setLabAnalyticsTest("");
                    fetchLabAnalytics(lab.id);
                  };

                  return (
                    <div key={lab.id} className={`transition-colors ${lab.hidden ? "opacity-55" : ""} ${isExpanded ? "bg-white/4" : "hover:bg-white/2"}`}>

                      {/* ── Main row ── */}
                      <div className="flex items-center gap-3 px-4 py-3">

                        {/* Logo */}
                        {lab.logo_url ? (
                          <img src={lab.logo_url} alt={lab.name} className="w-9 h-9 rounded-xl object-cover shrink-0" />
                        ) : (
                          <div className="w-9 h-9 bg-medical-700/40 rounded-xl flex items-center justify-center shrink-0">
                            <Building2 className="w-4 h-4 text-medical-400" />
                          </div>
                        )}

                        {/* Name + badges */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-semibold text-white leading-tight">{lab.name}</p>
                            <Badge variant="blue">Prefix: {lab.prefix}</Badge>
                            {lab.hidden && <span className="text-[10px] text-slate-500 bg-white/5 px-1.5 py-0.5 rounded">hidden</span>}
                            {lab.free_trial && <span className="text-[10px] bg-emerald-900/30 text-emerald-400 border border-emerald-800/30 px-1.5 py-0.5 rounded-full" title="Free trial - no commission">FREE TRIAL</span>}
                            {lab.slug && (
                              <a href={labUrl(lab.slug, "/")} target="_blank" rel="noopener noreferrer"
                                className="text-[10px] text-blue-400 hover:text-blue-300 font-mono bg-blue-500/8 border border-blue-500/20 px-1.5 py-0.5 rounded"
                                title={`Direct URL: ${labHost(lab.slug)}`}>{LAB_SUBDOMAINS_ENABLED ? labHost(lab.slug) : `/${lab.slug}`}</a>
                            )}
                            {lab.whatsapp && (
                              <span className="text-[10px] bg-green-900/30 text-green-400 border border-green-800/30 px-1.5 py-0.5 rounded-full" title={`WhatsApp: ${lab.whatsapp}`}>WA</span>
                            )}
                            {lab.request_email && (
                              <span className="text-[10px] bg-blue-900/30 text-blue-400 border border-blue-800/30 px-1.5 py-0.5 rounded-full" title={`Requests: ${lab.request_email}`}>Mail</span>
                            )}
                          </div>
                          {/* Email on mobile */}
                          <p className="text-xs text-slate-500 mt-0.5 md:hidden truncate">{lab.email}</p>
                        </div>

                        {/* Email (md+) */}
                        <div className="hidden md:block w-52 shrink-0 min-w-0">
                          <p className="text-xs text-slate-400 truncate">{lab.email}</p>
                          {lab.notification_email && (
                            <p className="text-[10px] text-emerald-400 truncate mt-0.5">{lab.notification_email}</p>
                          )}
                        </div>

                        {/* Outstanding + rating (sm+) */}
                        <div className="hidden sm:flex flex-col items-end gap-1 w-28 shrink-0">
                          {outstanding > 0 && (
                            <span className="text-xs font-mono font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
                              ₦{outstanding.toLocaleString()}
                            </span>
                          )}
                          {lab.rating_avg != null ? (
                            <div className="flex items-center gap-0.5">
                              {[1,2,3,4,5].map((i) => (
                                <Star key={i} className={`w-2.5 h-2.5 ${i <= Math.round(lab.rating_avg!) ? "text-amber-400 fill-amber-400" : "text-slate-700"}`} />
                              ))}
                              <span className="text-[10px] text-amber-400 font-semibold ml-0.5">{lab.rating_avg.toFixed(1)}</span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-600">No ratings</span>
                          )}
                        </div>

                        {/* Desktop quick-actions (icon buttons, lg+) */}
                        <div className="hidden lg:flex items-center gap-0.5 shrink-0">
                          <button onClick={() => setEditLab(lab)} title="Edit" className="p-2 rounded-lg hover:bg-white/8 text-slate-500 hover:text-white transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setBranchModalLabId(lab.id)} title="Branches" className="p-2 rounded-lg hover:bg-white/8 text-slate-500 hover:text-white transition-colors">
                            <GitBranch className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleToggleHidden(lab)} disabled={togglingId === lab.id} title={lab.hidden ? "Restore (fully hidden)" : "Hide completely"} className="p-2 rounded-lg hover:bg-white/8 text-slate-500 hover:text-white transition-colors">
                            {lab.hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => handleToggleSearchHidden(lab)}
                            disabled={togglingSearchHiddenId === lab.id}
                            title={lab.search_hidden ? "Restore to search" : "Hide from search only"}
                            className={`p-2 rounded-lg transition-colors ${lab.search_hidden ? "text-orange-400 hover:bg-orange-500/15" : "text-slate-500 hover:bg-orange-500/10 hover:text-orange-400"}`}
                          >
                            <Search className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={openStats} title="Stats" className="p-2 rounded-lg hover:bg-emerald-500/15 text-slate-500 hover:text-emerald-400 transition-colors">
                            <BarChart3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setPromoLab({ id: lab.id, name: lab.name, slug: lab.slug ?? null })}
                            title="Care Plan flyer & QR code"
                            className="p-2 rounded-lg hover:bg-sky-500/15 text-slate-500 hover:text-sky-400 transition-colors"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setCatalogLab(lab)} title="Test Catalog" className="p-2 rounded-lg hover:bg-teal-500/15 text-slate-500 hover:text-teal-400 transition-colors">
                            <FlaskConical className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setPartnersLab(lab)} title="Partners (HMOs, hospitals, companies)" className="p-2 rounded-lg hover:bg-rose-500/15 text-slate-500 hover:text-rose-400 transition-colors">
                            <HeartHandshake className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setExpandedLabIntegration(lab.id)} title="Dev / Integration" className="p-2 rounded-lg hover:bg-blue-500/15 text-slate-500 hover:text-blue-400 transition-colors">
                            <Code2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setSendAgreementLab(lab)}
                            title="Send Agreement Invite"
                            className="p-2 rounded-lg hover:bg-violet-500/15 text-slate-500 hover:text-violet-400 transition-colors"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setTransferEmailLab(lab)}
                            title="Transfer Ownership / Change Email"
                            className="p-2 rounded-lg hover:bg-amber-500/15 text-slate-500 hover:text-amber-400 transition-colors"
                          >
                            <UserCircle className="w-3.5 h-3.5" />
                          </button>
                          <LabWalletButton labId={lab.id} />
                          <button
                            onClick={() => handleToggleFreeTrial(lab)}
                            disabled={togglingFreeTrialId === lab.id}
                            title={lab.free_trial ? "Disable free trial" : "Enable free trial"}
                            className={`p-2 rounded-lg transition-colors ${
                              lab.free_trial
                                ? "text-emerald-400 hover:bg-emerald-500/15"
                                : "text-slate-500 hover:bg-emerald-500/10 hover:text-emerald-400"
                            }`}
                          >
                            <Star className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setTempPasswordLab(lab)} disabled={settingTempPassword} title="Set temporary password" className="p-2 rounded-lg hover:bg-sky-500/15 text-slate-500 hover:text-sky-400 transition-colors">
                            <Key className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setDeleteConfirmLab(lab)} disabled={deletingId === lab.id} title="Delete" className="p-2 rounded-lg hover:bg-red-500/15 text-slate-600 hover:text-red-400 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Expand toggle */}
                        <button onClick={toggleExpand} className="p-2 rounded-lg hover:bg-white/8 text-slate-600 hover:text-slate-300 transition-colors shrink-0" title={isExpanded ? "Collapse" : "Expand"}>
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>

                      {/* ── Expanded panel ── */}
                      {isExpanded && (
                        <div className="px-4 pt-3 pb-4 border-t border-white/5 space-y-4">

                          {/* Detail grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-3 text-xs">
                            <div className="md:hidden col-span-2 sm:col-span-3">
                              <p className="text-slate-500 mb-0.5">Email</p>
                              <p className="text-slate-300 break-all">{lab.email}</p>
                              {lab.notification_email && <p className="text-emerald-400 mt-0.5 break-all">{lab.notification_email}</p>}
                            </div>
                            {phones.length > 0 && (
                              <div>
                                <p className="text-slate-500 mb-0.5">Phone{phones.length > 1 ? "s" : ""}</p>
                                {phones.map((ph, i) => (
                                  <p key={i} className="text-slate-300 flex items-center gap-1">
                                    <Phone className="w-3 h-3 text-slate-600 shrink-0" />
                                    {ph.label && <span className="text-slate-500">{ph.label}:</span>}
                                    {ph.number}
                                  </p>
                                ))}
                              </div>
                            )}
                            {lab.address && (
                              <div className="col-span-2 sm:col-span-1">
                                <p className="text-slate-500 mb-0.5">Address</p>
                                <p className="text-slate-300 leading-snug">{lab.address}</p>
                              </div>
                            )}
                            <div>
                              <p className="text-slate-500 mb-0.5">Added</p>
                              <p className="text-slate-400">{format(new Date(lab.created_at), "dd MMM yyyy")}</p>
                            </div>
                            {outstanding > 0 && (
                              <div className="sm:hidden">
                                <p className="text-slate-500 mb-0.5">Outstanding</p>
                                <p className="text-amber-300 font-mono font-bold">₦{outstanding.toLocaleString()}</p>
                              </div>
                            )}
                            {lab.rating_avg != null && (
                              <div className="sm:hidden">
                                <p className="text-slate-500 mb-0.5">Rating</p>
                                <p className="text-amber-400">{lab.rating_avg.toFixed(1)} / 5 ({lab.rating_count})</p>
                              </div>
                            )}
                          </div>

                          {/* Services + certifications */}
                          {(services.length > 0 || certs.length > 0) && (
                            <div className="flex flex-wrap gap-4">
                              {services.length > 0 && (
                                <div>
                                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Services</p>
                                  <div className="flex flex-wrap gap-1">
                                    {services.map((c) => (
                                      <span key={c} className="text-xs bg-medical-900/50 text-medical-300 border border-medical-800/40 px-2 py-0.5 rounded-full">{c}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {certs.length > 0 && (
                                <div>
                                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Certifications</p>
                                  <div className="flex flex-wrap gap-1">
                                    {certs.map((c) => (
                                      <span key={c} className="text-xs bg-amber-900/20 text-amber-400 border border-amber-800/30 px-2 py-0.5 rounded-full">{c}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Action buttons — mobile & tablet (< lg) */}
                          <div className="lg:hidden grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                            <button onClick={() => setEditLab(lab)} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium transition-colors">
                              <Pencil className="w-3.5 h-3.5" />Edit
                            </button>
                            <button onClick={() => setBranchModalLabId(lab.id)} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium transition-colors">
                              <GitBranch className="w-3.5 h-3.5" />Branches
                            </button>
                            <button onClick={() => handleToggleHidden(lab)} disabled={togglingId === lab.id} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium transition-colors">
                              {lab.hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                              {lab.hidden ? "Show" : "Hide"}
                            </button>
                            <button onClick={openStats} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-medium transition-colors">
                              <BarChart3 className="w-3.5 h-3.5" />Stats
                            </button>
                            <button
                              onClick={() => setPromoLab({ id: lab.id, name: lab.name, slug: lab.slug ?? null })}
                              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 text-xs font-medium transition-colors"
                            >
                              <QrCode className="w-3.5 h-3.5" />Care flyer
                            </button>
                            <button onClick={() => setCatalogLab(lab)} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 text-xs font-medium transition-colors">
                              <FlaskConical className="w-3.5 h-3.5" />Catalog
                            </button>
                            <button onClick={() => setPartnersLab(lab)} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-medium transition-colors">
                              <HeartHandshake className="w-3.5 h-3.5" />Partners
                            </button>
                            <button onClick={() => setExpandedLabIntegration(lab.id)} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-medium transition-colors">
                              <Code2 className="w-3.5 h-3.5" />Dev
                            </button>
                            <button
                              onClick={() => setSendAgreementLab(lab)}
                              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 text-xs font-medium transition-colors"
                            >
                              <FileText className="w-3.5 h-3.5" />Agreement
                            </button>
                            <button
                              onClick={() => setTransferEmailLab(lab)}
                              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-medium transition-colors"
                            >
                              <UserCircle className="w-3.5 h-3.5" />Transfer
                            </button>
                            <button
                              onClick={() => handleToggleSearchHidden(lab)}
                              disabled={togglingSearchHiddenId === lab.id}
                              className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${lab.search_hidden ? "bg-orange-500/20 text-orange-400 hover:bg-orange-500/30" : "bg-white/5 hover:bg-orange-500/10 text-slate-300 hover:text-orange-400"}`}
                            >
                              <Search className="w-3.5 h-3.5" />{lab.search_hidden ? "In Search" : "Hide Search"}
                            </button>
                            <div><LabWalletButton labId={lab.id} /></div>
                            <button onClick={() => setDeleteConfirmLab(lab)} disabled={deletingId === lab.id} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {/* ── API ANALYTICS ── */}

        {/* ── SETTINGS ── */}
        {activeTab === "settings" && (
          <div className="animate-fade-in space-y-6 max-w-lg">
            <div>
              <h2 className="font-semibold text-white">Platform Settings</h2>
              <p className="text-xs text-slate-500 mt-0.5">Configure system-wide behaviour</p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-5">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-violet-400" />
                <p className="font-semibold text-white text-sm">Request Defaults</p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">
                    Default request charge (₦) — used for image-only or pre-catalog requests
                  </label>
                  <input
                    type="number" min="0" step="1"
                    value={defaultRequestPrice}
                    onChange={(e) => setDefaultRequestPrice(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-500 outline-none focus:ring-2 focus:ring-violet-500/50"
                    placeholder="e.g. 500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">
                    Support email — where dashboard help &amp; feedback messages are sent
                  </label>
                  <input
                    type="email"
                    value={supportEmail}
                    onChange={(e) => setSupportEmail(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-500 outline-none focus:ring-2 focus:ring-violet-500/50"
                    placeholder="spendbox@gmail.com"
                  />
                </div>
              </div>

              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {savingSettings ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Settings
              </button>
            </div>

            {/* Labs with outstanding Poveon commission */}
            {labs.filter((l) => (l.poveon_outstanding ?? 0) > 0).length > 0 && (
              <div className="bg-amber-500/8 border border-amber-500/20 rounded-2xl p-5 space-y-3">
                <p className="text-sm font-semibold text-amber-400 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  Labs with outstanding Poveon commission
                </p>
                {labs.filter((l) => (l.poveon_outstanding ?? 0) > 0).map((lab) => (
                  <div key={lab.id} className="flex items-center justify-between gap-3 bg-white/5 rounded-xl px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{lab.name}</p>
                      <p className="text-xs text-slate-400 truncate">{lab.email}</p>
                      {parsePhones(lab.phones).length > 0 && (
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 shrink-0" />{parsePhones(lab.phones)[0].number}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="text-sm font-bold font-mono text-amber-400">
                        ₦{(lab.poveon_outstanding ?? 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── MARKETERS ── */}

        {/* ── TRANSACTIONS ── */}
        {activeTab === "transactions" && <AdminTransactionsTab labs={labs} />}

        {/* ── KNOWLEDGE BASE ── */}

        {/* ── LAB MARKETERS ── */}

        {/* ── USERS ── */}
        {activeTab === "users" && <AdminUsersTab />}

        {/* ── HOSPITALS ── */}
        {activeTab === "hospitals" && <AdminHospitalsTab />}

        {/* ── PROFESSIONALS ── */}
        {activeTab === "professionals" && <AdminProfessionalsTab />}

        {/* ── SKIN CONSULTS ── */}

        {activeTab === "clients" && <AdminClientsTab />}

        {activeTab === "encounters" && <AdminEncountersTab />}

        {activeTab === "broadcast" && <AdminBroadcastTab />}
        {activeTab === "hmo" && <AdminHmoTab />}

        {activeTab === "perks" && <AdminPerksTab />}

        {activeTab === "care-plan" && <AdminCarePlanTab />}

        {activeTab === "pharmacies" && <AdminPharmaciesTab />}

        {/* ── AGREEMENTS ── */}
        {activeTab === "agreements" && (
          <AdminAgreementsTab
            agreements={agreements}
            loading={agreementsLoading}
            onLoad={() => {
              if (agreements.length === 0 && !agreementsLoading) {
                setAgreementsLoading(true);
                fetch("/api/admin/agreements")
                  .then((r) => r.json())
                  .then((d) => { if (d.success) setAgreements(d.agreements); })
                  .catch(() => {})
                  .finally(() => setAgreementsLoading(false));
              }
            }}
          />
        )}

        </main>
      </div>

      {showCreateLab && (
        <CreateLabForm onClose={() => setShowCreateLab(false)} onSuccess={() => { setShowCreateLab(false); fetchLabs(); }} />
      )}
      {editLab && (
        <EditLabForm lab={editLab} onClose={() => setEditLab(null)} onSuccess={() => { setEditLab(null); fetchLabs(); }} />
      )}
      <Modal
        open={!!promoLab}
        onClose={() => setPromoLab(null)}
        title="Care Plan promotion"
        subtitle={promoLab?.name}
      >
        {promoLab && (
          promoLab.slug ? (
            <div className="flex flex-col items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/admin/partner-qr?kind=lab&id=${promoLab.id}`}
                alt={`Sign-up QR code for ${promoLab.name}`}
                className="h-52 w-52 rounded-xl ring-1 ring-slate-100"
              />
              <p className="text-center text-xs text-slate-500">
                Anyone who scans this joins the care plan with {promoLab.name} already set as their
                lab, so their scheduled tests show up here.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <a
                  href={`/api/admin/partner-qr?kind=lab&id=${promoLab.id}`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-medical-700 ring-1 ring-medical-200 transition hover:ring-medical-300"
                >
                  Just the QR code
                </a>
                <a
                  href={`/api/admin/partner-promo?kind=lab&id=${promoLab.id}`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-medical-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-medical-700"
                >
                  Printable flyer (PDF)
                </a>
              </div>
              <p className="text-center text-[11px] text-slate-400">
                The flyer carries today&apos;s price and discounts — change them under Care Plan →
                Pricing and every flyer printed afterwards follows.
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-600">
              This lab has no slug yet, so it has no scannable link. Give it one in Edit Lab and the
              flyer will be available.
            </p>
          )
        )}
      </Modal>

      {catalogLab && (
        <AdminLabCatalogModal lab={catalogLab} onClose={() => setCatalogLab(null)} />
      )}

      {partnersLab && (
        <AdminLabPartnersModal lab={partnersLab} onClose={() => setPartnersLab(null)} />
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
      {sendAgreementLab && (
        <SendAgreementModal
          lab={sendAgreementLab}
          onClose={() => setSendAgreementLab(null)}
          onSent={(labEmail) => { setSendAgreementLab(null); toast.success(`Agreement invite sent to ${labEmail}`); }}
        />
      )}
      {transferEmailLab && (
        <TransferEmailModal
          lab={transferEmailLab}
          onClose={() => setTransferEmailLab(null)}
          onSuccess={(newEmail) => {
            setTransferEmailLab(null);
            fetchLabs();
            toast.success(`Email updated to ${newEmail}`);
          }}
        />
      )}
      {deleteConfirmLab && (
        <DeleteConfirmModal
          name={deleteConfirmLab.name}
          label="lab"
          onClose={() => setDeleteConfirmLab(null)}
          onConfirm={() => { setDeleteConfirmLab(null); handleDeleteLab(deleteConfirmLab); }}
        />
      )}

      {/* Set Temporary Password Modal */}
      {tempPasswordLab && (
        <AdminOverlay onClose={() => setTempPasswordLab(null)} align="center">
          <div
            className="bg-slate-900 border border-white/15 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-white/10">
              <div className="flex items-center gap-3">
                <Key className="w-5 h-5 text-sky-400" />
                <h3 className="font-semibold text-white">Set Temporary Password</h3>
              </div>
              <p className="text-sm text-slate-400 mt-2">Send a temporary password to {tempPasswordLab.name}</p>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <p className="text-sm text-slate-400 mb-2">Lab Email</p>
                <p className="text-white font-mono text-sm bg-white/5 rounded-lg px-3 py-2 border border-white/10">
                  {tempPasswordLab.email}
                </p>
              </div>
              <p className="text-xs text-slate-500">
                A temporary password will be generated and sent to this email. The lab must change it on first login.
              </p>
            </div>

            <div className="px-6 py-4 border-t border-white/10 flex gap-3">
              <button
                onClick={() => setTempPasswordLab(null)}
                disabled={settingTempPassword}
                className="flex-1 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => { handleSetTempPassword(tempPasswordLab); }}
                disabled={settingTempPassword}
                className="flex-1 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {settingTempPassword ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Key className="w-4 h-4" />
                    Send Password
                  </>
                )}
              </button>
            </div>
          </div>
        </AdminOverlay>
      )}

      {/* Per-lab analytics modal */}
      {labAnalyticsLabId && (
        <AdminOverlay onClose={() => setLabAnalyticsLabId(null)}>
          <div
            className="w-full max-w-2xl bg-slate-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden max-h-modal flex flex-col"
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
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </AdminOverlay>
      )}
    </div>
  );
}



// =============================================================================
// Referral Detail Modal
// =============================================================================

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
    <AdminOverlay onClose={() => onClose()}>
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg max-h-modal overflow-y-auto shadow-2xl animate-slide-up">
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
                const branchPhones = parsePhones(b.branch_lab.phones);
                return (
                  <div key={b.id} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-semibold text-white text-sm truncate">{b.branch_lab.name}</p>
                          {b.is_main && <span className="text-xs bg-medical-600/30 text-medical-300 border border-medical-600/30 px-2 py-0.5 rounded-full font-medium shrink-0">Main</span>}
                        </div>
                        {b.branch_lab.address && <p className="text-xs text-slate-400 flex items-center gap-1"><MapPin className="w-3 h-3 shrink-0" />{b.branch_lab.address}</p>}
                        {branchPhones.slice(0, 2).map((ph, i) => <p key={i} className="text-xs text-slate-500 flex items-center gap-1"><Phone className="w-3 h-3 shrink-0" />{ph.label && <span className="text-slate-600">{ph.label}:</span>}{ph.number}</p>)}
                        {b.branch_lab.whatsapp && (() => {
                          let waNumbers: string[] = [];
                          try { const p = JSON.parse(b.branch_lab.whatsapp!); waNumbers = Array.isArray(p) ? p.filter(Boolean) : [b.branch_lab.whatsapp!]; } catch { waNumbers = [b.branch_lab.whatsapp!]; }
                          return waNumbers.map((num, i) => (
                            <p key={i} className="text-xs text-emerald-400 flex items-center gap-1"><MessageCircle className="w-3 h-3 shrink-0" />{num}</p>
                          ));
                        })()}
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
    </AdminOverlay>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

type IntegrationTab = "developer" | "team";

function LabIntegrationModal({ lab, onClose }: { lab: Lab; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<IntegrationTab>("developer");

  return (
    <AdminOverlay onClose={onClose} align="center">
      <div className="bg-slate-900 border border-white/15 rounded-2xl w-full max-w-lg shadow-2xl animate-slide-up max-h-modal flex flex-col">
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
    </AdminOverlay>
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
    "patient_age": 34,
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
  { key: "can_view_wallet",     label: "Wallet",     description: "View wallet balance and transactions" },
  { key: "can_view_marketers",  label: "Marketers",  description: "Manage lab marketers and assign doctors" },
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
  can_view_wallet:     boolean;
  can_view_marketers:  boolean;
};

function blankRole(): DraftRole {
  return { name: "", can_view_requests: true, can_mark_seen: false, can_mark_done: false, can_send_results: false, can_manage_team: false, can_manage_api_keys: false, can_view_referrals: false, can_view_clients: false, can_view_analytics: false, can_view_activity: false, can_view_feedback: false, can_view_wallet: false, can_view_marketers: false };
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
      can_view_wallet:     (role as DraftRole).can_view_wallet ?? false,
      can_view_marketers:  (role as DraftRole).can_view_marketers ?? false,
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




/* ─────────────────────────────────────────────
   Admin Transactions Tab
───────────────────────────────────────────── */
interface TxRow {
  id: string;
  lab_id: string;
  lab_name: string;
  type: string;
  direction: string;
  amount: number;
  balance_after: number;
  description: string | null;
  actor_email: string | null;
  created_at: string;
  request_id: string | null;
  test_breakdown: unknown;
  tests_raw: unknown;
  quoted_price: number | null;
}

function AdminTransactionsTab({ labs }: { labs: Lab[] }) {
  const [labFilter, setLabFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rows, setRows] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);

  const fetchTx = useCallback(async (lab?: string, from?: string, to?: string) => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "500" });
    if (lab) params.set("lab_id", lab);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    try {
      const res = await fetch(`/api/admin/transactions?${params}`);
      const json = await res.json();
      if (json.success) setRows(json.transactions);
    } catch { /* ignore */ }
    setLoading(false);
    setFetched(true);
  }, []);

  // Initial load only
  useEffect(() => { fetchTx(); }, [fetchTx]);

  function exportCSV() {
    const header = ["ID", "Lab", "Type", "Direction", "Amount", "Balance After", "Description", "Actor", "Date", "Request ID", "Quoted Price", "Tests"];
    const body = rows.map((t) => {
      const tests = Array.isArray(t.tests_raw) ? (t.tests_raw as { name: string }[]).map((x) => x.name).join("; ")
        : typeof t.tests_raw === "string" ? t.tests_raw : "";
      return [
        t.id, t.lab_name, t.type, t.direction,
        t.amount, t.balance_after,
        `"${(t.description ?? "").replace(/"/g, '""')}"`,
        t.actor_email ?? "",
        format(new Date(t.created_at), "yyyy-MM-dd HH:mm"),
        t.request_id ?? "",
        t.quoted_price ?? "",
        `"${tests.replace(/"/g, '""')}"`,
      ].join(",");
    });
    const csv = [header.join(","), ...body].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "transactions.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  function getTestList(row: TxRow): string[] {
    if (Array.isArray(row.test_breakdown)) {
      return (row.test_breakdown as { name: string; price?: number }[]).map((t) =>
        t.price != null ? `${t.name} — ₦${Number(t.price).toLocaleString()}` : t.name
      );
    }
    if (Array.isArray(row.tests_raw)) {
      return (row.tests_raw as { name: string }[]).map((t) => t.name);
    }
    if (typeof row.tests_raw === "string" && row.tests_raw) {
      return row.tests_raw.split(",").map((s) => s.trim()).filter(Boolean);
    }
    return [];
  }

  const totalDebit = rows.filter((r) => r.direction === "debit").reduce((s, r) => s + r.amount, 0);
  const totalCredit = rows.filter((r) => r.direction === "credit").reduce((s, r) => s + r.amount, 0);

  return (
    <div className="animate-fade-in space-y-5">
      {/* Filters */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4 md:p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-slate-400" />
            All Transactions
          </h2>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => fetchTx(labFilter, dateFrom, dateTo)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/8 border border-white/10 text-xs text-slate-300 hover:bg-white/12 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            {rows.length > 0 && (
              <button
                onClick={exportCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-xs text-emerald-300 hover:bg-emerald-500/30 transition-colors"
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                Export CSV
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Lab</label>
            <select
              value={labFilter}
              onChange={(e) => setLabFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-white/10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-medical-500 [color-scheme:dark]"
            >
              <option value="">All Labs</option>
              {labs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white/8 border border-white/10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-medical-500 [color-scheme:dark]" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white/8 border border-white/10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-medical-500 [color-scheme:dark]" />
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={() => fetchTx(labFilter, dateFrom, dateTo)}
              disabled={loading}
              className="flex-1 px-3 py-2 rounded-xl bg-medical-600 border border-medical-500/30 text-sm text-white font-medium hover:bg-medical-500 transition-colors disabled:opacity-50"
            >
              Apply
            </button>
            <button
              onClick={() => { setLabFilter(""); setDateFrom(""); setDateTo(""); fetchTx(); }}
              className="px-3 py-2 rounded-xl bg-white/8 border border-white/10 text-sm text-slate-400 hover:bg-white/12 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Summary stats */}
      {fetched && rows.length > 0 && (
        <div className="grid grid-cols-3 gap-2 md:gap-3">
          {[
            { label: "Transactions", value: rows.length.toString(), color: "text-white", bg: "bg-white/5 border-white/10" },
            { label: "Total Credits", value: `₦${totalCredit.toLocaleString()}`, color: "text-emerald-300", bg: "bg-emerald-500/10 border-emerald-500/20" },
            { label: "Total Debits", value: `₦${totalDebit.toLocaleString()}`, color: "text-rose-300", bg: "bg-rose-500/10 border-rose-500/20" },
          ].map((s) => (
            <div key={s.label} className={`border rounded-xl p-3 md:p-4 text-center ${s.bg}`}>
              <p className={`text-base md:text-xl font-bold ${s.color} break-all tabular-nums`}>{s.value}</p>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Transaction list */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4 animate-pulse h-16" />
          ))}
        </div>
      ) : !fetched ? null : rows.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
          <CreditCard className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-300 font-medium">No transactions found</p>
          <p className="text-xs text-slate-500 mt-1">Try adjusting your filters</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((tx) => {
            const tests = getTestList(tx);
            const isExpanded = expandedId === tx.id;
            const isDebit = tx.direction === "debit";
            const hasDetails = tests.length > 0 || tx.quoted_price != null || tx.actor_email || tx.request_id;
            return (
              <div key={tx.id} className="bg-white/6 border border-white/12 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : tx.id)}
                  className="w-full flex items-start gap-3 px-4 py-3.5 hover:bg-white/6 transition-colors text-left"
                >
                  {/* Direction icon */}
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${isDebit ? "bg-rose-500/20 border border-rose-500/20" : "bg-emerald-500/20 border border-emerald-500/20"}`}>
                    {isDebit
                      ? <ArrowDownRight className="w-4 h-4 text-rose-300" />
                      : <ArrowUpRight className="w-4 h-4 text-emerald-300" />
                    }
                  </div>

                  {/* Main info — stacks nicely on all widths */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white leading-tight">{tx.lab_name}</span>
                      <span className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold bg-white/8 px-1.5 py-0.5 rounded">{tx.type}</span>
                    </div>
                    {tx.description && (
                      <p className="text-xs text-slate-400 mt-0.5 leading-snug line-clamp-2">{tx.description}</p>
                    )}
                    <p className="text-[11px] text-slate-500 mt-1">{format(new Date(tx.created_at), "dd MMM yyyy · HH:mm")}</p>
                  </div>

                  {/* Amount + chevron */}
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <p className={`text-sm font-bold tabular-nums ${isDebit ? "text-rose-300" : "text-emerald-300"}`}>
                      {isDebit ? "−" : "+"}₦{tx.amount.toLocaleString()}
                    </p>
                    {hasDetails && (
                      isExpanded
                        ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                        : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-white/8 px-4 py-3 bg-slate-950/40 space-y-3">
                    {/* Key metrics */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                      <div>
                        <p className="text-slate-500 mb-0.5">Balance After</p>
                        <p className="text-white font-semibold">₦{tx.balance_after.toLocaleString()}</p>
                      </div>
                      {tx.quoted_price != null && (
                        <div>
                          <p className="text-slate-500 mb-0.5">Quoted Price</p>
                          <p className="text-white font-semibold">₦{tx.quoted_price.toLocaleString()}</p>
                        </div>
                      )}
                      {tx.actor_email && (
                        <div className="col-span-2">
                          <p className="text-slate-500 mb-0.5">Processed by</p>
                          <p className="text-slate-300 font-medium break-all">{tx.actor_email}</p>
                        </div>
                      )}
                      {tx.request_id && (
                        <div className="col-span-2">
                          <p className="text-slate-500 mb-0.5">Request ID</p>
                          <p className="text-slate-400 font-mono text-[10px] break-all">{tx.request_id}</p>
                        </div>
                      )}
                    </div>
                    {/* Tests */}
                    {tests.length > 0 && (
                      <div>
                        <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1.5">Tests Performed</p>
                        <div className="flex flex-wrap gap-1.5">
                          {tests.map((t, i) => (
                            <span key={i} className="text-xs px-2.5 py-1 bg-white/8 border border-white/12 rounded-full text-slate-200 leading-tight">{t}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Admin Knowledge Base Tab
───────────────────────────────────────────── */


// ─────────────────────────────────────────────────────────
// Admin Users Tab — view & delete doctor portal users
// ─────────────────────────────────────────────────────────
interface PortalUser {
  email: string; name: string | null; phone: string | null;
  role: string; sub_role: string | null; detail: string | null;
  updated_at: string; has_pin: boolean;
}

const ROLE_TABS = [
  { key: "all", label: "All" },
  { key: "doctor", label: "Doctors" },
  { key: "lab", label: "Lab Staff" },
] as const;

const ROLE_COLORS: Record<string, string> = {
  doctor: "bg-medical-500/15 text-medical-400 border-medical-500/20",
  lab:    "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  admin:  "bg-violet-500/15 text-violet-400 border-violet-500/20",
};

function AdminUsersTab() {
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "doctor" | "lab">("all");
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users?role=${roleFilter}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [roleFilter]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function handleDelete(email: string) {
    if (!confirm(`Delete user ${email}? This removes their profile, sessions, and OTPs.`)) return;
    setDeletingEmail(email);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(email)}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("User deleted");
        setUsers((prev) => prev.filter((u) => u.email !== email));
      } else {
        const d = await res.json();
        toast.error(d.error ?? "Failed to delete");
      }
    } finally {
      setDeletingEmail(null);
    }
  }

  const filtered = search.trim()
    ? users.filter((u) =>
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        (u.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (u.detail ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : users;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-white">Portal Users</h2>
          <p className="text-xs text-slate-400 mt-0.5">{filtered.length} user{filtered.length !== 1 ? "s" : ""}{search ? " matching" : ""}</p>
        </div>
        <button onClick={fetchUsers} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/8 transition">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Role filter tabs */}
      <div className="flex gap-1 bg-white/5 p-1 rounded-xl w-fit">
        {ROLE_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setRoleFilter(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${roleFilter === t.key ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email, name, or lab…"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-medical-500 transition"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-5 h-5 animate-spin text-slate-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <UserCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No users found</p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden border border-white/8 divide-y divide-white/5">
          {filtered.map((u) => (
            <div key={`${u.role}-${u.email}`} className="flex items-center gap-3 px-4 py-3 bg-white/3 hover:bg-white/5 transition-colors">
              <div className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center shrink-0">
                <UserCircle className="w-4 h-4 text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <p className="text-sm font-semibold text-white truncate leading-tight">
                    {u.name ?? <span className="text-slate-500 font-normal italic">No name</span>}
                  </p>
                  <span className={`text-[10px] border rounded-full px-1.5 py-0.5 shrink-0 ${ROLE_COLORS[u.role] ?? ""}`}>
                    {u.sub_role ?? u.role}
                  </span>
                  {u.has_pin && <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 rounded-full px-1.5 py-0.5 shrink-0">PIN</span>}
                </div>
                <p className="text-xs text-slate-500 truncate">{u.email}</p>
                {u.detail && <p className="text-[10px] text-slate-600 truncate">{u.detail}</p>}
              </div>
              {u.role === "doctor" && (
                <button
                  onClick={() => handleDelete(u.email)}
                  disabled={deletingEmail === u.email}
                  className="p-1.5 rounded-lg text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition shrink-0"
                  title="Delete user"
                >
                  {deletingEmail === u.email
                    ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AdminHospitalsTab — full CRUD for the hospitals/clinics list + referral
// network details, plus a "Patient Referrals" oversight sub-view.
// ─────────────────────────────────────────────────────────────────────────────
interface HospitalRow {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  specialties: string[] | null;
  is_active: boolean;
  doctor_count: number;
}

interface HospitalFormValues {
  name: string;
  city: string;
  state: string;
  address: string;
  email: string;
  phone: string;
  specialties: string[];
}

const EMPTY_HOSPITAL_FORM: HospitalFormValues = {
  name: "", city: "", state: "", address: "", email: "", phone: "", specialties: [],
};

function HospitalFormFields({
  values,
  onChange,
  inputCls,
}: {
  values: HospitalFormValues;
  onChange: (v: HospitalFormValues) => void;
  inputCls: string;
}) {
  return (
    <>
      <input type="text" placeholder="Hospital name *" value={values.name}
        onChange={(e) => onChange({ ...values, name: e.target.value })} className={inputCls} required />
      <div className="grid grid-cols-2 gap-2">
        <input type="text" placeholder="City" value={values.city}
          onChange={(e) => onChange({ ...values, city: e.target.value })} className={inputCls} />
        <input type="text" placeholder="State" value={values.state}
          onChange={(e) => onChange({ ...values, state: e.target.value })} className={inputCls} />
      </div>
      <input type="text" placeholder="Address" value={values.address}
        onChange={(e) => onChange({ ...values, address: e.target.value })} className={inputCls} />
      <div>
        <input type="email" placeholder="Referral portal login email" value={values.email}
          onChange={(e) => onChange({ ...values, email: e.target.value })} className={inputCls} />
        <p className="text-[10px] text-slate-500 mt-1">
          Adding an email puts this hospital on the referral network and sends them a portal invite automatically.
        </p>
      </div>
      <input type="tel" placeholder="Phone" value={values.phone}
        onChange={(e) => onChange({ ...values, phone: e.target.value })} className={inputCls} />
      <SpecialtyTreePicker
        value={values.specialties}
        onChange={(specialties) => onChange({ ...values, specialties })}
      />
    </>
  );
}

function AdminHospitalsTab() {
  const [view, setView]           = useState<"hospitals" | "patient-referrals">("hospitals");
  const [hospitals, setHospitals] = useState<HospitalRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [creating, setCreating]   = useState(false);
  const [newForm, setNewForm]     = useState<HospitalFormValues>(EMPTY_HOSPITAL_FORM);
  const [saving, setSaving]       = useState(false);
  const [editId, setEditId]       = useState<string | null>(null);
  const [editForm, setEditForm]   = useState<HospitalFormValues>(EMPTY_HOSPITAL_FORM);
  const [syncing, setSyncing]     = useState(false);
  const [doctorsFor, setDoctorsFor] = useState<{ id: string; name: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/hospitals");
      const d = await res.json();
      if (d.success) setHospitals(d.hospitals);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function formPayload(f: HospitalFormValues) {
    return {
      name: f.name.trim(),
      city: f.city.trim() || null,
      state: f.state.trim() || null,
      address: f.address.trim() || null,
      email: f.email.trim() || null,
      phone: f.phone.trim() || null,
      specialties: f.specialties,
    };
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newForm.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/hospitals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formPayload(newForm)),
      });
      const d = await res.json();
      if (d.success) {
        toast.success(newForm.email.trim() ? "Hospital added — referral portal invite sent" : "Hospital added");
        setNewForm(EMPTY_HOSPITAL_FORM);
        setCreating(false);
        load();
      } else toast.error(d.error ?? "Failed to create");
    } finally { setSaving(false); }
  }

  function startEdit(h: HospitalRow) {
    setEditId(h.id);
    setEditForm({
      name: h.name,
      city: h.city ?? "",
      state: h.state ?? "",
      address: h.address ?? "",
      email: h.email ?? "",
      phone: h.phone ?? "",
      specialties: Array.isArray(h.specialties) ? h.specialties : [],
    });
  }

  async function handleEdit(id: string) {
    if (!editForm.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/hospitals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formPayload(editForm)),
      });
      const d = await res.json();
      if (d.success) { toast.success("Hospital updated"); setEditId(null); load(); }
      else toast.error(d.error ?? "Failed to update");
    } finally { setSaving(false); }
  }

  async function handleToggle(id: string, current: boolean) {
    await fetch(`/api/admin/hospitals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !current }),
    });
    load();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    await fetch(`/api/admin/hospitals/${id}`, { method: "DELETE" });
    load();
  }

  async function handleSyncFromProfiles() {
    setSyncing(true);
    try {
      const res = await fetch("/api/admin/hospitals/sync-from-profiles", { method: "POST" });
      const d = await res.json();
      if (d.success) {
        if (d.created > 0) {
          toast.success(`${d.created} hospital${d.created !== 1 ? "s" : ""} added from professional profiles`);
          load();
        } else {
          toast.success("All hospitals already up to date");
        }
      } else {
        toast.error(d.error ?? "Sync failed");
      }
    } catch { toast.error("Network error"); }
    finally { setSyncing(false); }
  }

  const filtered = hospitals.filter((h) =>
    !search.trim() ||
    h.name.toLowerCase().includes(search.toLowerCase()) ||
    (h.city ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (h.state ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const inputCls = "w-full px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition";

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Sub-view toggle */}
      <div className="flex gap-1 bg-white/5 p-1 rounded-xl w-fit">
        {([
          { key: "hospitals" as const, label: "Hospitals" },
          { key: "patient-referrals" as const, label: "Patient Referrals" },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${view === t.key ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === "patient-referrals" ? (
        <AdminPatientReferralsView />
      ) : (
        <>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-white">Hospitals &amp; Clinics</h2>
          <p className="text-xs text-slate-400 mt-0.5">Manage the list doctors can select from and the referral network</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleSyncFromProfiles} disabled={syncing}
            className="flex items-center gap-1.5 text-xs font-semibold bg-white/8 hover:bg-white/15 disabled:opacity-50 text-slate-300 px-3 py-2 rounded-xl transition border border-white/10"
            title="Auto-add any hospitals mentioned in professional profiles that aren't in this list yet">
            {syncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Sync from Profiles
          </button>
          <button type="button" onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-xl transition">
            <Plus className="w-3.5 h-3.5" /> Add Hospital
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
        <input type="text" placeholder="Search hospitals…" value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition" />
      </div>

      {/* Create form */}
      {creating && (
        <form onSubmit={handleCreate} className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider">New Hospital / Clinic</p>
          <HospitalFormFields values={newForm} onChange={setNewForm} inputCls={inputCls} />
          <div className="flex gap-2">
            <button type="submit" disabled={saving || !newForm.name.trim()}
              className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold py-2 rounded-xl transition">
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
            </button>
            <button type="button" onClick={() => { setCreating(false); setNewForm(EMPTY_HOSPITAL_FORM); }}
              className="px-4 text-xs font-semibold text-slate-400 hover:text-white bg-white/5 rounded-xl transition">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map((i) => <div key={i} className="h-14 bg-white/5 rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/8 overflow-hidden divide-y divide-white/5">
          {filtered.length === 0 && (
            <div className="py-10 text-center text-sm text-slate-500">No hospitals found</div>
          )}
          {filtered.map((h) => (
            <div key={h.id} className={`px-4 py-3 ${!h.is_active ? "opacity-50" : ""}`}>
              {editId === h.id ? (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Edit Hospital</p>
                  <HospitalFormFields values={editForm} onChange={setEditForm} inputCls={inputCls} />
                  <div className="flex gap-2">
                    <button onClick={() => handleEdit(h.id)} disabled={saving || !editForm.name.trim()}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition">
                      {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
                    </button>
                    <button onClick={() => setEditId(null)}
                      className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-white/5 rounded-lg transition">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-white truncate">{h.name}</p>
                      {h.email && (
                        <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 rounded-full px-1.5 py-0.5 shrink-0">
                          Referral portal ✓
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {(h.city || h.state) && (
                        <span className="text-xs text-slate-400">{[h.city, h.state].filter(Boolean).join(", ")}</span>
                      )}
                      <span className="text-xs text-slate-500">{h.doctor_count} doctor{h.doctor_count !== 1 ? "s" : ""}</span>
                      {Array.isArray(h.specialties) && h.specialties.length > 0 && (
                        <span className="text-xs text-slate-500">{h.specialties.length} specialt{h.specialties.length !== 1 ? "ies" : "y"}</span>
                      )}
                      {!h.is_active && <span className="text-xs text-amber-500">inactive</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setDoctorsFor({ id: h.id, name: h.name })}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition"
                      title="Manage doctors registered under this hospital">
                      <Stethoscope className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => startEdit(h)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleToggle(h.id, h.is_active)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition"
                      title={h.is_active ? "Deactivate" : "Activate"}>
                      {h.is_active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => handleDelete(h.id, h.name)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-500">{hospitals.length} hospital{hospitals.length !== 1 ? "s" : ""} total · {hospitals.filter(h => h.is_active).length} active · {hospitals.filter(h => h.email).length} on the referral network</p>

      {doctorsFor && (
        <HospitalDoctorsPanel
          hospitalId={doctorsFor.id}
          hospitalName={doctorsFor.name}
          onClose={() => setDoctorsFor(null)}
          onChanged={load}
        />
      )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AdminPatientReferralsView — platform-wide patient referral oversight
// (sub-view inside the Hospitals tab; distinct from doctor lab-referrer analytics)
// ─────────────────────────────────────────────────────────────────────────────
interface AdminPatientReferral {
  id: string;
  code: string;
  status: string;
  patient_name: string;
  doctor_name: string;
  doctor_email: string;
  from_hospital: string;
  specialty: string;
  urgency: string;
  created_at: string;
  to_hospital: { name: string; city: string | null; state: string | null } | null;
}

const PATIENT_REFERRAL_STATUSES = ["", "pending", "accepted", "rejected", "redirected"] as const;

const PATIENT_REFERRAL_STATUS_STYLES: Record<string, string> = {
  pending: "bg-blue-500/15 text-blue-400 border border-blue-500/20",
  accepted: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20",
  rejected: "bg-rose-500/15 text-rose-400 border border-rose-500/20",
  redirected: "bg-amber-500/15 text-amber-400 border border-amber-500/20",
};

function AdminPatientReferralsView() {
  const [referrals, setReferrals] = useState<AdminPatientReferral[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");

  const loadReferrals = useCallback(async (statusFilter: string, q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/admin/referrals?${params.toString()}`);
      const d = await res.json();
      if (d.success) setReferrals(d.referrals);
      else toast.error(d.error ?? "Failed to load referrals");
    } catch {
      toast.error("Network error loading referrals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => loadReferrals(status, query), query ? 350 : 0);
    return () => clearTimeout(t);
  }, [status, query, loadReferrals]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-white">Patient Referrals</h2>
          <p className="text-xs text-slate-400 mt-0.5">All referrals sent across the hospital network</p>
        </div>
        <button onClick={() => loadReferrals(status, query)} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/8 transition">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Status filter */}
      <div className="flex gap-1 bg-white/5 p-1 rounded-xl w-fit flex-wrap">
        {PATIENT_REFERRAL_STATUSES.map((s) => (
          <button
            key={s || "all"}
            onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${status === s ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"}`}
          >
            {s || "All"}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
        <input
          type="text" placeholder="Search by code, patient or doctor…" value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map((i) => <div key={i} className="h-16 bg-white/5 rounded-2xl animate-pulse" />)}
        </div>
      ) : referrals.length === 0 ? (
        <div className="py-12 text-center text-slate-500 rounded-2xl border border-white/8">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No patient referrals{status ? ` with status “${status}”` : ""}{query ? " matching the search" : ""}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/8 overflow-hidden divide-y divide-white/5">
          {referrals.map((r) => (
            <div key={r.id} className="px-4 py-3 bg-white/3 hover:bg-white/5 transition-colors">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono font-bold text-slate-300 tracking-wider">{r.code}</span>
                <span className={`text-[10px] rounded-full px-1.5 py-0.5 capitalize ${PATIENT_REFERRAL_STATUS_STYLES[r.status] ?? "bg-white/10 text-slate-300 border border-white/10"}`}>
                  {r.status}
                </span>
                {r.urgency !== "routine" && (
                  <span className={`text-[10px] rounded-full px-1.5 py-0.5 capitalize ${r.urgency === "emergency" ? "bg-rose-500/15 text-rose-400 border border-rose-500/20" : "bg-amber-500/15 text-amber-400 border border-amber-500/20"}`}>
                    {r.urgency}
                  </span>
                )}
                <span className="text-[10px] text-slate-500 ml-auto shrink-0">{format(new Date(r.created_at), "d MMM yyyy · HH:mm")}</span>
              </div>
              <p className="text-sm font-semibold text-white mt-1 truncate">
                {r.patient_name}
                <span className="text-slate-500 font-normal"> → {r.to_hospital?.name ?? "—"}</span>
              </p>
              <p className="text-xs text-slate-400 truncate mt-0.5">
                {r.specialty} · by {r.doctor_name} ({r.from_hospital})
              </p>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-500">{referrals.length} referral{referrals.length !== 1 ? "s" : ""} shown</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LabWalletButton — provision DVA or show existing account details, per lab card
// ─────────────────────────────────────────────────────────────────────────────
function LabWalletButton({ labId }: { labId: string }) {
  const [state, setState] = useState<"loading" | "idle" | "form" | "done" | "credit-form" | "regen-form">("loading");
  const [phone, setPhone] = useState("");
  const [regenPhone, setRegenPhone] = useState("");
  const [dva, setDva] = useState<{ bank_name: string | null; account_number: string; account_name: string | null } | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const [creditRef, setCreditRef] = useState("");
  const [hasCustomer, setHasCustomer] = useState(false);

  // Load existing wallet state on mount
  useEffect(() => {
    fetch(`/api/admin/wallet/${labId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.paystack_customer_id) setHasCustomer(true);
        if (d.dva_account_number) {
          setDva({ bank_name: d.dva_bank_name, account_number: d.dva_account_number, account_name: d.dva_account_name });
          setBalance(d.balance ?? 0);
          setState("done");
        } else {
          setState("idle");
        }
      })
      .catch(() => setState("idle"));
  }, [labId]);
  const [crediting, setCrediting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  async function regenerate() {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/admin/wallet/regenerate/${labId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: regenPhone.trim() || undefined }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error ?? "Regeneration failed"); return; }
      setDva({ bank_name: d.dva_bank_name, account_number: d.dva_account_number, account_name: d.dva_account_name });
      setBalance(d.balance ?? balance);
      setHasCustomer(true);
      setState("done");
      setShowDetails(true);
      toast.success("DVA regenerated successfully");
    } catch { toast.error("Network error"); }
    finally { setRegenerating(false); }
  }

  async function provision() {
    if (!phone.trim()) return;
    setState("loading");
    try {
      const res = await fetch(`/api/admin/wallet/provision/${labId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error ?? "Provisioning failed"); setState("form"); return; }
      setDva({ bank_name: d.dva_bank_name, account_number: d.dva_account_number, account_name: d.dva_account_name });
      setBalance(d.balance ?? 0);
      setState("done");
      if (d.already_provisioned) toast.success("DVA already provisioned — details loaded");
      else toast.success("Virtual account created!");
    } catch { toast.error("Network error"); setState("form"); }
  }

  async function manualCredit() {
    if (!creditRef.trim()) return;
    setCrediting(true);
    try {
      const res = await fetch("/api/admin/wallet/credit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: creditRef.trim() }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error ?? "Credit failed"); return; }
      toast.success(`₦${Number(d.amount).toLocaleString()} credited to wallet`);
      setBalance((prev) => (prev ?? 0) + Number(d.amount));
      setCreditRef("");
      setState("done");
    } catch { toast.error("Network error"); }
    finally { setCrediting(false); }
  }

  function copyAcc() {
    if (!dva?.account_number) return;
    navigator.clipboard.writeText(dva.account_number).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  if (state === "done" && dva) {
    return (
      <div className="col-span-2 space-y-1.5">
        <button
          onClick={() => setShowDetails((s) => !s)}
          className="w-full flex items-center justify-between gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs transition-colors"
        >
          <span className="flex items-center gap-1"><Wallet className="w-3 h-3" /> DVA</span>
          <span className="font-mono font-semibold">{balance != null ? `₦${balance.toLocaleString()}` : ""} {showDetails ? "▲" : "▼"}</span>
        </button>
        {showDetails && (
          <div className="p-3 bg-white/5 border border-white/10 rounded-xl space-y-2">
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{dva.bank_name}</p>
              <div className="flex items-center gap-2">
                <p className="font-mono text-sm text-white font-bold tracking-widest">{dva.account_number}</p>
                <button onClick={copyAcc} className="p-1 rounded text-slate-400 hover:text-white transition">
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">{dva.account_name}</p>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => setState("credit-form")}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 text-[11px] transition-colors"
              >
                + Manual credit
              </button>
              <button
                onClick={() => { setRegenPhone(""); setState("regen-form"); }}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 text-[11px] transition-colors"
                title="Regenerate the dedicated virtual account"
              >
                <RefreshCw className="w-2.5 h-2.5" /> Regen DVA
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (state === "regen-form") {
    return (
      <div className="col-span-2 space-y-1.5">
        <p className="text-[10px] text-orange-400 font-semibold">Regenerate DVA</p>
        {!hasCustomer && (
          <p className="text-[10px] text-slate-400">No Paystack customer yet — phone required:</p>
        )}
        {hasCustomer && (
          <p className="text-[10px] text-slate-400">Customer exists. Phone optional (updates profile):</p>
        )}
        <div className="flex gap-1.5 items-center">
          <input
            type="tel"
            value={regenPhone}
            onChange={(e) => setRegenPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (hasCustomer || regenPhone.trim()) && regenerate()}
            placeholder={hasCustomer ? "08012345678 (optional)" : "08012345678 *required"}
            autoFocus
            className="flex-1 px-2.5 py-1.5 rounded-lg bg-white/8 border border-white/15 text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-400 font-mono"
          />
          <button
            onClick={regenerate}
            disabled={(!hasCustomer && !regenPhone.trim()) || regenerating}
            className="px-2.5 py-1.5 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 text-xs transition-colors disabled:opacity-40 shrink-0"
          >
            {regenerating ? <RefreshCw className="w-3 h-3 animate-spin" /> : "Regen"}
          </button>
          <button onClick={() => setState(dva ? "done" : "idle")} className="p-1.5 rounded-lg text-slate-500 hover:text-white transition-colors">
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  }

  if (state === "credit-form") {
    return (
      <div className="col-span-2 space-y-1.5">
        <p className="text-[10px] text-slate-400">Paste Paystack reference to verify & credit:</p>
        <div className="flex gap-1.5 items-center">
          <input
            type="text"
            value={creditRef}
            onChange={(e) => setCreditRef(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && manualCredit()}
            placeholder="e.g. T123456789"
            autoFocus
            className="flex-1 px-2.5 py-1.5 rounded-lg bg-white/8 border border-white/15 text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-400 font-mono"
          />
          <button onClick={manualCredit} disabled={!creditRef.trim() || crediting}
            className="px-2.5 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-xs transition-colors disabled:opacity-40 shrink-0">
            {crediting ? <RefreshCw className="w-3 h-3 animate-spin" /> : "Credit"}
          </button>
          <button onClick={() => setState("done")} className="p-1.5 rounded-lg text-slate-500 hover:text-white transition-colors">
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  }

  if (state === "form") {
    return (
      <div className="col-span-2 mt-1 flex gap-2 items-center">
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && provision()}
          placeholder="08012345678"
          autoFocus
          className="flex-1 px-3 py-1.5 rounded-lg bg-white/8 border border-white/15 text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-400 font-mono"
        />
        <button onClick={provision} disabled={!phone.trim()}
          className="px-3 py-1.5 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 text-xs transition-colors disabled:opacity-40 shrink-0">
          Create
        </button>
        <button onClick={() => setState("idle")} className="p-1.5 rounded-lg text-slate-500 hover:text-white transition-colors">
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  // "loading" = initial fetch to check existing wallet; "idle" = no wallet yet
  if (state === "loading") {
    return <div className="h-7 w-20 rounded-lg bg-white/5 animate-pulse" />;
  }

  return (
    <button
      onClick={() => setState("form")}
      className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 hover:text-violet-300 text-xs transition-colors"
    >
      <Wallet className="w-3 h-3" /> Wallet DVA
    </button>
  );
}

// =============================================================================
// Admin Agreements Tab
// =============================================================================

function AdminAgreementsTab({
  agreements,
  loading,
  onLoad,
}: {
  agreements: { id: string; version: string; signed_at: string; signer_name: string; signer_email: string; signer_title: string | null; pdf_hash: string; lab: { id: string; name: string; email: string } }[];
  loading: boolean;
  onLoad: () => void;
}) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [showSlaModal, setShowSlaModal] = useState(false);

  // ── Global template editor state ──
  const [template, setTemplate] = useState<string>("");
  const [templateLoading, setTemplateLoading] = useState(true);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateDirty, setTemplateDirty] = useState(false);
  const [templateSavedAt, setTemplateSavedAt] = useState<Date | null>(null);
  const [templateError, setTemplateError] = useState("");
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);

  useEffect(() => {
    fetch("/api/admin/agreement-template")
      .then((r) => r.json())
      .then((d) => { if (d.template) setTemplate(d.template); })
      .catch(() => {})
      .finally(() => setTemplateLoading(false));
  }, []);

  async function saveTemplate() {
    setTemplateSaving(true);
    setTemplateError("");
    try {
      const r = await fetch("/api/admin/agreement-template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error ?? "Save failed");
      setTemplateDirty(false);
      setTemplateSavedAt(new Date());
    } catch (e: unknown) {
      setTemplateError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setTemplateSaving(false);
    }
  }

  useEffect(() => { onLoad(); }, []);

  async function handleDownload(id: string, labName: string) {
    setDownloading(id);
    try {
      const r = await fetch(`/api/admin/agreements/${id}/pdf`);
      const d = await r.json();
      if (!d.url) throw new Error("No URL");
      window.open(d.url, "_blank");
    } catch {
      toast.error("Could not download PDF");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="space-y-8">

      {/* ── Global Agreement Template ── */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowTemplateEditor((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center">
              <FileText className="w-4 h-4 text-violet-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-white">Global Agreement Template</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {templateSavedAt
                  ? `Last saved ${templateSavedAt.toLocaleTimeString()}`
                  : "Default template — edit to customise for all future invites"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {templateDirty && (
              <span className="text-xs text-amber-400 font-medium">Unsaved changes</span>
            )}
            <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${showTemplateEditor ? "rotate-180" : ""}`} />
          </div>
        </button>

        {showTemplateEditor && (
          <div className="border-t border-white/8 px-5 py-4 space-y-3">
            <p className="text-xs text-slate-400">
              This template pre-fills the agreement editor when you send an invite to any lab.
              Use <code className="bg-white/10 px-1 rounded text-violet-300">[LAB NAME]</code> as
              a placeholder — it will be replaced with the actual lab name when you open the send modal.
            </p>
            {templateLoading ? (
              <div className="h-48 bg-white/5 rounded-xl animate-pulse" />
            ) : (
              <AgreementTextEditor
                value={template}
                onChange={(v) => { setTemplate(v); setTemplateDirty(true); setTemplateSavedAt(null); }}
              />
            )}
            {templateError && <p className="text-xs text-red-400">{templateError}</p>}
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  fetch("/api/admin/agreement-template").then((r) => r.json()).then((d) => {
                    if (d.template) { setTemplate(d.template); setTemplateDirty(false); }
                  }).catch(() => {});
                }}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                Discard changes
              </button>
              <button
                onClick={saveTemplate}
                disabled={templateSaving || !templateDirty}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-xs font-medium transition-colors"
              >
                {templateSaving ? (
                  <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving…</>
                ) : (
                  "Save Template"
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Lab SLA Document ── */}
      <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
            <FileText className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">Laboratory Service Level Agreement</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Fill in lab &amp; signatory details, then print or save as PDF
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowSlaModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
        >
          <FileText className="w-3.5 h-3.5" />
          Edit &amp; Print
        </button>
      </div>
      {showSlaModal && <LabSlaModal onClose={() => setShowSlaModal(false)} />}

      {/* ── Signed Agreements ── */}
      <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-white">Signed Agreements</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Digital partnership agreements signed by lab owners
          </p>
        </div>
        <button
          onClick={() => {
            fetch("/api/admin/agreements").then((r) => r.json()).then((d) => {
              if (d.success) {
                const el = document.createElement("a");
                const rows = [
                  ["Reference", "Lab", "Signer", "Title", "Email", "Signed At", "Version"],
                  ...d.agreements.map((a: { id: string; lab: { name: string }; signer_name: string; signer_title: string | null; signer_email: string; signed_at: string; version: string }) => [
                    a.id.slice(0, 8).toUpperCase(), a.lab.name, a.signer_name,
                    a.signer_title ?? "", a.signer_email,
                    new Date(a.signed_at).toLocaleString(), a.version,
                  ]),
                ];
                const csv = rows.map((r) => r.map((c: string) => `"${c}"`).join(",")).join("\n");
                el.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
                el.download = "poveon-agreements.csv";
                el.click();
              }
            }).catch(() => {});
          }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/8 hover:bg-white/12 text-slate-300 text-xs font-medium transition-colors"
        >
          <ArrowDownToLine className="w-3.5 h-3.5" /> Export CSV
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-white/5 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : agreements.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
          <FileText className="w-9 h-9 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-400">No signed agreements yet</p>
          <p className="text-xs text-slate-600 mt-1">
            Send agreement invites to labs from the Labs tab
          </p>
        </div>
      ) : (
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Laboratory</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Signed By</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Version</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {agreements.map((a) => (
                <tr key={a.id} className="hover:bg-white/3 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-white text-sm">{a.lab.name}</p>
                    <p className="text-xs text-slate-500">{a.lab.email}</p>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <p className="text-slate-200 text-sm">{a.signer_name}</p>
                    {a.signer_title && <p className="text-xs text-slate-500">{a.signer_title}</p>}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <p className="text-slate-300 text-sm">{new Date(a.signed_at).toLocaleDateString()}</p>
                    <p className="text-xs text-slate-500">{new Date(a.signed_at).toLocaleTimeString()}</p>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-medium border border-emerald-500/20">
                      {a.version}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDownload(a.id, a.lab.name)}
                      disabled={downloading === a.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/15 text-slate-300 text-xs font-medium transition-colors ml-auto"
                    >
                      {downloading === a.id
                        ? <><RefreshCw className="w-3 h-3 animate-spin" /> Loading…</>
                        : <><ArrowDownToLine className="w-3 h-3" /> PDF</>}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </div>
  );
}

// ── Agreement Text Editor (rich-ish textarea with formatting toolbar) ─────────

function AgreementTextEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function applyFormat(type: "bold" | "heading" | "subheading" | "divider") {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);

    let replacement = "";
    let cursorOffset = 0;

    if (type === "bold") {
      replacement = `**${selected || "bold text"}**`;
      cursorOffset = selected ? replacement.length : 2;
    } else if (type === "heading") {
      // Prefix current line
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const lineEnd = value.indexOf("\n", start);
      const line = value.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
      const cleaned = line.replace(/^#{1,3}\s*/, "");
      const newLine = `## ${cleaned}`;
      const before = value.slice(0, lineStart);
      const after = lineEnd === -1 ? "" : value.slice(lineEnd);
      onChange(before + newLine + after);
      setTimeout(() => { el.selectionStart = el.selectionEnd = lineStart + newLine.length; el.focus(); }, 0);
      return;
    } else if (type === "subheading") {
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const lineEnd = value.indexOf("\n", start);
      const line = value.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
      const cleaned = line.replace(/^#{1,3}\s*/, "");
      const newLine = `### ${cleaned}`;
      const before = value.slice(0, lineStart);
      const after = lineEnd === -1 ? "" : value.slice(lineEnd);
      onChange(before + newLine + after);
      setTimeout(() => { el.selectionStart = el.selectionEnd = lineStart + newLine.length; el.focus(); }, 0);
      return;
    } else if (type === "divider") {
      replacement = `\n\n---\n\n`;
      cursorOffset = replacement.length;
    }

    const newValue = value.slice(0, start) + replacement + value.slice(end);
    onChange(newValue);
    setTimeout(() => {
      el.selectionStart = el.selectionEnd = start + cursorOffset;
      el.focus();
    }, 0);
  }

  const toolbarBtns: { label: string; title: string; action: "bold" | "heading" | "subheading" | "divider" }[] = [
    { label: "B", title: "Bold (**text**)", action: "bold" },
    { label: "H2", title: "Section heading", action: "heading" },
    { label: "H3", title: "Sub-heading", action: "subheading" },
    { label: "—", title: "Horizontal divider (---)", action: "divider" },
  ];

  return (
    <div className="rounded-xl border border-white/8 overflow-hidden bg-slate-800">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-white/8 bg-slate-900/50">
        {toolbarBtns.map((btn) => (
          <button
            key={btn.action}
            type="button"
            title={btn.title}
            onClick={() => applyFormat(btn.action)}
            className={`px-2.5 py-1 rounded text-xs font-bold text-slate-400 hover:text-white hover:bg-white/10 transition-colors ${btn.label === "B" ? "italic" : ""}`}
          >
            {btn.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5 text-[10px] text-slate-600">
          <span className="px-1.5 py-0.5 rounded bg-white/5 font-mono">**bold**</span>
          <span className="px-1.5 py-0.5 rounded bg-white/5 font-mono">## heading</span>
          <span className="px-1.5 py-0.5 rounded bg-white/5 font-mono">### sub</span>
        </div>
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={28}
        className="w-full bg-transparent text-slate-300 text-xs leading-relaxed px-4 py-3 resize-y focus:outline-none font-mono"
      />
    </div>
  );
}

// ── Send Agreement Modal ──────────────────────────────────────────────────────

function SendAgreementModal({
  lab,
  onClose,
  onSent,
}: {
  lab: Lab;
  onClose: () => void;
  onSent: (labEmail: string) => void;
}) {
  const [content, setContent] = useState("");
  const [loadingTemplate, setLoadingTemplate] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // Fetch global template on mount, replace [LAB NAME] placeholder
  useEffect(() => {
    fetch("/api/admin/agreement-template")
      .then((r) => r.json())
      .then((d) => {
        if (d.template) {
          setContent(d.template.replaceAll("[LAB NAME]", lab.name));
        } else {
          setContent(serializeAgreementToText(lab.name));
        }
      })
      .catch(() => setContent(serializeAgreementToText(lab.name)))
      .finally(() => setLoadingTemplate(false));
  }, [lab.name]);

  async function handleSend() {
    setSending(true);
    setError("");
    try {
      const r = await fetch(`/api/admin/labs/${lab.id}/send-agreement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ custom_content: content }),
      });
      const d = await r.json();
      if (d.success) { onSent(lab.email); }
      else throw new Error(d.error ?? "Failed to send");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to send agreement invite");
    } finally {
      setSending(false);
    }
  }

  return (
    <AdminOverlay onClose={() => onClose()}>
      <div
        className="w-full max-w-2xl bg-slate-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/8 shrink-0">
          <div>
            <h2 className="font-semibold text-white text-sm">Send Agreement Invite</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {lab.name} · <span className="text-slate-500">{lab.email}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/8 text-slate-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Edit the agreement text below before sending. Changes apply to this invite only.
            </p>
            <button
              onClick={() => {
                fetch("/api/admin/agreement-template").then((r) => r.json()).then((d) => {
                  if (d.template) setContent(d.template.replaceAll("[LAB NAME]", lab.name));
                }).catch(() => setContent(serializeAgreementToText(lab.name)));
              }}
              className="text-xs text-slate-500 hover:text-slate-300 underline-offset-2 hover:underline transition-colors"
            >
              Reset to global template
            </button>
          </div>
          {loadingTemplate ? (
            <div className="h-96 bg-white/5 rounded-xl animate-pulse" />
          ) : (
            <AgreementTextEditor value={content} onChange={setContent} />
          )}
          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/8 shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-white/8 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !content.trim() || loadingTemplate}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {sending ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <FileText className="w-3.5 h-3.5" />
                Send to Lab
              </>
            )}
          </button>
        </div>
      </div>
    </AdminOverlay>
  );
}

// ── Lab SLA Editor / Print Modal ─────────────────────────────────────────────
function LabSlaModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<LabSlaData>(EMPTY_LAB_SLA);
  const [sigName, setSigName] = useState("");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const html = useMemo(() => renderLabSla(data), [data]);

  function update(patch: Partial<LabSlaData>) {
    setData((d) => ({ ...d, ...patch }));
  }

  function handleSignature(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Signature image must be under 2 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      update({ signatureDataUrl: reader.result as string });
      setSigName(file.name);
    };
    reader.readAsDataURL(file);
  }

  function handlePrint() {
    const win = iframeRef.current?.contentWindow;
    if (win) {
      win.focus();
      win.print();
    }
  }

  const inputCls =
    "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors";
  const labelCls = "block text-xs font-medium text-slate-400 mb-1";

  return (
    <AdminOverlay onClose={() => onClose()}>
      <div
        className="w-full max-w-5xl bg-slate-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/8 shrink-0">
          <div>
            <h2 className="font-semibold text-white text-sm">Laboratory Service Level Agreement</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Fill in the lab and Poveon details, then print or save as PDF
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/8 text-slate-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto grid md:grid-cols-2 gap-0">
          {/* Form */}
          <div className="px-6 py-5 space-y-4 border-r border-white/8">
            <div>
              <label className={labelCls}>Effective Date</label>
              <input
                type="date"
                value={data.effectiveDate}
                onChange={(e) => update({ effectiveDate: e.target.value })}
                className={inputCls}
              />
            </div>

            <div className="pt-2 border-t border-white/8">
              <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide mb-3">Laboratory</p>
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Lab Name</label>
                  <input
                    type="text"
                    value={data.labName}
                    onChange={(e) => update({ labName: e.target.value })}
                    placeholder="e.g. Bridgepoint Diagnostics"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>RC Number</label>
                  <input
                    type="text"
                    value={data.labRcNumber}
                    onChange={(e) => update({ labRcNumber: e.target.value })}
                    placeholder="e.g. RC1234567"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Address</label>
                  <input
                    type="text"
                    value={data.labAddress}
                    onChange={(e) => update({ labAddress: e.target.value })}
                    placeholder="Lab registered address"
                    className={inputCls}
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-white/8">
              <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide mb-3">Poveon Signatory</p>
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>CEO Name</label>
                  <input
                    type="text"
                    value={data.ceoName}
                    onChange={(e) => update({ ceoName: e.target.value })}
                    placeholder="Full name"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Title</label>
                  <input
                    type="text"
                    value={data.ceoTitle}
                    onChange={(e) => update({ ceoTitle: e.target.value })}
                    placeholder="e.g. Chief Executive Officer"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Signature Image</label>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/8 text-xs text-slate-300 cursor-pointer transition-colors">
                      <Upload className="w-3.5 h-3.5" />
                      {data.signatureDataUrl ? "Replace" : "Upload"}
                      <input type="file" accept="image/*" onChange={handleSignature} className="hidden" />
                    </label>
                    {data.signatureDataUrl && (
                      <>
                        <span className="text-xs text-slate-500 truncate max-w-[120px]">{sigName}</span>
                        <button
                          onClick={() => { update({ signatureDataUrl: null }); setSigName(""); }}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors"
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                  {data.signatureDataUrl && (
                    <img
                      src={data.signatureDataUrl}
                      alt="Signature preview"
                      className="mt-2 max-h-12 bg-white rounded p-1"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Live preview */}
          <div className="bg-slate-950/50 p-4">
            <p className="text-xs text-slate-500 mb-2">Live preview</p>
            <iframe
              ref={iframeRef}
              srcDoc={html}
              title="SLA preview"
              className="w-full h-[70vh] bg-white rounded-lg border border-white/10"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/8 shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-white/8 transition-colors">
            Close
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Print / Save as PDF
          </button>
        </div>
      </div>
    </AdminOverlay>
  );
}

// ── Transfer Email / Ownership Modal ─────────────────────────────────────────

function TransferEmailModal({
  lab,
  onClose,
  onSuccess,
}: {
  lab: Lab;
  onClose: () => void;
  onSuccess: (newEmail: string) => void;
}) {
  const [newEmail, setNewEmail] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!newEmail.trim()) { setError("Enter the new email address."); return; }
    if (newEmail.trim().toLowerCase() !== confirm.trim().toLowerCase()) {
      setError("The two email addresses do not match."); return;
    }
    setSaving(true);
    setError("");
    try {
      const r = await fetch(`/api/admin/labs/${lab.id}/transfer-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_email: newEmail.trim() }),
      });
      const d = await r.json();
      if (d.success) { onSuccess(d.new_email); }
      else throw new Error(d.error ?? "Failed");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update email");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminOverlay onClose={() => onClose()}>
      <div
        className="w-full max-w-md bg-slate-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/8">
          <div>
            <h2 className="font-semibold text-white text-sm">Transfer Ownership</h2>
            <p className="text-xs text-slate-400 mt-0.5">{lab.name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/8 text-slate-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300 leading-relaxed">
              This changes both the lab contact email and the login credentials for the owner account.
              The current owner will immediately lose access. Confirm the new address is correct before saving.
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-500 mb-3">
              Current email: <span className="text-slate-300 font-medium">{lab.email}</span>
            </p>

            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
              New email address
            </label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => { setNewEmail(e.target.value); setError(""); }}
              placeholder="new@labdomain.com"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-white/8 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 placeholder:text-slate-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
              Confirm new email
            </label>
            <input
              type="email"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setError(""); }}
              placeholder="Retype to confirm"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-white/8 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 placeholder:text-slate-600"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 pb-5">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-white/8 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !newEmail.trim() || !confirm.trim()}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-sm font-medium transition-colors"
          >
            {saving
              ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving…</>
              : "Transfer Ownership"
            }
          </button>
        </div>
      </div>
    </AdminOverlay>
  );
}

// ── Admin Lab Catalog Modal ───────────────────────────────────────────────────

type CatalogTest = {
  id: string;
  raw_name: string;
  category_label: string | null;
  lab_price: number;
  commission_pct: number | null;
  poveon_fee: number | null;
  is_active: boolean;
  synonyms: string[];
};

function AdminLabCatalogModal({ lab, onClose }: { lab: Lab; onClose: () => void }) {
  const [tests, setTests] = useState<CatalogTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [addingRow, setAddingRow] = useState(false);
  const [bulkComm, setBulkComm] = useState("");
  const [showBulkComm, setShowBulkComm] = useState(false);
  const [bulkSyns, setBulkSyns] = useState("");
  const [showBulkSyns, setShowBulkSyns] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVals, setEditVals] = useState<{ raw_name: string; lab_price: string; commission_pct: string; category_label: string; synonyms: string }>({ raw_name: "", lab_price: "", commission_pct: "", category_label: "", synonyms: "" });
  const [newRow, setNewRow] = useState({ raw_name: "", lab_price: "", commission_pct: "", category_label: "", synonyms: "" });
  const [generationProgress, setGenerationProgress] = useState<{ jobId: string; percent: number; completed: number; total: number; status?: string } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ operationId: string; percent: number; completed: number; total: number } | null>(null);
  const [isModalMinimized, setIsModalMinimized] = useState(false);
  const [kbMappings, setKbMappings] = useState<Record<string, { canonical: string; synonyms: string[]; variants: string[] }>>({});
  const [mappingLabTestId, setMappingLabTestId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Fetch KB mappings for this lab
  const loadMappings = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/test-kb-manage/lab-mappings/${lab.id}`);
      const data = await res.json();
      if (data.success) {
        const mappingMap: typeof kbMappings = {};
        for (const test of data.tests) {
          if (test.isMapped) {
            mappingMap[test.labTestId] = {
              canonical: test.canonical,
              synonyms: test.synonyms,
              variants: test.variants,
            };
          }
        }
        setKbMappings(mappingMap);
      }
    } catch (e) {
      console.error("[lab-mappings] load error:", e);
    }
  }, [lab.id]);

  // Extract unique categories from tests
  const categories = useMemo(() => {
    const cats = new Set(tests.map(t => t.category_label).filter(Boolean) as string[]);
    return Array.from(cats).sort();
  }, [tests]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/labs/${lab.id}/catalog`);
      const d = await res.json();
      if (d.success) setTests(d.tests ?? []);
    } catch { toast.error("Failed to load catalog"); }
    finally { setLoading(false); }
  }, [lab.id]);

  useEffect(() => { load(); loadMappings(); }, [load, loadMappings]);

  const visible = useMemo(() => {
    let result = tests;
    const q = search.toLowerCase();

    // Filter by search
    if (q) {
      result = result.filter((t) =>
        t.raw_name.toLowerCase().includes(q) ||
        (t.category_label ?? "").toLowerCase().includes(q)
      );
    }

    // Filter by category
    if (selectedCategory) {
      result = result.filter((t) => t.category_label === selectedCategory);
    }

    return result;
  }, [tests, search, selectedCategory]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === visible.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visible.map((t) => t.id)));
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/admin/labs/${lab.id}/catalog/upload`, { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error ?? "Upload failed"); setUploading(false); return; }

      // Background upload with progress tracking
      if (d.operationId) {
        setUploadProgress({ operationId: d.operationId, percent: 0, completed: 0, total: d.totalRows });

        const pollProgress = async () => {
          try {
            const progressRes = await fetch(
              `/api/admin/labs/${lab.id}/catalog/progress?operation=upload-${d.operationId}`
            );
            if (!progressRes.ok) {
              // Upload completed
              toast.success(`Uploaded ${d.totalRows} tests`);
              setUploadProgress(null);
              setUploading(false);
              await load();
              return;
            }
            const progress = await progressRes.json();
            setUploadProgress({
              operationId: d.operationId,
              percent: progress.percent,
              completed: progress.completed,
              total: progress.total,
            });

            if (!progress.isComplete) {
              setTimeout(pollProgress, 1000); // Poll every 1 second
            } else {
              setTimeout(() => {
                toast.success(`Uploaded ${d.totalRows} tests`);
                setUploadProgress(null);
                setUploading(false);
                load();
              }, 500);
            }
          } catch {
            setUploadProgress(null);
            setUploading(false);
          }
        };

        pollProgress();
      }
    } catch { toast.error("Network error"); setUploading(false); }
  }

  async function handleAddRow() {
    if (!newRow.raw_name.trim() || !newRow.lab_price.trim()) return;
    try {
      const syns = newRow.synonyms.trim().split(/[,\n]+/).map(s => s.trim()).filter(s => s.length > 0);
      const res = await fetch(`/api/admin/labs/${lab.id}/catalog`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raw_name: newRow.raw_name.trim(),
          lab_price: parseFloat(newRow.lab_price),
          commission_pct: newRow.commission_pct ? parseFloat(newRow.commission_pct) : undefined,
          category_label: newRow.category_label.trim() || undefined,
          synonyms: syns.length > 0 ? syns : undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error ?? "Failed"); return; }
      toast.success("Test added");
      setNewRow({ raw_name: "", lab_price: "", commission_pct: "", category_label: "", synonyms: "" });
      setAddingRow(false);
      await load();
    } catch { toast.error("Network error"); }
  }

  async function handleSaveEdit(id: string) {
    try {
      const syns = editVals.synonyms.trim().split(/[,\n]+/).map(s => s.trim()).filter(s => s.length > 0);
      const res = await fetch(`/api/admin/labs/${lab.id}/catalog/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raw_name: editVals.raw_name.trim() || undefined,
          lab_price: editVals.lab_price ? parseFloat(editVals.lab_price) : undefined,
          commission_pct: editVals.commission_pct ? parseFloat(editVals.commission_pct) : undefined,
          category_label: editVals.category_label.trim() || null,
          synonyms: syns.length > 0 ? syns : undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error ?? "Failed"); return; }
      setEditingId(null);
      setTests((prev) => prev.map((t) => t.id === id ? { ...d.test } : t));
    } catch { toast.error("Network error"); }
  }

  async function handleToggleActive(t: CatalogTest) {
    try {
      const res = await fetch(`/api/admin/labs/${lab.id}/catalog/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !t.is_active }),
      });
      const d = await res.json();
      if (d.success) setTests((prev) => prev.map((x) => x.id === t.id ? { ...x, is_active: !t.is_active } : x));
    } catch { toast.error("Network error"); }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/admin/labs/${lab.id}/catalog/${id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Delete failed"); return; }
      setTests((prev) => prev.filter((t) => t.id !== id));
      setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
      toast.success("Test removed");
    } catch { toast.error("Network error"); }
  }

  async function handleBulkDelete() {
    if (!selected.size) return;
    const ids = Array.from(selected);
    try {
      const res = await fetch(`/api/admin/labs/${lab.id}/catalog/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", ids }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error ?? "Failed"); return; }
      toast.success(`Deleted ${d.deleted} tests`);
      setTests((prev) => prev.filter((t) => !ids.includes(t.id)));
      setSelected(new Set());
    } catch { toast.error("Network error"); }
  }

  async function handleBulkCommission() {
    const pct = parseFloat(bulkComm);
    if (isNaN(pct) || pct < 0 || pct > 100) { toast.error("Enter a valid commission %"); return; }
    const ids = Array.from(selected);
    try {
      const res = await fetch(`/api/admin/labs/${lab.id}/catalog/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_commission", ids, commission_pct: pct }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error ?? "Failed"); return; }
      toast.success(`Updated ${d.updated} tests`);
      setBulkComm(""); setShowBulkComm(false);
      await load();
    } catch { toast.error("Network error"); }
  }

  async function handleBulkSynonyms() {
    const syns = bulkSyns.trim().split(/[,\n]+/).map(s => s.trim()).filter(s => s.length > 0);
    if (syns.length === 0) { toast.error("Enter at least one synonym"); return; }
    const ids = Array.from(selected);
    try {
      const res = await fetch(`/api/admin/labs/${lab.id}/catalog/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_synonyms", ids, synonyms: syns }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error ?? "Failed"); return; }
      toast.success(`Updated ${d.updated} tests with manual synonyms`);
      setBulkSyns(""); setShowBulkSyns(false);
      await load();
    } catch { toast.error("Network error"); }
  }

  async function handleGenerateSynonyms() {
    const ids = Array.from(selected);
    if (ids.length === 0) { toast.error("Select tests first"); return; }
    try {
      const res = await fetch(`/api/admin/labs/${lab.id}/catalog/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_synonyms", ids }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error ?? "Failed"); return; }

      // Start polling progress using jobId
      if (d.jobId) {
        setGenerationProgress({ jobId: d.jobId, percent: 0, completed: 0, total: ids.length, status: "processing" });
        toast.success("Synonym generation started. Processing in background...");

        const pollProgress = async () => {
          try {
            const progressRes = await fetch(
              `/api/admin/labs/${lab.id}/catalog/synonym-progress?jobId=${d.jobId}`
            );
            if (!progressRes.ok) {
              // Job not found
              setGenerationProgress(null);
              return;
            }
            const progress = await progressRes.json();
            if (!progress.success) {
              setGenerationProgress(null);
              return;
            }

            setGenerationProgress({
              jobId: d.jobId,
              percent: progress.percent,
              completed: progress.completed,
              total: progress.total,
              status: progress.status,
            });

            if (progress.isComplete) {
              setTimeout(() => {
                const message = progress.status === "completed"
                  ? `Generated AI synonyms for ${progress.completed} tests (${progress.failed} failed)`
                  : `Synonym generation failed: ${progress.errorMessage || "Unknown error"}`;
                toast.success(message);
                setGenerationProgress(null);
                setSelected(new Set());
                load();
              }, 500);
            } else {
              // Continue polling every 3 seconds
              setTimeout(pollProgress, 3000);
            }
          } catch (err) {
            console.error("[handleGenerateSynonyms] polling error:", err);
            // Continue polling even on error
            setTimeout(pollProgress, 5000);
          }
        };

        pollProgress();
      }
    } catch { toast.error("Network error"); }
  }

  // Determine if there's an operation in progress
  const operationInProgress = uploadProgress || generationProgress;
  const progressPercent = uploadProgress?.percent ?? generationProgress?.percent ?? 0;
  const operationType = uploadProgress ? "upload" : generationProgress ? "generation" : null;

  if (isModalMinimized) {
    // Minimized floating tab in bottom-right corner
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={() => setIsModalMinimized(false)}
          className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-teal-600 to-teal-700 text-white shadow-lg hover:shadow-xl transition-shadow border border-teal-500/50 relative group min-w-fit"
          title="Click to expand catalog modal"
        >
          <div className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 flex-shrink-0" />
            <div className="flex flex-col text-left">
              <p className="text-sm font-semibold leading-tight">{lab.name}</p>
              <p className="text-xs text-teal-100">{tests.length} tests</p>
            </div>
          </div>

          {/* Progress Indicator */}
          {operationInProgress && (
            <div className="flex items-center gap-2 pl-3 border-l border-teal-500/50">
              <div className="flex flex-col text-right">
                <p className="text-xs font-semibold">{progressPercent}%</p>
                <p className="text-[10px] text-teal-100 capitalize">{operationType}</p>
              </div>
              <div className="relative w-6 h-6">
                <svg className="w-6 h-6 transform -rotate-90" style={{ filter: "drop-shadow(0 0 1px rgba(0,0,0,0.3))" }}>
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    fill="none"
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth="1.5"
                  />
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    fill="none"
                    stroke="rgb(255,255,255)"
                    strokeWidth="1.5"
                    strokeDasharray={`${(10 * 2 * Math.PI * progressPercent) / 100} ${10 * 2 * Math.PI}`}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dasharray 0.3s ease" }}
                  />
                </svg>
              </div>
            </div>
          )}
        </button>
      </div>
    );
  }

  return (
    <AdminOverlay onClose={() => onClose()} align="center">
      <div
        className="bg-slate-900 border border-white/10 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col transition-all duration-300 w-full h-full max-h-screen"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/8 shrink-0">
          <div>
            <h2 className="font-semibold text-white text-sm flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-teal-400" />
              Test Catalog — {lab.name}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{tests.length} test{tests.length !== 1 ? "s" : ""} · {tests.filter((t) => t.is_active).length} active</p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`/api/admin/labs/${lab.id}/catalog/export`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white hover:bg-white/8 transition-colors"
              title="Export as CSV"
            >
              <ArrowDownToLine className="w-3.5 h-3.5" />Export CSV
            </a>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) { handleUpload(f); e.target.value = ""; } }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 text-xs font-medium transition-colors disabled:opacity-50"
            >
              {uploading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {uploading ? "Importing…" : "Upload CSV / Excel"}
            </button>
            <button
              onClick={() => setIsModalMinimized(!isModalMinimized)}
              className="p-2 rounded-lg hover:bg-white/8 text-slate-400 hover:text-white transition-colors"
              title={isModalMinimized ? "Expand" : "Minimize"}
            >
              {isModalMinimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/8 text-slate-400 hover:text-white transition-colors" title="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Toolbar - Hidden when minimized */}
        {!isModalMinimized && <div className="flex items-center gap-2 px-6 py-3 border-b border-white/5 shrink-0 flex-wrap">
          <div className="relative flex-1 min-w-40">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tests…"
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-white/5 border border-white/8 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
            />
          </div>

          {/* Category Filter */}
          {categories.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/8 text-white text-xs hover:bg-white/8 transition-colors"
              >
                <Filter className="w-3.5 h-3.5" />
                {selectedCategory ? `Category: ${selectedCategory}` : "All Categories"}
                <ChevronDown className="w-3 h-3" />
              </button>
              {categoryDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setCategoryDropdownOpen(false)}
                  />
                  <div className="absolute top-full left-0 mt-1 w-48 bg-slate-800 border border-white/10 rounded-xl shadow-lg z-50 max-h-64 overflow-y-auto">
                    <button
                      onClick={() => {
                        setSelectedCategory(null);
                        setCategoryDropdownOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-xs transition-colors ${
                        selectedCategory === null ? "bg-teal-600/30 text-teal-300" : "text-slate-300 hover:bg-white/5"
                      }`}
                    >
                      All Categories
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => {
                          setSelectedCategory(cat);
                          setCategoryDropdownOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-xs transition-colors ${
                          selectedCategory === cat ? "bg-teal-600/30 text-teal-300" : "text-slate-300 hover:bg-white/5"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <button
            onClick={() => { setAddingRow((v) => !v); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 text-xs font-medium transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />Add test
          </button>
          {selected.size > 0 && (
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <span className="text-xs text-slate-400">{selected.size} selected</span>
              <button
                onClick={() => setShowBulkComm((v) => !v)}
                className="px-2.5 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 text-xs transition-colors"
              >Commission</button>
              <button
                onClick={handleGenerateSynonyms}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs transition-colors flex items-center gap-1"
              ><Sparkles className="w-3 h-3" />Generate AI</button>
              <button
                onClick={() => setShowBulkSyns((v) => !v)}
                className="px-2.5 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 text-xs transition-colors"
              >Manual Synonyms</button>
              <button
                onClick={handleBulkDelete}
                className="px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs transition-colors"
              >Delete</button>
            </div>
          )}
        </div>}

        {/* Bulk commission bar - Hidden when minimized */}
        {!isModalMinimized && (
        <>
        {/* Bulk commission bar */}
        {showBulkComm && selected.size > 0 && (
          <div className="flex items-center gap-2 px-6 py-2 bg-sky-500/5 border-b border-white/5 shrink-0">
            <span className="text-xs text-sky-300">Set commission % for {selected.size} selected:</span>
            <input
              type="number"
              value={bulkComm}
              onChange={(e) => setBulkComm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleBulkCommission()}
              placeholder="e.g. 15"
              className="w-24 px-2.5 py-1 rounded-lg bg-white/8 border border-white/15 text-white text-xs focus:outline-none focus:ring-1 focus:ring-sky-400 font-mono"
            />
            <button onClick={handleBulkCommission} className="px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-xs transition-colors">Apply</button>
            <button onClick={() => setShowBulkComm(false)} className="text-slate-500 hover:text-white text-xs transition-colors">Cancel</button>
          </div>
        )}

        {/* Bulk synonyms bar */}
        {showBulkSyns && selected.size > 0 && (
          <div className="flex items-center gap-2 px-6 py-2 bg-purple-500/5 border-b border-white/5 shrink-0">
            <span className="text-xs text-purple-300">Add AI synonyms for {selected.size} selected (comma or newline separated):</span>
            <textarea
              value={bulkSyns}
              onChange={(e) => setBulkSyns(e.target.value)}
              placeholder="e.g. FBC, CBC, Full Blood Count"
              className="flex-1 px-2.5 py-1 rounded-lg bg-white/8 border border-white/15 text-white text-xs focus:outline-none focus:ring-1 focus:ring-purple-400 font-mono"
              style={{ minHeight: "2rem", maxHeight: "5rem", resize: "none" }}
            />
            <button onClick={handleBulkSynonyms} className="px-2.5 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 text-xs transition-colors whitespace-nowrap">Apply</button>
            <button onClick={() => setShowBulkSyns(false)} className="text-slate-500 hover:text-white text-xs transition-colors">Cancel</button>
          </div>
        )}

        {/* Upload progress bar */}
        {uploadProgress && (
          <div className="px-6 py-3 bg-sky-500/5 border-b border-white/5 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-sky-300">
                Uploading tests: {uploadProgress.completed} of {uploadProgress.total}
              </span>
              <span className="text-xs text-sky-400 font-mono">{uploadProgress.percent}%</span>
            </div>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-sky-500 transition-all duration-300"
                style={{ width: `${uploadProgress.percent}%` }}
              />
            </div>
          </div>
        )}

        {/* Generation progress bar */}
        {generationProgress && (
          <div className="px-6 py-3 bg-emerald-500/5 border-b border-white/5 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-emerald-300">
                Generating AI synonyms: {generationProgress.completed} of {generationProgress.total}
              </span>
              <span className="text-xs text-emerald-400 font-mono">{generationProgress.percent}%</span>
            </div>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${generationProgress.percent}%` }}
              />
            </div>
          </div>
        )}

        {/* Table - Hidden when minimized */}
        {!isModalMinimized && <div className="flex-1 overflow-y-auto overflow-x-auto">
          <table className="w-full text-xs min-w-max sm:min-w-full">
            <thead className="sticky top-0 bg-slate-900/95 backdrop-blur-sm border-b border-white/8 z-10">
              <tr>
                <th className="w-8 px-3 py-3">
                  <input type="checkbox" checked={visible.length > 0 && selected.size === visible.length} onChange={toggleAll}
                    className="rounded border-white/20 bg-white/5 text-teal-500 cursor-pointer" />
                </th>
                <th className="px-3 py-3 text-left text-slate-400 font-semibold uppercase tracking-wider">Test Name</th>
                <th className="px-3 py-3 text-left text-slate-400 font-semibold uppercase tracking-wider">KB Mapping</th>
                <th className="px-3 py-3 text-left text-slate-400 font-semibold uppercase tracking-wider">Category</th>
                <th className="px-3 py-3 text-left text-slate-400 font-semibold uppercase tracking-wider">Synonyms</th>
                <th className="px-3 py-3 text-right text-slate-400 font-semibold uppercase tracking-wider">Price (₦)</th>
                <th className="px-3 py-3 text-right text-slate-400 font-semibold uppercase tracking-wider">Comm%</th>
                <th className="px-3 py-3 text-right text-slate-400 font-semibold uppercase tracking-wider">Fee (₦)</th>
                <th className="px-3 py-3 text-center text-slate-400 font-semibold uppercase tracking-wider">Active</th>
                <th className="px-3 py-3 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {/* Add row */}
              {addingRow && (
                <tr className="bg-teal-500/5">
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2">
                    <input autoFocus value={newRow.raw_name} onChange={(e) => setNewRow((p) => ({ ...p, raw_name: e.target.value }))}
                      placeholder="Test name *" className="w-full bg-white/8 border border-teal-500/40 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:ring-1 focus:ring-teal-400" />
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-slate-500 text-xs">—</span>
                  </td>
                  <td className="px-3 py-2">
                    <input value={newRow.category_label} onChange={(e) => setNewRow((p) => ({ ...p, category_label: e.target.value }))}
                      placeholder="Category" className="w-full bg-white/8 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none" />
                  </td>
                  <td className="px-3 py-2">
                    <textarea value={newRow.synonyms} onChange={(e) => setNewRow((p) => ({ ...p, synonyms: e.target.value }))}
                      placeholder="Separated by comma or newline" className="w-full bg-white/8 border border-white/10 rounded-lg px-2.5 py-1 text-white text-xs focus:outline-none" style={{ minHeight: "2rem", maxHeight: "4rem", resize: "none" }} />
                  </td>
                  <td className="px-3 py-2">
                    <input value={newRow.lab_price} onChange={(e) => setNewRow((p) => ({ ...p, lab_price: e.target.value }))} type="number"
                      placeholder="Price *" className="w-full bg-white/8 border border-teal-500/40 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none text-right font-mono" />
                  </td>
                  <td className="px-3 py-2">
                    <input value={newRow.commission_pct} onChange={(e) => setNewRow((p) => ({ ...p, commission_pct: e.target.value }))} type="number"
                      placeholder="%" className="w-full bg-white/8 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none text-right font-mono" />
                  </td>
                  <td className="px-3 py-2 text-slate-500 text-right text-xs">auto</td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button onClick={handleAddRow} disabled={!newRow.raw_name.trim() || !newRow.lab_price.trim()}
                        className="p-1 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 disabled:opacity-40 transition-colors"><Check className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setAddingRow(false)} className="p-1 rounded-lg text-slate-500 hover:text-white transition-colors"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              )}

              {loading ? (
                <tr><td colSpan={8} className="text-center py-16 text-slate-500"><RefreshCw className="w-5 h-5 animate-spin inline" /></td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-16 text-slate-500">
                  {search ? "No tests match your search." : "No tests yet. Upload a CSV/Excel or add manually."}
                </td></tr>
              ) : visible.map((t) => {
                const isEditing = editingId === t.id;
                return (
                  <tr key={t.id} className={`hover:bg-white/3 transition-colors ${selected.has(t.id) ? "bg-teal-500/5" : ""}`}>
                    <td className="px-3 py-2.5">
                      <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSelect(t.id)}
                        className="rounded border-white/20 bg-white/5 text-teal-500 cursor-pointer" />
                    </td>
                    {isEditing ? (
                      <>
                        <td className="px-3 py-2">
                          <input value={editVals.raw_name} onChange={(e) => setEditVals((p) => ({ ...p, raw_name: e.target.value }))} autoFocus
                            className="w-full bg-white/8 border border-teal-500/40 rounded-lg px-2.5 py-1 text-white text-xs focus:outline-none focus:ring-1 focus:ring-teal-400" />
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {kbMappings[t.id] ? (
                            <span className="text-emerald-300">{kbMappings[t.id].canonical}</span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <input value={editVals.category_label} onChange={(e) => setEditVals((p) => ({ ...p, category_label: e.target.value }))}
                            className="w-full bg-white/8 border border-white/10 rounded-lg px-2.5 py-1 text-white text-xs focus:outline-none" />
                        </td>
                        <td className="px-3 py-2">
                          <textarea value={editVals.synonyms} onChange={(e) => setEditVals((p) => ({ ...p, synonyms: e.target.value }))}
                            className="w-full bg-white/8 border border-white/10 rounded-lg px-2.5 py-1 text-white text-xs focus:outline-none" style={{ minHeight: "2rem", maxHeight: "4rem", resize: "none" }} />
                        </td>
                        <td className="px-3 py-2">
                          <input value={editVals.lab_price} onChange={(e) => setEditVals((p) => ({ ...p, lab_price: e.target.value }))} type="number"
                            className="w-full bg-white/8 border border-teal-500/40 rounded-lg px-2.5 py-1 text-white text-xs focus:outline-none text-right font-mono" />
                        </td>
                        <td className="px-3 py-2">
                          <input value={editVals.commission_pct} onChange={(e) => setEditVals((p) => ({ ...p, commission_pct: e.target.value }))} type="number"
                            className="w-full bg-white/8 border border-white/10 rounded-lg px-2.5 py-1 text-white text-xs focus:outline-none text-right font-mono" />
                        </td>
                        <td className="px-3 py-2 text-slate-500 text-right text-xs">recalc</td>
                        <td />
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleSaveEdit(t.id)} className="p-1 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 transition-colors"><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setEditingId(null)} className="p-1 rounded-lg text-slate-500 hover:text-white transition-colors"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2.5 text-white font-medium max-w-[180px] truncate" title={t.raw_name}>{t.raw_name}</td>
                        <td className="px-3 py-2.5 text-xs">
                          {kbMappings[t.id] ? (
                            <div className="text-emerald-300">{kbMappings[t.id].canonical}</div>
                          ) : (
                            <button onClick={() => setMappingLabTestId(t.id)} className="text-sky-400 hover:text-sky-300 underline">Map</button>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-slate-400 max-w-[100px] truncate">{t.category_label || <span className="text-slate-600">—</span>}</td>
                        <td className="px-3 py-2.5 text-slate-400 max-w-[150px]">
                          {t.synonyms && t.synonyms.length > 0 ? (
                            <div className="text-xs space-y-0.5">
                              {t.synonyms.slice(0, 2).map((s, i) => (
                                <div key={i} className="text-slate-300">{s}</div>
                              ))}
                              {t.synonyms.length > 2 && (
                                <div className="text-slate-500 italic">+{t.synonyms.length - 2} more</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-200">{Number(t.lab_price).toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-400">{t.commission_pct != null ? `${Number(t.commission_pct)}%` : <span className="text-slate-600">—</span>}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-400">{t.poveon_fee != null ? Number(t.poveon_fee).toLocaleString() : <span className="text-slate-600">—</span>}</td>
                        <td className="px-3 py-2.5 text-center">
                          <button onClick={() => handleToggleActive(t)}
                            className={`w-8 h-4 rounded-full transition-colors relative inline-flex items-center ${t.is_active ? "bg-teal-500" : "bg-white/10"}`}>
                            <span className={`w-3 h-3 rounded-full bg-white shadow transition-transform absolute ${t.is_active ? "translate-x-4" : "translate-x-0.5"}`} />
                          </button>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => { setEditingId(t.id); setEditVals({ raw_name: t.raw_name, lab_price: String(t.lab_price), commission_pct: t.commission_pct != null ? String(t.commission_pct) : "", category_label: t.category_label ?? "", synonyms: (t.synonyms ?? []).join(", ") }); }}
                              className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-white/8 transition-colors"
                            ><Pencil className="w-3 h-3" /></button>
                            <button onClick={() => handleDelete(t.id)} className="p-1 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"><Trash2 className="w-3 h-3" /></button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        }

        {/* Footer hint - Hidden when minimized */}
        {!isModalMinimized && (
        <div className="px-6 py-3 border-t border-white/5 shrink-0 space-y-1.5">
          <p className="text-[10px] text-slate-600">
            CSV/Excel columns: <span className="font-mono text-slate-500">test_name</span>, <span className="font-mono text-slate-500">price</span> (required) · optional: <span className="font-mono text-slate-500">category</span>, <span className="font-mono text-slate-500">commission_pct</span>, <span className="font-mono text-slate-500">is_active</span>
          </p>
          <p className="text-[10px] text-slate-600">
            Synonyms sync automatically with the Knowledge Base. Edit individual rows or use bulk assignment to set AI synonyms.
          </p>
        </div>
        )}
        </>)}

        {/* KB Mapping Modal */}
        {mappingLabTestId && (
          <KbMappingModal
            labId={lab.id}
            testId={mappingLabTestId}
            testName={tests.find((t) => t.id === mappingLabTestId)?.raw_name || ""}
            onClose={() => setMappingLabTestId(null)}
            onMapped={(canonical, synonyms, variants) => {
              setKbMappings((prev) => ({
                ...prev,
                [mappingLabTestId]: { canonical, synonyms, variants },
              }));
              setMappingLabTestId(null);
            }}
          />
        )}
      </div>
    </AdminOverlay>
  );
}

// ── KB Mapping Modal ─────────────────────────────────────────────────────────

function KbMappingModal({
  labId,
  testId,
  testName,
  onClose,
  onMapped,
}: {
  labId: string;
  testId: string;
  testName: string;
  onClose: () => void;
  onMapped: (canonical: string, synonyms: string[], variants: string[]) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: string; canonical: string; synonyms: string[]; variants: string[] }>>([]);
  const [searching, setSearching] = useState(false);
  const [mapping, setMapping] = useState(false);
  const [selectedVariants, setSelectedVariants] = useState<string[]>([]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const res = await fetch(
        `/api/admin/test-kb/search?q=${encodeURIComponent(searchQuery)}&limit=10`
      );
      const data = await res.json();
      if (data.success) {
        setSearchResults(
          data.tests.map((t: any) => ({
            id: t.id,
            canonical: t.canonical,
            synonyms: t.synonyms || [],
            variants: t.variants || [],
          }))
        );
      }
    } catch (e) {
      console.error("Search error:", e);
    }
    setSearching(false);
  }, [searchQuery]);

  const handleMapTest = async (kbTestId: string, canonical: string, synonyms: string[], variants: string[]) => {
    setMapping(true);
    try {
      const res = await fetch(
        `/api/admin/labs/${labId}/test-kb-mapping`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            labTestName: testName,
            knowledgeBaseId: kbTestId,
            variantsAvailable: selectedVariants.length > 0 ? selectedVariants : null,
          }),
        }
      );
      const data = await res.json();
      if (data.success) {
        toast.success(`Mapped to ${canonical}`);
        onMapped(canonical, synonyms, variants);
        onClose();
      } else {
        toast.error(data.error || "Mapping failed");
      }
    } catch (e) {
      toast.error("Mapping error");
    }
    setMapping(false);
  };

  return (
    <AdminOverlay onClose={() => onClose()} align="center">
      <div
        className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/8">
          <h2 className="font-semibold text-white">Map to Knowledge Base</h2>
          <p className="text-xs text-slate-400 mt-1">
            Search and select a KB entry to map: <span className="font-mono text-slate-300">{testName}</span>
          </p>
        </div>

        {/* Search */}
        <div className="px-6 py-4 border-b border-white/8 space-y-3">
          <div className="flex gap-2">
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search KB tests..."
              className="flex-1 px-3 py-2 rounded-lg bg-white/8 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium disabled:opacity-50 transition-colors"
            >
              {searching ? "..." : "Search"}
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {searchResults.length === 0 ? (
            <p className="text-center py-8 text-slate-500 text-sm">
              {searchQuery ? "No results found" : "Enter a search term"}
            </p>
          ) : (
            searchResults.map((result) => (
              <div
                key={result.id}
                className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white text-sm">{result.canonical}</p>
                    {result.synonyms.length > 0 && (
                      <p className="text-xs text-slate-400 mt-1">
                        {result.synonyms.slice(0, 3).join(", ")}
                        {result.synonyms.length > 3 && ` +${result.synonyms.length - 3}`}
                      </p>
                    )}
                  </div>
                </div>

                {/* Variants selection */}
                {result.variants.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-400">Variants offered by this lab:</p>
                    <div className="flex flex-wrap gap-2">
                      {result.variants.map((v) => (
                        <button
                          key={v}
                          onClick={() =>
                            setSelectedVariants((prev) =>
                              prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
                            )
                          }
                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                            selectedVariants.includes(v)
                              ? "bg-teal-600 text-white"
                              : "bg-white/10 text-slate-300 hover:bg-white/15"
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => handleMapTest(result.id, result.canonical, result.synonyms, result.variants)}
                  disabled={mapping}
                  className="w-full mt-3 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium disabled:opacity-50 transition-colors"
                >
                  {mapping ? "Mapping..." : "Select This"}
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/8 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white/8 hover:bg-white/12 text-slate-300 text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </AdminOverlay>
  );
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────

function DeleteConfirmModal({
  name,
  label,
  onClose,
  onConfirm,
}: {
  name: string;
  label: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  const match = typed.trim() === name.trim();

  return (
    <AdminOverlay onClose={() => onClose()}>
      <div
        className="w-full max-w-md bg-slate-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/8">
          <div>
            <h2 className="font-semibold text-white text-sm">Delete {label}</h2>
            <p className="text-xs text-slate-400 mt-0.5">This action is permanent and cannot be undone.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/8 text-slate-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-300 leading-relaxed">
              You are about to permanently delete <span className="font-semibold text-white">{name}</span>. All associated data will be removed. Type the name below to confirm.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
              Type &ldquo;{name}&rdquo; to confirm
            </label>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={name}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-white/8 text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50 placeholder:text-slate-600"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 pb-5">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-white/8 transition-colors">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!match}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-sm font-medium transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete {label}
          </button>
        </div>
      </div>
    </AdminOverlay>
  );
}
