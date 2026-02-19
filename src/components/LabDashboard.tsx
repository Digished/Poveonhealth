"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "react-hot-toast";
import {
  Search, RefreshCw, CheckCircle, Clock, FlaskConical,
  ChevronRight, Calendar, Stethoscope, LogOut, Eye, EyeOff, Phone,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { StatusBadge } from "@/components/ui/Badge";
import type { LabRequest, RequestStatus } from "@/lib/types";
import { format, differenceInYears } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface LabDashboardProps {
  labName: string;
  labId: string;
  labLogoUrl?: string | null;
}

const TABS: { key: RequestStatus; label: string; icon: React.ReactNode }[] = [
  { key: "incoming", label: "Incoming", icon: <Clock className="w-4 h-4" /> },
  { key: "seen", label: "Patient Seen", icon: <Eye className="w-4 h-4" /> },
  { key: "done", label: "Done", icon: <CheckCircle className="w-4 h-4" /> },
];

function calcAge(dob: string): number {
  return differenceInYears(new Date(), new Date(dob));
}

export function LabDashboard({ labName, labId: _labId, labLogoUrl }: LabDashboardProps) {
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

  async function handleMarkDone(req: LabRequest) {
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
              onClick={handleSignOut}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white text-sm"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
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
              className="bg-white/10 border-white/20 text-white placeholder-slate-400 font-mono"
            />
            <Button onClick={handleRetrieve} loading={retrieving} className="shrink-0">
              <Search className="w-4 h-4" />
              Reveal
            </Button>
          </div>

          {retrievedRequest && (
            <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl animate-slide-up">
              <p className="text-xs text-emerald-400 font-semibold uppercase tracking-wider mb-3">
                Patient Revealed
              </p>
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
                  <p className="text-xs text-slate-400">Doctor</p>
                  <p className="text-white font-medium">{retrievedRequest.doctor_name}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Tests</p>
                  <p className="text-white font-medium line-clamp-1">{retrievedRequest.tests}</p>
                </div>
              </div>
              {retrievedRequest.address && (
                <p className="mt-2 text-xs text-slate-400">
                  <span className="text-slate-500">Address: </span>{retrievedRequest.address}
                </p>
              )}
            </div>
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
                    onClick={() => setSelectedRequest(selectedRequest?.id === req.id ? null : req)}
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
                                {req.doctor_name}
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

          {/* Right: Detail panel */}
          <div>
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
                    <div className="border-t border-white/10 pt-3" />
                    <DetailRow label="Referring Doctor">{selectedRequest.doctor_name}</DetailRow>
                    <DetailRow label="Doctor Email">{selectedRequest.doctor_email}</DetailRow>
                    {selectedRequest.doctor_phone && (
                      <DetailRow label="Doctor Phone">
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
                      onClick={() => handleMarkDone(selectedRequest)}
                    >
                      <CheckCircle className="w-4 h-4" />
                      Mark Tests as Done
                    </Button>
                    <p className="text-xs text-slate-400 text-center mt-2">
                      Doctor will be notified by email
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
