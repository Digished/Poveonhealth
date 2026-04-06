"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-hot-toast";
import {
  FlaskConical, User, Check, Search, X, ChevronRight, ChevronLeft,
  Building2, MapPin, Phone, Loader2, MessageCircle, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { PhoneInput } from "@/components/PhoneInput";
import type { Lab } from "@/lib/types";

interface PatientRequestFormProps {
  initialLabs?: Lab[];
  preselectedLabId?: string;
  preselectedLabName?: string;
  preselectedLabAddress?: string;
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

/** Simple lab search modal for home page patient form */
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

  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 80);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? labs.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.address?.toLowerCase().includes(q)
      )
    : labs;

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center sm:justify-center bg-black/40 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full sm:w-[480px] sm:mx-4 bg-white sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[85vh] sm:max-h-[620px] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">Select Laboratory</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-slate-100">
          <Search className="absolute left-8 top-14 w-4 h-4 text-slate-400 pointer-events-none" />
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
                  onClick={() => {
                    onSelect(lab);
                    onClose();
                  }}
                  className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors text-left"
                >
                  {lab.logo_url ? (
                    <img src={lab.logo_url} alt={lab.name} className="w-10 h-10 rounded-xl object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-medical-100 flex items-center justify-center">
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
    </div>
  );

  return createPortal(modal, document.body);
}

export function PatientRequestForm(props: PatientRequestFormProps) {
  const {
    initialLabs = [],
    preselectedLabId,
    preselectedLabName,
    preselectedLabAddress,
    preselectedServiceCategories = [],
    locations = [],
  } = props;

  // Step & form state
  const [step, setStep] = useState(1);
  const [labId, setLabId] = useState(preselectedLabId || "");
  const [labName, setLabName] = useState(preselectedLabName || "");
  const [labAddress, setLabAddress] = useState(preselectedLabAddress || "");
  const [labServiceCategories, setLabServiceCategories] = useState(preselectedServiceCategories);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    locations[0]?.lab_branch_id ?? null
  );

  // Test selection
  const [selectedTests, setSelectedTests] = useState<string[]>([]);
  const [testMode, setTestMode] = useState<"assistant" | "categories">("categories");
  const [additionalNotes, setAdditionalNotes] = useState("");

  // Assistant chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  // Patient details
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientAge, setPatientAge] = useState("");

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [successData, setSuccessData] = useState<{
    code: string;
    labName: string;
    labAddress: string;
  } | null>(null);

  // Lab selection
  const [showLabModal, setShowLabModal] = useState(false);
  const [labsLoading, setLabsLoading] = useState(false);
  const [labs, setLabs] = useState(initialLabs);

  const selectedLab = labs.find((l) => l.id === labId);

  // Fetch labs if needed
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

  // Select lab
  const handleLabSelect = (lab: Lab) => {
    setLabId(lab.id);
    setLabName(lab.name);
    setLabAddress(lab.address);
    setLabServiceCategories((lab.service_categories as string[]) ?? []);
  };

  // Chat: send message
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
          messages: [...chatMessages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.ok) throw new Error("Assistant error");
      const data = await res.json();

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: data.message,
        suggestions: data.suggestions,
      };
      setChatMessages((prev) => [...prev, assistantMsg]);
    } catch (e) {
      toast.error("Assistant unavailable");
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, labId, chatLoading, chatMessages]);

  // Add test from suggestions
  const addTest = (test: string) => {
    setSelectedTests((prev) =>
      prev.includes(test) ? prev.filter((t) => t !== test) : [...prev, test]
    );
  };

  // Can advance step?
  const canAdvance = (() => {
    if (step === 1) {
      if (!preselectedLabId && !labId) return false;
      return selectedTests.length > 0;
    }
    if (step === 2) {
      return patientName.trim().length > 0 && patientPhone.trim().length > 0;
    }
    return true;
  })();

  // Submit request
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
          patient_age: patientAge ? parseInt(patientAge) : undefined,
          tests: selectedTests.join(", "),
          additional_notes: additionalNotes,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Failed to submit");
        return;
      }

      setSuccessData({
        code: data.code,
        labName: data.lab.name,
        labAddress: data.lab.address,
      });
    } catch {
      toast.error("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  // Success screen
  if (successData) {
    return (
      <div className="animate-slide-up space-y-4 pt-6">
        <div className="text-center">
          <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Check className="w-7 h-7 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">Request Submitted</h2>
          <p className="text-sm text-slate-500 mt-1">You'll receive an SMS confirmation shortly.</p>
        </div>

        <div className="bg-medical-50 border border-medical-200 rounded-2xl px-5 py-4">
          <p className="text-[10px] font-bold text-medical-500 uppercase tracking-widest text-center mb-2">
            Request Code
          </p>
          <p className="text-3xl font-black text-medical-700 text-center font-mono tracking-[0.2em]">
            {successData.code}
          </p>
          <p className="text-xs text-center text-medical-600 mt-2">Show this code at the lab</p>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl px-4 py-3.5 space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase">Laboratory</p>
          <p className="text-sm font-bold text-slate-800">{successData.labName}</p>
          {successData.labAddress && (
            <p className="text-xs text-slate-500 flex items-start gap-1">
              <MapPin className="w-3 h-3 mt-0.5 shrink-0" />{successData.labAddress}
            </p>
          )}
        </div>

        <button
          onClick={() => window.location.href = "/"}
          className="w-full text-sm font-semibold text-medical-600 hover:text-medical-700 py-2.5 rounded-xl hover:bg-medical-50 transition-colors"
        >
          Submit another request
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Sticky header with step indicator */}
      <div className="sticky top-0 z-10 -mx-4 px-4 py-3 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => {
            const num = i + 1;
            const done = num < step;
            const active = num === step;
            const Icon = s.icon;
            return (
              <div key={i} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all ${
                      done
                        ? "bg-slate-700 border-slate-700 text-white"
                        : active
                        ? "bg-slate-900 border-slate-800 text-white w-7 h-7"
                        : "bg-slate-100 border-slate-300 text-slate-500"
                    }`}
                  >
                    {done ? <Check className="w-2.5 h-2.5" /> : <Icon className="w-3 h-3" />}
                  </div>
                  <p className={`text-xs mt-1 font-medium hidden sm:block ${
                    active ? "text-slate-800" : done ? "text-slate-500" : "text-slate-400"
                  }`}>
                    {s.title}
                  </p>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1.5 mb-3 rounded ${
                    done ? "bg-slate-400" : "bg-slate-200"
                  }`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <div className="glass-card p-4 mt-3 mb-2 space-y-4">
        {/* Step 1: Tests */}
        {step === 1 && (
          <div className="space-y-4">
            {/* Lab selection (home page only) */}
            {!preselectedLabId && (
              <>
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-2">Select Laboratory</p>
                  {!labId ? (
                    <button
                      onClick={() => {
                        fetchLabs();
                        setShowLabModal(true);
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl border border-medical-200 bg-medical-50 text-medical-700 font-medium hover:bg-medical-100 transition-colors"
                    >
                      <Search className="w-4 h-4" />
                      Choose a laboratory
                    </button>
                  ) : (
                    <div className="p-3 rounded-xl border border-medical-200 bg-medical-50 flex items-center gap-3">
                      <Building2 className="w-5 h-5 text-medical-600 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-medical-900">{labName}</p>
                        {labAddress && <p className="text-xs text-medical-700">{labAddress}</p>}
                      </div>
                      <button
                        onClick={() => {
                          setLabId("");
                          setSelectedTests([]);
                        }}
                        className="text-medical-600 hover:text-medical-700"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {showLabModal && (
                  <LabSearchModal
                    labs={labs}
                    onSelect={handleLabSelect}
                    onClose={() => setShowLabModal(false)}
                  />
                )}
              </>
            )}

            {/* Location selector (lab page) */}
            {preselectedLabId && locations.length > 0 && (
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-2">Location</label>
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

            {/* Test selection (only if lab selected) */}
            {labId && (
              <>
                <div>
                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={() => setTestMode("categories")}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                        testMode === "categories"
                          ? "bg-medical-600 text-white"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      Browse Services
                    </button>
                    <button
                      onClick={() => setTestMode("assistant")}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                        testMode === "assistant"
                          ? "bg-medical-600 text-white"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      Ask Assistant
                    </button>
                  </div>

                  {testMode === "categories" && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {labServiceCategories.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => addTest(cat)}
                          className={`p-3 rounded-lg text-center text-sm font-medium transition-all ${
                            selectedTests.includes(cat)
                              ? "bg-medical-600 text-white border-2 border-medical-700"
                              : "bg-slate-100 text-slate-700 border-2 border-transparent hover:bg-slate-200"
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  )}

                  {testMode === "assistant" && (
                    <div className="bg-slate-50 rounded-lg p-4 space-y-3 max-h-64 overflow-y-auto">
                      {chatMessages.length === 0 && (
                        <p className="text-xs text-slate-500 italic text-center py-8">
                          Describe your health concern and the Health Assistant will suggest relevant tests.
                        </p>
                      )}

                      {chatMessages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`max-w-xs px-3 py-2 rounded-lg text-sm ${
                              msg.role === "user"
                                ? "bg-medical-600 text-white"
                                : "bg-white border border-slate-200 text-slate-700"
                            }`}
                          >
                            {msg.content}
                            {msg.suggestions && msg.suggestions.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {msg.suggestions.map((sugg) => (
                                  <button
                                    key={sugg}
                                    onClick={() => addTest(sugg)}
                                    className={`px-2 py-1 text-xs rounded transition-colors ${
                                      selectedTests.includes(sugg)
                                        ? "bg-emerald-600 text-white"
                                        : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                                    }`}
                                  >
                                    {sugg}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {testMode === "assistant" && (
                    <div className="flex gap-2 mt-3">
                      <input
                        type="text"
                        placeholder="Describe your concern…"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleChatSend()}
                        disabled={chatLoading}
                        className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500"
                      />
                      <button
                        onClick={handleChatSend}
                        disabled={chatLoading || !chatInput.trim()}
                        className="px-3 py-2 rounded-lg bg-medical-600 text-white hover:bg-medical-700 disabled:opacity-50"
                      >
                        {chatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                      </button>
                    </div>
                  )}
                </div>

                {/* Selected tests */}
                {selectedTests.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-slate-700 mb-2">Selected Tests</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedTests.map((test) => (
                        <div
                          key={test}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-medical-100 text-medical-700 text-sm font-medium"
                        >
                          {test}
                          <button onClick={() => addTest(test)} className="text-medical-600 hover:text-medical-800">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
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
              </>
            )}
          </div>
        )}

        {/* Step 2: Your Details */}
        {step === 2 && (
          <div className="space-y-4">
            <Input
              label="Full Name"
              placeholder="Your full name"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              required
            />
            <PhoneInput
              label="Phone Number"
              required
              value={patientPhone}
              onChange={setPatientPhone}
            />
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
        )}

        {/* Step 3: Review & Submit */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-4 space-y-3 text-sm">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase">Laboratory</p>
                <p className="font-medium text-slate-800">{labName}</p>
                {labAddress && <p className="text-xs text-slate-600">{labAddress}</p>}
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase">Tests</p>
                <p className="text-slate-800">{selectedTests.join(", ")}</p>
                {additionalNotes && <p className="text-xs text-slate-600 mt-1">{additionalNotes}</p>}
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase">Your Details</p>
                <p className="text-slate-800">{patientName}</p>
                <p className="text-xs text-slate-600">{patientPhone}</p>
                {patientAge && <p className="text-xs text-slate-600">Age: {patientAge}</p>}
              </div>
            </div>

            <p className="text-xs text-slate-500 italic">
              An SMS confirmation will be sent to your phone number.
            </p>

            <Button
              onClick={handleSubmit}
              disabled={submitting}
              loading={submitting}
              fullWidth
            >
              {submitting ? "Submitting…" : "Submit Request"}
            </Button>
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex gap-2 mt-4">
        {step > 1 && (
          <button
            onClick={() => setStep(step - 1)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
        )}
        {step < 3 && (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canAdvance}
            className="ml-auto flex items-center gap-2 px-4 py-2.5 rounded-xl bg-medical-600 text-white hover:bg-medical-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Continue
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
