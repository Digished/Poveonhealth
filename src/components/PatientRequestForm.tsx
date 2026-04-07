"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-hot-toast";
import {
  FlaskConical, User, Check, Search, X, ChevronRight, ChevronLeft,
  Building2, MapPin, Loader2, MessageCircle, RefreshCw, Send,
  ShieldAlert, Sparkles, Grid3X3, Phone, Copy, Link2,
} from "lucide-react";
import { parsePhones } from "@/lib/phones";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { PhoneInput } from "@/components/PhoneInput";
import type { Lab } from "@/lib/types";

interface PatientRequestFormProps {
  initialLabs?: Lab[];
  preselectedLabId?: string;
  preselectedLabName?: string;
  preselectedLabAddress?: string;
  preselectedLabLogoUrl?: string;
  preselectedServiceCategories?: string[];
  preselectedLabPhones?: unknown;
  locations?: Array<{
    lab_id: string;
    lab_branch_id: string | null;
    name: string;
    address: string;
  }>;
}

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  suggestions?: string[];
};

const STEPS = [
  { title: "Services", icon: FlaskConical },
  { title: "Details", icon: User },
  { title: "Review", icon: Check },
];

/** Lab search modal */
function LabSearchModal({
  labs,
  onSelect,
  onClose,
}: {
  labs: Lab[];
  onSelect: (lab: Lab) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = "auto"; };
  }, []);

  useEffect(() => { setTimeout(() => searchRef.current?.focus(), 80); }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? labs.filter((l) => l.name.toLowerCase().includes(q) || l.address?.toLowerCase().includes(q))
    : labs;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full sm:w-[480px] sm:mx-4 bg-white sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[85vh] sm:max-h-[620px] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">Select Laboratory</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-4 py-3 border-b border-slate-100 relative">
          <Search className="absolute left-7 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search by name or location…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-400"
          />
        </div>
        <ul className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <li className="px-5 py-8 text-sm text-slate-400 text-center">No laboratories found</li>
          ) : (
            filtered.map((lab) => (
              <li key={lab.id}>
                <button
                  onClick={() => { onSelect(lab); onClose(); }}
                  className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors text-left"
                >
                  {lab.logo_url ? (
                    <img src={lab.logo_url} alt={lab.name} className="w-10 h-10 rounded-xl object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-medical-100 flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5 text-medical-600" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate text-slate-800">{lab.name}</p>
                    {lab.address && (
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                        <MapPin className="w-3 h-3 shrink-0" />{lab.address}
                      </p>
                    )}
                  </div>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>,
    document.body
  );
}

function PatientSuccessScreen({
  data,
  onReset,
}: {
  data: { code: string; labName: string; labAddress: string; labPhones: { number: string; label: string }[] };
  onReset: () => void;
}) {
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  async function copyCode() {
    try { await navigator.clipboard.writeText(data.code); } catch { /* ignore */ }
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 3000);
  }
  async function copyLink() {
    const url = `${window.location.origin}/r/${data.code}`;
    try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 3000);
  }

  return (
    <div className="animate-slide-up space-y-4 pt-4">
      <div className="text-center py-2">
        <div className="w-16 h-16 bg-emerald-100 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-sm">
          <Check className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Request Submitted!</h2>
        <p className="text-sm text-slate-500 mt-1.5">An SMS confirmation will be sent to your phone shortly.</p>
      </div>

      <div className="glass-card p-5">
        <p className="text-[10px] font-bold text-medical-500 uppercase tracking-widest text-center mb-2">
          Your Request Code
        </p>
        <div className="flex items-center justify-center gap-3">
          <p className="text-4xl font-black text-medical-700 font-mono tracking-[0.25em] py-1">
            {data.code}
          </p>
          <button
            onClick={copyCode}
            className="p-2 rounded-xl bg-medical-50 border border-medical-200 hover:bg-medical-100 transition-colors"
            title={codeCopied ? "Copied!" : "Copy code"}
          >
            {codeCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-medical-600" />}
          </button>
        </div>
        <p className="text-xs text-center text-medical-600 mt-2 font-medium">Show this code at the lab reception</p>
        <button
          onClick={copyLink}
          className="mt-3 w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl border border-medical-200 bg-white hover:bg-medical-50 text-xs font-semibold text-medical-700 transition-colors"
        >
          {linkCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Link2 className="w-3.5 h-3.5" />}
          {linkCopied ? "Link copied!" : "Copy shareable link"}
        </button>
      </div>

      <div className="glass-card px-4 py-3.5 space-y-1">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Laboratory</p>
        <p className="text-sm font-bold text-slate-800">{data.labName}</p>
        {data.labAddress && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.labName + " " + data.labAddress)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-1.5 mt-0.5 group"
          >
            <MapPin className="w-3 h-3 mt-0.5 shrink-0 text-medical-400" />
            <span className="text-xs text-medical-600 group-hover:underline">{data.labAddress}</span>
          </a>
        )}
        {data.labPhones.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Contact the Lab</p>
            <div className="space-y-1.5">
              {data.labPhones.map((p, i) => (
                <a key={i} href={`tel:${p.number}`} className="flex items-center gap-2 text-sm font-medium text-medical-700 hover:text-medical-900 transition-colors">
                  <Phone className="w-3.5 h-3.5 shrink-0 text-medical-400" />
                  {p.label ? <><span className="text-slate-500 text-xs">{p.label}:</span> {p.number}</> : p.number}
                </a>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-2">You can also call these numbers if you have any questions.</p>
          </div>
        )}
      </div>

      <button
        onClick={onReset}
        className="w-full text-sm font-semibold text-medical-600 hover:text-medical-700 py-2.5 rounded-xl hover:bg-medical-50 transition-colors"
      >
        Submit another request
      </button>
    </div>
  );
}

export function PatientRequestForm(props: PatientRequestFormProps) {
  const {
    initialLabs = [],
    preselectedLabId,
    preselectedLabName,
    preselectedLabAddress,
    preselectedLabLogoUrl,
    preselectedServiceCategories = [],
    locations = [],
  } = props;

  // ── Step & nav ──────────────────────────────────────────────────────────────
  const [step, setStep] = useState(1);
  const [maxStep, setMaxStep] = useState(1);

  // ── Lab selection ────────────────────────────────────────────────────────────
  const [labId, setLabId] = useState(preselectedLabId || "");
  const [labName, setLabName] = useState(preselectedLabName || "");
  const [labAddress, setLabAddress] = useState(preselectedLabAddress || "");
  const [labLogoUrl, setLabLogoUrl] = useState(preselectedLabLogoUrl || "");
  const [labServiceCategories, setLabServiceCategories] = useState(preselectedServiceCategories);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    locations[0]?.lab_branch_id ?? null
  );

  // ── Test selection ───────────────────────────────────────────────────────────
  const [selectedTests, setSelectedTests] = useState<string[]>([]);
  const [testMode, setTestMode] = useState<"assistant" | "categories">("categories");
  const [additionalNotes, setAdditionalNotes] = useState("");

  // ── Health Assistant chat ────────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── Patient details ──────────────────────────────────────────────────────────
  const [patientPhone, setPatientPhone] = useState("");
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientEmail, setPatientEmail] = useState("");

  // ── Submission ───────────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [successData, setSuccessData] = useState<{
    code: string;
    labName: string;
    labAddress: string;
    labPhones: { number: string; label: string }[];
  } | null>(null);

  // ── Lab loading ──────────────────────────────────────────────────────────────
  const [showLabModal, setShowLabModal] = useState(false);
  const [labsLoading, setLabsLoading] = useState(false);
  const [labs, setLabs] = useState(initialLabs);

  // ── Sticky header scroll ─────────────────────────────────────────────────────
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ── Scroll chat to bottom ────────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // ── Fetch labs on demand ─────────────────────────────────────────────────────
  const fetchLabs = useCallback(async () => {
    if (labs.length > 0) return;
    setLabsLoading(true);
    try {
      const res = await fetch("/api/labs");
      const data = await res.json();
      if (data.labs) setLabs(data.labs);
    } catch {
      toast.error("Failed to load laboratories");
    } finally {
      setLabsLoading(false);
    }
  }, [labs.length]);

  const handleLabSelect = (lab: Lab) => {
    setLabId(lab.id);
    setLabName(lab.name);
    setLabAddress(lab.address ?? "");
    setLabLogoUrl(lab.logo_url ?? "");
    setLabServiceCategories((lab.service_categories as string[]) ?? []);
    setSelectedTests([]);
  };

  // ── stepValid ────────────────────────────────────────────────────────────────
  const stepValid = (() => {
    if (step === 1) {
      if (!preselectedLabId && !labId) return false;
      return selectedTests.length > 0;
    }
    if (step === 2) {
      return patientPhone.trim().length > 0 && patientName.trim().length > 0;
    }
    return true;
  })();

  const handleNext = () => {
    const next = step + 1;
    setStep(next);
    setMaxStep((m) => Math.max(m, next));
  };

  // ── Chat ─────────────────────────────────────────────────────────────────────
  const handleChatSend = useCallback(async () => {
    if (!chatInput.trim() || !labId || chatLoading) return;
    const userMsg: ChatMessage = { role: "user", content: chatInput.trim() };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);
    try {
      const res = await fetch(`/api/labs/${labId}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...chatMessages, userMsg].map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setChatMessages((prev) => [...prev, { role: "assistant", content: data.message, suggestions: data.suggestions }]);
      // Auto-add all suggestions to the test list
      if (data.suggestions && data.suggestions.length > 0) {
        setSelectedTests((prev) => {
          const toAdd = (data.suggestions as string[]).filter((s) => !prev.includes(s));
          return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
        });
      }
    } catch {
      toast.error("Assistant unavailable — please try again");
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, labId, chatLoading, chatMessages]);

  const toggleTest = (test: string) => {
    setSelectedTests((prev) => prev.includes(test) ? prev.filter((t) => t !== test) : [...prev, test]);
  };

  // ── Submit ────────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/requests/patient-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lab_id: labId,
          branch_id: selectedLocationId || undefined,
          patient_name: patientName,
          patient_phone: patientPhone,
          patient_email: patientEmail || undefined,
          patient_age: patientAge ? parseInt(patientAge) : undefined,
          tests: selectedTests.join(", "),
          additional_notes: additionalNotes,
        }),
      });
      const data = await res.json();
      if (!data.success) { toast.error(data.error || "Failed to submit"); return; }
      setSuccessData({
        code: data.code,
        labName: data.lab.name,
        labAddress: data.lab.address,
        labPhones: parsePhones(data.lab.phones),
      });
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success screen ────────────────────────────────────────────────────────────
  if (successData) {
    return <PatientSuccessScreen data={successData} onReset={() => window.location.reload()} />;
  }

  // ── Main form ─────────────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in">
      {/* ── Sticky step header ── */}
      <div className={`sticky top-0 z-10 -mx-4 px-4 pt-3 pb-3 transition-all duration-200 ${
        scrolled
          ? "bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm"
          : "bg-white/80 backdrop-blur-sm border-b border-slate-100"
      }`}>
        {/* Lab name when scrolled */}
        {scrolled && (labName || preselectedLabName) && (
          <p className="text-xs font-semibold text-medical-600 truncate mb-2 -mt-0.5">
            {labName || preselectedLabName}
          </p>
        )}
        <div className="flex items-center">
          {STEPS.map((s, i) => {
            const num = i + 1;
            const done = num < step;
            const active = num === step;
            const visited = num <= maxStep;
            const Icon = s.icon;
            return (
              <div key={s.title} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <button
                    type="button"
                    onClick={() => visited && num < step && setStep(num)}
                    disabled={!visited || num >= step}
                    className={`rounded-full flex items-center justify-center transition-all border-2 focus:outline-none ${
                      done
                        ? "w-6 h-6 bg-slate-700 text-white border-slate-700 cursor-pointer hover:bg-medical-600 hover:border-medical-600"
                        : active
                        ? "w-7 h-7 bg-slate-900 text-white border-slate-800 ring-2 ring-slate-900/10 cursor-default"
                        : "w-6 h-6 bg-white text-slate-300 border-slate-200 cursor-default"
                    }`}
                  >
                    {done ? <Check className="w-2.5 h-2.5" /> : <Icon className={active ? "w-3 h-3" : "w-2.5 h-2.5"} />}
                  </button>
                  <p className={`text-xs whitespace-nowrap transition-all duration-200 hidden sm:block mt-1 ${
                    scrolled ? "max-h-0 opacity-0 overflow-hidden" : "max-h-5 opacity-100"
                  } ${active ? "font-semibold text-slate-800" : done ? "font-medium text-slate-500" : "font-medium text-slate-400"}`}>
                    {s.title}
                  </p>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1.5 mb-3 rounded transition-colors ${done ? "bg-slate-500" : "bg-slate-200"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Step 1: Services ── */}
      {step === 1 && (
        <div className="mt-4 space-y-4">
          {/* Lab selection card (home page) */}
          {!preselectedLabId && (
            <div className="glass-card p-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Laboratory</p>
              {!labId ? (
                <button
                  onClick={() => { fetchLabs(); setShowLabModal(true); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-medical-300 bg-medical-50/60 text-medical-700 font-medium hover:bg-medical-100 hover:border-medical-400 transition-all"
                >
                  {labsLoading
                    ? <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    : <Search className="w-4 h-4 shrink-0" />}
                  <span className="text-sm">{labsLoading ? "Loading laboratories…" : "Choose a laboratory"}</span>
                </button>
              ) : (
                <div className="flex items-center gap-3 p-3 rounded-xl border border-medical-200 bg-medical-50">
                  {labLogoUrl ? (
                    <img src={labLogoUrl} alt={labName} className="w-10 h-10 rounded-xl object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-medical-100 flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5 text-medical-600" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-medical-900 text-sm truncate">{labName}</p>
                    {labAddress && (
                      <p className="text-xs text-medical-600 flex items-center gap-1 mt-0.5 truncate">
                        <MapPin className="w-3 h-3 shrink-0" />{labAddress}
                      </p>
                    )}
                  </div>
                  <button onClick={() => { setLabId(""); setSelectedTests([]); }} className="p-1.5 rounded-lg text-medical-500 hover:text-medical-700 hover:bg-medical-100 transition-colors shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {showLabModal && (
                <LabSearchModal labs={labs} onSelect={handleLabSelect} onClose={() => setShowLabModal(false)} />
              )}
            </div>
          )}

          {/* Location selector (lab page with multiple branches) */}
          {preselectedLabId && locations.length > 1 && (
            <div className="glass-card p-4">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-2">Branch / Location</label>
              <select
                value={selectedLocationId || ""}
                onChange={(e) => setSelectedLocationId(e.target.value || null)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500"
              >
                {locations.map((loc) => (
                  <option key={loc.lab_id} value={loc.lab_branch_id || ""}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Test selection — only when lab is chosen */}
          {labId && (
            <div className="glass-card p-4 space-y-4">
              {/* Mode toggle */}
              <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                <button
                  onClick={() => setTestMode("categories")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
                    testMode === "categories"
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Grid3X3 className="w-3.5 h-3.5" />
                  Browse Services
                </button>
                <button
                  onClick={() => setTestMode("assistant")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
                    testMode === "assistant"
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Health Assistant
                </button>
              </div>

              {/* Categories grid */}
              {testMode === "categories" && (
                labServiceCategories.length === 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-center">
                    <p className="text-sm font-semibold text-amber-800">No service categories configured</p>
                    <p className="text-xs text-amber-600 mt-1">Use the Health Assistant tab or contact the lab directly.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {labServiceCategories.map((cat) => {
                      const selected = selectedTests.includes(cat);
                      return (
                        <button
                          key={cat}
                          onClick={() => toggleTest(cat)}
                          className={`relative p-3 rounded-xl text-center text-sm font-semibold transition-all border-2 ${
                            selected
                              ? "bg-medical-600 text-white border-medical-600 shadow-md shadow-medical-600/20"
                              : "bg-white/70 text-slate-700 border-slate-200 hover:border-medical-300 hover:bg-medical-50"
                          }`}
                        >
                          {selected && (
                            <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-white/30 rounded-full flex items-center justify-center">
                              <Check className="w-2.5 h-2.5 text-white" />
                            </span>
                          )}
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                )
              )}

              {/* Health Assistant chat */}
              {testMode === "assistant" && (
                <div className="space-y-3">
                  {/* Disclaimer */}
                  <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
                    <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 leading-relaxed">
                      This Health Assistant provides general guidance only and is not a substitute for medical advice. Always consult a qualified healthcare professional.
                    </p>
                  </div>

                  {/* Chat window */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-white/80">
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      <p className="text-xs font-semibold text-slate-600">{labName ? `${labName} Assistant` : "Health Assistant"}</p>
                    </div>

                    <div className="min-h-[200px] max-h-[280px] overflow-y-auto p-3 space-y-3">
                      {chatMessages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-36 text-center gap-2">
                          <div className="w-10 h-10 rounded-2xl bg-medical-100 flex items-center justify-center">
                            <MessageCircle className="w-5 h-5 text-medical-500" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-600">How can I help you today?</p>
                            <p className="text-xs text-slate-400 mt-0.5 max-w-[220px]">Describe your concern and tests will be automatically added to your request.</p>
                          </div>
                        </div>
                      ) : (
                        chatMessages.map((msg, i) => (
                          <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                            {msg.role === "assistant" && (
                              <div className="w-6 h-6 rounded-full bg-medical-100 flex items-center justify-center shrink-0 mt-0.5">
                                <Sparkles className="w-3 h-3 text-medical-600" />
                              </div>
                            )}
                            <div className={`max-w-[80%] space-y-1.5 ${msg.role === "user" ? "items-end flex flex-col" : ""}`}>
                              <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                                msg.role === "user"
                                  ? "bg-medical-600 text-white rounded-tr-sm"
                                  : "bg-white border border-slate-200 text-slate-700 rounded-tl-sm shadow-sm"
                              }`}>
                                {msg.content}
                              </div>
                              {msg.suggestions && msg.suggestions.length > 0 && (
                                <div className="space-y-1.5 px-1">
                                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Added to your request</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {msg.suggestions.map((sugg) => {
                                      const sel = selectedTests.includes(sugg);
                                      return (
                                        <button
                                          key={sugg}
                                          onClick={() => toggleTest(sugg)}
                                          title={sel ? "Click to remove" : "Click to add back"}
                                          className={`px-2.5 py-1 text-xs font-semibold rounded-full border transition-all ${
                                            sel
                                              ? "bg-emerald-600 text-white border-emerald-600"
                                              : "bg-slate-100 text-slate-400 border-slate-200 line-through"
                                          }`}
                                        >
                                          {sel ? <><Check className="w-3 h-3 inline mr-1" />{sugg}</> : sugg}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                      {chatLoading && (
                        <div className="flex gap-2 justify-start">
                          <div className="w-6 h-6 rounded-full bg-medical-100 flex items-center justify-center shrink-0 mt-0.5">
                            <Sparkles className="w-3 h-3 text-medical-600" />
                          </div>
                          <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-3.5 py-2.5 shadow-sm">
                            <div className="flex gap-1 items-center h-4">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.3s]" />
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.15s]" />
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" />
                            </div>
                          </div>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>

                    {/* Chat input */}
                    <div className="p-3 border-t border-slate-200 bg-white/80 flex gap-2">
                      <input
                        type="text"
                        placeholder="Describe your health concern…"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleChatSend()}
                        disabled={chatLoading}
                        className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-medical-400 focus:border-medical-400 disabled:opacity-60"
                      />
                      <button
                        onClick={handleChatSend}
                        disabled={chatLoading || !chatInput.trim()}
                        className="w-9 h-9 rounded-xl bg-medical-600 text-white flex items-center justify-center hover:bg-medical-700 disabled:opacity-40 transition-all shrink-0"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Selected tests summary */}
              {selectedTests.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Selected</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedTests.map((test) => (
                      <span
                        key={test}
                        className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full bg-medical-100 text-medical-700 text-sm font-semibold border border-medical-200"
                      >
                        {test}
                        <button onClick={() => toggleTest(test)} className="w-4 h-4 rounded-full bg-medical-200 flex items-center justify-center hover:bg-medical-300 transition-colors">
                          <X className="w-2.5 h-2.5 text-medical-700" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Additional notes */}
              <Textarea
                label="Additional Notes (optional)"
                placeholder="Any specific concerns or instructions…"
                rows={2}
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Your Details ── */}
      {step === 2 && (
        <div className="mt-4 space-y-4">
          <div className="glass-card p-4">
            <h2 className="flex items-center gap-3 text-base font-bold text-slate-800 pb-4 border-b border-slate-100 mb-1">
              <div className="w-8 h-8 rounded-xl bg-medical-50 flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-medical-600" />
              </div>
              Your Details
            </h2>

            <div className="relative pt-2">
              {/* Substep 1: Phone */}
              <div className="relative flex gap-3">
                <div className="flex flex-col items-center shrink-0 pt-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all shrink-0 ${
                    patientPhone.trim()
                      ? "bg-emerald-500 border-emerald-500 text-white"
                      : "bg-white border-medical-400 text-medical-600"
                  }`}>
                    {patientPhone.trim() ? <Check className="w-3.5 h-3.5" /> : "1"}
                  </div>
                  {patientPhone.trim() && <div className="w-0.5 flex-1 min-h-4 bg-slate-200 mt-1" />}
                </div>
                <div className="flex-1 pb-4 min-w-0">
                  <PhoneInput
                    label="Phone Number"
                    required
                    value={patientPhone}
                    onChange={setPatientPhone}
                  />
                  <p className="text-xs text-slate-400 mt-1.5">We'll send your request code to this number.</p>
                </div>
              </div>

              {/* Substep 2: Name — reveals after phone */}
              {patientPhone.trim() && (
                <div className="relative flex gap-3 animate-fade-in-up">
                  <div className="flex flex-col items-center shrink-0 pt-1">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all shrink-0 ${
                      patientName.trim()
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : "bg-white border-medical-400 text-medical-600"
                    }`}>
                      {patientName.trim() ? <Check className="w-3.5 h-3.5" /> : "2"}
                    </div>
                    {patientName.trim() && <div className="w-0.5 flex-1 min-h-4 bg-slate-200 mt-1" />}
                  </div>
                  <div className="flex-1 pb-4 min-w-0">
                    <Input
                      label="Full Name"
                      placeholder="Your full name"
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              {/* Substep 3: Age — reveals after name */}
              {patientPhone.trim() && patientName.trim() && (
                <div className="relative flex gap-3 animate-fade-in-up">
                  <div className="flex flex-col items-center shrink-0 pt-1">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all shrink-0 ${
                      patientAge.trim()
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : "bg-white border-slate-300 text-slate-400"
                    }`}>
                      {patientAge.trim() ? <Check className="w-3.5 h-3.5" /> : "3"}
                    </div>
                    <div className="w-0.5 flex-1 min-h-4 bg-slate-200 mt-1" />
                  </div>
                  <div className="flex-1 pb-4 min-w-0">
                    <Input
                      label="Age (optional)"
                      type="number"
                      min="0"
                      max="150"
                      placeholder="e.g. 35"
                      value={patientAge}
                      onChange={(e) => setPatientAge(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Substep 4: Email — reveals after name */}
              {patientPhone.trim() && patientName.trim() && (
                <div className="relative flex gap-3 animate-fade-in-up">
                  <div className="flex flex-col items-center shrink-0 pt-1">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all shrink-0 ${
                      patientEmail.trim()
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : "bg-white border-slate-300 text-slate-400"
                    }`}>
                      {patientEmail.trim() ? <Check className="w-3.5 h-3.5" /> : "4"}
                    </div>
                  </div>
                  <div className="flex-1 pb-2 min-w-0">
                    <Input
                      label="Email (optional)"
                      type="email"
                      placeholder="your@email.com"
                      value={patientEmail}
                      onChange={(e) => setPatientEmail(e.target.value)}
                    />
                    <p className="text-xs text-slate-400 mt-1.5">For email confirmations if desired.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Step 3: Review & Submit ── */}
      {step === 3 && (
        <div className="mt-4 space-y-4">
          <div className="rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm">
            <div className="px-4 py-3 bg-gradient-to-r from-slate-50 to-slate-50/60 border-b border-slate-100 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-medical-400" />
              <p className="text-xs font-bold text-slate-600 tracking-wide">Review before submitting</p>
            </div>
            <div className="divide-y divide-slate-100/80">
              {/* Lab */}
              <div className="px-4 py-3.5 flex items-start justify-between gap-4">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide shrink-0 w-20 pt-px">Lab</p>
                <div className="text-right min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{labName || preselectedLabName}</p>
                  {(labAddress || preselectedLabAddress) && (
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{labAddress || preselectedLabAddress}</p>
                  )}
                </div>
              </div>
              {/* Tests */}
              <div className="px-4 py-3.5 flex items-start justify-between gap-4">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide shrink-0 w-20 pt-px">Services</p>
                <div className="text-right min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{selectedTests.join(", ")}</p>
                  {additionalNotes && <p className="text-xs text-slate-400 mt-0.5 truncate">{additionalNotes}</p>}
                </div>
              </div>
              {/* Patient */}
              <div className="px-4 py-3.5 flex items-start justify-between gap-4">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide shrink-0 w-20 pt-px">You</p>
                <div className="text-right min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{patientName}</p>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">{patientPhone}</p>
                  {patientAge && <p className="text-xs text-slate-400 mt-0.5">Age: {patientAge}</p>}
                  {patientEmail && <p className="text-xs text-slate-400 mt-0.5">{patientEmail}</p>}
                </div>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-400 text-center leading-relaxed px-4">
            By submitting you agree to the{" "}
            <a href="/terms" className="underline hover:text-slate-600">Terms</a>
            {" "}&amp;{" "}
            <a href="/privacy" className="underline hover:text-slate-600">Privacy Policy</a>.
          </p>
        </div>
      )}

      {/* ── Back button ── */}
      {step > 1 && (
        <div className="mt-5">
          <button
            onClick={() => setStep(step - 1)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
        </div>
      )}

      {/* ── Sticky bottom action bar ── */}
      {(stepValid || step === 3) && (
        <div className="sticky bottom-0 -mx-4 px-4 pt-2 pb-4 mt-6 pointer-events-none">
          {step < 3 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={!stepValid}
              className="pointer-events-auto w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-medical-600 hover:bg-medical-700 active:scale-[0.98] disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-medical-600/30 transition-all"
            >
              Continue
              <ChevronRight className="w-5 h-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="pointer-events-auto w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-medical-600 hover:bg-medical-700 active:scale-[0.98] disabled:opacity-70 text-white font-bold text-sm shadow-lg shadow-medical-600/30 transition-all"
            >
              {submitting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
              {submitting ? "Submitting…" : "Submit Request"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
