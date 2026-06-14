"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-hot-toast";
import Link from "next/link";
import {
  ImagePlus, X, Send, Check, ChevronLeft, ChevronRight, Loader2, ShieldCheck,
  MessageCircle, Sparkles, User, Camera, Stethoscope, Users, CalendarClock, CreditCard,
} from "lucide-react";
import { Input } from "@/components/ui/Input";
import { PhoneInput } from "@/components/PhoneInput";

type ChatMessage = { role: "assistant" | "user"; content: string };
type Plan = "single" | "monthly" | "yearly";

interface EncounterFlowProps {
  slug: string;
  doctorName: string;
  specialty: string | null;
  hospitals: string[];
  patientCount: number;
  pricing: { single: number | null; monthly: number | null; yearly: number | null };
  avatarUrl?: string | null;
  heroGradient?: string;
}

const STEPS = [
  { title: "Your details", icon: User },
  { title: "Photos", icon: Camera },
  { title: "Questions", icon: MessageCircle },
  { title: "Plan", icon: CreditCard },
];

const MAX_PHOTOS = 5;
const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

export function EncounterFlow({ slug, doctorName, specialty, hospitals, patientCount, pricing, avatarUrl, heroGradient = "from-medical-500 to-medical-700" }: EncounterFlowProps) {
  const [step, setStep] = useState(1);

  // Step 1 — details (email first, auto-fill the rest)
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<"" | "male" | "female" | "other">("");
  const [lookingUp, setLookingUp] = useState(false);
  const [autofilled, setAutofilled] = useState(false);
  const lastLookup = useRef("");

  // Step 2 — photos (optional)
  const [images, setImages] = useState<{ url: string; uploading: boolean; id: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadedUrls = images.filter((i) => !i.uploading).map((i) => i.url);

  // Step 3 — chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [aiThinking, setAiThinking] = useState(false);
  const [chatDone, setChatDone] = useState(false);
  const [chatStarted, setChatStarted] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Step 4 — plan + submit
  const defaultPlan: Plan = pricing.single != null ? "single" : pricing.monthly != null ? "monthly" : "yearly";
  const [plan, setPlan] = useState<Plan>(defaultPlan);
  const [submitting, setSubmitting] = useState(false);

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  // ── Email lookup → auto-fill ────────────────────────────────────────────────
  const lookupEmail = useCallback(async () => {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e === lastLookup.current) return;
    lastLookup.current = e;
    setLookingUp(true);
    try {
      const res = await fetch("/api/encounter/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e }),
      });
      const data = await res.json();
      if (data.exists && data.patient) {
        if (!name && data.patient.name) setName(data.patient.name);
        if (!phone && data.patient.phone) setPhone(data.patient.phone);
        if (!age && data.patient.age) setAge(String(data.patient.age));
        if (!sex && data.patient.sex) setSex(data.patient.sex);
        setAutofilled(true);
      }
    } catch {
      /* non-blocking */
    } finally {
      setLookingUp(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, name, phone, age, sex]);

  // ── Photo upload ────────────────────────────────────────────────────────────
  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const remaining = MAX_PHOTOS - images.length;
    if (remaining <= 0) { toast.error(`You can upload up to ${MAX_PHOTOS} photos.`); return; }
    for (const file of Array.from(files).slice(0, remaining)) {
      const id = Math.random().toString(36).slice(2);
      const localUrl = URL.createObjectURL(file);
      setImages((prev) => [...prev, { url: localUrl, uploading: true, id }]);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/encounter/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok || !data.success) {
          toast.error(data.error ?? "Upload failed.");
          setImages((prev) => prev.filter((i) => i.id !== id));
          continue;
        }
        setImages((prev) => prev.map((i) => (i.id === id ? { url: data.url, uploading: false, id } : i)));
      } catch {
        toast.error("Network error during upload.");
        setImages((prev) => prev.filter((i) => i.id !== id));
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeImage(id: string) {
    setImages((prev) => prev.filter((i) => i.id !== id));
  }

  // ── Chat ──────────────────────────────────────────────────────────────────
  const scrollChat = useCallback(() => {
    requestAnimationFrame(() => {
      chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, []);

  const callChat = useCallback(
    async (history: ChatMessage[]) => {
      setAiThinking(true);
      try {
        const res = await fetch("/api/encounter/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, imageUrls: uploadedUrls, messages: history }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error ?? "The assistant is unavailable. Please try again."); return; }
        setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
        if (data.done) setChatDone(true);
        scrollChat();
      } catch {
        toast.error("Network error — please try again.");
      } finally {
        setAiThinking(false);
      }
    },
    [slug, uploadedUrls, scrollChat]
  );

  // Kick off the chat when the patient reaches step 3
  useEffect(() => {
    if (step === 3 && !chatStarted) {
      setChatStarted(true);
      callChat([]);
    }
  }, [step, chatStarted, callChat]);

  async function sendAnswer() {
    const text = chatInput.trim();
    if (!text || aiThinking || chatDone) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setChatInput("");
    scrollChat();
    await callChat(next);
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  const detailsValid = name.trim().length >= 2 && emailValid && phone.trim().length >= 7;
  const planPrice = pricing[plan] ?? 0;

  async function handleSubmit() {
    if (!detailsValid || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/encounter/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          plan_type: plan,
          patient_name: name.trim(),
          patient_email: email.trim(),
          patient_phone: phone.trim(),
          patient_age: age ? parseInt(age) : undefined,
          patient_sex: sex || undefined,
          image_urls: uploadedUrls,
          conversation: messages,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error ?? "Submission failed. Please try again.");
        setSubmitting(false);
        return;
      }
      if (data.authorizationUrl) {
        window.location.href = data.authorizationUrl; // keep loading state during redirect
        return;
      }
      setSubmitting(false);
    } catch {
      toast.error("Network error — please check your connection and try again.");
      setSubmitting(false);
    }
  }

  const anyUploading = images.some((i) => i.uploading);

  function goNext() { setStep((s) => Math.min(s + 1, 4)); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function goBack() { setStep((s) => Math.max(s - 1, 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }

  const planOptions = ([
    { key: "single", label: "Single encounter", sub: "One-off consultation", price: pricing.single, icon: Stethoscope },
    { key: "monthly", label: "Monthly retainership", sub: "Ongoing access, billed monthly", price: pricing.monthly, icon: CalendarClock },
    { key: "yearly", label: "Yearly retainership", sub: "Best value, billed yearly", price: pricing.yearly, icon: CalendarClock },
  ] as { key: Plan; label: string; sub: string; price: number | null; icon: typeof CreditCard }[]).filter((p) => p.price != null);

  return (
    <div className="animate-fade-in pb-32">
      {/* ── Doctor hero + trust badge ── */}
      <div className="mt-5 mb-3 text-center">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt={doctorName} className="w-20 h-20 rounded-2xl object-cover mx-auto mb-3 shadow-lg ring-2 ring-white" />
        ) : (
          <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br ${heroGradient} text-white shadow-lg mb-3`}>
            <Stethoscope className="w-8 h-8" />
          </div>
        )}
        <h1 className="text-xl font-bold text-slate-800">{doctorName}</h1>
        {specialty && <p className="text-sm text-medical-600 font-medium mt-0.5">{specialty}</p>}
        {hospitals.length > 0 && <p className="text-xs text-slate-400 mt-0.5 truncate">{hospitals.join(" · ")}</p>}
        {patientCount > 0 && (
          <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
            <Users className="w-3.5 h-3.5" />
            <span className="text-xs font-semibold">{patientCount.toLocaleString("en-NG")} {patientCount === 1 ? "patient is" : "patients are"} managed by this doctor</span>
          </div>
        )}
      </div>

      {/* ── Step header ── */}
      <div className="sticky top-0 z-10 -mx-4 px-4 pt-3 pb-3 bg-white/85 backdrop-blur-md border-b border-slate-100">
        <div className="flex items-center">
          {STEPS.map((s, i) => {
            const num = i + 1;
            const done = num < step;
            const active = num === step;
            const Icon = s.icon;
            return (
              <div key={s.title} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                    active ? "bg-medical-600 text-white shadow-lg shadow-medical-600/30"
                      : done ? "bg-medical-100 text-medical-600" : "bg-slate-100 text-slate-400"
                  }`}>
                    {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  </div>
                  <span className={`text-[10px] mt-1 font-semibold ${active ? "text-medical-700" : "text-slate-400"}`}>{s.title}</span>
                </div>
                {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-2 rounded ${num < step ? "bg-medical-300" : "bg-slate-100"}`} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Step 1: Details ── */}
      {step === 1 && (
        <div className="mt-5 space-y-4">
          <div className="px-2">
            <h2 className="text-lg font-bold text-slate-800">Tell us who you are</h2>
            <p className="text-sm text-slate-500 mt-1">Start with your email — if you&apos;ve consulted before, we&apos;ll fill the rest in.</p>
          </div>
          <div className="glass-card p-4 sm:p-5 space-y-4">
            <div className="relative">
              <Input
                label="Email" type="email" placeholder="you@email.com" value={email}
                onChange={(e) => { setEmail(e.target.value); setAutofilled(false); }}
                onBlur={lookupEmail} required hint="We'll send your confirmation here."
              />
              {lookingUp && <Loader2 className="w-4 h-4 text-medical-500 animate-spin absolute right-3 top-[34px]" />}
            </div>
            {autofilled && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-medium">
                <Check className="w-3.5 h-3.5" /> Welcome back — we filled in your saved details.
              </div>
            )}
            <Input label="Full name" placeholder="e.g. Ada Obi" value={name} onChange={(e) => setName(e.target.value)} required />
            <PhoneInput label="Phone number" required value={phone} onChange={setPhone} hint="Your doctor will reach you here." />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Age" type="number" inputMode="numeric" placeholder="e.g. 28" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))} />
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-700">Sex</label>
                <div className="flex gap-2">
                  {(["male", "female", "other"] as const).map((opt) => (
                    <button key={opt} type="button" onClick={() => setSex(sex === opt ? "" : opt)}
                      className={`flex-1 capitalize px-2 py-2.5 rounded-xl text-xs font-semibold border-2 transition ${
                        sex === opt ? "bg-medical-600 border-medical-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}>{opt}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2: Photos (optional) ── */}
      {step === 2 && (
        <div className="mt-5 space-y-4">
          <div className="text-center px-2">
            <h2 className="text-lg font-bold text-slate-800">Add photos <span className="text-slate-400 font-normal text-sm">(optional)</span></h2>
            <p className="text-sm text-slate-500 mt-1.5">If a photo helps explain your concern, add it here. Clear, well-lit shots help your doctor most. Up to {MAX_PHOTOS}.</p>
          </div>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic" capture="environment" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          <div className="grid grid-cols-3 gap-3">
            {images.map((img) => (
              <div key={img.id} className="relative aspect-square rounded-2xl overflow-hidden border border-slate-200 bg-slate-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="Concern" className="w-full h-full object-cover" />
                {img.uploading && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><Loader2 className="w-5 h-5 text-white animate-spin" /></div>}
                {!img.uploading && (
                  <button onClick={() => removeImage(img.id)} className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/55 hover:bg-black/75 text-white flex items-center justify-center transition" aria-label="Remove photo">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            {images.length < MAX_PHOTOS && (
              <button onClick={() => fileInputRef.current?.click()} className="aspect-square rounded-2xl border-2 border-dashed border-medical-200 bg-medical-50/50 hover:bg-medical-50 flex flex-col items-center justify-center gap-1.5 text-medical-600 transition">
                <ImagePlus className="w-6 h-6" /><span className="text-xs font-semibold">Add photo</span>
              </button>
            )}
          </div>
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-medical-50 border border-medical-100">
            <ShieldCheck className="w-4 h-4 text-medical-500 shrink-0 mt-0.5" />
            <p className="text-xs text-medical-700 leading-relaxed">Your photos are private and only shared with {doctorName}.</p>
          </div>
        </div>
      )}

      {/* ── Step 3: AI chat intake ── */}
      {step === 3 && (
        <div className="mt-5 space-y-3">
          <div className="px-2">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Sparkles className="w-4 h-4 text-medical-500" /> A few quick questions</h2>
            <p className="text-sm text-slate-500 mt-1">So {doctorName} has the full picture before reviewing.</p>
          </div>
          <div ref={chatScrollRef} className="glass-card p-4 space-y-3 max-h-[52vh] overflow-y-auto">
            {messages.length === 0 && aiThinking && <p className="text-sm text-slate-400 text-center py-6">Starting your intake…</p>}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === "user" ? "bg-medical-600 text-white rounded-br-md" : "bg-white border border-slate-200 text-slate-700 rounded-bl-md"
                }`}>{m.content}</div>
              </div>
            ))}
            {aiThinking && messages.length > 0 && (
              <div className="flex justify-start">
                <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-white border border-slate-200">
                  <span className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" />
                  </span>
                </div>
              </div>
            )}
          </div>
          {chatDone ? (
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-100">
              <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-700 leading-relaxed">That&apos;s everything we need. Tap <strong>Continue</strong> to choose a plan and submit.</p>
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <textarea value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAnswer(); } }}
                rows={1} placeholder="Type your answer…" disabled={aiThinking}
                className="flex-1 resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-400 transition max-h-32 disabled:opacity-60" />
              <button onClick={sendAnswer} disabled={!chatInput.trim() || aiThinking}
                className="w-11 h-11 rounded-2xl bg-medical-600 hover:bg-medical-700 disabled:opacity-40 text-white flex items-center justify-center shrink-0 transition" aria-label="Send">
                {aiThinking ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
          )}
          <p className="text-[11px] text-slate-400 text-center px-4">This assistant gathers your history only — it does not diagnose. {doctorName} will review everything.</p>
        </div>
      )}

      {/* ── Step 4: Plan + pay ── */}
      {step === 4 && (
        <div className="mt-5 space-y-4">
          <div className="px-2">
            <h2 className="text-lg font-bold text-slate-800">Choose how to pay</h2>
            <p className="text-sm text-slate-500 mt-1">Pick a single encounter or a retainership for ongoing access.</p>
          </div>
          <div className="space-y-2.5">
            {planOptions.map((p) => {
              const Icon = p.icon;
              const selected = plan === p.key;
              return (
                <button key={p.key} type="button" onClick={() => setPlan(p.key)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 text-left transition ${
                    selected ? "border-medical-600 bg-medical-50/60 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"
                  }`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${selected ? "bg-medical-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-bold ${selected ? "text-medical-800" : "text-slate-700"}`}>{p.label}</p>
                    <p className="text-[11px] text-slate-400">{p.sub}</p>
                  </div>
                  <p className={`text-base font-black shrink-0 ${selected ? "text-medical-700" : "text-slate-500"}`}>{naira(p.price!)}</p>
                </button>
              );
            })}
          </div>
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-slate-50 border border-slate-100">
            <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-500 leading-relaxed">
              By paying, you agree to share your answers{uploadedUrls.length ? " and photos" : ""} with {doctorName} for review.
              See our <Link href="/privacy" className="underline hover:text-slate-700">Privacy Policy</Link>.
            </p>
          </div>
        </div>
      )}

      {/* ── Floating action bar ── */}
      {mounted && createPortal(
        <div className="fixed bottom-0 inset-x-0 z-[200] px-4 pb-6 pt-3 pointer-events-none">
          <div className="max-w-2xl mx-auto flex items-center gap-3 pointer-events-auto">
            {step > 1 && (
              <button onClick={goBack} className="flex items-center gap-1.5 px-4 py-3.5 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold transition-all shadow-lg shadow-slate-900/5 shrink-0">
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
            )}
            {step === 1 && (
              <button onClick={goNext} disabled={!detailsValid}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-medical-600 hover:bg-medical-700 active:scale-[0.98] disabled:opacity-50 text-white font-bold text-sm shadow-xl shadow-medical-600/35 transition-all">
                Continue <ChevronRight className="w-5 h-5" />
              </button>
            )}
            {step === 2 && (
              <button onClick={goNext} disabled={anyUploading}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-medical-600 hover:bg-medical-700 active:scale-[0.98] disabled:opacity-50 text-white font-bold text-sm shadow-xl shadow-medical-600/35 transition-all">
                {anyUploading ? "Uploading…" : uploadedUrls.length ? "Continue" : "Skip — no photos"} <ChevronRight className="w-5 h-5" />
              </button>
            )}
            {step === 3 && (
              <button onClick={goNext} disabled={!chatDone}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-medical-600 hover:bg-medical-700 active:scale-[0.98] disabled:opacity-50 text-white font-bold text-sm shadow-xl shadow-medical-600/35 transition-all">
                {chatDone ? "Continue" : "Answer the questions to continue"} {chatDone && <ChevronRight className="w-5 h-5" />}
              </button>
            )}
            {step === 4 && (
              <button onClick={handleSubmit} disabled={!detailsValid || submitting}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-medical-600 hover:bg-medical-700 active:scale-[0.98] disabled:opacity-50 text-white font-bold text-sm shadow-xl shadow-medical-600/35 transition-all">
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
                {submitting ? "Redirecting to payment…" : `Pay ${naira(planPrice)} & Submit`}
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
