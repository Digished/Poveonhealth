"use client";

import { useState, useEffect, useCallback, useRef, useMemo, startTransition } from "react";
import { toast } from "react-hot-toast";
import {
  Search, RefreshCw, CheckCircle, Clock, FlaskConical,
  ChevronRight, Calendar, Stethoscope, LogOut, Eye, EyeOff, Phone, X,
  Link2, Paperclip, Send, SkipForward, UserCircle, MapPin, Shield, Layers,
  Users, CreditCard, Filter, ChevronDown, AlertTriangle, Truck, ExternalLink,
  MessageCircle, ChevronLeft, FileImage, Sun, Moon, Pencil, Save, BarChart3, Lock,
  Menu, Activity, KeyRound, ArrowRight, Star, MessageSquare, Wallet, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { useDashTheme } from "@/hooks/useDashTheme";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { StatusBadge } from "@/components/ui/Badge";
import type { LabRequest, RequestStatus, Sex } from "@/lib/types";
import { SERVICE_CATEGORIES } from "@/lib/constants";
import { format, differenceInYears } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface ReferralDoctor {
  doctor_name: string;
  doctor_email: string;
  doctor_prefix: string | null;
  doctor_phone: string | null;
  doctor_hospital: string | null;
  doctor_bank_name: string | null;
  doctor_account_number: string | null;
  doctor_account_name: string | null;
  total_referrals: number;
  months: Record<string, number>;
  tests: string[];
  last_referral: string;
  recent_requests?: { id: string; code: string; status: string; tests: string; test_image_url: string | null; created_at: string; patient_name: string | null; patient_phone: string | null }[];
}

interface LabDashboardProps {
  lab: {
    id: string;
    name: string;
    logo_url: string | null;
    address: string;
    description: string;
    phones: string[];
    whatsapp?: string | null;
    service_categories: string[];
    certifications: string[];
  };
  isOwner?: boolean;
  roleName?: string;
  canViewReferrals?: boolean;
  canViewClients?: boolean;
  canViewAnalytics?: boolean;
  canViewActivity?: boolean;
  canViewFeedback?: boolean;
  canViewWallet?: boolean;
}

const TABS: { key: RequestStatus; label: string; icon: React.ReactNode }[] = [
  { key: "seen", label: "Patient Seen", icon: <Eye className="w-4 h-4" /> },
  { key: "done", label: "Done", icon: <CheckCircle className="w-4 h-4" /> },
];

function calcAge(dob: string | null): number | null {
  if (!dob) return null;
  return differenceInYears(new Date(), new Date(dob));
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

function scheduleLabel(value: string | null): string | null {
  const map: Record<string, string> = {
    today: "Today",
    this_week: "Within a week",
    this_month: "Within a month",
    not_sure: "Not sure yet",
  };
  return value ? (map[value] ?? value) : null;
}

export function LabDashboard({ lab, isOwner = false, roleName = "Lab Owner", canViewReferrals = false, canViewClients = false, canViewAnalytics = false, canViewActivity = false, canViewFeedback = false, canViewWallet = false }: LabDashboardProps) {
  const { name: labName, logo_url: labLogoUrl } = lab;
  const router = useRouter();
  const { isLight, toggle, themeClass } = useDashTheme("lab_dash_theme");
  const [mainView, setMainView] = useState<"requests" | "referrals" | "clients" | "analytics" | "activity" | "feedback" | "wallet">("requests");
  const [walletData, setWalletData] = useState<{ balance: number; transactions: { id: string; type: string; direction: string; amount: number; balance_after: number; description: string | null; actor_email: string | null; created_at: string; request_id: string | null; test_breakdown: unknown; tests_raw: string | null }[] } | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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
  const [teamMembers, setTeamMembers] = useState<{ id: string; email: string; role: { name: string }; last_sign_in_at: string | null }[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);

  // Clients state
  type ClientRecord = {
    patient_phone: string;
    patient_email: string | null;
    patient_name: string | null;
    visit_count: number;
    first_visit: string;
    last_visit: string;
    recent_tests: string;
    requests: LabRequest[];
  };
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientRecord | null>(null);

  // Referrals state
  const [referrals, setReferrals] = useState<ReferralDoctor[]>([]);
  const [referralsLoading, setReferralsLoading] = useState(false);
  const [referralMonthFilter, setReferralMonthFilter] = useState("");
  const [referralTestFilter, setReferralTestFilter] = useState("");
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [availableTests, setAvailableTests] = useState<string[]>([]);
  const [expandedDoctor, setExpandedDoctor] = useState<string | null>(null);

  // Analytics filters
  const [analyticsTestFilter, setAnalyticsTestFilter] = useState("");
  const [analyticsStatusFilter, setAnalyticsStatusFilter] = useState<"" | "incoming" | "seen" | "done">("");
  const [analyticsMonthFilter, setAnalyticsMonthFilter] = useState("");

  // Patient info edit modal state
  const [editPatientRequest, setEditPatientRequest] = useState<LabRequest | null>(null);
  const [editPatientForm, setEditPatientForm] = useState({ patient_name: "", patient_phone: "", patient_email: "", dob: "", sex: "", address: "" });
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

  const fetchReferrals = useCallback(async () => {
    setReferralsLoading(true);
    try {
      const params = new URLSearchParams();
      if (referralMonthFilter) params.set("month", referralMonthFilter);
      if (referralTestFilter) params.set("test", referralTestFilter);
      const res = await fetch(`/api/lab/referrals?${params}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setReferrals(data.referrals ?? []);
      setAvailableMonths(data.available_months ?? []);
      setAvailableTests(data.available_tests ?? []);
    } catch {
      toast.error("Failed to load referrals");
    } finally {
      setReferralsLoading(false);
    }
  }, [referralMonthFilter, referralTestFilter]);

  useEffect(() => {
    fetchRequests();
    const interval = setInterval(() => fetchRequests(true), 30_000);
    return () => clearInterval(interval);
  }, [fetchRequests]);

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
    if (mainView === "referrals" && (isOwner || canViewReferrals)) fetchReferrals();
    if (mainView === "clients" && (isOwner || canViewClients)) fetchClients();
  }, [mainView, fetchReferrals, fetchClients, isOwner, canViewReferrals, canViewClients]);

  const tabRequests = requests.filter((r) => r.status === activeTab);

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
      dob: req.dob ? req.dob.slice(0, 10) : "",
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
        dob: editPatientForm.dob || null,
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
              <p className="text-xs text-blue-300 mt-0.5">{roleName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Desktop: individual action buttons */}
            <div className="hidden sm:flex items-center gap-2">
              <button
                onClick={toggle}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
                title={isLight ? "Switch to dark mode" : "Switch to light mode"}
              >
                {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>
              <button
                onClick={async () => {
                  setProfileOpen(true);
                  if (isOwner && teamMembers.length === 0) {
                    setTeamLoading(true);
                    try {
                      const res = await fetch("/api/lab/team");
                      const data = await res.json();
                      if (data.success) setTeamMembers(data.members ?? []);
                    } finally {
                      setTeamLoading(false);
                    }
                  }
                }}
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
                    <button
                      onClick={async () => {
                        setMobileHeaderOpen(false);
                        setProfileOpen(true);
                        if (isOwner && teamMembers.length === 0) {
                          setTeamLoading(true);
                          try {
                            const res = await fetch("/api/lab/team");
                            const data = await res.json();
                            if (data.success) setTeamMembers(data.members ?? []);
                          } finally { setTeamLoading(false); }
                        }
                      }}
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

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Top-level navigation */}
        {(() => {
          const navItems = [
            { key: "requests" as const, label: "Requests", icon: <FlaskConical className="w-4 h-4" />, show: true },
            { key: "referrals" as const, label: "Referrals", icon: <Users className="w-4 h-4" />, show: isOwner || canViewReferrals },
            { key: "clients" as const, label: "Clients", icon: <UserCircle className="w-4 h-4" />, show: isOwner || canViewClients },
            { key: "analytics" as const, label: "Analytics", icon: <BarChart3 className="w-4 h-4" />, show: isOwner || canViewAnalytics },
            { key: "activity" as const, label: "Activity", icon: <Activity className="w-4 h-4" />, show: isOwner || canViewActivity },
            { key: "feedback" as const, label: "Feedback", icon: <Star className="w-4 h-4" />, show: isOwner || canViewFeedback },
            { key: "wallet" as const, label: "Wallet", icon: <Wallet className="w-4 h-4" />, show: isOwner || canViewWallet },
          ].filter((item) => item.show);
          if (navItems.length <= 1) return null;
          const currentItem = navItems.find((n) => n.key === mainView) ?? navItems[0];
          return (
            <div className="mb-6">
              {/* Mobile: hamburger trigger + inline dropdown */}
              <div className="sm:hidden">
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
                    {navItems.map((item) => (
                      <button key={item.key}
                        onClick={() => {
                          setMainView(item.key);
                          setMobileNavOpen(false);
                          if (item.key === "wallet" && !walletData) {
                            setWalletLoading(true);
                            fetch("/api/lab/wallet").then((r) => r.json()).then((d) => { if (d.success) setWalletData(d); }).catch(() => {}).finally(() => setWalletLoading(false));
                          }
                        }}
                        className={`flex items-center gap-3 w-full px-4 py-3.5 text-sm font-medium transition-colors border-b border-white/5 last:border-0 ${
                          mainView === item.key
                            ? "bg-white/12 text-white"
                            : "text-slate-300 active:bg-white/8"
                        }`}>
                        <span className={mainView === item.key ? "text-white" : "text-slate-500"}>{item.icon}</span>
                        {item.label}
                        {mainView === item.key && <ChevronRight className="w-3.5 h-3.5 ml-auto text-white/40" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Desktop: pill row */}
              <div className="hidden sm:flex gap-1 bg-white/5 rounded-xl p-1 w-fit">
                {navItems.map((item) => (
                  <button key={item.key} onClick={() => {
                    setMainView(item.key);
                    if (item.key === "wallet" && !walletData) {
                      setWalletLoading(true);
                      fetch("/api/lab/wallet").then((r) => r.json()).then((d) => { if (d.success) setWalletData(d); }).catch(() => {}).finally(() => setWalletLoading(false));
                    }
                  }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      mainView === item.key ? "bg-white/15 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                    }`}>
                    {item.icon}{item.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Referrals view */}
        {mainView === "referrals" && (
          <div>
            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-6">
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                <Filter className="w-4 h-4 text-slate-400 shrink-0" />
                <select
                  value={referralMonthFilter}
                  onChange={(e) => setReferralMonthFilter(e.target.value)}
                  className="bg-transparent text-sm text-slate-200 outline-none cursor-pointer min-w-[120px]"
                >
                  <option value="" className="bg-slate-800">All months</option>
                  {availableMonths.map((m) => {
                    const [year, month] = m.split("-");
                    const label = new Date(Number(year), Number(month) - 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
                    return <option key={m} value={m} className="bg-slate-800">{label}</option>;
                  })}
                </select>
              </div>
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <select
                  value={referralTestFilter}
                  onChange={(e) => setReferralTestFilter(e.target.value)}
                  className="bg-transparent text-sm text-slate-200 outline-none cursor-pointer min-w-[140px]"
                >
                  <option value="" className="bg-slate-800">All tests</option>
                  {availableTests.map((t) => (
                    <option key={t} value={t} className="bg-slate-800">{t}</option>
                  ))}
                </select>
              </div>
              {(referralMonthFilter || referralTestFilter) && (
                <button
                  onClick={() => { setReferralMonthFilter(""); setReferralTestFilter(""); }}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Clear
                </button>
              )}
            </div>

            {referralsLoading ? (
              <div className="text-center py-20 text-slate-400">
                <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin opacity-50" />
                <p>Loading referrals…</p>
              </div>
            ) : referrals.length === 0 ? (
              <div className="text-center py-20 text-slate-400">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No referrals found</p>
                <p className="text-sm mt-1 text-slate-500">Referrals appear here once patients have been seen</p>
              </div>
            ) : (
              <>
                {/* Doctor cards — unified for all screen sizes, each opens a popup */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {referrals.map((doc) => (
                    <button
                      key={doc.doctor_email}
                      type="button"
                      onClick={() => startTransition(() => setExpandedDoctor(doc.doctor_email))}
                      className="text-left bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-2xl p-4 transition-all group"
                    >
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-medical-600/20 border border-medical-500/30 flex items-center justify-center shrink-0">
                          <Stethoscope className="w-5 h-5 text-medical-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-white truncate leading-tight">
                            {[doc.doctor_prefix, doc.doctor_name].filter(Boolean).join(" ")}
                          </p>
                          {doc.doctor_hospital && (
                            <p className="text-xs text-slate-500 truncate mt-0.5">{doc.doctor_hospital}</p>
                          )}
                        </div>
                        <span className="shrink-0 text-xs font-bold bg-medical-900/50 text-medical-300 border border-medical-800/30 px-2 py-0.5 rounded-full">
                          {doc.total_referrals}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 mb-3">
                        {doc.tests.slice(0, 3).map((t) => (
                          <span key={t} className="text-xs bg-white/5 text-slate-400 border border-white/10 px-2 py-0.5 rounded-full">{t}</span>
                        ))}
                        {doc.tests.length > 3 && (
                          <span className="text-xs text-slate-500">+{doc.tests.length - 3} more</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        Last: {new Date(doc.last_referral).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </button>
                  ))}
                </div>

                {/* Doctor detail popup */}
                {expandedDoctor && (() => {
                  const doc = referrals.find((d) => d.doctor_email === expandedDoctor);
                  if (!doc) return null;
                  return (
                    <div
                      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
                      style={{ backgroundColor: "rgba(15,23,42,0.8)", backdropFilter: "blur(4px)" }}
                      onClick={() => setExpandedDoctor(null)}
                    >
                      <div
                        className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden max-h-[88vh] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Header */}
                        <div className="px-5 pt-5 pb-4 border-b border-white/10 flex items-start justify-between gap-3 shrink-0">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-11 h-11 rounded-2xl bg-medical-600/20 border border-medical-500/30 flex items-center justify-center shrink-0">
                              <Stethoscope className="w-6 h-6 text-medical-400" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-white text-base leading-tight truncate">
                                {[doc.doctor_prefix, doc.doctor_name].filter(Boolean).join(" ")}
                              </p>
                              <p className="text-xs text-slate-400 truncate mt-0.5">{doc.doctor_email}</p>
                            </div>
                          </div>
                          <button type="button" onClick={() => setExpandedDoctor(null)} className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors shrink-0">
                            <X className="w-5 h-5" />
                          </button>
                        </div>

                        {/* Quick stats */}
                        <div className="px-5 py-3 flex gap-5 border-b border-white/5 bg-white/3 shrink-0">
                          <div>
                            <p className="text-xs text-slate-500">Total Referrals</p>
                            <p className="text-xl font-bold text-white">{doc.total_referrals}</p>
                          </div>
                          {doc.doctor_hospital && (
                            <div className="min-w-0">
                              <p className="text-xs text-slate-500">Hospital / Clinic</p>
                              <p className="text-sm font-semibold text-slate-300 truncate">{doc.doctor_hospital}</p>
                            </div>
                          )}
                          {doc.doctor_phone && (
                            <div>
                              <p className="text-xs text-slate-500">Phone</p>
                              <a href={`tel:${doc.doctor_phone}`} className="text-sm text-blue-400 hover:underline flex items-center gap-1">
                                <Phone className="w-3 h-3" />{doc.doctor_phone}
                              </a>
                            </div>
                          )}
                        </div>

                        {/* Scrollable body */}
                        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

                          {/* Bank details */}
                          {(doc.doctor_bank_name || doc.doctor_account_number) && (
                            <div>
                              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Bank Details</p>
                              <div className="bg-white/5 rounded-xl p-3 flex items-start gap-2">
                                <CreditCard className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                                <div>
                                  {doc.doctor_bank_name && <p className="text-white font-medium text-sm">{doc.doctor_bank_name}</p>}
                                  {doc.doctor_account_number && <p className="font-mono text-sm text-slate-200">{doc.doctor_account_number}</p>}
                                  {doc.doctor_account_name && <p className="text-xs text-slate-400">{doc.doctor_account_name}</p>}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Tests referred */}
                          <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                              Tests Referred ({doc.tests.length})
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {doc.tests.map((t) => (
                                <span key={t} className="text-xs bg-medical-900/50 text-medical-300 border border-medical-800/30 px-2 py-0.5 rounded-full">{t}</span>
                              ))}
                            </div>
                          </div>

                          {/* All requests — with patient + status per request */}
                          {doc.recent_requests && doc.recent_requests.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                Requests ({doc.recent_requests.length})
                              </p>
                              <div className="space-y-2">
                                {doc.recent_requests.map((r) => {
                                  const statusDot: Record<string, string> = { incoming: "bg-amber-400", seen: "bg-blue-400", done: "bg-emerald-400" };
                                  const statusLabel: Record<string, string> = { incoming: "Pending", seen: "Patient Seen", done: "Completed" };
                                  const testDisplay = r.tests === "See attached image"
                                    ? null
                                    : r.tests.split(/[,\n]+/).map((t) => t.trim()).filter(Boolean);
                                  return (
                                    <div key={r.id} className="bg-white/5 border border-white/10 rounded-xl px-3 py-3 space-y-2">
                                      {/* Header row: patient name + code + date */}
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot[r.status] ?? "bg-slate-400"}`} />
                                          <div className="min-w-0">
                                            {r.patient_name && (
                                              <p className="text-sm font-semibold text-white truncate">{r.patient_name}</p>
                                            )}
                                            <p className="text-xs text-slate-500 font-mono">{r.code}</p>
                                          </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                          <p className={`text-xs font-medium ${statusDot[r.status] === "bg-emerald-400" ? "text-emerald-400" : statusDot[r.status] === "bg-blue-400" ? "text-blue-400" : "text-amber-400"}`}>
                                            {statusLabel[r.status] ?? r.status}
                                          </p>
                                          <p className="text-xs text-slate-500 mt-0.5">
                                            {new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                                          </p>
                                        </div>
                                      </div>
                                      {/* Tests as badges */}
                                      {testDisplay && testDisplay.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                          {testDisplay.map((t, ti) => (
                                            <span key={ti} className="text-xs bg-medical-900/50 text-medical-300 border border-medical-800/30 px-2 py-0.5 rounded-full">{t}</span>
                                          ))}
                                        </div>
                                      )}
                                      {r.tests === "See attached image" && (
                                        <p className="text-xs italic text-slate-500">See attached image</p>
                                      )}
                                      {r.patient_phone && (
                                        <a href={`tel:${r.patient_phone}`} className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline">
                                          <Phone className="w-3 h-3" />{r.patient_phone}
                                        </a>
                                      )}
                                      {r.test_image_url && (
                                        <a
                                          href={r.test_image_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition text-xs font-medium text-blue-300"
                                        >
                                          <FileImage className="w-3.5 h-3.5" />
                                          View image
                                          <ExternalLink className="w-3 h-3 opacity-60 ml-0.5" />
                                        </a>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Monthly breakdown */}
                          <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Monthly Breakdown</p>
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(doc.months).sort((a, b) => b[0].localeCompare(a[0])).map(([ym, count]) => {
                                const [year, month] = ym.split("-");
                                const label = new Date(Number(year), Number(month) - 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
                                return (
                                  <span key={ym} className="text-xs bg-white/10 text-slate-300 px-2 py-1 rounded-lg">
                                    {label}: <span className="font-bold text-white">{count}</span>
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
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
              <div className="space-y-3">
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-4">{clients.length} client{clients.length !== 1 ? "s" : ""}</p>
                {clients.map((client) => (
                  <button
                    key={client.patient_phone}
                    type="button"
                    onClick={() => setSelectedClient(client)}
                    className="w-full text-left bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-2xl p-4 transition-all group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-medical-600/20 border border-medical-500/30 flex items-center justify-center shrink-0">
                          <UserCircle className="w-5 h-5 text-medical-400" />
                        </div>
                        <div className="min-w-0">
                          {client.patient_name ? (
                            <p className="text-sm font-bold text-white leading-tight truncate">{client.patient_name}</p>
                          ) : null}
                          <a
                            href={`tel:${client.patient_phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-medical-400 hover:text-medical-300 font-mono flex items-center gap-1 mt-0.5"
                          >
                            <Phone className="w-3 h-3" />
                            {client.patient_phone}
                          </a>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="inline-block text-xs font-bold text-medical-300 bg-medical-600/20 border border-medical-500/30 px-2 py-0.5 rounded-full">
                          {client.visit_count} visit{client.visit_count !== 1 ? "s" : ""}
                        </span>
                        <p className="text-xs text-slate-500 mt-1">{new Date(client.last_visit).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-white/5">
                      <p className="text-xs text-slate-400 line-clamp-1"><span className="text-slate-500">Last: </span>{client.recent_tests}</p>
                    </div>
                  </button>
                ))}
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
                  {/* Stats */}
                  <div className="px-5 py-3 flex gap-4 border-b border-white/5 shrink-0">
                    <div>
                      <p className="text-xs text-slate-500">Visits</p>
                      <p className="text-lg font-bold text-white">{selectedClient.visit_count}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">First visit</p>
                      <p className="text-sm font-semibold text-white">{new Date(selectedClient.first_visit).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Last visit</p>
                      <p className="text-sm font-semibold text-white">{new Date(selectedClient.last_visit).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
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

        {/* Analytics view */}
        {mainView === "analytics" && (() => {
          // Build filter options from all requests
          const allAnalyticsMonths = Array.from(new Set(requests.map((r) => r.created_at.slice(0, 7)))).sort().reverse();
          const allAnalyticsTests = Array.from(new Set(
            requests.flatMap((r) => r.tests && r.tests !== "See attached image"
              ? r.tests.split(/[,\n]+/).map((t) => t.trim()).filter(Boolean)
              : [])
          )).sort();

          // Apply filters
          const filteredRequests = requests.filter((r) => {
            if (analyticsMonthFilter && r.created_at.slice(0, 7) !== analyticsMonthFilter) return false;
            if (analyticsStatusFilter && r.status !== analyticsStatusFilter) return false;
            if (analyticsTestFilter) {
              const tests = r.tests ? r.tests.split(/[,\n]+/).map((t) => t.trim().toLowerCase()) : [];
              if (!tests.includes(analyticsTestFilter.toLowerCase())) return false;
            }
            return true;
          });

          const analyticsMetrics = (() => {
            const total = filteredRequests.length;
            const done = filteredRequests.filter((r) => r.status === "done").length;
            const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;
            const todayStr = new Date().toISOString().slice(0, 10);
            const seenToday = filteredRequests.filter((r) => {
              const sa = (r as any).seen_at;
              return sa && String(sa).slice(0, 10) === todayStr;
            }).length;
            let avgPerMonth = 0;
            if (total > 0) {
              const sorted = [...filteredRequests].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              );
              const first = new Date(sorted[0].created_at);
              const now = new Date();
              const months =
                (now.getFullYear() - first.getFullYear()) * 12 +
                (now.getMonth() - first.getMonth()) +
                1;
              avgPerMonth = Math.round((total / months) * 10) / 10;
            }

            // Monthly trend (last 6 months) — total requests
            const monthCounts: Record<string, number> = {};
            filteredRequests.forEach((r) => {
              const key = r.created_at.slice(0, 7);
              monthCounts[key] = (monthCounts[key] ?? 0) + 1;
            });
            const last6: { label: string; key: string; count: number }[] = [];
            for (let i = 5; i >= 0; i--) {
              const d = new Date();
              d.setDate(1);
              d.setMonth(d.getMonth() - i);
              const key = d.toISOString().slice(0, 7);
              const label = d.toLocaleDateString("en-GB", { month: "short" });
              last6.push({ label, key, count: monthCounts[key] ?? 0 });
            }

            // Monthly breakdown by status (incoming / seen / done) — last 6 months
            const monthStatusCounts: Record<string, { incoming: number; seen: number; done: number }> = {};
            filteredRequests.forEach((r) => {
              const key = r.created_at.slice(0, 7);
              if (!monthStatusCounts[key]) monthStatusCounts[key] = { incoming: 0, seen: 0, done: 0 };
              if (r.status in monthStatusCounts[key]) monthStatusCounts[key][r.status as "incoming" | "seen" | "done"]++;
            });
            const last6Status = last6.map((m) => ({
              ...m,
              incoming: monthStatusCounts[m.key]?.incoming ?? 0,
              seen: monthStatusCounts[m.key]?.seen ?? 0,
              done: monthStatusCounts[m.key]?.done ?? 0,
            }));

            // Status breakdown
            const statusCounts = { incoming: 0, seen: 0, done: 0 };
            filteredRequests.forEach((r) => {
              if (r.status in statusCounts) statusCounts[r.status as keyof typeof statusCounts]++;
            });

            // Sex demographics
            const sexCounts: Record<string, number> = {};
            filteredRequests.forEach((r) => {
              const s = (r.sex ?? "unknown").toLowerCase();
              const key = ["male", "female", "other"].includes(s) ? s : "unknown";
              sexCounts[key] = (sexCounts[key] ?? 0) + 1;
            });

            // Top 10 tests
            const testCounts: Record<string, number> = {};
            filteredRequests.forEach((r) => {
              if (!r.tests) return;
              r.tests
                .split(/[,\n]+/)
                .map((t: string) => t.trim())
                .filter(Boolean)
                .forEach((t: string) => {
                  testCounts[t] = (testCounts[t] ?? 0) + 1;
                });
            });
            const top10Tests = Object.entries(testCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10);

            // Schedule preferences
            const schedCounts: Record<string, number> = {
              today: 0,
              this_week: 0,
              this_month: 0,
              not_sure: 0,
            };
            filteredRequests.forEach((r) => {
              const s = (r as any).schedule ?? "not_sure";
              if (s in schedCounts) schedCounts[s]++;
            });

            // Tests completed (done) — all-time count per test name
            const doneTestCounts: Record<string, number> = {};
            const doneByMonth: Record<string, Record<string, number>> = {};
            filteredRequests
              .filter((r) => r.status === "done")
              .forEach((r) => {
                if (!r.tests || r.tests === "See attached image") return;
                const monthKey = r.created_at.slice(0, 7);
                r.tests
                  .split(/[,\n]+/)
                  .map((t: string) => t.trim())
                  .filter(Boolean)
                  .forEach((t: string) => {
                    doneTestCounts[t] = (doneTestCounts[t] ?? 0) + 1;
                    if (!doneByMonth[monthKey]) doneByMonth[monthKey] = {};
                    doneByMonth[monthKey][t] = (doneByMonth[monthKey][t] ?? 0) + 1;
                  });
              });
            const topDoneTests = Object.entries(doneTestCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 15);

            // Build last-6-month keys for done tests monthly chart
            const doneMonthKeys: { key: string; label: string }[] = [];
            for (let i = 5; i >= 0; i--) {
              const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
              doneMonthKeys.push({
                key: d.toISOString().slice(0, 7),
                label: d.toLocaleDateString("en-GB", { month: "short" }),
              });
            }
            // Top 5 done tests for the monthly chart
            const top5DoneTests = topDoneTests.slice(0, 5).map(([name]) => name);
            const DONE_COLORS = ["#10b981", "#0e8fe5", "#f59e0b", "#8b5cf6", "#ec4899"];

            return {
              total,
              completionRate,
              seenToday,
              avgPerMonth,
              last6,
              last6Status,
              statusCounts,
              sexCounts,
              top10Tests,
              schedCounts,
              topDoneTests,
              doneByMonth,
              doneMonthKeys,
              top5DoneTests,
              DONE_COLORS,
            };
          })();

          const {
            total,
            completionRate,
            seenToday,
            avgPerMonth,
            last6,
            last6Status,
            statusCounts,
            sexCounts,
            top10Tests,
            schedCounts,
            topDoneTests,
            doneByMonth,
            doneMonthKeys,
            top5DoneTests,
            DONE_COLORS,
          } = analyticsMetrics;

          const maxMonthly = Math.max(...last6.map((m) => m.count), 1);
          const maxTest = top10Tests.length > 0 ? top10Tests[0][1] : 1;
          const totalSex = Object.values(sexCounts).reduce((a, b) => a + b, 0) || 1;
          const totalStatus = statusCounts.incoming + statusCounts.seen + statusCounts.done || 1;

          const schedLabels: Record<string, string> = {
            today: "Today",
            this_week: "This Week",
            this_month: "This Month",
            not_sure: "Not Sure",
          };

          const hasFilter = !!(analyticsMonthFilter || analyticsStatusFilter || analyticsTestFilter);

          return (
            <div className="space-y-5">
              {/* Filter row */}
              <div className="flex flex-wrap gap-2">
                <select
                  value={analyticsMonthFilter}
                  onChange={(e) => setAnalyticsMonthFilter(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 outline-none cursor-pointer"
                >
                  <option value="" className="bg-slate-800">All months</option>
                  {allAnalyticsMonths.map((m) => {
                    const [y, mo] = m.split("-");
                    const lbl = new Date(Number(y), Number(mo) - 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
                    return <option key={m} value={m} className="bg-slate-800">{lbl}</option>;
                  })}
                </select>
                <select
                  value={analyticsStatusFilter}
                  onChange={(e) => setAnalyticsStatusFilter(e.target.value as typeof analyticsStatusFilter)}
                  className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 outline-none cursor-pointer"
                >
                  <option value="" className="bg-slate-800">All statuses</option>
                  <option value="incoming" className="bg-slate-800">Incoming</option>
                  <option value="seen" className="bg-slate-800">Patient Seen</option>
                  <option value="done" className="bg-slate-800">Completed</option>
                </select>
                <select
                  value={analyticsTestFilter}
                  onChange={(e) => setAnalyticsTestFilter(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 outline-none cursor-pointer min-w-[160px]"
                >
                  <option value="" className="bg-slate-800">All tests</option>
                  {allAnalyticsTests.map((t) => (
                    <option key={t} value={t} className="bg-slate-800">{t}</option>
                  ))}
                </select>
                {hasFilter && (
                  <button
                    type="button"
                    onClick={() => { setAnalyticsMonthFilter(""); setAnalyticsStatusFilter(""); setAnalyticsTestFilter(""); }}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors border border-white/10"
                  >
                    <X className="w-3.5 h-3.5" /> Clear
                  </button>
                )}
                {hasFilter && (
                  <span className="self-center text-xs text-slate-500 ml-auto">
                    {filteredRequests.length} of {requests.length} requests
                  </span>
                )}
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Total Requests", value: total },
                  { label: "Completion Rate", value: `${completionRate}%` },
                  { label: "Seen Today", value: seenToday },
                  { label: "Avg / Month", value: avgPerMonth },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col gap-1"
                  >
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      {stat.label}
                    </span>
                    <span className="text-2xl font-bold text-white">{stat.value}</span>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Monthly Trend */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
                    Monthly Trend (Last 6 Months)
                  </p>
                  <svg
                    viewBox={`0 0 ${last6.length * 50} 110`}
                    className="w-full h-28"
                    preserveAspectRatio="none"
                  >
                    {last6.map((m, i) => {
                      const barH = Math.max((m.count / maxMonthly) * 80, 2);
                      const y = 90 - barH;
                      return (
                        <g key={m.key}>
                          <rect
                            x={i * 50 + 5}
                            y={y}
                            width={40}
                            height={barH}
                            rx="4"
                            fill="#0e8fe5"
                            opacity="0.8"
                          />
                          <text
                            x={i * 50 + 25}
                            y={104}
                            textAnchor="middle"
                            fill="#94a3b8"
                            fontSize="9"
                          >
                            {m.label}
                          </text>
                          <text
                            x={i * 50 + 25}
                            y={y - 3}
                            textAnchor="middle"
                            fill="white"
                            fontSize="9"
                          >
                            {m.count}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>

                {/* Monthly Status Breakdown — stacked bar chart */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Monthly by Status (Last 6 Months)
                  </p>
                  {/* Legend */}
                  <div className="flex gap-4 mb-3">
                    {[{ label: "Incoming", color: "#f59e0b" }, { label: "Seen", color: "#60a5fa" }, { label: "Done", color: "#10b981" }].map((s) => (
                      <div key={s.label} className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
                        <span className="text-xs text-slate-400">{s.label}</span>
                      </div>
                    ))}
                  </div>
                  {(() => {
                    const barW = 36;
                    const gap = 14;
                    const colW = barW + gap;
                    const svgW = last6Status.length * colW + gap;
                    const chartH = 80;
                    const labelY = chartH + 14;
                    const maxVal = Math.max(1, ...last6Status.map((m) => m.incoming + m.seen + m.done));
                    return (
                      <div className="overflow-x-auto">
                        <svg viewBox={`0 0 ${svgW} ${labelY + 4}`} className="w-full" style={{ minWidth: `${Math.max(svgW, 220)}px`, height: `${labelY + 8}px` }} preserveAspectRatio="none">
                          {last6Status.map((m, i) => {
                            const x = i * colW + gap / 2;
                            const total = m.incoming + m.seen + m.done;
                            const inH = (m.incoming / maxVal) * chartH;
                            const seH = (m.seen / maxVal) * chartH;
                            const doH = (m.done / maxVal) * chartH;
                            let y = chartH;
                            const segs = [
                              { h: inH, color: "#f59e0b", v: m.incoming },
                              { h: seH, color: "#60a5fa", v: m.seen },
                              { h: doH, color: "#10b981", v: m.done },
                            ];
                            return (
                              <g key={m.key}>
                                {segs.map((seg, si) => {
                                  y -= seg.h;
                                  return seg.h > 0 ? (
                                    <rect key={si} x={x} y={y} width={barW} height={seg.h} rx={si === 0 ? 0 : 0} fill={seg.color} opacity="0.85" />
                                  ) : null;
                                })}
                                {total > 0 && (
                                  <text x={x + barW / 2} y={chartH - (m.incoming + m.seen + m.done) / maxVal * chartH - 3} textAnchor="middle" fill="white" fontSize="8">{total}</text>
                                )}
                                <text x={x + barW / 2} y={labelY} textAnchor="middle" fill="#94a3b8" fontSize="9">{m.label}</text>
                              </g>
                            );
                          })}
                        </svg>
                      </div>
                    );
                  })()}
                </div>

                {/* Status Breakdown */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
                    Status Breakdown
                  </p>
                  <div className="space-y-3">
                    {(
                      [
                        { key: "incoming", label: "Incoming", color: "bg-amber-400" },
                        { key: "seen", label: "Seen", color: "bg-blue-400" },
                        { key: "done", label: "Done", color: "bg-emerald-400" },
                      ] as const
                    ).map(({ key, label, color }) => {
                      const count = statusCounts[key];
                      const pct = Math.round((count / totalStatus) * 100);
                      return (
                        <div key={key}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-slate-300">{label}</span>
                            <span className="text-slate-400">
                              {count} ({pct}%)
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${color}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Sex Demographics */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
                    Sex Demographics
                  </p>
                  <div className="space-y-3">
                    {(["male", "female", "other", "unknown"] as const).map((s) => {
                      const count = sexCounts[s] ?? 0;
                      const pct = Math.round((count / totalSex) * 100);
                      return (
                        <div key={s}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-slate-300 capitalize">{s}</span>
                            <span className="text-slate-400">
                              {count} ({pct}%)
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-medical-500"
                              style={{ width: `${pct}%`, backgroundColor: "#0e8fe5" }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Schedule Preferences */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
                    Schedule Preferences
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {Object.entries(schedCounts).map(([key, count]) => (
                      <div
                        key={key}
                        className="flex flex-col items-center bg-white/5 border border-white/10 rounded-xl px-4 py-3 min-w-[80px]"
                      >
                        <span className="text-lg font-bold text-white">{count}</span>
                        <span className="text-xs text-slate-400 mt-0.5 text-center">
                          {schedLabels[key] ?? key}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Top 10 Tests */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
                  Top 10 Tests (All Requests)
                </p>
                {top10Tests.length === 0 ? (
                  <p className="text-slate-500 text-sm">No test data available.</p>
                ) : (
                  <div className="space-y-2">
                    {top10Tests.map(([name, count], idx) => {
                      const pct = Math.round((count / maxTest) * 100);
                      return (
                        <div key={name} className="flex items-center gap-3">
                          <span className="text-xs text-slate-500 w-4 text-right shrink-0">
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between text-sm mb-0.5">
                              <span className="text-slate-300 truncate">{name}</span>
                              <span className="text-slate-400 ml-2 shrink-0">{count}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${pct}%`, backgroundColor: "#0e8fe5" }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Tests Completed (Done) — All-Time */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Tests Completed — All-Time
                  </p>
                </div>
                {topDoneTests.length === 0 ? (
                  <p className="text-slate-500 text-sm">No completed tests recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {topDoneTests.map(([name, count], idx) => {
                      const maxDone = topDoneTests[0][1];
                      const pct = Math.round((count / maxDone) * 100);
                      return (
                        <div key={name} className="flex items-center gap-3">
                          <span className="text-xs text-slate-500 w-5 text-right shrink-0">{idx + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between text-sm mb-0.5">
                              <span className="text-slate-300 truncate">{name}</span>
                              <span className="text-emerald-400 font-semibold ml-2 shrink-0">{count}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Tests Completed — Monthly Trend (Top 5 Tests) */}
              {top5DoneTests.length > 0 && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Tests Completed — Monthly (Top {top5DoneTests.length})
                    </p>
                  </div>
                  {/* Legend */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mb-4 mt-2">
                    {top5DoneTests.map((name, ci) => (
                      <div key={name} className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: DONE_COLORS[ci] }} />
                        <span className="text-xs text-slate-400 truncate max-w-[140px]">{name}</span>
                      </div>
                    ))}
                  </div>
                  {/* Grouped bar chart */}
                  {(() => {
                    const barW = 10;
                    const gapBetween = 3;
                    const groupW = top5DoneTests.length * (barW + gapBetween) + 12;
                    const svgW = doneMonthKeys.length * groupW;
                    const maxVal = Math.max(
                      1,
                      ...doneMonthKeys.flatMap(({ key }) =>
                        top5DoneTests.map((name) => doneByMonth[key]?.[name] ?? 0)
                      )
                    );
                    const chartH = 80;
                    const labelY = chartH + 18;
                    return (
                      <div className="overflow-x-auto">
                        <svg
                          viewBox={`0 0 ${svgW} ${labelY + 4}`}
                          className="w-full"
                          style={{ minWidth: `${Math.max(svgW, 280)}px`, height: `${labelY + 8}px` }}
                          preserveAspectRatio="none"
                        >
                          {doneMonthKeys.map(({ key, label }, mi) => {
                            const groupX = mi * groupW + 6;
                            return (
                              <g key={key}>
                                {top5DoneTests.map((name, ci) => {
                                  const val = doneByMonth[key]?.[name] ?? 0;
                                  const barH = val > 0 ? Math.max((val / maxVal) * chartH, 3) : 0;
                                  const x = groupX + ci * (barW + gapBetween);
                                  const y = chartH - barH;
                                  return (
                                    <g key={name}>
                                      <rect x={x} y={y} width={barW} height={barH} rx="2" fill={DONE_COLORS[ci]} opacity="0.85" />
                                      {val > 0 && (
                                        <text x={x + barW / 2} y={y - 2} textAnchor="middle" fill="white" fontSize="7">{val}</text>
                                      )}
                                    </g>
                                  );
                                })}
                                <text
                                  x={groupX + (top5DoneTests.length * (barW + gapBetween)) / 2}
                                  y={labelY}
                                  textAnchor="middle"
                                  fill="#94a3b8"
                                  fontSize="9"
                                >
                                  {label}
                                </text>
                              </g>
                            );
                          })}
                        </svg>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })()}

        {/* Activity view */}
        {mainView === "activity" && (isOwner || canViewActivity) && (
          <LabActivityView />
        )}

        {/* Feedback view */}
        {mainView === "feedback" && (isOwner || canViewFeedback) && (
          <LabFeedbackView labId={lab.id} />
        )}

        {/* Wallet view */}
        {mainView === "wallet" && (isOwner || canViewWallet) && (
          <LabWalletView
            walletData={walletData}
            loading={walletLoading}
            onLoad={async () => {
              setWalletLoading(true);
              try {
                const res = await fetch("/api/lab/wallet");
                const data = await res.json();
                if (data.success) setWalletData(data);
              } catch { /* non-critical */ } finally { setWalletLoading(false); }
            }}
          />
        )}

        {/* Requests view */}
        {mainView === "requests" && (
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
            <Input
              placeholder="Enter patient code (e.g. LABA-8X4K29Q)"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRetrieve()}
              className="!bg-white !backdrop-blur-none border-slate-200 text-slate-800 placeholder-slate-300 font-mono"
            />
            <Button onClick={handleRetrieve} loading={retrieving} className="shrink-0">
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
                    {retrievedRequest.dob ? `${calcAge(retrievedRequest.dob)} yrs` : "—"}{retrievedRequest.sex ? ` · ${retrievedRequest.sex}` : ""}
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
                  <p className="text-white font-medium line-clamp-1">{retrievedRequest.tests}</p>
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
                                {req.sex ?? "—"}{req.dob ? ` · ${calcAge(req.dob)} yrs` : ""}
                              </span>
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
                              {scheduleLabel(req.schedule) && (
                                <span className="text-xs bg-emerald-900/40 text-emerald-400 border border-emerald-800/30 px-2 py-0.5 rounded-full">
                                  {scheduleLabel(req.schedule)}
                                </span>
                              )}
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
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                              <span className="flex items-center gap-1">
                                <Stethoscope className="w-3 h-3" />
                                {[req.doctor_prefix, req.doctor_name].filter(Boolean).join(" ")}
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
                            {scheduleLabel(req.schedule) && (
                              <span className="mt-1 inline-flex text-xs bg-emerald-900/40 text-emerald-400 border border-emerald-800/30 px-2 py-0.5 rounded-full">
                                {scheduleLabel(req.schedule)}
                              </span>
                            )}
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
                        <p className="text-xs text-medical-400 font-semibold uppercase tracking-wider mb-1">Tests Requested</p>
                        <p className="text-white font-semibold leading-snug">{selectedRequest.tests}</p>
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
                    {(selectedRequest.dob || selectedRequest.sex) && (
                      <DetailRow label="Age / Sex">
                        {selectedRequest.dob ? `${calcAge(selectedRequest.dob)} yrs` : ""}{selectedRequest.sex ? `${selectedRequest.dob ? " · " : ""}${selectedRequest.sex}` : ""}
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
                    {scheduleLabel(selectedRequest.schedule) && (
                      <DetailRow label="Preferred Schedule">
                        <span className="text-emerald-300 font-medium">{scheduleLabel(selectedRequest.schedule)}</span>
                      </DetailRow>
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
                    {(selectedRequest.is_critical || selectedRequest.needs_ambulance) && (
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
                    {(selectedRequest.dob || selectedRequest.sex) && (
                      <DetailRow label="Age / Sex">
                        {selectedRequest.dob ? `${calcAge(selectedRequest.dob)} yrs` : ""}{selectedRequest.sex ? `${selectedRequest.dob ? " · " : ""}${selectedRequest.sex}` : ""}
                      </DetailRow>
                    )}
                    {selectedRequest.dob && (
                      <DetailRow label="Date of Birth">
                        {format(new Date(selectedRequest.dob), "dd MMM yyyy")}
                      </DetailRow>
                    )}
                    <div className="border-t border-white/10 pt-3" />
                    <DetailRow label="Tests">
                      <span className="text-white font-medium">{selectedRequest.tests}</span>
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

                {/* Contact */}
                {(() => {
                  const waNumbers: string[] = lab.whatsapp
                    ? (() => { try { const p = JSON.parse(lab.whatsapp); return Array.isArray(p) ? p : [lab.whatsapp]; } catch { return [lab.whatsapp]; } })()
                    : [];
                  const hasContact = lab.address || lab.phones.length > 0 || waNumbers.filter(Boolean).length > 0;
                  return hasContact ? (
                    <div className="bg-white/5 border border-white/8 rounded-xl p-4 space-y-2">
                      <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-3">Contact</p>
                      {lab.address && (
                        <div className="flex items-start gap-2 text-sm text-slate-300">
                          <MapPin className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                          <span>{lab.address}</span>
                        </div>
                      )}
                      {lab.phones.map((ph, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <Phone className="w-4 h-4 text-slate-500 shrink-0" />
                          <a href={`tel:${ph}`} className="text-blue-400 hover:underline">{ph}</a>
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

                {lab.service_categories.length === 0 && lab.certifications.length === 0 && !lab.address && lab.phones.length === 0 && !isOwner && (
                  <p className="text-center text-slate-500 text-sm py-6">No additional profile information yet.</p>
                )}

                {/* Team members — visible to lab owner only */}
                {isOwner && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <UserCircle className="w-4 h-4 text-slate-500" />
                      <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Team Members</p>
                    </div>
                    {teamLoading ? (
                      <p className="text-sm text-slate-500 text-center py-4">Loading…</p>
                    ) : teamMembers.length === 0 ? (
                      <p className="text-sm text-slate-500 text-center py-4">No team members yet. Add them from the admin panel.</p>
                    ) : (
                      <div className="space-y-2">
                        {teamMembers.map((m) => (
                          <div key={m.id} className="bg-white/5 border border-white/8 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm text-white truncate">{m.email ?? "—"}</p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {m.role.name}
                                {m.last_sign_in_at
                                  ? <span className="ml-2">· last login {new Date(m.last_sign_in_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                                  : <span className="ml-2">· never logged in</span>}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
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
                    <p className="text-xs text-medical-400 font-semibold uppercase tracking-wider mb-1">Tests Requested</p>
                    <p className="text-white font-semibold leading-snug">{selectedRequest.tests}</p>
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
                  <p className="text-slate-200 capitalize">{selectedRequest.dob ? `${calcAge(selectedRequest.dob)} yrs` : "—"}{selectedRequest.sex ? ` · ${selectedRequest.sex}` : ""}</p>
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
                {scheduleLabel(selectedRequest.schedule) && (
                  <div>
                    <p className="text-xs text-slate-500 font-medium mb-0.5">Preferred Schedule</p>
                    <p className="text-emerald-300 font-medium text-sm">{scheduleLabel(selectedRequest.schedule)}</p>
                  </div>
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
                {(selectedRequest.is_critical || selectedRequest.needs_ambulance) && (
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
                { key: "dob", label: "Date of Birth", type: "date", placeholder: "" },
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
      </div>
    </div>
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

function LabFeedbackView({ labId }: { labId: string }) {
  const [feedbacks, setFeedbacks] = useState<FeedbackRecord[]>([]);
  const [averages, setAverages] = useState<FeedbackAverages | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [filterType, setFilterType] = useState<"all" | "patient" | "doctor">("all");
  const PAGE = 20;

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
          <h2 className="font-semibold text-white text-base">Patient & Doctor Feedback</h2>
          <p className="text-xs text-slate-500 mt-0.5">Reviews and ratings from your clients</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 bg-white/5 border border-white/8 rounded-full px-2.5 py-1">{total} review{total !== 1 ? "s" : ""}</span>
          <button onClick={() => { setOffset(0); fetchFeedback(0); }} className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
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
        {(["all", "patient", "doctor"] as const).map((t) => (
          <button key={t} onClick={() => setFilterType(t)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors capitalize ${
              filterType === t ? "bg-medical-600 text-white" : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
            }`}>
            {t === "all" ? "All" : t === "patient" ? "Patients" : "Doctors"}
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
          <p className="text-slate-500 text-xs mt-1">Feedback from patients and doctors will appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((fb) => {
            const reviewer = fb.is_anonymous
              ? (fb.display_name ?? "Anonymous")
              : fb.reviewer_email;
            const typeColor = fb.reviewer_type === "patient" ? "text-sky-400 bg-sky-400/10" : "text-violet-400 bg-violet-400/10";
            return (
              <div key={fb.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5">
                {/* Top row */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <p className="text-sm font-semibold text-white truncate">{reviewer}</p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${typeColor}`}>
                        {fb.reviewer_type}
                      </span>
                      {fb.is_anonymous && (
                        <span className="text-xs text-slate-500 bg-white/5 px-2 py-0.5 rounded-full">anonymous</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">{format(new Date(fb.updated_at), "dd MMM yyyy")}</p>
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
// Lab Wallet View
// =============================================================================
type BreakdownItem = { raw: string; canonical_name: string; category: string; unit_price: number; confidence: number };
type WalletTxn = {
  id: string; type: string; direction: string; amount: number; balance_after: number;
  description: string | null; actor_email: string | null; created_at: string;
  request_id: string | null; test_breakdown: unknown; tests_raw: string | null;
};
type WalletViewData = { balance: number; transactions: WalletTxn[] } | null;

function LabWalletView({ walletData, loading, onLoad }: { walletData: WalletViewData; loading: boolean; onLoad: () => void }) {
  const [expandedTxn, setExpandedTxn] = useState<string | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [schedule, setSchedule] = useState<{ category: string; tests: { id: string; name: string; effective_price: number; is_custom: boolean; is_rapid_test: boolean }[] }[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSearch, setScheduleSearch] = useState("");

  useEffect(() => { if (!walletData) onLoad(); }, [walletData, onLoad]);

  async function loadSchedule() {
    if (schedule.length > 0) { setShowSchedule(true); return; }
    setScheduleLoading(true);
    const res = await fetch("/api/lab/price-schedule");
    const data = await res.json();
    setSchedule(data.schedule ?? []);
    setScheduleLoading(false);
    setShowSchedule(true);
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-32 bg-white/5 rounded-2xl" />
        <div className="h-20 bg-white/5 rounded-2xl" />
        <div className="h-48 bg-white/5 rounded-2xl" />
      </div>
    );
  }

  const balance = walletData?.balance ?? 0;
  const transactions = walletData?.transactions ?? [];
  const isNegative = balance < 0;
  const isLow = !isNegative && balance < 5000;

  const filteredSchedule = scheduleSearch.trim()
    ? schedule.map((g) => ({
        ...g,
        tests: g.tests.filter((t) => t.name.toLowerCase().includes(scheduleSearch.toLowerCase())),
      })).filter((g) => g.tests.length > 0)
    : schedule;

  return (
    <div className="space-y-6">
      {/* Balance card */}
      <div className={`rounded-2xl p-6 text-center border ${isNegative ? "bg-red-500/10 border-red-500/20" : isLow ? "bg-amber-500/10 border-amber-500/20" : "bg-emerald-500/10 border-emerald-500/20"}`}>
        <Wallet className={`w-8 h-8 mx-auto mb-2 ${isNegative ? "text-red-400" : isLow ? "text-amber-400" : "text-emerald-400"}`} />
        <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Wallet Balance</p>
        <p className={`text-5xl font-bold font-mono ${isNegative ? "text-red-400" : isLow ? "text-amber-400" : "text-emerald-300"}`}>
          ₦{balance.toLocaleString()}
        </p>
        {isNegative && <p className="mt-3 text-sm text-red-400 font-semibold">Your wallet is overdrawn. Please contact support to top up.</p>}
        {isLow && <p className="mt-3 text-sm text-amber-400">Your balance is running low. Contact your account manager to top up.</p>}
      </div>

      {/* Info card */}
      <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4 flex items-start gap-3">
        <CreditCard className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
        <div className="space-y-1 flex-1">
          <p className="text-sm font-semibold text-white">How charges work</p>
          <p className="text-xs text-slate-400 leading-relaxed">
            Each time you mark a patient request as <strong className="text-white">Seen</strong>, the total price of the requested tests is deducted from your wallet.
            Prices are calculated per test at the time the request is submitted.
            Contact your Poveon account manager to top up your balance.
          </p>
          <button
            onClick={loadSchedule}
            className="mt-2 text-xs text-medical-400 hover:text-medical-300 underline underline-offset-2"
          >
            {showSchedule ? "Hide price schedule" : "View your price schedule →"}
          </button>
        </div>
      </div>

      {/* Price schedule */}
      {showSchedule && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Your Price Schedule</p>
            <button onClick={() => setShowSchedule(false)} className="text-slate-400 hover:text-white text-xs">Hide</button>
          </div>
          <input
            value={scheduleSearch} onChange={(e) => setScheduleSearch(e.target.value)}
            placeholder="Search test name..."
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder-slate-500 outline-none focus:ring-2 focus:ring-medical-500/50"
          />
          {scheduleLoading ? (
            <p className="text-slate-400 text-sm">Loading...</p>
          ) : filteredSchedule.length === 0 ? (
            <p className="text-slate-400 text-sm">No tests found.</p>
          ) : (
            <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
              {filteredSchedule.map((group) => (
                <div key={group.category}>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{group.category}</p>
                  <div className="space-y-1">
                    {group.tests.map((t) => (
                      <div key={t.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white">{t.name}</span>
                          {t.is_rapid_test && <span className="text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">rapid</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-mono ${t.is_custom ? "text-amber-300 font-semibold" : "text-slate-300"}`}>
                            ₦{t.effective_price.toLocaleString()}
                          </span>
                          {t.is_custom && <span className="text-xs text-amber-500">custom</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Transaction history */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-white">Transaction History</p>
          <button onClick={onLoad} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {transactions.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
            <Wallet className="w-8 h-8 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No transactions yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map((txn) => {
              const breakdown = Array.isArray(txn.test_breakdown) ? (txn.test_breakdown as BreakdownItem[]) : null;
              const hasBreakdown = breakdown && breakdown.length > 0;
              const isExpanded = expandedTxn === txn.id;

              return (
                <div key={txn.id} className="bg-white/5 border border-white/8 rounded-xl overflow-hidden">
                  <div
                    className={`flex items-center gap-3 px-4 py-3.5 ${hasBreakdown ? "cursor-pointer hover:bg-white/8" : ""}`}
                    onClick={() => hasBreakdown && setExpandedTxn(isExpanded ? null : txn.id)}
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${txn.direction === "credit" ? "bg-emerald-500/15" : "bg-red-500/15"}`}>
                      {txn.direction === "credit"
                        ? <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                        : <ArrowDownRight className="w-4 h-4 text-red-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">
                        {txn.description ?? (txn.type === "topup" ? "Wallet top-up" : txn.type === "deduction" ? "Request charge" : "Adjustment")}
                      </p>
                      <p className="text-xs text-slate-500">{format(new Date(txn.created_at), "dd MMM yyyy · HH:mm")}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-bold font-mono ${txn.direction === "credit" ? "text-emerald-400" : "text-white"}`}>
                        {txn.direction === "credit" ? "+" : "-"}₦{txn.amount.toLocaleString()}
                      </p>
                      <p className="text-xs text-slate-500 font-mono">bal: ₦{txn.balance_after.toLocaleString()}</p>
                    </div>
                    {hasBreakdown && (
                      <ChevronDown className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    )}
                  </div>

                  {/* Test breakdown drill-down */}
                  {isExpanded && breakdown && (
                    <div className="border-t border-white/8 px-4 pb-3 pt-2 space-y-1.5">
                      <p className="text-xs text-slate-500 font-medium mb-2">Test breakdown</p>
                      {breakdown.map((item, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-white truncate">{item.canonical_name}</span>
                            <span className="text-slate-500 shrink-0">{item.category}</span>
                          </div>
                          <span className="font-mono text-slate-300 shrink-0">₦{item.unit_price.toLocaleString()}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between text-xs border-t border-white/8 pt-1.5 mt-1.5">
                        <span className="text-slate-400 font-medium">Total charged</span>
                        <span className="font-mono text-white font-bold">₦{txn.amount.toLocaleString()}</span>
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
