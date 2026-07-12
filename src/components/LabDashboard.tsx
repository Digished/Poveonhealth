"use client";

import { useState, useEffect, useCallback, useRef, useMemo, startTransition } from "react";
import { toast } from "react-hot-toast";
import {
  Search, RefreshCw, CheckCircle, Check, Clock, FlaskConical,
  ChevronRight, Calendar, Stethoscope, LogOut, Eye, EyeOff, Phone, X,
  Link2, Paperclip, Send, SkipForward, UserCircle, MapPin, Shield, Layers,
  Users, CreditCard, Filter, ChevronDown, AlertTriangle, Truck, ExternalLink,
  MessageCircle, ChevronLeft, FileImage, Sun, Moon, Pencil, Save, BarChart3, Lock,
  Menu, Activity, KeyRound, ArrowRight, Star, MessageSquare, Wallet2, Copy, ArrowUpRight,
  Settings2, FileText, Plus, Workflow, QrCode, ClipboardList, ListOrdered, UsersRound,
} from "lucide-react";
import dynamic from "next/dynamic";

const LabPriceListManager = dynamic(() => import("@/components/LabPriceListManager"), { ssr: false });
const JourneyView = dynamic(() => import("@/components/lab/JourneyView").then(m => ({ default: m.JourneyView })), { ssr: false });
const ReferralsView = dynamic(() => import("@/components/lab/ReferralsView").then(m => ({ default: m.ReferralsView })), { ssr: false });
const TemplatesManager = dynamic(() => import("@/components/lab/TemplatesManager").then(m => ({ default: m.TemplatesManager })), { ssr: false });
const Workspace = dynamic(() => import("@/components/lab/Workspace").then(m => ({ default: m.Workspace })), { ssr: false });
const ResultTemplatesManager = dynamic(() => import("@/components/lab/ResultTemplatesManager").then(m => ({ default: m.ResultTemplatesManager })), { ssr: false });
const SopManager = dynamic(() => import("@/components/lab/SopManager").then(m => ({ default: m.SopManager })), { ssr: false });
const MirthInterfacesPanel = dynamic(() => import("@/components/lab/MirthInterfacesPanel").then(m => ({ default: m.MirthInterfacesPanel })), { ssr: false });
const ResultsHub = dynamic(() => import("@/components/lab/ResultsHub").then(m => ({ default: m.ResultsHub })), { ssr: false });
const PastResults = dynamic(() => import("@/components/lab/PastResults").then(m => ({ default: m.PastResults })), { ssr: false });
const DepartmentsManager = dynamic(() => import("@/components/lab/DepartmentsManager").then(m => ({ default: m.DepartmentsManager })), { ssr: false });
const LabQrCard = dynamic(() => import("@/components/lab/LabQrCard").then(m => ({ default: m.LabQrCard })), { ssr: false });
const QueueView = dynamic(() => import("@/components/lab/QueueView").then(m => ({ default: m.QueueView })), { ssr: false });
const CustomersView = dynamic(() => import("@/components/lab/CustomersView").then(m => ({ default: m.CustomersView })), { ssr: false });
const AnalyticsView = dynamic(() => import("@/components/lab/AnalyticsView").then(m => ({ default: m.AnalyticsView })), { ssr: false });
const QueueNotifyFab = dynamic(() => import("@/components/lab/QueueNotifyFab").then(m => ({ default: m.QueueNotifyFab })), { ssr: false });
const TeamView = dynamic(() => import("@/components/lab/TeamView").then(m => ({ default: m.TeamView })), { ssr: false });
const PartnersView = dynamic(() => import("@/components/lab/PartnersView").then(m => ({ default: m.PartnersView })), { ssr: false });
import { useDashTheme } from "@/hooks/useDashTheme";
import { TourProvider } from "@/components/lab/tour/TourProvider";
import { GuideToggle } from "@/components/lab/tour/GuideToggle";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { StatusBadge } from "@/components/ui/Badge";
import { SourceBadge, SOURCE_OPTIONS } from "@/components/lab/SourceBadge";
import type { LabRequest, RequestStatus, Sex } from "@/lib/types";
import { parsePhones } from "@/lib/phones";
import { SERVICE_CATEGORIES } from "@/lib/constants";
import { format, differenceInYears } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";

interface LabDashboardProps {
  lab: {
    id: string;
    name: string;
    slug?: string | null;
    logo_url: string | null;
    address: string;
    description: string;
    phones: unknown; // PhoneEntry[] — parsed via parsePhones()
    whatsapp?: string | null;
    service_categories: string[];
    certifications: string[];
    free_trial?: boolean;
  };
  isOwner?: boolean;
  roleName?: string;
  canViewReferrals?: boolean;
  canViewClients?: boolean;
  canViewAnalytics?: boolean;
  canViewActivity?: boolean;
  canViewFeedback?: boolean;
  canViewWallet?: boolean;
  canViewMarketers?: boolean;
  canManageRoles?: boolean;
  canManageProfessionals?: boolean;
  canManageTemplates?: boolean;
  canViewRequests?: boolean;
  canMarkSeen?: boolean;
  canMarkDone?: boolean;
  canSendResults?: boolean;
  defaultTab?: string | null;
  memberDepartment?: string | null;
}

const TABS: { key: RequestStatus; label: string; icon: React.ReactNode }[] = [
  { key: "seen", label: "Patient Seen", icon: <Eye className="w-4 h-4" /> },
  { key: "done", label: "Done", icon: <CheckCircle className="w-4 h-4" /> },
];

function calcAge(dob: string | null): number | null {
  if (!dob) return null;
  return differenceInYears(new Date(), new Date(dob));
}

/** Prefer the stored age; fall back to deriving it from a legacy dob. */
function displayAge(r: { patient_age?: number | null; dob?: string | null }): number | null {
  return r.patient_age ?? calcAge(r.dob ?? null);
}

/** Normalise a raw tests string to comma-separated display */
function displayTests(raw: string | null | undefined): string {
  if (!raw || raw === "See attached image") return raw ?? "";
  return raw
    .split(/[,\n]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .join(", ");
}


export function LabDashboard({ lab, isOwner = false, roleName = "Lab Owner", canViewReferrals = false, canViewClients = false, canViewAnalytics = false, canViewActivity = false, canViewFeedback = false, canViewWallet = false, canViewMarketers = false, canManageRoles = false, canManageProfessionals = false, canManageTemplates = false, canViewRequests = true, canMarkSeen = false, canMarkDone = false, canSendResults = false, defaultTab = null, memberDepartment = null }: LabDashboardProps) {
  const canViewRequestsEff = isOwner || canViewRequests;
  const canAdvanceJourney = isOwner || canMarkSeen || canMarkDone;
  const canEnterResults = isOwner || canMarkDone;
  const canSendResultsEff = isOwner || canSendResults;
  const { name: labName, logo_url: labLogoUrl } = lab;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLight, toggle, themeClass } = useDashTheme("lab_dash_theme");
  type MainView = "workspace" | "requests" | "journey" | "onboarding" | "queue" | "departments" | "results" | "past" | "templates" | "sops" | "network" | "referrals" | "professionals" | "clients" | "customers" | "analytics" | "activity" | "feedback" | "poveon" | "price-list" | "marketers" | "team" | "partners";
  const VALID_TABS: MainView[] = ["onboarding", "queue", "workspace", "requests", "journey", "departments", "results", "past", "templates", "sops", "network", "referrals", "professionals", "clients", "customers", "analytics", "activity", "feedback", "poveon", "price-list", "marketers", "team", "partners"];
  // Legacy tabs now fold into the unified Workspace.
  const LEGACY_TO_WORKSPACE = new Set(["requests", "journey"]);
  // Which permission gates each tab (used by the sidebar and the initial landing).
  const tabVisible: Record<MainView, boolean> = {
    workspace: canViewRequestsEff,
    requests: canViewRequestsEff,
    journey: canViewRequestsEff,
    onboarding: canMarkSeen || isOwner,
    queue: canMarkSeen || isOwner || canViewRequestsEff,
    customers: isOwner || canViewClients,
    departments: isOwner,
    results: canSendResults || canMarkDone || isOwner || canManageTemplates,
    past: canViewRequestsEff || canSendResults || isOwner,
    templates: canViewRequestsEff || isOwner || canManageTemplates,
    sops: canViewRequestsEff || isOwner || canManageTemplates,
    network: isOwner || canViewReferrals || canManageProfessionals,
    referrals: isOwner || canViewReferrals,
    professionals: isOwner || canManageProfessionals,
    clients: isOwner || canViewClients,
    analytics: isOwner || canViewAnalytics,
    activity: isOwner || canViewActivity,
    feedback: isOwner || canViewFeedback,
    poveon: isOwner || canViewWallet,
    "price-list": isOwner || canViewWallet,
    marketers: isOwner || canViewMarketers,
    team: isOwner || canManageRoles || canViewMarketers,
    partners: isOwner || canManageProfessionals || canViewRequestsEff,
  };
  // ── Lite / LIMS (beta) mode ───────────────────────────────────────────────
  // Lite (default) trims the dashboard to Onboarding, Referrals, Marketers and
  // Price list — no journey map and no journey sub-tab in onboarding. LIMS (beta)
  // exposes the full suite. Persisted per-lab in localStorage (effect-based to
  // avoid hydration mismatch; mirrors useDashTheme).
  type LabMode = "micro" | "lite" | "lims";
  const [labMode, setLabMode] = useState<LabMode>("lite");
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`lab_dash_mode_${lab.id}`);
      if (stored === "lims" || stored === "lite" || stored === "micro") setLabMode(stored);
    } catch { /* ignore */ }
  }, [lab.id]);
  const applyLabMode = useCallback((m: LabMode) => {
    setLabMode(m);
    try { localStorage.setItem(`lab_dash_mode_${lab.id}`, m); } catch { /* ignore */ }
  }, [lab.id]);
  // Micro: the smallest footprint — front desk + referrals + pricing only.
  const MICRO_SIDEBAR = new Set<MainView>(["onboarding", "customers", "network", "price-list"]);
  const MICRO_ALLOWED = new Set<MainView>(["onboarding", "customers", "clients", "network", "referrals", "professionals", "price-list"]);
  const LITE_SIDEBAR = new Set<MainView>(["onboarding", "queue", "customers", "analytics", "feedback", "network", "partners", "team", "price-list"]);
  const LITE_ALLOWED = new Set<MainView>(["onboarding", "queue", "customers", "analytics", "feedback", "network", "referrals", "professionals", "partners", "team", "price-list"]);
  const modeSidebar = labMode === "micro" ? MICRO_SIDEBAR : labMode === "lite" ? LITE_SIDEBAR : null;
  const tabVisibleEff: Record<MainView, boolean> = modeSidebar
    ? (Object.fromEntries((Object.keys(tabVisible) as MainView[]).map((k) => [k, tabVisible[k] && modeSidebar.has(k)])) as Record<MainView, boolean>)
    : tabVisible;
  const STANDALONE_NETWORK = new Set(["referrals", "professionals"]);
  const firstVisibleTab = (VALID_TABS.find((t) => t !== "requests" && t !== "journey" && !STANDALONE_NETWORK.has(t) && tabVisible[t]) ?? "workspace") as MainView;
  const firstVisibleLiteTab = (VALID_TABS.find((t) => t !== "requests" && t !== "journey" && !STANDALONE_NETWORK.has(t) && tabVisibleEff[t]) ?? "onboarding") as MainView;
  const rawTabParam = searchParams.get("tab") as MainView | null;
  // Old deep links (requests/journey/onboarding) resolve to the Workspace.
  const tabParam: MainView | null =
    rawTabParam && LEGACY_TO_WORKSPACE.has(rawTabParam) ? "workspace"
    : rawTabParam === "marketers" ? "team"
    : rawTabParam;
  const initialTab: MainView =
    tabParam && VALID_TABS.includes(tabParam) && tabVisible[tabParam]
      ? tabParam
      : defaultTab && VALID_TABS.includes(defaultTab as MainView) && tabVisible[defaultTab as MainView]
      ? (defaultTab as MainView)
      : firstVisibleTab;
  const [mainView, setMainView] = useState<MainView>(initialTab);
  const navigateToTab = useCallback((tab: MainView) => {
    setMainView(tab);
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", tab);
    router.replace(`/lab-dashboard?${next.toString()}`);
  }, [router, searchParams]);

  // Grouped views — a parent nav entry reveals a sub-tab strip above the content.
  const SUBTAB_GROUPS: { key: MainView; children: { key: MainView; label: string }[] }[] = [
    { key: "results", children: [
      { key: "results", label: "Worklist" },
      { key: "past", label: "Past Results" },
      { key: "templates", label: "Result Templates" },
    ] },
    { key: "customers", children: [
      { key: "customers", label: "Customers" },
      { key: "clients", label: "Clients" },
    ] },
    { key: "departments", children: [
      { key: "departments", label: "Departments" },
      { key: "sops", label: "SOPs" },
      { key: "team", label: "Team" },
    ] },
    { key: "analytics", children: [
      { key: "analytics", label: "Overview" },
      { key: "feedback", label: "Feedback" },
      { key: "activity", label: "Activity" },
    ] },
  ];
  const groupChildren = (parent: MainView) =>
    (SUBTAB_GROUPS.find((g) => g.key === parent)?.children ?? []).filter((c) => tabVisibleEff[c.key]);
  const groupForView = (view: MainView) => SUBTAB_GROUPS.find((g) => g.children.some((c) => c.key === view));
  const groupVisible = (parent: MainView) => groupChildren(parent).length > 0;
  const firstChild = (parent: MainView): MainView => groupChildren(parent)[0]?.key ?? parent;
  const activeGroup = groupForView(mainView);
  const subTabs = activeGroup ? groupChildren(activeGroup.key) : [];
  // In Micro/Lite modes, keep the active view inside the allowed set (covers
  // toggling modes while on a hidden tab, and stale `?tab=` deep links).
  const allowedForMode = labMode === "micro" ? MICRO_ALLOWED : labMode === "lite" ? LITE_ALLOWED : null;
  useEffect(() => {
    if (allowedForMode && !allowedForMode.has(mainView)) {
      navigateToTab(firstVisibleLiteTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labMode, mainView]);
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [walletRefreshing, setWalletRefreshing] = useState(false);
  const [poveonData, setPoveonData] = useState<PoveonViewData>(null);
  const [poveonLoading, setPoveonLoading] = useState(false);
  const [priceListData, setPriceListData] = useState<{ category: string; tests: { id: string; name: string; lab_price: number; poveon_fee: number | null; commission_pct: number | null }[] }[] | null>(null);
  const [priceListLoading, setPriceListLoading] = useState(false);
  const [priceListError, setPriceListError] = useState<string | null>(null);
  const [priceManagerOpen, setPriceManagerOpen] = useState(false);
  // Load (or reload) the lab's price schedule. Errors are surfaced with a
  // retry instead of being swallowed — a failed fetch used to leave the tab
  // stuck on "No tests in your catalog yet".
  const fetchPriceList = useCallback(async () => {
    setPriceListLoading(true);
    setPriceListError(null);
    try {
      const res = await fetch("/api/lab/price-schedule", { cache: "no-store" });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) throw new Error(d?.error || `Could not load the price list (${res.status})`);
      setPriceListData(d.schedule ?? []);
    } catch (e) {
      setPriceListError(e instanceof Error ? e.message : "Could not load the price list");
    } finally {
      setPriceListLoading(false);
    }
  }, []);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Agreement status — checked once on mount for owners
  const [agreementSigned, setAgreementSigned] = useState<boolean | null>(null);
  // Eagerly loaded wallet balance for the "amount owed" banner shown on all tabs
  const [poveonBalance, setPoveonBalance] = useState<number | null>(null);
  // Banner dismissal — persisted per-lab in localStorage
  const [balanceBannerDismissed, setBalanceBannerDismissed] = useState(false);
  const [agreementBannerDismissed, setAgreementBannerDismissed] = useState(false);
  const [mobileHeaderOpen, setMobileHeaderOpen] = useState(false);


  const [activeTab, setActiveTab] = useState<RequestStatus>("seen");
  const [requests, setRequests] = useState<LabRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [retrieving, setRetrieving] = useState(false);
  const [retrievedRequest, setRetrievedRequest] = useState<LabRequest | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<LabRequest | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  // Clients state
  type ClientRecord = {
    patient_phone: string;
    patient_email: string | null;
    patient_name: string | null;
    visit_count: number;
    first_visit: string;
    last_visit: string;
    recent_tests: string;
    source?: string | null;
    requests: LabRequest[];
  };
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientRecord | null>(null);

  // Patient info edit modal state
  const [editPatientRequest, setEditPatientRequest] = useState<LabRequest | null>(null);
  const [editPatientForm, setEditPatientForm] = useState({ patient_name: "", patient_phone: "", patient_email: "", age: "", sex: "", address: "" });
  const [savingPatient, setSavingPatient] = useState(false);

  // Results modal state
  const [resultsModalRequest, setResultsModalRequest] = useState<LabRequest | null>(null);
  const [resultsStep, setResultsStep] = useState<1 | 2>(1);
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactError, setContactError] = useState("");
  const [updatingContact, setUpdatingContact] = useState(false);
  const [resultLink, setResultLink] = useState("");
  const [resultFiles, setResultFiles] = useState<File[]>([]);
  const [resultNote, setResultNote] = useState("");
  const [patientEmailInput, setPatientEmailInput] = useState("");
  const [patientEmailError, setPatientEmailError] = useState("");
  const [sendingResults, setSendingResults] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchRequests = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch("/api/lab/requests");
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setRequests(data.requests ?? []);
    } catch {
      toast.error("Failed to load requests");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);


  useEffect(() => {
    fetchRequests();
    const interval = setInterval(() => { if (!document.hidden) fetchRequests(true); }, 30_000);
    return () => clearInterval(interval);
  }, [fetchRequests]);

  // Eagerly fetch Poveon + wallet data so tabs are instant, no per-mount skeleton
  const fetchWallet = useCallback(async (isRefresh = false) => {
    if (isRefresh) setWalletRefreshing(true);
    try {
      const res = await fetch("/api/lab/wallet");
      const d = await res.json();
      if (d.success) setWalletData(d);
    } catch { /* non-critical */ } finally {
      setWalletRefreshing(false);
    }
  }, []);

  const fetchPoveon = useCallback(async (showLoading = false) => {
    if (showLoading) setPoveonLoading(true);
    try {
      const res = await fetch("/api/lab/poveon");
      const d = await res.json();
      if (d.success) {
        setPoveonData(d);
        setPoveonBalance(d.wallet_balance ?? null);
      }
    } catch { /* non-critical */ } finally {
      setPoveonLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOwner && !canViewWallet) return;
    fetchPoveon(true);
    fetchWallet();
    const walletInterval = setInterval(() => { if (!document.hidden) fetchWallet(true); }, 30_000);
    return () => clearInterval(walletInterval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check agreement status for owners once on mount
  useEffect(() => {
    if (!isOwner) return;
    fetch("/api/lab/agreement-status")
      .then((r) => r.json())
      .then((d) => setAgreementSigned(d.signed ?? false))
      .catch(() => setAgreementSigned(true)); // fail silently — don't nag if API is down
  }, [isOwner]);

  // Load banner dismissal state from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    setBalanceBannerDismissed(localStorage.getItem(`balance_banner_dismissed_${lab.id}`) === "1");
    setAgreementBannerDismissed(localStorage.getItem(`agreement_banner_dismissed_${lab.id}`) === "1");
  }, [lab.id]);

  // Poll Poveon data every 30s when on the poveon tab (real-time updates)
  useEffect(() => {
    if (mainView !== "poveon" || (!isOwner && !canViewWallet)) return;
    const interval = setInterval(() => { if (!document.hidden) fetchPoveon(); }, 30_000);
    return () => clearInterval(interval);
  }, [mainView, fetchPoveon, isOwner, canViewWallet]);

  const fetchClients = useCallback(async () => {
    setClientsLoading(true);
    try {
      const res = await fetch("/api/lab/clients");
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setClients(data.clients ?? []);
    } catch {
      toast.error("Failed to load clients");
    } finally {
      setClientsLoading(false);
    }
  }, []);


  useEffect(() => {
    if (mainView === "clients" && (isOwner || canViewClients)) fetchClients();
  }, [mainView, fetchClients, isOwner, canViewClients]);


  const [requestSourceFilter, setRequestSourceFilter] = useState("");
  const [clientSourceFilter, setClientSourceFilter] = useState("");
  const tabRequests = requests.filter((r) => r.status === activeTab && (!requestSourceFilter || (r.source ?? "poveon") === requestSourceFilter));

  async function handleRetrieve() {
    const code = codeInput.trim().toUpperCase();
    if (!code) return toast.error("Please enter a request code");
    setRetrieving(true);
    setRetrievedRequest(null);
    try {
      const res = await fetch("/api/requests/retrieve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (data.success) {
        setRetrievedRequest(data.request);
        toast.success("Patient details revealed");
        await fetchRequests(true);
        setCodeInput("");
        setActiveTab("seen");
        setSelectedRequest(null);
      } else {
        toast.error(data.error ?? "Request not found");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setRetrieving(false);
    }
  }

  function openResultsModal(req: LabRequest) {
    setResultsModalRequest(req);
    setResultsStep(1);
    setContactPhone(req.patient_phone ?? "");
    setContactEmail(req.patient_email ?? "");
    setContactError("");
    setUpdatingContact(false);
    setResultLink("");
    setResultFiles([]);
    setResultNote("");
    setPatientEmailInput("");
    setPatientEmailError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function closeResultsModal() {
    setResultsModalRequest(null);
    setContactError("");
    setPatientEmailError("");
  }

  async function handleContactNext() {
    if (!resultsModalRequest) return;
    setContactError("");
    setUpdatingContact(true);
    try {
      const res = await fetch("/api/requests/update-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: resultsModalRequest.id,
          patient_phone: contactPhone.trim(),
          patient_email: contactEmail.trim(),
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setContactError(data.error ?? "Failed to update contact info");
        return;
      }
      setResultsStep(2);
    } catch {
      setContactError("Network error — please try again");
    } finally {
      setUpdatingContact(false);
    }
  }

  function removeFile(index: number) {
    setResultFiles((prev) => prev.filter((_, i) => i !== index));
    // Reset the file input so the same files can be re-selected if needed
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSkipResults(req: LabRequest) {
    // Close modal and send the default doctor-only notification
    closeResultsModal();
    setUpdatingId(req.id);
    try {
      const res = await fetch("/api/requests/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: req.id, status: "done" }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Marked as done. Doctor notified.");
        await fetchRequests(true);
        if (selectedRequest?.id === req.id) setSelectedRequest(null);
        if (retrievedRequest?.id === req.id) setRetrievedRequest(null);
      } else {
        toast.error(data.error ?? "Failed to update");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleSendResults() {
    if (!resultsModalRequest) return;
    const hasContent = resultFiles.length > 0 || resultLink.trim().length > 0;
    if (!hasContent) return;
    // Patient email is required when none is on file
    if (!resultsModalRequest.patient_email) {
      const email = patientEmailInput.trim();
      if (!email) {
        setPatientEmailError("Patient email is required to send results");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setPatientEmailError("Please enter a valid email address");
        return;
      }
    }
    setPatientEmailError("");
    setSendingResults(true);
    try {
      const fd = new FormData();
      fd.append("requestId", resultsModalRequest.id);
      if (resultLink.trim()) fd.append("resultLink", resultLink.trim());
      resultFiles.forEach((f) => fd.append("resultFiles", f));
      if (resultNote.trim()) fd.append("note", resultNote.trim());
      if (patientEmailInput.trim()) fd.append("patientEmail", patientEmailInput.trim());

      const res = await fetch("/api/requests/send-results", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Results sent successfully.");
        closeResultsModal();
        await fetchRequests(true);
        if (selectedRequest?.id === resultsModalRequest.id) setSelectedRequest(null);
        if (retrievedRequest?.id === resultsModalRequest.id) setRetrievedRequest(null);
      } else {
        toast.error(data.error ?? "Failed to send results");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSendingResults(false);
    }
  }

  async function handleSignOut() {
    await createClient().auth.signOut();
    router.push("/lab-login");
    router.refresh();
  }


  function openEditPatient(req: LabRequest) {
    setEditPatientRequest(req);
    setEditPatientForm({
      patient_name: req.patient_name ?? "",
      patient_phone: req.patient_phone ?? "",
      patient_email: req.patient_email ?? "",
      age: displayAge(req) != null ? String(displayAge(req)) : "",
      sex: req.sex ?? "",
      address: req.address ?? "",
    });
  }

  async function handleSavePatient() {
    if (!editPatientRequest) return;
    setSavingPatient(true);
    try {
      const res = await fetch("/api/lab/requests/update-patient", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: editPatientRequest.id, ...editPatientForm }),
      });
      const data = await res.json();
      if (!data.success) { toast.error(data.error ?? "Failed to save"); return; }
      toast.success("Patient info updated");
      // Optimistic update
      const updated: LabRequest = {
        ...editPatientRequest,
        patient_name: editPatientForm.patient_name || null,
        patient_phone: editPatientForm.patient_phone || null,
        patient_email: editPatientForm.patient_email || null,
        patient_age: editPatientForm.age ? parseInt(editPatientForm.age, 10) : null,
        sex: (editPatientForm.sex || null) as Sex | null,
        address: editPatientForm.address || null,
      };
      setRequests((prev) => prev.map((r) => r.id === updated.id ? updated : r));
      if (selectedRequest?.id === updated.id) setSelectedRequest(updated);
      setEditPatientRequest(null);
    } catch {
      toast.error("Network error");
    } finally {
      setSavingPatient(false);
    }
  }

  const counts = {
    incoming: requests.filter((r) => r.status === "incoming").length,
    seen: requests.filter((r) => r.status === "seen").length,
    done: requests.filter((r) => r.status === "done").length,
  };

  const isRevealed = selectedRequest?.status !== "incoming";

  return (
    // Lite mode has no tutorial — the guided tour only exists in LIMS mode.
    <TourProvider disabled={labMode !== "lims"}>
    <div className={`min-h-screen bg-gradient-to-br from-slate-900 via-medical-950 to-slate-900 text-white transition-colors duration-300 ${themeClass}`}>
      {/* Top bar */}
      <header className="border-b border-white/10 backdrop-blur-sm bg-white/5 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {labLogoUrl ? (
              <img src={labLogoUrl} alt={labName} className="w-9 h-9 rounded-xl object-cover" />
            ) : (
              <div className="w-9 h-9 bg-medical-600 rounded-xl flex items-center justify-center">
                <FlaskConical className="w-5 h-5 text-white" />
              </div>
            )}
            <div>
              <h1 className="font-bold text-white text-sm leading-none">{labName}</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-xs text-blue-300">{roleName}</p>
                {lab.free_trial && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded-full">
                    Free Trial
                  </span>
                )}
              </div>
            </div>
          </div>
          {/* Micro / Lite / LIMS mode switch — always visible */}
          <div className="inline-flex items-center rounded-lg border border-white/10 bg-white/5 p-0.5 text-xs shrink-0">
            <button
              onClick={() => applyLabMode("micro")}
              className={`px-2.5 py-1 rounded-md font-semibold transition ${labMode === "micro" ? "bg-medical-600 text-white shadow-sm" : "text-slate-400 hover:text-white"}`}
              title="Micro mode — onboarding, customers, referrals & price list only"
            >
              Micro
            </button>
            <button
              onClick={() => applyLabMode("lite")}
              className={`px-2.5 py-1 rounded-md font-semibold transition ${labMode === "lite" ? "bg-medical-600 text-white shadow-sm" : "text-slate-400 hover:text-white"}`}
              title="Lite mode — onboarding, referrals, marketers & price list"
            >
              Lite
            </button>
            <button
              onClick={() => applyLabMode("lims")}
              className={`px-2.5 py-1 rounded-md font-semibold transition flex items-center gap-1 ${labMode === "lims" ? "bg-medical-600 text-white shadow-sm" : "text-slate-400 hover:text-white"}`}
              title="LIMS mode (beta) — full laboratory features"
            >
              LIMS
              <span className="text-[9px] uppercase tracking-wide bg-amber-400/20 text-amber-300 border border-amber-400/30 px-1 py-px rounded">beta</span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            {/* Desktop: individual action buttons */}
            <div className="hidden sm:flex items-center gap-2">
              {labMode === "lims" && <GuideToggle />}
              <button
                onClick={toggle}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
                title={isLight ? "Switch to dark mode" : "Switch to light mode"}
              >
                {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setProfileOpen(true)}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
                title="Lab Profile"
              >
                <UserCircle className="w-4 h-4" />
              </button>
              <button
                onClick={() => setChangePasswordOpen(true)}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
                title="Change Password"
              >
                <Lock className="w-4 h-4" />
              </button>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white text-sm"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
            {/* Mobile: hamburger menu */}
            <div className="sm:hidden relative">
              <button
                onClick={() => setMobileHeaderOpen((v) => !v)}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
                title="Menu"
              >
                {mobileHeaderOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
              {mobileHeaderOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setMobileHeaderOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-white/10 bg-slate-800 shadow-2xl overflow-hidden z-30">
                    <button
                      onClick={() => { toggle(); setMobileHeaderOpen(false); }}
                      className="flex items-center gap-3 w-full px-4 py-3 text-sm text-slate-300 hover:bg-white/8 transition-colors border-b border-white/5"
                    >
                      {isLight ? <Moon className="w-4 h-4 text-slate-500" /> : <Sun className="w-4 h-4 text-slate-500" />}
                      {isLight ? "Dark Mode" : "Light Mode"}
                    </button>
                    {labMode === "lims" && <GuideToggle variant="row" />}
                    <button
                      onClick={() => { setMobileHeaderOpen(false); setProfileOpen(true); }}
                      className="flex items-center gap-3 w-full px-4 py-3 text-sm text-slate-300 hover:bg-white/8 transition-colors border-b border-white/5"
                    >
                      <UserCircle className="w-4 h-4 text-slate-500" />
                      Lab Profile
                    </button>
                    <button
                      onClick={() => { setMobileHeaderOpen(false); setChangePasswordOpen(true); }}
                      className="flex items-center gap-3 w-full px-4 py-3 text-sm text-slate-300 hover:bg-white/8 transition-colors border-b border-white/5"
                    >
                      <Lock className="w-4 h-4 text-slate-500" />
                      Change Password
                    </button>
                    <button
                      onClick={() => { setMobileHeaderOpen(false); handleSignOut(); }}
                      className="flex items-center gap-3 w-full px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 lg:flex lg:gap-6">

        {/* Role-aware grouped navigation (sidebar on desktop, sheet on mobile) */}
        {(() => {
          const RAW_SECTIONS: { label: string; items: { key: MainView; label: string; icon: React.ReactNode; show: boolean }[] }[] = [
            { label: "Operations", items: [
              { key: "onboarding", label: "Onboarding", icon: <QrCode className="w-4 h-4" />, show: tabVisibleEff.onboarding },
              { key: "queue", label: "Queue", icon: <ListOrdered className="w-4 h-4" />, show: tabVisibleEff.queue },
              { key: "workspace", label: "Workstation", icon: <Workflow className="w-4 h-4" />, show: tabVisibleEff.workspace },
              { key: "results", label: "Results", icon: <FlaskConical className="w-4 h-4" />, show: groupVisible("results") },
            ] },
            { label: "People", items: [
              { key: "customers", label: "Customers", icon: <UsersRound className="w-4 h-4" />, show: groupVisible("customers") },
              { key: "departments", label: "HR", icon: <Users className="w-4 h-4" />, show: groupVisible("departments") },
            ] },
            { label: "Network", items: [
              { key: "network", label: "Referrals", icon: <Stethoscope className="w-4 h-4" />, show: tabVisibleEff.network },
              { key: "partners", label: "Partners", icon: <Link2 className="w-4 h-4" />, show: tabVisibleEff.partners },
            ] },
            { label: "Insights", items: [
              { key: "analytics", label: "Analytics", icon: <BarChart3 className="w-4 h-4" />, show: groupVisible("analytics") },
            ] },
            { label: "Finance", items: [
              { key: "poveon", label: "Revenue", icon: <CreditCard className="w-4 h-4" />, show: tabVisibleEff.poveon },
              { key: "price-list", label: "Price List", icon: <FileText className="w-4 h-4" />, show: tabVisibleEff["price-list"] },
            ] },
          ];
          const NAV_SECTIONS = RAW_SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => i.show) })).filter((s) => s.items.length > 0);

          const onNav = (key: MainView) => {
            // Group parents land on their first visible child.
            const target = groupForView(key)?.key === key ? firstChild(key) : key;
            navigateToTab(target);
            setMobileNavOpen(false);
            if (target === "price-list") fetchPriceList();
          };

          const allItems = NAV_SECTIONS.flatMap((s) => s.items);
          // A parent item is active when the current view is any of its children.
          const isItemActive = (key: MainView) => {
            const grp = SUBTAB_GROUPS.find((g) => g.key === key);
            if (grp) return grp.children.some((c) => c.key === mainView);
            return key === mainView || (key === "network" && STANDALONE_NETWORK.has(mainView));
          };
          const currentItem = allItems.find((n) => isItemActive(n.key)) ?? allItems[0];

          const itemClass = (active: boolean) =>
            `flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              active ? "bg-medical-600/20 text-white border border-medical-500/30" : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
            }`;

          return (
            <>
              {/* Desktop sidebar */}
              <aside className="hidden lg:block w-56 shrink-0">
                <nav className="slim-scroll sticky top-24 max-h-[calc(100vh-7rem)] space-y-5 overflow-y-auto pr-1">
                  {NAV_SECTIONS.map((sec) => (
                    <div key={sec.label}>
                      <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{sec.label}</p>
                      <div className="space-y-0.5">
                        {sec.items.map((item) => (
                          <button key={item.key} onClick={() => onNav(item.key)} className={itemClass(isItemActive(item.key))}>
                            <span className={isItemActive(item.key) ? "text-medical-300" : "text-slate-500"}>{item.icon}</span>
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </nav>
              </aside>

              {/* Mobile grouped menu */}
              {currentItem && (
                <div className="lg:hidden mb-4">
                  <button
                    onClick={() => setMobileNavOpen((v) => !v)}
                    className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-white/8 border border-white/12 text-sm font-semibold text-white w-full active:bg-white/15 transition-colors"
                  >
                    <span className="text-slate-300">{currentItem.icon}</span>
                    <span className="flex-1 text-left">{currentItem.label}</span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${mobileNavOpen ? "rotate-180" : ""}`} />
                  </button>
                  {mobileNavOpen && (
                    <div className="mt-1.5 rounded-xl border border-white/10 bg-slate-800 overflow-hidden shadow-2xl">
                      {NAV_SECTIONS.map((sec) => (
                        <div key={sec.label}>
                          <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 bg-white/5">{sec.label}</p>
                          {sec.items.map((item) => (
                            <button key={item.key} onClick={() => onNav(item.key)}
                              className={`flex items-center gap-3 w-full px-4 py-3 text-sm font-medium transition-colors border-b border-white/5 ${
                                isItemActive(item.key) ? "bg-white/12 text-white" : "text-slate-300 active:bg-white/8"
                              }`}>
                              <span className={isItemActive(item.key) ? "text-white" : "text-slate-500"}>{item.icon}</span>
                              {item.label}
                              {isItemActive(item.key) && <ChevronRight className="w-3.5 h-3.5 ml-auto text-white/40" />}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          );
        })()}

        <main className="min-w-0 flex-1">

        {/* Sub-tab strip for grouped sections (Results / Customers / HR / Analytics) */}
        {subTabs.length > 1 && (
          <div className="mb-5 flex flex-wrap gap-1 border-b border-white/10 pb-2">
            {subTabs.map((st) => (
              <button
                key={st.key}
                onClick={() => navigateToTab(st.key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  mainView === st.key ? "bg-medical-600/20 text-white border border-medical-500/30" : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        )}

        {/* Amount-owed and unsigned-agreement banners intentionally hidden —
            this info still lives on the Revenue tab. */}

        {/* Unified Referrals page (merges referrals + professionals) */}
        {(mainView === "network" || mainView === "referrals" || mainView === "professionals") && (
          <ReferralsView canManage={isOwner || canManageProfessionals} />
        )}

        {/* Clients view */}
        {mainView === "clients" && (
          <div>
            {clientsLoading ? (
              <div className="flex items-center justify-center py-20">
                <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
              </div>
            ) : clients.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
                  <UserCircle className="w-8 h-8 text-slate-500" />
                </div>
                <p className="text-slate-300 font-semibold">No clients yet</p>
                <p className="text-slate-500 text-sm mt-1">Clients appear here after their code is entered at the lab.</p>
              </div>
            ) : (
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  {(() => {
                    const shown = clientSourceFilter ? clients.filter((c) => (c.source ?? "poveon") === clientSourceFilter) : clients;
                    return <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">{shown.length} client{shown.length !== 1 ? "s" : ""}</p>;
                  })()}
                  <select
                    value={clientSourceFilter}
                    onChange={(e) => setClientSourceFilter(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none cursor-pointer"
                  >
                    {SOURCE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value} className="bg-slate-800">{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="rounded-2xl overflow-hidden border border-white/8 divide-y divide-white/5">
                  {clients.filter((client) => !clientSourceFilter || (client.source ?? "poveon") === clientSourceFilter).map((client) => (
                    <button
                      key={client.patient_phone}
                      type="button"
                      onClick={() => setSelectedClient(client)}
                      className="w-full text-left flex items-center gap-3 px-4 py-3 bg-white/3 hover:bg-white/8 transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-full bg-medical-600/20 border border-medical-500/30 flex items-center justify-center shrink-0">
                        <UserCircle className="w-4 h-4 text-medical-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {client.patient_name && (
                            <p className="text-sm font-semibold text-white truncate leading-tight">{client.patient_name}</p>
                          )}
                          <SourceBadge source={client.source} className="shrink-0" />
                        </div>
                        <p className="text-xs text-slate-500 font-mono truncate">{client.patient_phone}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="text-xs font-bold text-medical-300 bg-medical-600/20 border border-medical-500/30 px-2 py-0.5 rounded-full">
                          {client.visit_count}
                        </span>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {new Date(client.last_visit).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </p>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0 group-hover:text-slate-300 transition-colors" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Client detail popup */}
            {selectedClient && (
              <div
                className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
                style={{ backgroundColor: "rgba(15,23,42,0.7)", backdropFilter: "blur(4px)" }}
                onClick={() => setSelectedClient(null)}
              >
                <div
                  className="w-full max-w-md bg-slate-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Header */}
                  <div className="px-5 pt-5 pb-4 border-b border-white/10 flex items-start justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-2xl bg-medical-600/20 border border-medical-500/30 flex items-center justify-center shrink-0">
                        <UserCircle className="w-6 h-6 text-medical-400" />
                      </div>
                      <div className="min-w-0">
                        {selectedClient.patient_name && <p className="font-bold text-white text-base leading-tight truncate">{selectedClient.patient_name}</p>}
                        <a href={`tel:${selectedClient.patient_phone}`} className="text-sm text-medical-400 font-mono flex items-center gap-1 mt-0.5">
                          <Phone className="w-3.5 h-3.5" />{selectedClient.patient_phone}
                        </a>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {selectedClient.requests.length > 0 && (
                        <button
                          type="button"
                          onClick={() => { openEditPatient(selectedClient.requests[0]); setSelectedClient(null); }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-medical-600/20 hover:bg-medical-600/30 text-medical-400 hover:text-medical-300 text-xs font-medium transition-all border border-medical-500/30"
                        >
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                      )}
                      <button type="button" onClick={() => setSelectedClient(null)} className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  {/* Stats — grid so items never squeeze on narrow phones */}
                  <div className="px-5 py-4 border-b border-white/5 shrink-0">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-white/5 rounded-2xl px-3 py-3 text-center">
                        <p className="text-xs text-slate-400 mb-1">Visits</p>
                        <p className="text-2xl font-bold text-white leading-none">{selectedClient.visit_count}</p>
                      </div>
                      <div className="bg-white/5 rounded-2xl px-3 py-3 text-center">
                        <p className="text-xs text-slate-400 mb-1">First visit</p>
                        <p className="text-sm font-semibold text-slate-200 leading-snug">
                          {new Date(selectedClient.first_visit).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </p>
                        <p className="text-[11px] text-slate-500 leading-tight">
                          {new Date(selectedClient.first_visit).getFullYear()}
                        </p>
                      </div>
                      <div className="bg-white/5 rounded-2xl px-3 py-3 text-center">
                        <p className="text-xs text-slate-400 mb-1">Last visit</p>
                        <p className="text-sm font-semibold text-slate-200 leading-snug">
                          {new Date(selectedClient.last_visit).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </p>
                        <p className="text-[11px] text-slate-500 leading-tight">
                          {new Date(selectedClient.last_visit).getFullYear()}
                        </p>
                      </div>
                    </div>
                  </div>
                  {/* Visit history */}
                  <div className="overflow-y-auto flex-1">
                    <p className="px-5 pt-4 pb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Visit History</p>
                    <div className="space-y-0">
                      {selectedClient.requests.map((req, i) => (
                        <div key={req.id} className={`px-5 py-4 ${i < selectedClient.requests.length - 1 ? "border-b border-white/5" : ""}`}>
                          <div className="flex items-start justify-between gap-3 mb-1.5">
                            <p className="text-xs text-slate-400">{new Date(req.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
                            <StatusBadge status={req.status} />
                          </div>
                          <p className="text-sm text-white font-medium leading-snug line-clamp-2">{displayTests(req.tests)}</p>
                          {req.diagnosis && <p className="text-xs text-slate-500 mt-1 line-clamp-1">{req.diagnosis}</p>}
                          {req.test_image_url && (
                            <a
                              href={req.test_image_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-all text-xs font-medium text-blue-300"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <FileImage className="w-3.5 h-3.5" />
                              View Test Image
                              <ExternalLink className="w-3 h-3 opacity-60" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Analytics view — full breakdown of everything the lab gathers */}
        {mainView === "analytics" && (isOwner || canViewAnalytics) && (
          <AnalyticsView labId={lab.id} lite={labMode !== "lims"} />
        )}

        {/* Journey / sample tracking view */}
        {mainView === "journey" && canViewRequestsEff && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-white">Sample journey</h2>
              <p className="text-sm text-slate-400 mt-1">Track every client and sample from registration to reported results.</p>
            </div>
            <JourneyView canAdvance={canAdvanceJourney} />
          </div>
        )}


        {/* Activity view */}
        {mainView === "activity" && (isOwner || canViewActivity) && (
          <LabActivityView />
        )}

        {/* Feedback view */}
        {mainView === "feedback" && (isOwner || canViewFeedback) && (
          <LabFeedbackView labId={lab.id} labSlug={lab.slug ?? null} />
        )}

        {/* Poveon commission view */}
        {mainView === "poveon" && (isOwner || canViewWallet) && (
          <LabPoveonView
            data={poveonData}
            loading={poveonLoading}
            walletData={walletData}
            walletRefreshing={walletRefreshing}
            onRefreshWallet={() => fetchWallet(true)}
            onLoad={() => fetchPoveon(true)}
          />
        )}

        {/* Price list view */}
        {mainView === "price-list" && (isOwner || canViewWallet) && (
          <>
            <LabPriceListView
              data={priceListData}
              loading={priceListLoading}
              error={priceListError}
              onManage={() => setPriceManagerOpen(true)}
              onLoad={fetchPriceList}
            />
            {priceManagerOpen && (
              <LabPriceListManager onClose={() => setPriceManagerOpen(false)} />
            )}
          </>
        )}

        {/* Queue view — self-service + walk-in waiting queue (Journey sub-tab in LIMS) */}
        {mainView === "queue" && (isOwner || canMarkSeen || canViewRequestsEff) && (
          <QueueView
            canManage={isOwner || canMarkSeen}
            lite={labMode !== "lims"}
            labId={lab.id}
            labName={lab.name}
            labSlug={lab.slug ?? null}
          />
        )}

        {/* Customers view — every customer since inception, exportable */}
        {mainView === "customers" && (isOwner || canViewClients) && (
          <CustomersView labName={lab.name} />
        )}

        {/* Team — staff, marketers and roles, in the nav (Lite + LIMS) */}
        {mainView === "team" && (isOwner || canManageRoles || canViewMarketers) && (
          <TeamView
            labId={lab.id}
            isOwner={isOwner}
            canManageRoles={canManageRoles}
            canViewMarketers={isOwner || canViewMarketers}
          />
        )}

        {/* Partners — HMOs / hospitals / companies the lab works with */}
        {mainView === "partners" && (isOwner || canManageProfessionals || canViewRequestsEff) && (
          <PartnersView canManage={isOwner || canManageProfessionals} />
        )}

        {/* Departments — per-lab pipeline configuration */}
        {mainView === "departments" && isOwner && (
          <DepartmentsManager />
        )}

        {/* Results hub — pending worklist + create/edit/send results */}
        {mainView === "results" && (isOwner || canManageTemplates || canSendResults || canMarkDone) && (
          <ResultsHub canSendResults={canSendResults || isOwner} memberDepartment={memberDepartment} />
        )}

        {/* Past results — search & reprint reported results */}
        {mainView === "past" && (isOwner || canViewRequestsEff || canSendResults) && (
          <PastResults />
        )}

        {/* Result report templates view */}
        {mainView === "templates" && (isOwner || canViewRequestsEff || canManageTemplates) && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-white">Result templates</h2>
              <p className="text-sm text-slate-400 mt-1">Define result reports (parameters + reference ranges) used to enter, print and send results.</p>
            </div>
            <ResultTemplatesManager canManage={isOwner || canManageTemplates} />
            <div className="border-t border-white/10 pt-5">
              <MirthInterfacesPanel canManage={isOwner || canManageTemplates} />
            </div>
          </div>
        )}

        {/* Standard Operating Procedures */}
        {mainView === "sops" && (isOwner || canViewRequestsEff || canManageTemplates) && (
          <SopManager canManage={isOwner || canManageTemplates} />
        )}

        {/* Unified Workspace — intake + requests + multi-department journey + results */}
        {mainView === "onboarding" && (canMarkSeen || isOwner) && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-white">Onboarding</h2>
              <p className="text-sm text-slate-400 mt-1">
                {labMode !== "lims"
                  ? "Check in Poveon arrivals, confirm their details and take payment. New walk-ins register from the Queue."
                  : "Check in Poveon arrivals, confirm tests and take payment. Paid clients move on to the Workstation; new walk-ins register from the Queue."}
              </p>
            </div>
            <Workspace
              mode="onboarding"
              lite={labMode !== "lims"}
              labId={lab.id}
              labName={lab.name}
              labSlug={lab.slug ?? null}
              canAdvance={canAdvanceJourney}
              canEnterResults={canEnterResults}
              canSendResults={canSendResultsEff}
              memberDepartment={memberDepartment}
            />
          </div>
        )}

        {mainView === "workspace" && canViewRequestsEff && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-white">Workstation</h2>
              <p className="text-sm text-slate-400 mt-1">Track every paid sample across departments and deliver results. Registration happens in Onboarding.</p>
            </div>
            <Workspace
              mode="workstation"
              labId={lab.id}
              labName={lab.name}
              labSlug={lab.slug ?? null}
              canAdvance={canAdvanceJourney}
              canEnterResults={canEnterResults}
              canSendResults={canSendResultsEff}
              memberDepartment={memberDepartment}
            />
          </div>
        )}

        {/* Requests view */}
        {mainView === "requests" && canViewRequestsEff && (
        <div>
        {/* Code reveal section */}
        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 mb-6">
          <h2 className="text-sm font-semibold text-slate-300 mb-1 uppercase tracking-wider">
            Reveal Patient Details
          </h2>
          <p className="text-xs text-slate-500 mb-3">
            Enter the patient code to reveal their full information.
          </p>
          <div className="flex gap-2">
            <div className="flex-1 min-w-0">
              <Input
                placeholder="Enter patient code (e.g. LABA-8X4K29Q)"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRetrieve()}
                className="!bg-white !backdrop-blur-none border-slate-200 text-slate-800 placeholder-slate-300 font-mono w-full"
              />
            </div>
            <Button onClick={handleRetrieve} loading={retrieving} className="shrink-0 sm:px-6">
              <Search className="w-4 h-4" />
              Reveal
            </Button>
          </div>

          {retrievedRequest && (
            <button
              className="mt-4 w-full text-left p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl animate-slide-up hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all group"
              onClick={() => {
                setSelectedRequest(retrievedRequest);
                setMobileDetailOpen(true);
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-emerald-400 font-semibold uppercase tracking-wider">
                  Patient Revealed
                </p>
                <span className="text-xs text-emerald-600 group-hover:text-emerald-400 transition-colors flex items-center gap-1">
                  View details <ChevronRight className="w-3 h-3" />
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-400">Patient</p>
                  <p className="text-white font-medium">{retrievedRequest.patient_name}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Age / Sex</p>
                  <p className="text-white font-medium capitalize">
                    {displayAge(retrievedRequest) != null ? `${displayAge(retrievedRequest)} yrs` : "—"}{retrievedRequest.sex ? ` · ${retrievedRequest.sex}` : ""}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Referrer</p>
                  <p className="text-white font-medium">
                    {[retrievedRequest.doctor_prefix, retrievedRequest.doctor_name].filter(Boolean).join(" ")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Tests</p>
                  <p className="text-white font-medium line-clamp-1">{displayTests(retrievedRequest.tests)}</p>
                </div>
              </div>
              {(retrievedRequest.address || retrievedRequest.patient_phone) && (
                <p className="mt-2 text-xs text-slate-400 flex flex-wrap gap-x-4 gap-y-0.5">
                  {retrievedRequest.address && (
                    <span><span className="text-slate-500">Address: </span>{retrievedRequest.address}</span>
                  )}
                  {retrievedRequest.patient_phone && (
                    <span><span className="text-slate-500">Phone: </span>{retrievedRequest.patient_phone}</span>
                  )}
                </p>
              )}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Tabs + list */}
          <div className="lg:col-span-2">
            <div className="flex gap-1 mb-4 bg-white/5 rounded-xl p-1">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => { setActiveTab(tab.key); setSelectedRequest(null); }}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab.key
                      ? "bg-white/15 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {tab.icon}
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className={`text-xs rounded-full px-1.5 py-0.5 font-bold ${
                    activeTab === tab.key ? "bg-white/20 text-white" : "bg-white/10 text-slate-400"
                  }`}>
                    {counts[tab.key]}
                  </span>
                </button>
              ))}
            </div>

            <div className="mb-3 flex justify-end">
              <select
                value={requestSourceFilter}
                onChange={(e) => setRequestSourceFilter(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none cursor-pointer"
              >
                {SOURCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-slate-800">{o.label}</option>
                ))}
              </select>
            </div>

<div className="space-y-2">
              {loading ? (
                <div className="text-center py-16 text-slate-400">
                  <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin opacity-50" />
                  <p>Loading requests…</p>
                </div>
              ) : tabRequests.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <FlaskConical className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No {activeTab} requests</p>
                  <p className="text-sm mt-1 text-slate-500">
                    {activeTab === "incoming"
                      ? "New requests will appear here"
                      : activeTab === "seen"
                      ? "Retrieved requests appear here"
                      : "Completed requests appear here"}
                  </p>
                </div>
              ) : (
                tabRequests.map((req) => (
                  <button
                    key={req.id}
                    onClick={() => {
                      setSelectedRequest(selectedRequest?.id === req.id ? null : req);
                      if (selectedRequest?.id !== req.id) {
                        setMobileDetailOpen(true);
                      }
                    }}
                    className={`w-full text-left p-4 rounded-xl border transition-all ${
                      selectedRequest?.id === req.id
                        ? "bg-white/15 border-white/30"
                        : "bg-white/5 border-white/10 hover:bg-white/10"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {req.status === "incoming" ? (
                          /* Privacy mode — no name, no code */
                          <>
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-xs bg-slate-700/80 text-slate-300 px-2 py-0.5 rounded capitalize">
                                {req.sex ?? "—"}{displayAge(req) != null ? ` · ${displayAge(req)} yrs` : ""}
                              </span>
                              <SourceBadge source={req.source} />
                              {req.fast_mode && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded-full">⚡ Fast Mode</span>
                              )}
                            </div>
                            <div className="mt-1.5">
                              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Tests Requested</p>
                              <p className="text-sm font-semibold text-white leading-snug line-clamp-2">
                                {displayTests(req.tests)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <p className="text-xs text-slate-500 flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {format(new Date(req.created_at), "dd MMM yyyy")}
                              </p>
                              </div>
                          </>
                        ) : (
                          /* Full info for seen/done */
                          <>
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-semibold text-white truncate">{req.patient_name}</p>
                              <span className="font-mono text-xs text-medical-400 bg-medical-900/50 px-1.5 py-0.5 rounded shrink-0">
                                {req.code}
                              </span>
                              <SourceBadge source={req.source} className="shrink-0" />
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                              <span className="flex items-center gap-1">
                                <Stethoscope className="w-3 h-3" />
                                {req.doctor_name === "Self Service" ? (
                                  <span className="text-emerald-400 font-semibold">Self-Service Patient</span>
                                ) : (
                                  [req.doctor_prefix, req.doctor_name].filter(Boolean).join(" ")
                                )}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {format(new Date(req.created_at), "dd MMM yyyy")}
                              </span>
                            </div>
                            <div className="mt-1.5">
                              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-0.5">Tests</p>
                              <p className="text-sm font-semibold text-white line-clamp-1">
                                {displayTests(req.tests)}
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-500 shrink-0 mt-1" />
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right: Detail panel (desktop only) */}
          <div className="hidden lg:block">
            {selectedRequest ? (
              <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 sticky top-24 animate-slide-up">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-white">Details</h3>
                  <StatusBadge status={selectedRequest.status} />
                </div>

                {isRevealed ? (
                  <div className="space-y-4 text-sm">
                    {/* Tests & Diagnosis — prominent at top */}
                    <div className="bg-medical-900/30 border border-medical-700/30 rounded-xl p-3 space-y-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                      <p className="text-xs text-medical-400 font-semibold uppercase tracking-wider">Tests Requested</p>
                      {selectedRequest.fast_mode && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-bold uppercase tracking-wide">⚡ Fast Mode</span>
                      )}
                    </div>
                        <p className="text-white font-semibold leading-snug">{displayTests(selectedRequest.tests)}</p>
                      </div>
                      {selectedRequest.diagnosis && (
                        <div>
                          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">Diagnosis</p>
                          <p className="text-slate-200">{selectedRequest.diagnosis}</p>
                        </div>
                      )}
                    </div>
                    <div className="border-t border-white/10" />
                    <DetailRow label="Code">
                      <span className="font-mono font-bold text-medical-400">{selectedRequest.code}</span>
                    </DetailRow>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Patient</span>
                      <button
                        onClick={() => openEditPatient(selectedRequest)}
                        className="inline-flex items-center gap-1 text-xs text-medical-400 hover:text-medical-300 transition-colors"
                        title="Edit patient info"
                      >
                        <Pencil className="w-3 h-3" />
                        Edit
                      </button>
                    </div>
                    {selectedRequest.patient_name && (
                      <DetailRow label="Patient Name">{selectedRequest.patient_name}</DetailRow>
                    )}
                    {(displayAge(selectedRequest) != null || selectedRequest.sex) && (
                      <DetailRow label="Age / Sex">
                        {displayAge(selectedRequest) != null ? `${displayAge(selectedRequest)} yrs` : ""}{selectedRequest.sex ? `${displayAge(selectedRequest) != null ? " · " : ""}${selectedRequest.sex}` : ""}
                      </DetailRow>
                    )}
                    {selectedRequest.dob && (
                      <DetailRow label="Date of Birth">
                        {format(new Date(selectedRequest.dob), "dd MMM yyyy")}
                      </DetailRow>
                    )}
                    {selectedRequest.address && (
                      <DetailRow label="Address">{selectedRequest.address}</DetailRow>
                    )}
                    {selectedRequest.patient_email && (
                      <DetailRow label="Patient Email">{selectedRequest.patient_email}</DetailRow>
                    )}
                    {selectedRequest.patient_phone && (
                      <DetailRow label="Patient Phone">
                        <a
                          href={`tel:${selectedRequest.patient_phone}`}
                          className="text-blue-400 hover:underline flex items-center gap-1"
                        >
                          <Phone className="w-3 h-3" />
                          {selectedRequest.patient_phone}
                        </a>
                      </DetailRow>
                    )}
                    <div className="border-t border-white/10 pt-3" />
                    <DetailRow label="Referring Professional">
                      {[selectedRequest.doctor_prefix, selectedRequest.doctor_name].filter(Boolean).join(" ")}
                    </DetailRow>
                    <DetailRow label="Email">{selectedRequest.doctor_email}</DetailRow>
                    {selectedRequest.doctor_phone && (
                      <DetailRow label="Phone">
                        <a
                          href={`tel:${selectedRequest.doctor_phone}`}
                          className="text-blue-400 hover:underline flex items-center gap-1"
                        >
                          <Phone className="w-3 h-3" />
                          {selectedRequest.doctor_phone}
                        </a>
                      </DetailRow>
                    )}
                    {selectedRequest.doctor_hospital && (
                      <DetailRow label="Hospital/Clinic">{selectedRequest.doctor_hospital}</DetailRow>
                    )}
                    <DetailRow label="Submitted">
                      {format(new Date(selectedRequest.created_at), "dd MMM yyyy HH:mm")}
                    </DetailRow>
                    {selectedRequest.seen_at && (
                      <DetailRow label="Retrieved">
                        {format(new Date(selectedRequest.seen_at), "dd MMM yyyy HH:mm")}
                      </DetailRow>
                    )}
                    {selectedRequest.updated_at && (
                      <DetailRow label="Last updated">
                        {format(new Date(selectedRequest.updated_at), "dd MMM yyyy HH:mm")}
                      </DetailRow>
                    )}
                    {/* Flags */}
                    {(selectedRequest.is_critical || selectedRequest.needs_ambulance || selectedRequest.has_free_ride) && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {selectedRequest.is_critical && (
                          <span className="flex items-center gap-1 text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30 px-2.5 py-1 rounded-full">
                            <AlertTriangle className="w-3 h-3" />
                            Critical Patient
                          </span>
                        )}
                        {selectedRequest.needs_ambulance && (
                          <span className="flex items-center gap-1 text-xs font-semibold bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2.5 py-1 rounded-full">
                            <Truck className="w-3 h-3" />
                            Ambulance Requested
                          </span>
                        )}
                        {selectedRequest.has_free_ride && (
                          <span className="flex items-center gap-1 text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-full">
                            <Truck className="w-3 h-3" />
                            Free Ride (redeem within 7 days)
                          </span>
                        )}
                      </div>
                    )}
                    {/* Test request image */}
                    {selectedRequest.test_image_url && (
                      <DetailRow label="Test Request Image">
                        <a
                          href={selectedRequest.test_image_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 hover:border-blue-500/40 transition-all group"
                        >
                          <div className="w-9 h-9 rounded-xl bg-blue-500/20 group-hover:bg-blue-500/30 flex items-center justify-center shrink-0 transition-colors">
                            <FileImage className="w-4.5 h-4.5 text-blue-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-blue-300 leading-tight">Test Request Image</p>
                            <p className="text-xs text-blue-400/70 mt-0.5">Tap to open</p>
                          </div>
                          <ExternalLink className="w-3.5 h-3.5 text-blue-400/60 group-hover:text-blue-300 transition-colors shrink-0 ml-auto" />
                        </a>
                      </DetailRow>
                    )}
                  </div>
                ) : (
                  /* Incoming: restricted view */
                  <div className="space-y-4 text-sm">
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2">
                      <EyeOff className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-300">
                        Patient details are hidden. Enter the code above to reveal.
                      </p>
                    </div>
                    {(displayAge(selectedRequest) != null || selectedRequest.sex) && (
                      <DetailRow label="Age / Sex">
                        {displayAge(selectedRequest) != null ? `${displayAge(selectedRequest)} yrs` : ""}{selectedRequest.sex ? `${displayAge(selectedRequest) != null ? " · " : ""}${selectedRequest.sex}` : ""}
                      </DetailRow>
                    )}
                    {selectedRequest.dob && (
                      <DetailRow label="Date of Birth">
                        {format(new Date(selectedRequest.dob), "dd MMM yyyy")}
                      </DetailRow>
                    )}
                    <div className="border-t border-white/10 pt-3" />
                    <DetailRow label="Tests">
                      {selectedRequest.tests === "See attached image" ? (
                        <span className="text-white font-medium">See attached image</span>
                      ) : (
                        <ul className="space-y-1 mt-0.5">
                          {selectedRequest.tests
                            .split(/[,\n]+/)
                            .map((t) => t.trim())
                            .filter(Boolean)
                            .map((test, i) => (
                              <li key={i} className="text-white font-medium text-sm flex items-start gap-1.5">
                                <span className="text-slate-500 mt-0.5 shrink-0">·</span>
                                {test}
                              </li>
                            ))}
                        </ul>
                      )}
                    </DetailRow>
                    {selectedRequest.diagnosis && (
                      <DetailRow label="Diagnosis">{selectedRequest.diagnosis}</DetailRow>
                    )}
                    {selectedRequest.test_image_url && (
                      <DetailRow label="Test Request Image">
                        <a
                          href={selectedRequest.test_image_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 hover:border-blue-500/40 transition-all group"
                        >
                          <div className="w-9 h-9 rounded-xl bg-blue-500/20 group-hover:bg-blue-500/30 flex items-center justify-center shrink-0 transition-colors">
                            <FileImage className="w-4 h-4 text-blue-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-blue-300 leading-tight">Test Request Image</p>
                            <p className="text-xs text-blue-400/70 mt-0.5">Click to open</p>
                          </div>
                          <ExternalLink className="w-3.5 h-3.5 text-blue-400/60 group-hover:text-blue-300 transition-colors shrink-0 ml-auto" />
                        </a>
                      </DetailRow>
                    )}
                    <DetailRow label="Submitted">
                      {format(new Date(selectedRequest.created_at), "dd MMM yyyy HH:mm")}
                    </DetailRow>
                  </div>
                )}

                {selectedRequest.status === "seen" && (
                  <div className="mt-5">
                    <Button
                      variant="success"
                      fullWidth
                      loading={updatingId === selectedRequest.id}
                      onClick={() => openResultsModal(selectedRequest)}
                    >
                      <CheckCircle className="w-4 h-4" />
                      Mark Tests as Done
                    </Button>
                    <p className="text-xs text-slate-400 text-center mt-2">
                      Attach results or skip to notify doctor
                    </p>
                  </div>
                )}
                {selectedRequest.status === "done" && (
                  <div className="mt-5">
                    <Button
                      variant="secondary"
                      fullWidth
                      onClick={() => openResultsModal(selectedRequest)}
                    >
                      <Send className="w-4 h-4" />
                      Send Results
                    </Button>
                    <p className="text-xs text-slate-400 text-center mt-2">
                      Attach a result that became available later
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center text-slate-400">
                <FlaskConical className="w-8 h-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Select a request to view details</p>
              </div>
            )}
          </div>
        </div>

        {/* Results modal */}
        {resultsModalRequest && (() => {
          const isSeenRequest = resultsModalRequest.status === "seen";
          const hasContent = resultFiles.length > 0 || resultLink.trim().length > 0;
          const contactNextDisabled = !contactPhone.trim() || !contactEmail.trim() || updatingContact;
          return (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-0 sm:px-4">
              <div className="w-full sm:max-w-lg bg-slate-900 border border-white/15 rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto animate-slide-up">

                {/* Modal header */}
                <div className="sticky top-0 bg-slate-900 border-b border-white/10 p-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-white text-base">
                      {isSeenRequest ? "Mark Done & Send Results" : "Send Results"}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {resultsModalRequest.patient_name} &middot; {resultsModalRequest.code}
                    </p>
                    <p className="text-xs text-medical-400 font-medium mt-1">
                      {resultsStep === 1 ? "Step 1 of 2: Patient Contact" : "Step 2 of 2: Send Results"}
                    </p>
                  </div>
                  <button
                    onClick={closeResultsModal}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors shrink-0"
                    title="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Step 1 — Contact Verification */}
                {resultsStep === 1 && (
                  <div className="p-5 space-y-5">
                    <p className="text-sm text-slate-300">
                      Verify the patient&apos;s contact details before sending results. Both fields are required.
                    </p>

                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        <Phone className="w-3.5 h-3.5" />
                        Patient Phone <span className="text-red-400 ml-0.5">*</span>
                      </label>
                      <input
                        type="tel"
                        placeholder="+234 800 000 0000"
                        value={contactPhone}
                        onChange={(e) => { setContactPhone(e.target.value); if (contactError) setContactError(""); }}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-medical-500/50 focus:border-medical-500/50 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        Patient Email <span className="text-red-400 ml-0.5">*</span>
                      </label>
                      <input
                        type="email"
                        placeholder="patient@example.com"
                        value={contactEmail}
                        onChange={(e) => { setContactEmail(e.target.value); if (contactError) setContactError(""); }}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-medical-500/50 focus:border-medical-500/50 transition-colors"
                      />
                    </div>

                    {contactError && (
                      <p className="text-xs text-red-400 font-medium">{contactError}</p>
                    )}

                    <div className="flex flex-col gap-2 pt-1">
                      <Button
                        variant="success"
                        fullWidth
                        loading={updatingContact}
                        disabled={contactNextDisabled}
                        onClick={handleContactNext}
                      >
                        Next
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                      {(!contactPhone.trim() || !contactEmail.trim()) && (
                        <p className="text-center text-xs text-slate-500">
                          Both phone and email are required to continue.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Step 2 — Clinical Content */}
                {resultsStep === 2 && (
                  <div className="p-5 space-y-5">
                    <p className="text-sm text-slate-300">
                      {isSeenRequest
                        ? "Attach results below to email them to the doctor and patient. Or skip to just mark as done and notify the doctor."
                        : "Send additional results that became available after the request was completed."}
                    </p>

                    {/* PDF attachments */}
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        <Paperclip className="w-3.5 h-3.5" />
                        PDF Attachments <span className="normal-case font-normal text-slate-500">(optional, max 5 · 10 MB each)</span>
                      </label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/pdf"
                        multiple
                        onChange={(e) => {
                          const picked = Array.from(e.target.files ?? []);
                          if (picked.length) setResultFiles((prev) => [...prev, ...picked]);
                          // Reset so the same file can be re-picked if removed
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                        className="w-full text-sm text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-white/10 file:text-white file:font-medium hover:file:bg-white/20 file:cursor-pointer cursor-pointer bg-white/5 border border-white/10 rounded-xl px-3 py-2.5"
                      />
                      {resultFiles.length > 0 && (
                        <ul className="mt-2 space-y-1.5">
                          {resultFiles.map((f, i) => (
                            <li key={i} className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                              <span className="text-xs text-emerald-300 truncate">{f.name}</span>
                              <button
                                onClick={() => removeFile(i)}
                                className="ml-2 text-slate-400 hover:text-white shrink-0"
                                title="Remove"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Result link */}
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        <Link2 className="w-3.5 h-3.5" />
                        Result Link <span className="normal-case font-normal text-slate-500">(optional)</span>
                      </label>
                      <input
                        type="url"
                        placeholder="https://results.example.com/..."
                        value={resultLink}
                        onChange={(e) => setResultLink(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-medical-500/50 focus:border-medical-500/50 transition-colors"
                      />
                    </div>

                    {/* Note from laboratory */}
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        Note from Laboratory <span className="normal-case font-normal text-slate-500">(optional)</span>
                      </label>
                      <textarea
                        rows={3}
                        placeholder="e.g. Culture results may follow within 48 hours…"
                        value={resultNote}
                        onChange={(e) => setResultNote(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-medical-500/50 focus:border-medical-500/50 transition-colors resize-none"
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2 pt-1">
                      <Button
                        variant="success"
                        fullWidth
                        loading={sendingResults}
                        disabled={!hasContent}
                        onClick={handleSendResults}
                      >
                        <Send className="w-4 h-4" />
                        {isSeenRequest ? "Send Results & Mark Done" : "Send Results"}
                      </Button>
                      {!hasContent && (
                        <p className="text-center text-xs text-slate-500">
                          Add a PDF or a link to enable sending.
                        </p>
                      )}
                      {isSeenRequest && (
                        <button
                          onClick={() => handleSkipResults(resultsModalRequest)}
                          disabled={sendingResults}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
                        >
                          <SkipForward className="w-4 h-4" />
                          Skip — mark done &amp; notify doctor only
                        </button>
                      )}
                      <button
                        onClick={() => setResultsStep(1)}
                        disabled={sendingResults}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Back
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        </div>
        )} {/* end mainView === "requests" */}

        {/* Change Password modal */}
        {changePasswordOpen && <ChangePasswordModal onClose={() => setChangePasswordOpen(false)} />}

        {/* Lab Profile modal — global so it works from any tab */}
        {profileOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-0 sm:px-4">
            <div className="w-full sm:max-w-lg bg-slate-900 border border-white/15 rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto animate-slide-up">
              {/* Header */}
              <div className="sticky top-0 bg-slate-900 border-b border-white/10 p-4 flex items-center justify-between">
                <h3 className="font-semibold text-white">Lab Profile</h3>
                <button onClick={() => setProfileOpen(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-5">
                {/* Identity */}
                <div className="flex items-center gap-4">
                  {labLogoUrl ? (
                    <img src={labLogoUrl} alt={labName} className="w-16 h-16 rounded-2xl object-cover border border-white/10 shrink-0" />
                  ) : (
                    <div className="w-16 h-16 bg-medical-700/50 rounded-2xl flex items-center justify-center shrink-0">
                      <FlaskConical className="w-8 h-8 text-medical-400" />
                    </div>
                  )}
                  <div>
                    <h2 className="font-bold text-white text-lg leading-tight">{labName}</h2>
                    {lab.description && <p className="text-sm text-slate-400 mt-1 leading-relaxed">{lab.description}</p>}
                  </div>
                </div>

                {/* Onboarding QR — print/download for physical display */}
                {(isOwner || canManageRoles) && <LabQrCard slug={lab.slug ?? null} />}

                {/* Contact */}
                {(() => {
                  const waNumbers: string[] = lab.whatsapp
                    ? (() => { try { const p = JSON.parse(lab.whatsapp); return Array.isArray(p) ? p : [lab.whatsapp]; } catch { return [lab.whatsapp]; } })()
                    : [];
                  const hasContact = lab.address || parsePhones(lab.phones).length > 0 || waNumbers.filter(Boolean).length > 0;
                  return hasContact ? (
                    <div className="bg-white/5 border border-white/8 rounded-xl p-4 space-y-2">
                      <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-3">Contact</p>
                      {lab.address && (
                        <div className="flex items-start gap-2 text-sm text-slate-300">
                          <MapPin className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                          <span>{lab.address}</span>
                        </div>
                      )}
                      {parsePhones(lab.phones).map((ph, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <Phone className="w-4 h-4 text-slate-500 shrink-0" />
                          <a href={`tel:${ph.number}`} className="text-blue-400 hover:underline">
                            {ph.label && <span className="text-slate-500 text-xs mr-1">{ph.label}:</span>}{ph.number}
                          </a>
                        </div>
                      ))}
                      {waNumbers.filter(Boolean).map((num, i) => (
                        <div key={`wa-${i}`} className="flex items-center gap-2 text-sm">
                          <MessageCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                          <a href={`https://wa.me/${num.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline flex items-center gap-1">
                            {num}
                            <span className="text-xs bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded-full border border-emerald-500/20 ml-1">WhatsApp</span>
                          </a>
                        </div>
                      ))}
                    </div>
                  ) : null;
                })()}

                {/* Service Categories */}
                {lab.service_categories.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Layers className="w-4 h-4 text-slate-500" />
                      <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Services Offered</p>
                    </div>
                    {SERVICE_CATEGORIES.map(({ group, items }) => {
                      const active = items.filter((i) => lab.service_categories.includes(i));
                      if (!active.length) return null;
                      return (
                        <div key={group} className="mb-3">
                          <p className="text-xs text-slate-600 font-medium mb-1.5">{group}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {active.map((s) => (
                              <span key={s} className="text-xs bg-medical-900/50 text-medical-300 border border-medical-800/40 px-2.5 py-1 rounded-full">{s}</span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Certifications */}
                {lab.certifications.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Shield className="w-4 h-4 text-amber-500" />
                      <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Certifications & Accreditations</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {lab.certifications.map((c) => (
                        <span key={c} className="flex items-center gap-1.5 text-xs bg-amber-900/20 text-amber-400 border border-amber-800/30 px-2.5 py-1 rounded-full">
                          <Shield className="w-3 h-3" />{c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {lab.service_categories.length === 0 && lab.certifications.length === 0 && !lab.address && parsePhones(lab.phones).length === 0 && !isOwner && (
                  <p className="text-center text-slate-500 text-sm py-6">No additional profile information yet.</p>
                )}

                {/* Team management moved to its own nav tab */}
                {(isOwner || canManageRoles) && (
                  <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <p className="text-sm text-slate-300">Team members, marketers and roles now live in the <span className="font-semibold text-white">Team</span> tab.</p>
                    <button
                      onClick={() => { setProfileOpen(false); navigateToTab("team"); }}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-medical-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-medical-700"
                    >
                      <Users className="w-3.5 h-3.5" /> Open Team
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Mobile detail modal */}
        {mainView === "requests" && mobileDetailOpen && selectedRequest && (
          <div className="fixed inset-0 z-40 lg:hidden flex items-end bg-black/60 backdrop-blur-sm">
            <div className="w-full bg-slate-900 border-t border-white/10 rounded-t-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
              <div className="sticky top-0 bg-slate-900 border-b border-white/10 p-4 flex items-center justify-between">
                <h3 className="font-semibold text-white">Request Details</h3>
                <button onClick={() => setMobileDetailOpen(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 space-y-4 text-sm">
                {/* Tests & Diagnosis — prominent at top */}
                <div className="bg-medical-900/30 border border-medical-700/30 rounded-xl p-3 space-y-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-xs text-medical-400 font-semibold uppercase tracking-wider">Tests Requested</p>
                      {selectedRequest.fast_mode && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-bold uppercase tracking-wide">⚡ Fast Mode</span>
                      )}
                    </div>
                    <p className="text-white font-semibold leading-snug">{displayTests(selectedRequest.tests)}</p>
                  </div>
                  {selectedRequest.diagnosis && (
                    <div>
                      <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">Diagnosis</p>
                      <p className="text-slate-200">{selectedRequest.diagnosis}</p>
                    </div>
                  )}
                </div>
                <div className="border-t border-white/10" />
                {selectedRequest.status !== "incoming" ? (
                  <>
                    <div>
                      <p className="text-xs text-slate-500 font-medium mb-0.5">Code</p>
                      <p className="font-mono font-bold text-medical-400">{selectedRequest.code}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-slate-500 font-medium mb-0.5">Patient Name</p>
                        <p className="text-slate-200">{selectedRequest.patient_name ?? "—"}</p>
                      </div>
                      <button
                        onClick={() => { openEditPatient(selectedRequest); setMobileDetailOpen(false); }}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-medical-400 hover:text-medical-300 bg-medical-600/20 hover:bg-medical-600/30 px-3 py-1.5 rounded-lg transition"
                      >
                        <Pencil className="w-3 h-3" />
                        Edit Patient
                      </button>
                    </div>
                  </>
                ) : null}
                <div>
                  <p className="text-xs text-slate-500 font-medium mb-0.5">Age / Sex</p>
                  <p className="text-slate-200 capitalize">{displayAge(selectedRequest) != null ? `${displayAge(selectedRequest)} yrs` : "—"}{selectedRequest.sex ? ` · ${selectedRequest.sex}` : ""}</p>
                </div>
                {selectedRequest.dob && (
                  <div>
                    <p className="text-xs text-slate-500 font-medium mb-0.5">Date of Birth</p>
                    <p className="text-slate-200">{format(new Date(selectedRequest.dob), "dd MMM yyyy")}</p>
                  </div>
                )}
                {selectedRequest.status !== "incoming" && selectedRequest.address && (
                  <div>
                    <p className="text-xs text-slate-500 font-medium mb-0.5">Address</p>
                    <p className="text-slate-200">{selectedRequest.address}</p>
                  </div>
                )}
                {selectedRequest.status !== "incoming" && selectedRequest.patient_email && (
                  <div>
                    <p className="text-xs text-slate-500 font-medium mb-0.5">Patient Email</p>
                    <p className="text-slate-200">{selectedRequest.patient_email}</p>
                  </div>
                )}
                {selectedRequest.status !== "incoming" && selectedRequest.patient_phone && (
                  <div>
                    <p className="text-xs text-slate-500 font-medium mb-0.5">Patient Phone</p>
                    <a href={`tel:${selectedRequest.patient_phone}`} className="text-blue-400 hover:underline flex items-center gap-1 text-sm">
                      <Phone className="w-3 h-3" />{selectedRequest.patient_phone}
                    </a>
                  </div>
                )}
                <div className="border-t border-white/10 pt-3" />
                {selectedRequest.status !== "incoming" && (
                  <>
                    <div>
                      <p className="text-xs text-slate-500 font-medium mb-0.5">Referring Professional</p>
                      <p className="text-slate-200">
                        {[selectedRequest.doctor_prefix, selectedRequest.doctor_name].filter(Boolean).join(" ")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium mb-0.5">Email</p>
                      <p className="text-slate-200">{selectedRequest.doctor_email}</p>
                    </div>
                    {selectedRequest.doctor_phone && (
                      <div>
                        <p className="text-xs text-slate-500 font-medium mb-0.5">Phone</p>
                        <a href={`tel:${selectedRequest.doctor_phone}`} className="text-blue-400 hover:underline flex items-center gap-1 text-sm">
                          <Phone className="w-3 h-3" />{selectedRequest.doctor_phone}
                        </a>
                      </div>
                    )}
                    {selectedRequest.doctor_hospital && (
                      <div>
                        <p className="text-xs text-slate-500 font-medium mb-0.5">Hospital/Clinic</p>
                        <p className="text-slate-200">{selectedRequest.doctor_hospital}</p>
                      </div>
                    )}
                  </>
                )}
                <div>
                  <p className="text-xs text-slate-500 font-medium mb-0.5">Submitted</p>
                  <p className="text-slate-200">{format(new Date(selectedRequest.created_at), "dd MMM yyyy HH:mm")}</p>
                </div>
                {selectedRequest.seen_at && (
                  <div>
                    <p className="text-xs text-slate-500 font-medium mb-0.5">Retrieved</p>
                    <p className="text-slate-200">{format(new Date(selectedRequest.seen_at), "dd MMM yyyy HH:mm")}</p>
                  </div>
                )}
                {selectedRequest.updated_at && (
                  <div>
                    <p className="text-xs text-slate-500 font-medium mb-0.5">Last updated</p>
                    <p className="text-slate-200">{format(new Date(selectedRequest.updated_at), "dd MMM yyyy HH:mm")}</p>
                  </div>
                )}
                {/* Flags */}
                {(selectedRequest.is_critical || selectedRequest.needs_ambulance || selectedRequest.has_free_ride) && (
                  <div className="flex flex-wrap gap-2">
                    {selectedRequest.is_critical && (
                      <span className="flex items-center gap-1 text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30 px-2.5 py-1 rounded-full">
                        <AlertTriangle className="w-3 h-3" />
                        Critical Patient
                      </span>
                    )}
                    {selectedRequest.needs_ambulance && (
                      <span className="flex items-center gap-1 text-xs font-semibold bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2.5 py-1 rounded-full">
                        <Truck className="w-3 h-3" />
                        Ambulance Requested
                      </span>
                    )}
                    {selectedRequest.has_free_ride && (
                      <span className="flex items-center gap-1 text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-full">
                        <Truck className="w-3 h-3" />
                        Free Ride (redeem within 7 days)
                      </span>
                    )}
                  </div>
                )}
                {/* Test request image */}
                {selectedRequest.test_image_url && (
                  <div>
                    <p className="text-xs text-slate-500 font-medium mb-1.5">Test Request Image</p>
                    <a
                      href={selectedRequest.test_image_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 hover:border-blue-500/40 transition-all group"
                    >
                      <div className="w-9 h-9 rounded-xl bg-blue-500/20 group-hover:bg-blue-500/30 flex items-center justify-center shrink-0 transition-colors">
                        <FileImage className="w-4 h-4 text-blue-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-blue-300 leading-tight">Test Request Image</p>
                        <p className="text-xs text-blue-400/70 mt-0.5">Tap to open</p>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-blue-400/60 group-hover:text-blue-300 transition-colors shrink-0 ml-auto" />
                    </a>
                  </div>
                )}
                {selectedRequest.status === "seen" && (
                  <div className="border-t border-white/10 pt-4">
                    <Button variant="success" fullWidth loading={updatingId === selectedRequest.id} onClick={() => { setMobileDetailOpen(false); openResultsModal(selectedRequest); }}>
                      <CheckCircle className="w-4 h-4" />
                      Mark Tests as Done
                    </Button>
                    <p className="text-xs text-slate-400 text-center mt-2">Attach results or skip to notify doctor</p>
                  </div>
                )}
                {selectedRequest.status === "done" && (
                  <div className="border-t border-white/10 pt-4">
                    <Button variant="secondary" fullWidth onClick={() => { setMobileDetailOpen(false); openResultsModal(selectedRequest); }}>
                      <Send className="w-4 h-4" />
                      Send Results
                    </Button>
                    <p className="text-xs text-slate-400 text-center mt-2">Attach a result that became available later</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      {/* Patient info edit modal */}
      {editPatientRequest && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full sm:max-w-md bg-slate-900 border border-white/15 rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90dvh] flex flex-col">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10 shrink-0">
              <div className="w-8 h-8 rounded-xl bg-medical-600/30 flex items-center justify-center shrink-0">
                <UserCircle className="w-4 h-4 text-medical-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">Edit Patient Info</p>
                <p className="text-xs text-slate-400 font-mono">{editPatientRequest.code}</p>
              </div>
              <button
                onClick={() => setEditPatientRequest(null)}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              <p className="text-xs text-slate-400">Changes will also reflect on the patient&apos;s portal profile.</p>
              {[
                { key: "patient_name", label: "Full Name", type: "text", placeholder: "Patient full name" },
                { key: "patient_phone", label: "Phone", type: "tel", placeholder: "+234 800 000 0000" },
                { key: "patient_email", label: "Email", type: "email", placeholder: "patient@email.com" },
                { key: "age", label: "Age", type: "number", placeholder: "e.g. 42" },
                { key: "address", label: "Address", type: "text", placeholder: "Home address" },
              ].map(({ key, label, type, placeholder }) => (
                <div key={key}>
                  <label className="text-xs font-medium text-slate-400 block mb-1">{label}</label>
                  <input
                    type={type}
                    value={editPatientForm[key as keyof typeof editPatientForm]}
                    onChange={(e) => setEditPatientForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-400 placeholder-slate-500 transition"
                  />
                </div>
              ))}
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Sex</label>
                <select
                  value={editPatientForm.sex}
                  onChange={(e) => setEditPatientForm((f) => ({ ...f, sex: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 transition"
                >
                  <option value="">Not specified</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-white/10 flex gap-3 shrink-0">
              <button
                onClick={() => setEditPatientRequest(null)}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 font-semibold text-sm hover:bg-white/5 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePatient}
                disabled={savingPatient}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-medical-600 hover:bg-medical-500 disabled:opacity-60 text-white font-semibold text-sm transition shadow-sm"
              >
                {savingPatient ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Save</>}
              </button>
            </div>
          </div>
        </div>
      )}
      </main>
      </div>

      {/* Global queue notification — every tab, clears when addressed */}
      {(isOwner || canMarkSeen) && (
        <QueueNotifyFab labId={lab.id} active={mainView === "queue"} onOpenQueue={() => navigateToTab("queue")} />
      )}
    </div>
    </TourProvider>
  );
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  login:               { label: "Signed in",          color: "text-emerald-400 bg-emerald-400/10" },
  logout:              { label: "Signed out",          color: "text-slate-400 bg-white/5" },
  password_change:     { label: "Password changed",    color: "text-amber-400 bg-amber-400/10" },
  request_seen:        { label: "Patient seen",        color: "text-blue-400 bg-blue-400/10" },
  request_done:        { label: "Marked done",         color: "text-emerald-400 bg-emerald-400/10" },
  results_sent:        { label: "Results sent",        color: "text-medical-400 bg-medical-400/10" },
  team_member_added:   { label: "Member added",        color: "text-indigo-400 bg-indigo-400/10" },
  team_member_removed: { label: "Member removed",      color: "text-red-400 bg-red-400/10" },
};

interface ActivityRecord {
  id: string;
  actor_email: string;
  actor_role: string;
  action: string;
  detail: string | null;
  created_at: string;
}

function LabActivityView() {
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingAct, setLoadingAct] = useState(true);
  const [offset, setOffset] = useState(0);
  const PAGE = 50;

  const fetchActivities = useCallback(async (off: number) => {
    setLoadingAct(true);
    try {
      const res = await fetch(`/api/lab/activity?limit=${PAGE}&offset=${off}`);
      const data = await res.json();
      if (data.success) { setActivities(data.activities ?? []); setTotal(data.total ?? 0); }
    } catch { /* ignore */ } finally { setLoadingAct(false); }
  }, []);

  useEffect(() => { fetchActivities(0); }, [fetchActivities]);

  function loadPage(off: number) { setOffset(off); fetchActivities(off); }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-white text-base">Team Activity</h2>
          <p className="text-xs text-slate-500 mt-0.5">Actions taken by all lab members</p>
        </div>
        <span className="text-xs text-slate-500 bg-white/5 border border-white/8 rounded-full px-2.5 py-1">{total} records</span>
      </div>

      {loadingAct ? (
        <div className="flex justify-center py-16">
          <RefreshCw className="w-6 h-6 text-slate-500 animate-spin" />
        </div>
      ) : activities.length === 0 ? (
        <div className="text-center py-16">
          <Activity className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium text-sm">No activity recorded yet</p>
          <p className="text-slate-500 text-xs mt-1">Activity will appear here as team members use the dashboard</p>
        </div>
      ) : (
        <div className="space-y-2">
          {activities.map((a) => {
            const meta = ACTION_LABELS[a.action] ?? { label: a.action, color: "text-slate-400 bg-white/5" };
            return (
              <div key={a.id} className="bg-white/5 border border-white/8 rounded-xl px-3 py-3 sm:px-4">
                {/* Top row: badge + timestamp */}
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${meta.color}`}>{meta.label}</span>
                  <p className="text-xs text-slate-600 shrink-0">{format(new Date(a.created_at), "dd MMM, HH:mm")}</p>
                </div>
                {/* Actor */}
                <p className="text-xs text-slate-300 break-all">
                  <span className="font-semibold text-white">{a.actor_email}</span>
                  {a.actor_role !== "owner" && <span className="text-slate-500 ml-1">({a.actor_role})</span>}
                </p>
                {a.detail && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{a.detail}</p>}
              </div>
            );
          })}
        </div>
      )}

      {total > PAGE && (
        <div className="flex items-center justify-between pt-2">
          <button onClick={() => loadPage(Math.max(0, offset - PAGE))} disabled={offset === 0}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white disabled:opacity-30 transition px-3 py-2 rounded-lg hover:bg-white/5">
            <ChevronLeft className="w-3.5 h-3.5" />Previous
          </button>
          <span className="text-xs text-slate-500">{offset + 1}–{Math.min(offset + PAGE, total)} of {total}</span>
          <button onClick={() => loadPage(offset + PAGE)} disabled={offset + PAGE >= total}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white disabled:opacity-30 transition px-3 py-2 rounded-lg hover:bg-white/5">
            Next<ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

interface FeedbackRecord {
  id: string;
  reviewer_email: string;
  reviewer_type: string;
  is_anonymous: boolean;
  display_name: string | null;
  rating_overall: number;
  rating_accuracy: number | null;
  rating_speed: number | null;
  rating_staff: number | null;
  rating_environment: number | null;
  comment: string | null;
  created_at: string;
  updated_at: string;
}

interface FeedbackAverages {
  overall: number | null;
  accuracy: number | null;
  speed: number | null;
  staff: number | null;
  environment: number | null;
}

function FeedbackStars({ value, size = "sm" }: { value: number | null; size?: "sm" | "md" }) {
  if (value == null) return <span className="text-xs text-slate-500">No data</span>;
  const sz = size === "md" ? "w-4 h-4" : "w-3.5 h-3.5";
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`${sz} ${i <= Math.round(value) ? "text-amber-400 fill-amber-400" : "text-slate-600"}`} />
      ))}
      <span className="text-xs text-slate-400 ml-1">{value.toFixed(1)}</span>
    </div>
  );
}

function LabFeedbackView({ labId, labSlug }: { labId: string; labSlug: string | null }) {
  const [feedbacks, setFeedbacks] = useState<FeedbackRecord[]>([]);
  const [averages, setAverages] = useState<FeedbackAverages | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [filterType, setFilterType] = useState<"all" | "qr" | "patient" | "doctor">("all");
  // Shareable feedback link + QR (printed and displayed at the lab)
  const [fbUrl, setFbUrl] = useState("");
  const [fbQr, setFbQr] = useState<string | null>(null);
  const PAGE = 20;

  useEffect(() => {
    if (!labSlug || typeof window === "undefined") return;
    const link = `${window.location.origin}/f/${labSlug}`;
    setFbUrl(link);
    import("qrcode")
      .then((m) => (m.default ?? m).toDataURL(link, { width: 480, margin: 1, color: { dark: "#0f172a", light: "#ffffff" } }))
      .then(setFbQr)
      .catch(() => {});
  }, [labSlug]);

  const fetchFeedback = useCallback(async (off: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/lab/feedback?limit=${PAGE}&offset=${off}`);
      const data = await res.json();
      if (data.success) {
        setFeedbacks(data.feedbacks ?? []);
        setAverages(data.averages ?? null);
        setTotal(data.total ?? 0);
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchFeedback(0); }, [fetchFeedback]);

  function loadPage(off: number) { setOffset(off); fetchFeedback(off); }

  const filtered = filterType === "all" ? feedbacks : feedbacks.filter((f) => f.reviewer_type === filterType);

  const aspectLabels: { key: keyof FeedbackAverages; label: string }[] = [
    { key: "overall", label: "Overall" },
    { key: "accuracy", label: "Accuracy" },
    { key: "speed", label: "Speed" },
    { key: "staff", label: "Staff" },
    { key: "environment", label: "Environment" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold text-white text-base">Client Feedback</h2>
          <p className="text-xs text-slate-500 mt-0.5">Reviews from patients, doctors and your in-lab QR / link</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 bg-white/5 border border-white/8 rounded-full px-2.5 py-1">{total} review{total !== 1 ? "s" : ""}</span>
          <button onClick={() => { setOffset(0); fetchFeedback(0); }} className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Feedback link + QR — print and display so clients can review via QR */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-white"><QrCode className="w-4 h-4 text-medical-300" /> Collect feedback with a link or QR code</p>
        <p className="mt-1 text-xs text-slate-400">Share the link or print the QR code and display it at your desk. Clients enter their name and email, then rate their experience — reviews land here tagged &ldquo;QR&rdquo;.</p>
        {!labSlug ? (
          <div className="mt-3 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-200">Set a public URL slug for your lab to enable the feedback link and QR.</div>
        ) : (
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="shrink-0 self-center rounded-2xl bg-white p-2.5 sm:self-start">
              {fbQr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fbQr} alt="Feedback QR" className="h-32 w-32" />
              ) : (
                <div className="flex h-32 w-32 items-center justify-center"><RefreshCw className="h-5 w-5 animate-spin text-slate-400" /></div>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <input readOnly value={fbUrl} className="min-w-0 flex-1 truncate rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-slate-300" />
                <button
                  onClick={() => { navigator.clipboard?.writeText(fbUrl); toast.success("Feedback link copied"); }}
                  className="rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/5 hover:text-white" title="Copy link"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <a href={fbUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/5 hover:text-white" title="Open feedback page">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
              <button
                onClick={() => {
                  if (!fbQr) return;
                  const a = document.createElement("a");
                  a.href = fbQr;
                  a.download = `${labSlug}-feedback-qr.png`;
                  a.click();
                }}
                disabled={!fbQr}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/5 disabled:opacity-50"
              >
                <ArrowUpRight className="h-4 w-4 rotate-45" /> Download QR image
              </button>
              <p className="text-[11px] text-slate-500">Tip: stick the QR next to your exit or reception so clients can review while they wait.</p>
            </div>
          </div>
        )}
      </div>

      {/* Averages overview */}
      {averages && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Rating Overview</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
            {aspectLabels.map(({ key, label }) => (
              <div key={key} className={`flex flex-col gap-1.5 ${key === "overall" ? "col-span-2 sm:col-span-1" : ""}`}>
                <p className="text-xs text-slate-500 font-medium">{label}</p>
                {averages[key] != null ? (
                  <>
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star key={i} className={`w-4 h-4 ${i <= Math.round(averages[key]!) ? "text-amber-400 fill-amber-400" : "text-slate-600"}`} />
                      ))}
                    </div>
                    <p className={`text-xl font-bold ${key === "overall" ? "text-amber-400" : "text-white"}`}>{averages[key]!.toFixed(1)}</p>
                  </>
                ) : (
                  <p className="text-sm text-slate-600 italic">No data</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-500 font-medium">Filter:</span>
        {(["all", "qr", "patient", "doctor"] as const).map((t) => (
          <button key={t} onClick={() => setFilterType(t)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors capitalize ${
              filterType === t ? "bg-medical-600 text-white" : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
            }`}>
            {t === "all" ? "All" : t === "qr" ? "QR / in-lab" : t === "patient" ? "Patients" : "Doctors"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <RefreshCw className="w-6 h-6 text-slate-500 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <MessageSquare className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium text-sm">No feedback yet</p>
          <p className="text-slate-500 text-xs mt-1">Share your feedback link or QR code above — reviews will appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((fb) => {
            const reviewer = fb.is_anonymous
              ? (fb.display_name ?? "Anonymous")
              : fb.reviewer_type === "qr"
              ? (fb.display_name ?? fb.reviewer_email)
              : fb.reviewer_email;
            const typeColor =
              fb.reviewer_type === "patient" ? "text-sky-400 bg-sky-400/10"
              : fb.reviewer_type === "qr" ? "text-emerald-400 bg-emerald-400/10"
              : "text-violet-400 bg-violet-400/10";
            return (
              <div key={fb.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5">
                {/* Top row */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <p className="text-sm font-semibold text-white truncate">{reviewer}</p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${typeColor}`}>
                        {fb.reviewer_type === "qr" ? "QR" : fb.reviewer_type.charAt(0).toUpperCase() + fb.reviewer_type.slice(1)}
                      </span>
                      {fb.is_anonymous && (
                        <span className="text-xs text-slate-500 bg-white/5 px-2 py-0.5 rounded-full">anonymous</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      {fb.reviewer_type === "qr" && fb.display_name ? <span>{fb.reviewer_email} · </span> : null}
                      {format(new Date(fb.updated_at), "dd MMM yyyy")}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <FeedbackStars value={fb.rating_overall} size="md" />
                  </div>
                </div>

                {/* Aspect ratings */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                  {[
                    { label: "Accuracy", val: fb.rating_accuracy },
                    { label: "Speed", val: fb.rating_speed },
                    { label: "Staff", val: fb.rating_staff },
                    { label: "Environment", val: fb.rating_environment },
                  ].filter((a) => a.val != null).map((a) => (
                    <div key={a.label} className="bg-white/5 rounded-xl px-3 py-2">
                      <p className="text-xs text-slate-500 mb-1">{a.label}</p>
                      <FeedbackStars value={a.val!} />
                    </div>
                  ))}
                </div>

                {/* Comment */}
                {fb.comment && (
                  <div className="bg-white/5 border border-white/8 rounded-xl px-4 py-3">
                    <p className="text-sm text-slate-300 leading-relaxed italic">&ldquo;{fb.comment}&rdquo;</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {total > PAGE && (
        <div className="flex items-center justify-between pt-2">
          <button onClick={() => loadPage(Math.max(0, offset - PAGE))} disabled={offset === 0}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white disabled:opacity-30 transition px-3 py-2 rounded-lg hover:bg-white/5">
            <ChevronLeft className="w-3.5 h-3.5" />Previous
          </button>
          <span className="text-xs text-slate-500">{offset + 1}–{Math.min(offset + PAGE, total)} of {total}</span>
          <button onClick={() => loadPage(offset + PAGE)} disabled={offset + PAGE >= total}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white disabled:opacity-30 transition px-3 py-2 rounded-lg hover:bg-white/5">
            Next<ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Lab Price List View
// =============================================================================
type PriceListTest = { id: string; name: string; lab_price: number; poveon_fee: number | null; commission_pct: number | null };
type PriceListCategory = { category: string; tests: PriceListTest[] };

function LabPriceListView({ data, loading, error, onLoad, onManage }: { data: PriceListCategory[] | null; loading: boolean; error?: string | null; onLoad: () => void; onManage: () => void }) {
  const [search, setSearch] = useState("");
  // Load once on mount if nothing is cached yet. Deliberately NOT re-run on
  // every render — a failed fetch must show the retry state, not refetch in a
  // silent loop (which is what made the price list appear to never load).
  useEffect(() => {
    if (!data && !loading && !error) onLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-12 bg-white/5 rounded-xl" />
        <div className="h-48 bg-white/5 rounded-2xl" />
        <div className="h-32 bg-white/5 rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 px-6 py-14 text-center">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-rose-400" />
        <p className="text-sm font-semibold text-white">Couldn&apos;t load your price list</p>
        <p className="mt-1 text-xs text-slate-400">{error}</p>
        <button
          onClick={onLoad}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-medical-600 px-4 py-2 text-sm font-semibold text-white hover:bg-medical-700"
        >
          <RefreshCw className="h-4 w-4" /> Try again
        </button>
      </div>
    );
  }

  const schedule = data ?? [];
  const q = search.trim().toLowerCase();
  const filtered = schedule
    .map((cat) => ({ ...cat, tests: q ? cat.tests.filter((t) => t.name.toLowerCase().includes(q)) : cat.tests }))
    .filter((cat) => cat.tests.length > 0);

  const totalTests = schedule.reduce((s, c) => s + c.tests.length, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h2 className="text-lg font-bold text-white">Your Price List</h2>
          <p className="text-xs text-slate-400 mt-0.5">{totalTests} test{totalTests !== 1 ? "s" : ""} across {schedule.length} categor{schedule.length !== 1 ? "ies" : "y"}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tests…"
              className="pl-9 pr-4 py-2.5 rounded-xl bg-white/8 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-white/25 w-full sm:w-52"
            />
          </div>
          <button
            onClick={onManage}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 border border-sky-600 text-white hover:bg-sky-700 text-sm font-medium transition-all whitespace-nowrap shadow-sm"
          >
            <Settings2 className="w-4 h-4" />
            Manage &amp; Edit
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          {q ? "No tests match your search." : "No tests in your catalog yet."}
        </div>
      ) : (
        <div className="space-y-5">
          {filtered.map((cat) => (
            <div key={cat.category} className="bg-white/5 border border-white/8 rounded-2xl overflow-hidden">
              {/* Category header */}
              <div className="px-5 py-3 bg-white/5 border-b border-white/8 flex items-center justify-between">
                <p className="text-sm font-semibold text-white">{cat.category}</p>
                <p className="text-xs text-slate-500">{cat.tests.length} test{cat.tests.length !== 1 ? "s" : ""}</p>
              </div>
              {/* Column headers */}
              <div className="grid grid-cols-4 px-5 py-2 text-[11px] uppercase tracking-wider text-slate-500 border-b border-white/5">
                <p className="col-span-2">Test Name</p>
                <p className="text-right">Your Price</p>
                <p className="text-right">Poveon Fee</p>
              </div>
              {/* Test rows */}
              {cat.tests.map((test, idx) => (
                <div
                  key={test.id}
                  className={`grid grid-cols-4 px-5 py-3 items-center ${idx < cat.tests.length - 1 ? "border-b border-white/5" : ""} hover:bg-white/3 transition-colors`}
                >
                  <p className="col-span-2 text-sm text-slate-200 pr-4">{test.name}</p>
                  <p className="text-right text-sm font-mono text-white font-medium">₦{Number(test.lab_price).toLocaleString()}</p>
                  <div className="text-right">
                    <p className="text-sm font-mono text-amber-300 font-semibold">
                      {test.poveon_fee != null ? `₦${Number(test.poveon_fee).toLocaleString()}` : "—"}
                    </p>
                    {test.commission_pct != null && (
                      <p className="text-[10px] text-slate-500">{Number(test.commission_pct).toFixed(1)}%</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Lab Poveon View
// =============================================================================
type BreakdownItem = {
  raw: string; canonical_name: string; source?: string;
  unit_price: number; poveon_fee?: number | null;
};
type PoveonReq = {
  id: string; code: string; patient_name: string | null; tests: string;
  poveon_amount: number; lab_revenue_amount: number; is_paid_to_poveon: boolean;
  seen_at: string | null; completed_at: string | null;
  test_breakdown: BreakdownItem[];
};
type PoveonViewData = { total_owed: number; total_lab_revenue: number; total_deposited: number; wallet_balance: number; requests: PoveonReq[] } | null;

type WalletCredit = { id: string; amount: number; balance_after: number; reference: string; channel: string; sender_name: string | null; sender_bank: string | null; created_at: string };
type WalletData = { balance: number; dva: { bank_name: string; account_number: string; account_name: string } | null; credits: WalletCredit[] } | null;

function LabWalletPanel({ wallet, refreshing, onRefresh }: {
  wallet: WalletData | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const [copied, setCopied] = useState(false);

  if (!wallet) return <div className="h-28 bg-white/5 rounded-2xl animate-pulse" />;

  const balance = wallet.balance ?? 0;
  const dva     = wallet.dva    ?? null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {/* Balance card */}
      <div className="bg-gradient-to-br from-emerald-500/15 to-emerald-600/5 border border-emerald-500/25 rounded-2xl p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
          <Wallet2 className="w-5 h-5 text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-0.5">Wallet Balance</p>
          <p className="text-2xl font-bold font-mono text-white">₦{balance.toLocaleString()}</p>
        </div>
        <button onClick={onRefresh} disabled={refreshing} className="shrink-0 p-2 rounded-xl bg-white/8 hover:bg-white/15 text-slate-400 hover:text-white transition disabled:opacity-50" title="Refresh">
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* DVA account card */}
      {dva ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Your Dedicated Account</p>
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-lg font-bold font-mono text-white tracking-widest">{dva.account_number}</p>
              <p className="text-xs text-slate-400 mt-0.5">{dva.bank_name} · {dva.account_name}</p>
            </div>
            <button onClick={() => { navigator.clipboard.writeText(dva.account_number).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }} className="shrink-0 p-2 rounded-xl bg-white/8 hover:bg-white/15 text-slate-300 hover:text-white transition">
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">Transfer to this account from any bank to top up your wallet.</p>
        </div>
      ) : (
        <div className="bg-white/5 border border-white/10 border-dashed rounded-2xl p-4 flex items-center gap-3">
          <Wallet2 className="w-5 h-5 text-slate-500 shrink-0" />
          <div>
            <p className="text-sm text-slate-400 font-medium">No virtual account yet</p>
            <p className="text-xs text-slate-500 mt-0.5">Ask your admin to provision a dedicated payment account.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function LabPoveonView({ data, loading, walletData, walletRefreshing, onRefreshWallet, onLoad }: {
  data: PoveonViewData; loading: boolean;
  walletData: WalletData | null; walletRefreshing: boolean; onRefreshWallet: () => void;
  onLoad: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  useEffect(() => { if (!data) onLoad(); }, [data, onLoad]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-32 bg-white/5 rounded-2xl" />
        <div className="h-20 bg-white/5 rounded-2xl" />
        <div className="h-48 bg-white/5 rounded-2xl" />
      </div>
    );
  }

  const allRequests = data?.requests ?? [];
  const credits = walletData?.credits ?? [];

  // Apply date filter to requests (by seen_at) and credits (by created_at)
  const fromDate = dateFrom ? new Date(dateFrom + "T00:00:00") : null;
  const toDate   = dateTo   ? new Date(dateTo   + "T23:59:59") : null;

  const filteredRequests = allRequests.filter((r) => {
    if (!r.seen_at) return false;
    const d = new Date(r.seen_at);
    if (fromDate && d < fromDate) return false;
    if (toDate   && d > toDate)   return false;
    return true;
  });

  const filteredCredits = credits.filter((c) => {
    const d = new Date(c.created_at);
    if (fromDate && d < fromDate) return false;
    if (toDate   && d > toDate)   return false;
    return true;
  });

  const isFiltered = !!dateFrom || !!dateTo;
  const requests   = isFiltered ? filteredRequests : allRequests;
  const shownCredits = isFiltered ? filteredCredits : credits;

  // Recompute summary totals from filtered requests / credits
  const totalLabRevenue = isFiltered
    ? requests.reduce((s, r) => s + Number(r.lab_revenue_amount ?? 0), 0)
    : (data?.total_lab_revenue ?? 0);
  const totalOwed = isFiltered
    ? requests.reduce((s, r) => s + Number(r.poveon_amount ?? 0), 0)
    : (data?.total_owed ?? 0);
  const totalDeposited = isFiltered
    ? shownCredits.reduce((s, c) => s + Number(c.amount ?? 0), 0)
    : (data?.total_deposited ?? 0);

  function formatMoney(v: number) {
    if (v >= 1_000_000) return `₦${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 10_000)    return `₦${(v / 1_000).toFixed(0)}k`;
    if (v >= 1_000)     return `₦${(v / 1_000).toFixed(1)}k`;
    return `₦${v.toLocaleString()}`;
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* 1 — Wallet balance + DVA */}
      <LabWalletPanel wallet={walletData} refreshing={walletRefreshing} onRefresh={onRefreshWallet} />

      {/* 2 — Date filter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-slate-400">
          <Calendar className="w-3.5 h-3.5 shrink-0" />
          <span className="text-xs font-medium">Filter by date</span>
        </div>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-white/30"
          placeholder="From"
        />
        <span className="text-xs text-slate-500">to</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-white/30"
          placeholder="To"
        />
        {isFiltered && (
          <button
            onClick={() => { setDateFrom(""); setDateTo(""); }}
            className="text-xs text-slate-400 hover:text-white underline underline-offset-2 transition"
          >
            Clear
          </button>
        )}
      </div>

      {/* 3 — Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
        {/* Revenue */}
        <div className="bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/30 rounded-2xl px-4 py-3 flex sm:flex-col items-center sm:items-center justify-between sm:justify-center gap-2">
          <div className="sm:text-center">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide leading-tight">Your Revenue</p>
            <p className="text-[9px] text-slate-500 leading-tight mt-0.5">Approximate</p>
          </div>
          <p className="text-lg sm:text-base font-bold font-mono text-white sm:mt-1">{formatMoney(totalLabRevenue)}</p>
        </div>
        {/* Poveon Fee */}
        <div className="bg-gradient-to-br from-sky-500/20 to-sky-600/10 border border-sky-500/30 rounded-2xl px-4 py-3 flex sm:flex-col items-center sm:items-center justify-between sm:justify-center gap-2">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide sm:text-center">Poveon Fee</p>
          <p className="text-lg sm:text-base font-bold font-mono text-white sm:mt-1">{formatMoney(totalOwed)}</p>
        </div>
        {/* Deposited */}
        <div className="bg-gradient-to-br from-violet-500/20 to-violet-600/10 border border-violet-500/30 rounded-2xl px-4 py-3 flex sm:flex-col items-center sm:items-center justify-between sm:justify-center gap-2">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide sm:text-center">Deposited</p>
          <p className="text-lg sm:text-base font-bold font-mono text-white sm:mt-1">{formatMoney(totalDeposited)}</p>
        </div>
      </div>

      {/* 4 — How Poveon commission works */}
      <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4 flex items-start gap-3">
        <CreditCard className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
        <div className="space-y-1 flex-1">
          <p className="text-sm font-semibold text-white">How Poveon commission works</p>
          <p className="text-xs text-slate-400 leading-relaxed">
            Each time you mark a request as <strong className="text-white">Seen</strong>, Poveon calculates the commission from your test catalog.
            The commission rate is set per test in your catalog. Only tests in your price list contribute to the commission.
            Tests not in your catalog cost ₦0 commission.
          </p>
        </div>
      </div>

      {/* 5 — Payment history */}
      {shownCredits.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 border-b border-white/8">Payment History</p>
          <div className="divide-y divide-white/5">
            {shownCredits.slice(0, 10).map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                    <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-300 truncate">
                      {c.sender_name ? `From ${c.sender_name}` : "Bank transfer"}
                      {c.sender_bank ? ` · ${c.sender_bank}` : ""}
                      {c.channel === "manual" ? " (manual)" : ""}
                    </p>
                    <p className="text-[10px] text-slate-500">{new Date(c.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold font-mono text-emerald-300">+₦{Number(c.amount).toLocaleString()}</p>
                  <p className="text-[10px] text-slate-500">bal ₦{Number(c.balance_after).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6 — Commission by Request */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-white">Commission by Request ({requests.length})</p>
          <button onClick={onLoad} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {requests.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
            <CreditCard className="w-8 h-8 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-400">{isFiltered ? "No requests in selected date range" : "No commission data yet"}</p>
            <p className="text-xs text-slate-500 mt-1">{isFiltered ? "Try adjusting the date filter above" : "Commission appears once requests are marked as Seen"}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {requests.map((req) => {
              const isOpen = expanded.has(req.id);
              const catalogItems = req.test_breakdown.filter((t) => t.source === "lab_catalog");
              const othersItems = req.test_breakdown.filter((t) => t.source !== "lab_catalog");
              // Always derive totals from the JSON items — guaranteed to match per-row display
              const totalPrice = catalogItems.reduce((s, t) => s + Number(t.unit_price ?? 0), 0);
              const totalCommission = catalogItems.reduce((s, t) => s + Number(t.poveon_fee ?? 0), 0);
              return (
                <div key={req.id} className="bg-white/5 border border-white/8 rounded-xl overflow-hidden">
                  {/* Request row — click to expand */}
                  <button
                    onClick={() => toggleExpand(req.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-amber-500/15">
                      <CreditCard className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm text-white font-mono font-medium">{req.code}</p>
                      </div>
                      <p className="text-xs text-slate-500 truncate">{req.patient_name ?? "Patient"} · {req.tests.slice(0, 40)}</p>
                      <p className="text-[10px] text-slate-600 mt-0.5 sm:hidden">{req.seen_at ? format(new Date(req.seen_at), "dd MMM yyyy") : ""}</p>
                    </div>
                    <div className="text-right shrink-0 mr-1">
                      <p className="text-sm font-bold font-mono text-amber-300">₦{req.poveon_amount.toLocaleString()}</p>
                      <p className="text-xs text-slate-500 hidden sm:block">{req.seen_at ? format(new Date(req.seen_at), "dd MMM yyyy") : ""}</p>
                    </div>
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>

                  {/* Expanded breakdown */}
                  {isOpen && req.test_breakdown.length > 0 && (
                    <div className="border-t border-white/8 px-3 sm:px-4 py-3 space-y-1 overflow-x-auto">
                      <div className="min-w-[280px]">
                        <div className="grid grid-cols-3 gap-2 mb-2 px-1">
                          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Test</p>
                          <p className="text-[10px] text-slate-500 uppercase tracking-wider text-right">Price</p>
                          <p className="text-[10px] text-slate-500 uppercase tracking-wider text-right">Commission</p>
                        </div>
                        {catalogItems.map((item, i) => (
                          <div key={i} className="grid grid-cols-3 gap-2 px-1 py-1 rounded-lg bg-emerald-500/5">
                            <p className="text-xs text-slate-200 truncate">{item.canonical_name || item.raw}</p>
                            <p className="text-xs text-slate-300 text-right font-mono">₦{Number(item.unit_price).toLocaleString()}</p>
                            <p className="text-xs text-amber-300 text-right font-mono font-semibold">₦{Number(item.poveon_fee ?? 0).toLocaleString()}</p>
                          </div>
                        ))}
                        {othersItems.map((item, i) => (
                          <div key={i} className="grid grid-cols-3 gap-2 px-1 py-1 rounded-lg">
                            <p className="text-xs text-slate-500 truncate italic">{item.raw}</p>
                            <p className="text-xs text-slate-600 text-right font-mono">—</p>
                            <p className="text-xs text-slate-600 text-right font-mono">₦0</p>
                          </div>
                        ))}
                        <div className="grid grid-cols-3 gap-2 px-1 pt-2 border-t border-white/8">
                          <p className="text-xs text-slate-400 font-semibold">Total</p>
                          <p className="text-xs text-white text-right font-mono font-semibold">₦{totalPrice.toLocaleString()}</p>
                          <p className="text-xs text-amber-300 text-right font-mono font-semibold">₦{totalCommission.toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-500 font-medium mb-0.5">{label}</p>
      <div className="text-slate-200">{children}</div>
    </div>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const supabase = createClient();
  type CPStage = "send" | "verify" | "password";
  const [stage, setStage] = useState<CPStage>("send");
  const [userEmail, setUserEmail] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setUserEmail(data.user.email);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendOtp() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/lab/send-otp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail, purpose: "verify" }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Failed to send code."); return; }
      setOtp(["", "", "", "", "", ""]); setCountdown(60);
      let c = 60; const t = setInterval(() => { c--; setCountdown(c); if (c <= 0) clearInterval(t); }, 1000);
      setStage("verify");
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); }
  }

  function handleOtpChange(i: number, raw: string) {
    const digit = raw.replace(/\D/g, "").slice(-1);
    const next = [...otp]; next[i] = digit; setOtp(next);
    if (digit && i < 5) otpRefs.current[i + 1]?.focus();
  }
  function handleOtpKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault(); setError("");
    const code = otp.join("");
    if (code.length !== 6) { setError("Please enter all 6 digits."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/lab/verify-otp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail, code }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Invalid code."); return; }
      setNewPassword(""); setConfirmPassword(""); setStage("password");
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (newPassword.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/lab/set-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail, password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to change password."); return; }
      fetch("/api/lab/log-activity", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "password_change", detail: "Password changed from dashboard" }),
      }).catch(() => null);
      toast.success("Password changed successfully");
      onClose();
    } catch { setError("Failed to change password. Please try again."); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-slate-900 border border-white/15 rounded-2xl w-full max-w-sm shadow-2xl animate-slide-up">
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-medical-400" />
            <p className="font-semibold text-white text-sm">Change Password</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {stage === "send" && (
          <div className="p-5 space-y-4">
            {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
            <p className="text-sm text-slate-300">
              To confirm your identity, we&apos;ll send a one-time code to{" "}
              <span className="font-semibold text-white">{userEmail || "your email"}</span>.
            </p>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 font-semibold text-sm hover:bg-white/5 transition">Cancel</button>
              <button type="button" onClick={sendOtp} disabled={loading || !userEmail}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-medical-600 hover:bg-medical-500 disabled:opacity-60 text-white font-semibold text-sm transition">
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><KeyRound className="w-4 h-4" />Send Code</>}
              </button>
            </div>
          </div>
        )}

        {stage === "verify" && (
          <form onSubmit={handleVerify} className="p-5 space-y-4">
            {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
            <p className="text-xs text-slate-400 text-center">Enter the 6-digit code sent to <span className="text-white font-semibold">{userEmail}</span></p>
            <div className="flex gap-2 justify-center">
              {otp.map((digit, i) => (
                <input key={i} ref={(el) => { otpRefs.current[i] = el; }}
                  type="tel" inputMode="numeric" maxLength={2} value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  style={{ height: "48px" }}
                  className="w-10 text-center text-lg font-bold text-white border border-white/20 rounded-xl bg-white/5 focus:outline-none focus:ring-1 focus:ring-medical-500 transition" />
              ))}
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 font-semibold text-sm hover:bg-white/5 transition">Cancel</button>
              <button type="submit" disabled={loading || otp.join("").length !== 6}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-medical-600 hover:bg-medical-500 disabled:opacity-60 text-white font-semibold text-sm transition">
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><ArrowRight className="w-4 h-4" />Verify</>}
              </button>
            </div>
            <p className="text-center text-xs text-slate-500">
              {countdown > 0 ? `Resend in ${countdown}s` :
                <button type="button" onClick={sendOtp} disabled={loading}
                  className="text-medical-400 hover:text-medical-300 underline underline-offset-2 transition">Resend code</button>
              }
            </p>
          </form>
        )}

        {stage === "password" && (
          <form onSubmit={handleChangePassword} className="p-5 space-y-4">
            {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">New Password</label>
              <div className="relative">
                <input type={showNew ? "text" : "password"} value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 pr-10 text-white placeholder-slate-600 text-sm focus:outline-none focus:ring-1 focus:ring-medical-500" />
                <button type="button" onClick={() => setShowNew((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Confirm New Password</label>
              <div className="relative">
                <input type={showConfirm ? "text" : "password"} value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat new password"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 pr-10 text-white placeholder-slate-600 text-sm focus:outline-none focus:ring-1 focus:ring-medical-500" />
                <button type="button" onClick={() => setShowConfirm((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 font-semibold text-sm hover:bg-white/5 transition">Cancel</button>
              <button type="submit" disabled={loading} className="flex-1 py-2.5 rounded-xl bg-medical-600 hover:bg-medical-500 disabled:opacity-60 text-white font-semibold text-sm transition">
                {loading ? "Changing…" : "Change Password"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

