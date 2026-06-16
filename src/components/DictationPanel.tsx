"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { Mic, MicOff, Wand2, Loader2, X, Info } from "lucide-react";

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
 * Behaviour notes:
 * - The mic stays on until the doctor stops it (auto-restarts on engine timeouts).
 * - Only FINALISED speech is committed to the box — interim words are not shown.
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
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [parsing, setParsing] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // True while the doctor wants to keep listening — drives auto-restart on engine end.
  const keepListeningRef = useRef(false);
  const speechSupported = typeof window !== "undefined" && !!getSpeechRecognition();

  const stopListening = useCallback(() => {
    keepListeningRef.current = false;
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    setListening(false);
  }, []);

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
        rec.interimResults = true; // needed so the engine streams, but we only keep finals
        rec.onresult = (e) => {
          let finalChunk = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i];
            if (res.isFinal) finalChunk += res[0].transcript;
          }
          if (finalChunk.trim()) {
            setText((prev) => `${prev ? `${prev} ` : ""}${finalChunk.trim()}`.replace(/\s+/g, " "));
          }
        };
        rec.onerror = (ev) => {
          if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
            toast.error("Microphone permission denied.");
            keepListeningRef.current = false;
            setListening(false);
          }
          // "no-speech"/"aborted" are transient — onend handles restart.
        };
        rec.onend = () => {
          // Keep the mic alive across the engine's silence timeouts until the
          // doctor explicitly stops.
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

  async function handleBuild() {
    if (listening) stopListening();
    const value = text.trim();
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
      const flagged = ((data.resolvedTests as ResolvedTest[] | null) ?? []).filter((r) => r.status === "unknown").length;
      toast.success(flagged > 0 ? `Filled in — check ${flagged} test${flagged > 1 ? "s" : ""} not in this lab's catalogue.` : "Referral filled in — review below.");
    } catch {
      toast.error("Network error. You can still type the fields below.");
    } finally {
      setParsing(false);
    }
  }

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
          <button type="button" onClick={() => { stopListening(); onClose(); }} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 shrink-0" aria-label="Close dictation">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={speechSupported ? "Tap “Speak” and talk, or type here…" : "Type the referral here…"}
        rows={3}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[15px] leading-7 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-400 resize-none"
      />

      <div className="flex items-center gap-2 mt-2.5">
        {speechSupported && (
          <button
            type="button"
            onClick={listening ? stopListening : startListening}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shrink-0 ${
              listening
                ? "bg-red-600 text-white shadow-lg shadow-red-600/30 animate-pulse"
                : "bg-white border border-medical-200 text-medical-700 hover:bg-medical-50"
            }`}
          >
            {listening ? <><MicOff className="w-4 h-4" /> Stop</> : <><Mic className="w-4 h-4" /> Speak</>}
          </button>
        )}
        <button
          type="button"
          onClick={handleBuild}
          disabled={parsing || text.trim().length < 3}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-medical-600 to-indigo-600 text-white text-sm font-bold shadow-sm shadow-medical-600/30 hover:from-medical-700 hover:to-indigo-700 disabled:opacity-50 transition-all"
        >
          {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
          {parsing ? "Filling in…" : "Fill in the form"}
        </button>
      </div>
      {listening && (
        <p className="text-[11px] text-red-500 mt-2 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Listening… tap Stop when you’re done.
        </p>
      )}
    </div>
  );
}
