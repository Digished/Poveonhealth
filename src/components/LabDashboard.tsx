"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "react-hot-toast";
import {
  Search, RefreshCw, CheckCircle, Clock, FlaskConical,
  ChevronRight, Calendar, Stethoscope, LogOut, Eye, EyeOff, Phone, X,
  Link2, Paperclip, Send, SkipForward, UserCircle, MapPin, Shield, Layers,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { StatusBadge } from "@/components/ui/Badge";
import type { LabRequest, RequestStatus } from "@/lib/types";
import { SERVICE_CATEGORIES } from "@/lib/constants";
import { format, differenceInYears } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface LabDashboardProps {
  lab: {
    id: string;
    name: string;
    logo_url: string | null;
    address: string;
    description: string;
    phones: string[];
    service_categories: string[];
    certifications: string[];
  };
  isOwner?: boolean;
}

const TABS: { key: RequestStatus; label: string; icon: React.ReactNode }[] = [
  { key: "incoming", label: "Incoming", icon: <Clock className="w-4 h-4" /> },
  { key: "seen", label: "Patient Seen", icon: <Eye className="w-4 h-4" /> },
  { key: "done", label: "Done", icon: <CheckCircle className="w-4 h-4" /> },
];

function calcAge(dob: string): number {
  return differenceInYears(new Date(), new Date(dob));
}

export function LabDashboard({ lab, isOwner = false }: LabDashboardProps) {
  const { name: labName, logo_url: labLogoUrl } = lab;
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<RequestStatus>("incoming");
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
  const [teamMembers, setTeamMembers] = useState<{ id: string; email: string; role: { name: string }; last_sign_in_at: string | null }[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);

  // Results modal state
  const [resultsModalRequest, setResultsModalRequest] = useState<LabRequest | null>(null);
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
    const interval = setInterval(() => fetchRequests(true), 30_000);
    return () => clearInterval(interval);
  }, [fetchRequests]);

  const tabRequests = requests.filter((r) => r.status === activeTab);

  // Find a request that matches the code input as user types — auto-switch tab when found
  const codeNormalized = codeInput.trim().toUpperCase();
  const codeMatch = codeNormalized.length >= 3
    ? requests.find((r) => r.code === codeNormalized || r.code.startsWith(codeNormalized))
    : null;

  // When a match is found in a different tab, switch to that tab automatically
  useEffect(() => {
    if (codeMatch && codeMatch.status !== activeTab) {
      setActiveTab(codeMatch.status as RequestStatus);
      setSelectedRequest(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeMatch?.id]);

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
    setResultLink("");
    setResultFiles([]);
    setResultNote("");
    setPatientEmailInput("");
    setPatientEmailError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function closeResultsModal() {
    setResultsModalRequest(null);
    setPatientEmailError("");
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

  const counts = {
    incoming: requests.filter((r) => r.status === "incoming").length,
    seen: requests.filter((r) => r.status === "seen").length,
    done: requests.filter((r) => r.status === "done").length,
  };

  const isRevealed = selectedRequest?.status !== "incoming";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-medical-950 to-slate-900 text-white">
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
              <h1 className="font-bold text-white text-sm leading-none">Poveon</h1>
              <p className="text-xs text-blue-300 mt-0.5">{labName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchRequests(true)}
              disabled={refreshing}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
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
              onClick={handleSignOut}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white text-sm"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Code reveal section */}
        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 mb-8">
          <h2 className="text-sm font-semibold text-slate-300 mb-1 uppercase tracking-wider">
            Reveal Patient Details
          </h2>
          <p className="text-xs text-slate-500 mb-3">
            Enter the code the patient or doctor brings to reveal their full information.
          </p>
          <div className="flex gap-3">
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
                    {calcAge(retrievedRequest.dob)} yrs · {retrievedRequest.sex}
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

            {activeTab === "incoming" && tabRequests.length > 0 && (
              <div className="flex items-center gap-2 mb-3 px-1">
                <EyeOff className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <p className="text-xs text-slate-500">
                  Patient names and codes are hidden until the code is entered above.
                </p>
              </div>
            )}

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
                      codeMatch?.id === req.id
                        ? "bg-medical-900/60 border-medical-500/60 ring-2 ring-medical-500/40"
                        : selectedRequest?.id === req.id
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
                                {req.sex} · {calcAge(req.dob)} yrs
                              </span>
                            </div>
                            <p className="text-sm text-slate-300 line-clamp-2">
                              <span className="text-slate-500 font-medium">Tests: </span>
                              {req.tests}
                            </p>
                            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {format(new Date(req.created_at), "dd MMM yyyy")}
                            </p>
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
                            <p className="mt-1.5 text-xs text-slate-400 line-clamp-1">
                              <span className="text-slate-500 font-medium">Tests: </span>
                              {req.tests}
                            </p>
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
                    <DetailRow label="Code">
                      <span className="font-mono font-bold text-medical-400">{selectedRequest.code}</span>
                    </DetailRow>
                    <DetailRow label="Patient Name">{selectedRequest.patient_name}</DetailRow>
                    <DetailRow label="Age / Sex">
                      {calcAge(selectedRequest.dob)} yrs ·{" "}
                      <span className="capitalize">{selectedRequest.sex}</span>
                    </DetailRow>
                    <DetailRow label="Date of Birth">
                      {format(new Date(selectedRequest.dob), "dd MMM yyyy")}
                    </DetailRow>
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
                    <div className="border-t border-white/10 pt-3" />
                    {selectedRequest.diagnosis && (
                      <DetailRow label="Diagnosis">{selectedRequest.diagnosis}</DetailRow>
                    )}
                    <DetailRow label="Tests">
                      <span className="text-white font-medium">{selectedRequest.tests}</span>
                    </DetailRow>
                    <DetailRow label="Submitted">
                      {format(new Date(selectedRequest.created_at), "dd MMM yyyy HH:mm")}
                    </DetailRow>
                    {selectedRequest.seen_at && (
                      <DetailRow label="Retrieved">
                        {format(new Date(selectedRequest.seen_at), "dd MMM yyyy HH:mm")}
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
                    <DetailRow label="Age / Sex">
                      {calcAge(selectedRequest.dob)} yrs ·{" "}
                      <span className="capitalize">{selectedRequest.sex}</span>
                    </DetailRow>
                    <DetailRow label="Date of Birth">
                      {format(new Date(selectedRequest.dob), "dd MMM yyyy")}
                    </DetailRow>
                    <div className="border-t border-white/10 pt-3" />
                    <DetailRow label="Tests">
                      <span className="text-white font-medium">{selectedRequest.tests}</span>
                    </DetailRow>
                    {selectedRequest.diagnosis && (
                      <DetailRow label="Diagnosis">{selectedRequest.diagnosis}</DetailRow>
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
                  </div>
                  <button
                    onClick={closeResultsModal}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors shrink-0"
                    title="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

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
                      PDF Attachments <span className="normal-case font-normal text-slate-500">(optional, multiple)</span>
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

                  {/* Note to doctor */}
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Note to Doctor <span className="normal-case font-normal text-slate-500">(optional)</span>
                    </label>
                    <textarea
                      rows={3}
                      placeholder="e.g. Culture results may follow within 48 hours…"
                      value={resultNote}
                      onChange={(e) => setResultNote(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-medical-500/50 focus:border-medical-500/50 transition-colors resize-none"
                    />
                  </div>

                  {/* Patient email — required when none is on file */}
                  {!resultsModalRequest.patient_email && (
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        Patient Email <span className="text-red-400 ml-0.5">*</span>
                      </label>
                      <input
                        type="email"
                        placeholder="patient@example.com"
                        value={patientEmailInput}
                        onChange={(e) => {
                          setPatientEmailInput(e.target.value);
                          if (patientEmailError) setPatientEmailError("");
                        }}
                        className={`w-full bg-white/5 border rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-colors ${
                          patientEmailError
                            ? "border-red-500 focus:ring-red-500/50"
                            : "border-white/10 focus:ring-medical-500/50 focus:border-medical-500/50"
                        }`}
                      />
                      {patientEmailError ? (
                        <p className="text-xs text-red-400 font-medium mt-1.5">{patientEmailError}</p>
                      ) : (
                        <p className="text-xs text-slate-500 mt-1.5">
                          No email on file — required to send results to the patient.
                        </p>
                      )}
                    </div>
                  )}

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
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Lab Profile modal */}
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
                {(lab.address || lab.phones.length > 0) && (
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
                  </div>
                )}

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
                              <p className="text-sm text-white truncate">{m.email}</p>
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
        {mobileDetailOpen && selectedRequest && (
          <div className="fixed inset-0 z-40 lg:hidden flex items-end bg-black/60 backdrop-blur-sm">
            <div className="w-full bg-slate-900 border-t border-white/10 rounded-t-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
              <div className="sticky top-0 bg-slate-900 border-b border-white/10 p-4 flex items-center justify-between">
                <h3 className="font-semibold text-white">Request Details</h3>
                <button onClick={() => setMobileDetailOpen(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 space-y-4 text-sm">
                {selectedRequest.status !== "incoming" ? (
                  <>
                    <div>
                      <p className="text-xs text-slate-500 font-medium mb-0.5">Code</p>
                      <p className="font-mono font-bold text-medical-400">{selectedRequest.code}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium mb-0.5">Patient Name</p>
                      <p className="text-slate-200">{selectedRequest.patient_name}</p>
                    </div>
                  </>
                ) : null}
                <div>
                  <p className="text-xs text-slate-500 font-medium mb-0.5">Age / Sex</p>
                  <p className="text-slate-200 capitalize">{calcAge(selectedRequest.dob)} yrs · {selectedRequest.sex}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium mb-0.5">Date of Birth</p>
                  <p className="text-slate-200">{format(new Date(selectedRequest.dob), "dd MMM yyyy")}</p>
                </div>
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
                  </>
                )}
                {selectedRequest.diagnosis && (
                  <div>
                    <p className="text-xs text-slate-500 font-medium mb-0.5">Diagnosis</p>
                    <p className="text-slate-200">{selectedRequest.diagnosis}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-slate-500 font-medium mb-0.5">Tests</p>
                  <p className="text-slate-200 font-medium">{selectedRequest.tests}</p>
                </div>
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
