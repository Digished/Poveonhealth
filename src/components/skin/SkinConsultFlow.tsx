"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-hot-toast";
import Link from "next/link";
import {
  Camera, ImagePlus, X, Send, Check, ChevronLeft, ChevronRight, Loader2,
  ShieldCheck, MessageCircle, Copy, Sparkles, AlertTriangle, User,
} from "lucide-react";
import { Input } from "@/components/ui/Input";
import { PhoneInput } from "@/components/PhoneInput";
import { SkinSuccessScreen } from "@/components/skin/SkinSuccess";

type ChatMessage = { role: "assistant" | "user"; content: string };

const STEPS = [
  { title: "Photos", icon: Camera },
  { title: "Questions", icon: MessageCircle },
  { title: "Your details", icon: User },
];

const MAX_PHOTOS = 5;

// ─── Main flow ──────────────────────────────────────────────────────────────

export function SkinConsultFlow() {
  const [step, setStep] = useState(1);

  // Step 1 — photos
  const [images, setImages] = useState<{ url: string; uploading: boolean; id: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadedUrls = images.filter((i) => !i.uploading).map((i) => i.url);

  // Step 2 — chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [aiThinking, setAiThinking] = useState(false);
  const [chatDone, setChatDone] = useState(false);
  const [chatStarted, setChatStarted] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Step 3 — details
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<"" | "male" | "female" | "other">("");
  const [submitting, setSubmitting] = useState(false);

  const [successCode, setSuccessCode] = useState<string | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Fetch the consultation fee (0 = free)
  useEffect(() => {
    fetch("/api/skin/price")
      .then((r) => r.json())
      .then((d) => { if (typeof d.price === "number") setPrice(d.price); })
      .catch(() => setPrice(0));
  }, []);

  const priceLabel = price && price > 0 ? `₦${price.toLocaleString("en-NG")}` : null;

  // ── Photo upload ────────────────────────────────────────────────────────────
  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const remaining = MAX_PHOTOS - images.length;
    if (remaining <= 0) {
      toast.error(`You can upload up to ${MAX_PHOTOS} photos.`);
      return;
    }
    const toUpload = Array.from(files).slice(0, remaining);
    for (const file of toUpload) {
      const id = Math.random().toString(36).slice(2);
      const localUrl = URL.createObjectURL(file);
      setImages((prev) => [...prev, { url: localUrl, uploading: true, id }]);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/skin/upload", { method: "POST", body: fd });
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
        const res = await fetch("/api/skin/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrls: uploadedUrls, messages: history }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? "The assistant is unavailable. Please try again.");
          return;
        }
        setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
        if (data.done) setChatDone(true);
        scrollChat();
      } catch {
        toast.error("Network error — please try again.");
      } finally {
        setAiThinking(false);
      }
    },
    [uploadedUrls, scrollChat]
  );

  // Kick off the chat when the patient first reaches step 2
  useEffect(() => {
    if (step === 2 && !chatStarted && uploadedUrls.length > 0) {
      setChatStarted(true);
      callChat([]);
    }
  }, [step, chatStarted, uploadedUrls.length, callChat]);

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
  const detailsValid =
    name.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    whatsapp.trim().length >= 7;

  async function handleSubmit() {
    if (!detailsValid || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/skin/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_name: name.trim(),
          patient_email: email.trim(),
          patient_whatsapp: whatsapp.trim(),
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
      // Paid consult — hand off to Paystack checkout; the code is revealed after payment
      if (data.requiresPayment && data.authorizationUrl) {
        window.location.href = data.authorizationUrl;
        return; // keep the button in its loading state during the redirect
      }
      // Free consult — code issued immediately
      setSuccessCode(data.code);
      window.scrollTo({ top: 0 });
      setSubmitting(false);
    } catch {
      toast.error("Network error — please check your connection and try again.");
      setSubmitting(false);
    }
  }

  if (successCode) return <SkinSuccessScreen code={successCode} patientName={name} />;

  const anyUploading = images.some((i) => i.uploading);
  const step1Valid = uploadedUrls.length >= 1 && !anyUploading;

  function goNext() {
    setStep((s) => Math.min(s + 1, 3));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function goBack() {
    setStep((s) => Math.max(s - 1, 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="animate-fade-in pb-32">
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
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                      active ? "bg-medical-600 text-white shadow-lg shadow-medical-600/30"
                        : done ? "bg-medical-100 text-medical-600"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  </div>
                  <span className={`text-[10px] mt-1 font-semibold ${active ? "text-medical-700" : "text-slate-400"}`}>
                    {s.title}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 rounded ${num < step ? "bg-medical-300" : "bg-slate-100"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Step 1: Photos ── */}
      {step === 1 && (
        <div className="mt-5 space-y-4">
          <div className="text-center px-2">
            <h1 className="text-xl font-bold text-slate-800">Show us your skin concern</h1>
            <p className="text-sm text-slate-500 mt-1.5">
              Upload clear photos of the affected area. Good lighting and a close, focused shot help the
              dermatologist most. You can add up to {MAX_PHOTOS}.
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          <div className="grid grid-cols-3 gap-3">
            {images.map((img) => (
              <div key={img.id} className="relative aspect-square rounded-2xl overflow-hidden border border-slate-200 bg-slate-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="Skin concern" className="w-full h-full object-cover" />
                {img.uploading && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  </div>
                )}
                {!img.uploading && (
                  <button
                    onClick={() => removeImage(img.id)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/55 hover:bg-black/75 text-white flex items-center justify-center transition"
                    aria-label="Remove photo"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            {images.length < MAX_PHOTOS && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square rounded-2xl border-2 border-dashed border-medical-200 bg-medical-50/50 hover:bg-medical-50 flex flex-col items-center justify-center gap-1.5 text-medical-600 transition"
              >
                <ImagePlus className="w-6 h-6" />
                <span className="text-xs font-semibold">Add photo</span>
              </button>
            )}
          </div>

          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-medical-50 border border-medical-100">
            <ShieldCheck className="w-4 h-4 text-medical-500 shrink-0 mt-0.5" />
            <p className="text-xs text-medical-700 leading-relaxed">
              Your photos are private and only shared with the reviewing dermatologist. Avoid including
              your face unless it is part of the concern.
            </p>
          </div>
        </div>
      )}

      {/* ── Step 2: AI chat intake ── */}
      {step === 2 && (
        <div className="mt-5 space-y-3">
          <div className="px-2">
            <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-medical-500" />
              A few quick questions
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Our assistant will ask about your concern so the dermatologist has the full picture.
            </p>
          </div>

          <div
            ref={chatScrollRef}
            className="glass-card p-4 space-y-3 max-h-[52vh] overflow-y-auto"
          >
            {messages.length === 0 && aiThinking && (
              <p className="text-sm text-slate-400 text-center py-6">Starting your intake…</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-medical-600 text-white rounded-br-md"
                      : "bg-white border border-slate-200 text-slate-700 rounded-bl-md"
                  }`}
                >
                  {m.content}
                </div>
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
              <p className="text-xs text-emerald-700 leading-relaxed">
                That&apos;s everything we need. Tap <strong>Continue</strong> to add your details and submit.
              </p>
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendAnswer();
                  }
                }}
                rows={1}
                placeholder="Type your answer…"
                disabled={aiThinking}
                className="flex-1 resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-400 transition max-h-32 disabled:opacity-60"
              />
              <button
                onClick={sendAnswer}
                disabled={!chatInput.trim() || aiThinking}
                className="w-11 h-11 rounded-2xl bg-medical-600 hover:bg-medical-700 disabled:opacity-40 text-white flex items-center justify-center shrink-0 transition"
                aria-label="Send"
              >
                {aiThinking ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
          )}
          <p className="text-[11px] text-slate-400 text-center px-4">
            This assistant gathers your history only — it does not diagnose. A dermatologist will review everything.
          </p>
        </div>
      )}

      {/* ── Step 3: Details ── */}
      {step === 3 && (
        <div className="mt-5 space-y-4">
          <div className="px-2">
            <h1 className="text-lg font-bold text-slate-800">Your details</h1>
            <p className="text-sm text-slate-500 mt-1">
              So the dermatologist can reach you. They&apos;ll follow up on WhatsApp.
            </p>
          </div>

          <div className="glass-card p-4 sm:p-5 space-y-4">
            <Input label="Full name" placeholder="e.g. Ada Obi" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input label="Email" type="email" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required hint="We'll email your confirmation here." />
            <PhoneInput label="WhatsApp number" required value={whatsapp} onChange={setWhatsapp} hint="The dermatologist will message you here." />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Age" type="number" inputMode="numeric" placeholder="e.g. 28" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))} />
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-700">Sex</label>
                <div className="flex gap-2">
                  {(["male", "female", "other"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setSex(sex === opt ? "" : opt)}
                      className={`flex-1 capitalize px-2 py-2.5 rounded-xl text-xs font-semibold border-2 transition ${
                        sex === opt ? "bg-medical-600 border-medical-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {priceLabel && (
            <div className="flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl bg-medical-50 border border-medical-100">
              <div>
                <p className="text-xs font-semibold text-medical-700">Consultation fee</p>
                <p className="text-[11px] text-medical-600/80 mt-0.5">Paid securely before a dermatologist reviews your case.</p>
              </div>
              <p className="text-lg font-black text-medical-700 shrink-0">{priceLabel}</p>
            </div>
          )}

          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-slate-50 border border-slate-100">
            <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-500 leading-relaxed">
              By submitting{priceLabel ? " and paying" : ""}, you agree to share your photos and answers with a Poveon dermatologist for review.
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
              <button
                onClick={goBack}
                className="flex items-center gap-1.5 px-4 py-3.5 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold transition-all shadow-lg shadow-slate-900/5 shrink-0"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            )}
            {step === 1 && (
              <button
                onClick={goNext}
                disabled={!step1Valid}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-medical-600 hover:bg-medical-700 active:scale-[0.98] disabled:opacity-50 text-white font-bold text-sm shadow-xl shadow-medical-600/35 transition-all"
              >
                {anyUploading ? "Uploading…" : "Continue"}
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
            {step === 2 && (
              <button
                onClick={goNext}
                disabled={!chatDone}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-medical-600 hover:bg-medical-700 active:scale-[0.98] disabled:opacity-50 text-white font-bold text-sm shadow-xl shadow-medical-600/35 transition-all"
              >
                {chatDone ? "Continue" : "Answer the questions to continue"}
                {chatDone && <ChevronRight className="w-5 h-5" />}
              </button>
            )}
            {step === 3 && (
              <button
                onClick={handleSubmit}
                disabled={!detailsValid || submitting}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-medical-600 hover:bg-medical-700 active:scale-[0.98] disabled:opacity-50 text-white font-bold text-sm shadow-xl shadow-medical-600/35 transition-all"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                {submitting
                  ? (priceLabel ? "Redirecting to payment…" : "Submitting…")
                  : (priceLabel ? `Pay ${priceLabel} & Submit` : "Submit consultation")}
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
