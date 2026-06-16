"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { Mic, Square, Wand2, Loader2, X, Info, Keyboard } from "lucide-react";

export interface ParsedReferral {
  tests: string[];
  diagnosis: string;
  patient_name: string;
  patient_age: number | null;
  sex: "male" | "female" | "";
  patient_phone: string;
  schedule_hint: "today" | "this_week" | "this_month" | "";
}

export type ResolvedTest = { input: string; status: "resolved" | "ambiguous" | "unknown"; canonical?: string };

// Minimal typing for the Web Speech API (not in lib.dom across all targets).
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Dictation panel — the "Fast mode" input. The doctor speaks or types the whole
 * referral in plain English; the AI parser turns it into structured fields,
 * which the parent applies to the form. A sibling of "Scan slip".
 *
 * Voice behaviour (per product requirements):
 * - The raw transcript is NEVER shown in the input while speaking — only a
 *   listening animation. The captured speech is held privately and parsed
 *   straight into the form when the doctor stops.
 * - The mic stays on until the doctor stops it (auto-restarts on engine timeouts).
 */
export function DictationPanel({
  labId,
  onParsed,
  onClose,
}: {
  labId?: string;
  onParsed: (parsed: ParsedReferral, resolved: ResolvedTest[] | null) => void;
  onClose?: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [listening, setListening] = useState(false);
  const [parsing, setParsing] = useState(false);
  // Captured speech is held here and NOT rendered while dictating.
  const voiceRef = useRef("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const keepListeningRef = useRef(false);
  const speechSupported = typeof window !== "undefined" && !!getSpeechRecognition();

  const combinedText = useCallback(() => [typed.trim(), voiceRef.current.trim()].filter(Boolean).join(". ").trim(), [typed]);

  const doBuild = useCallback(async () => {
    const value = combinedText();
    if (value.length < 3) { toast.error("Dictate or type the referral first."); return; }
    setParsing(true);
    try {
      const res = await fetch("/api/requests/parse-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value, labId: labId || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error ?? "Couldn't understand that. Try again or type the fields below.");
        return;
      }
      onParsed(data.parsed as ParsedReferral, (data.resolvedTests as ResolvedTest[] | null) ?? null);
    } catch {
      toast.error("Network error. You can still type the fields below.");
    } finally {
      setParsing(false);
    }
  }, [combinedText, labId, onParsed]);

  const stopListening = useCallback((thenBuild: boolean) => {
    keepListeningRef.current = false;
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    setListening(false);
    if (thenBuild && voiceRef.current.trim().length >= 3) {
      // Auto-convert the moment the doctor stops talking.
      setTimeout(() => { void doBuild(); }, 150);
    }
  }, [doBuild]);

  useEffect(() => () => { keepListeningRef.current = false; try { recognitionRef.current?.stop(); } catch { /* ignore */ } }, []);

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) { toast.error("Voice input isn't supported on this browser — type instead."); return; }
    keepListeningRef.current = true;
    const begin = () => {
      try {
        const rec = new Ctor();
        rec.lang = "en-NG";
        rec.continuous = true;
        rec.interimResults = true; // streamed, but we keep finals only and never render them
        rec.onresult = (e) => {
          let finalChunk = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i];
            if (r.isFinal) finalChunk += r[0].transcript;
          }
          if (finalChunk.trim()) {
            voiceRef.current = `${voiceRef.current ? `${voiceRef.current} ` : ""}${finalChunk.trim()}`.replace(/\s+/g, " ");
          }
        };
        rec.onerror = (ev) => {
          if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
            toast.error("Microphone permission denied.");
            keepListeningRef.current = false;
            setListening(false);
          }
          // "no-speech"/"aborted" are transient — onend restarts.
        };
        rec.onend = () => {
          if (keepListeningRef.current) {
            try { rec.start(); } catch { setTimeout(() => { if (keepListeningRef.current) begin(); }, 250); }
          } else {
            setListening(false);
          }
        };
        recognitionRef.current = rec;
        rec.start();
        setListening(true);
      } catch {
        toast.error("Couldn't start the microphone.");
        keepListeningRef.current = false;
        setListening(false);
      }
    };
    begin();
  }, []);

  return (
    <div className="rounded-2xl border-2 border-medical-100 bg-gradient-to-b from-medical-50/40 to-white p-3.5 animate-fade-in">
      <div className="flex items-start gap-2 mb-2.5">
        <Info className="w-4 h-4 text-medical-500 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-600 leading-relaxed flex-1">
          Say or type the whole thing in plain English — the tests, the patient, the age and why.
          <span className="block text-slate-400 mt-0.5 italic">
            “FBC, malaria parasite and widal for Mrs Okafor, 42, query typhoid”
          </span>
        </p>
        {onClose && (
          <button type="button" onClick={() => { stopListening(false); onClose(); }} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 shrink-0" aria-label="Close dictation">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Listening state — animated, NO transcript shown */}
      {listening ? (
        <div className="rounded-xl border border-red-200 bg-red-50/60 px-4 py-5 flex flex-col items-center gap-3">
          <div className="flex items-end gap-1 h-9">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <span
                key={i}
                className="w-1.5 rounded-full bg-red-500/80 animate-pulse"
                style={{ height: `${[40, 70, 100, 55, 90, 65, 45][i]}%`, animationDelay: `${i * 90}ms`, animationDuration: "0.8s" }}
              />
            ))}
          </div>
          <p className="text-sm font-semibold text-red-600 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Listening…
          </p>
          <p className="text-[11px] text-slate-400">Speak naturally. Your words are captured privately.</p>
          <button
            type="button"
            onClick={() => stopListening(true)}
            className="mt-1 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold shadow-lg shadow-red-600/30 hover:bg-red-700 transition-all"
          >
            <Square className="w-3.5 h-3.5 fill-current" /> Stop &amp; fill the form
          </button>
        </div>
      ) : (
        <>
          <textarea
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={speechSupported ? "Tap “Speak” and talk, or type here…" : "Type the referral here…"}
            rows={3}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[15px] leading-7 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-400 resize-none"
          />
          {voiceRef.current.trim() && (
            <p className="text-[11px] text-emerald-600 mt-1.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Speech captured — tap “Fill in the form”.
            </p>
          )}

          <div className="flex items-center gap-2 mt-2.5">
            {speechSupported && (
              <button
                type="button"
                onClick={startListening}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shrink-0 bg-white border border-medical-200 text-medical-700 hover:bg-medical-50"
              >
                <Mic className="w-4 h-4" /> Speak
              </button>
            )}
            <button
              type="button"
              onClick={doBuild}
              disabled={parsing || combinedText().length < 3}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-medical-600 to-indigo-600 text-white text-sm font-bold shadow-sm shadow-medical-600/30 hover:from-medical-700 hover:to-indigo-700 disabled:opacity-50 transition-all"
            >
              {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              {parsing ? "Filling in…" : "Fill in the form"}
            </button>
          </div>
          {!speechSupported && (
            <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
              <Keyboard className="w-3 h-3" /> Voice input isn’t available on this browser — typing works the same.
            </p>
          )}
        </>
      )}
    </div>
  );
}
