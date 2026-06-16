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
  patient_email: string;
  schedule_hint: "today" | "this_week" | "this_month" | "";
}

export type ResolvedTest = { input: string; status: "resolved" | "ambiguous" | "unknown"; canonical?: string };

function recordingSupported(): boolean {
  return typeof window !== "undefined"
    && typeof navigator !== "undefined"
    && !!navigator.mediaDevices?.getUserMedia
    && typeof MediaRecorder !== "undefined";
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

/**
 * Dictation panel — the "Fast mode" input. The doctor speaks or types the whole
 * referral in plain English; an AI parser turns it into structured fields.
 *
 * Voice path (chosen for accuracy with Nigerian accents + medical terms):
 * - Audio is RECORDED in the browser (MediaRecorder), then transcribed
 *   server-side by OpenAI with a Nigerian lab-vocabulary prompt — the browser's
 *   built-in speech engine can't be steered and mangles accents/abbreviations.
 * - The raw transcript is never shown in the input; recording → transcription →
 *   structured fields happens straight through, with a checklist afterwards.
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
  const [processing, setProcessing] = useState(false); // transcribing + parsing
  const [parsing, setParsing] = useState(false);        // typed-only parse

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const canRecord = recordingSupported();

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => {
    try { recorderRef.current?.state !== "inactive" && recorderRef.current?.stop(); } catch { /* ignore */ }
    stopTracks();
  }, [stopTracks]);

  // Parse free text (typed and/or transcribed) into structured fields.
  const buildFromText = useCallback(async (text: string) => {
    const value = text.trim();
    if (value.length < 3) { toast.error("Dictate or type the referral first."); return; }
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
  }, [labId, onParsed]);

  // Typed "Fill in the form" button.
  async function handleBuildTyped() {
    setParsing(true);
    try { await buildFromText(typed); } finally { setParsing(false); }
  }

  // Send the recorded audio for transcription, then parse it.
  const transcribeAndBuild = useCallback(async (blob: Blob) => {
    setProcessing(true);
    try {
      const fd = new FormData();
      const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
      fd.append("audio", blob, `dictation.${ext}`);
      const res = await fetch("/api/requests/transcribe", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.success || !data.text) {
        toast.error(data.error ?? "Didn't catch that — try again or type it.");
        return;
      }
      // Merge with anything already typed, then parse.
      const merged = [typed.trim(), String(data.text).trim()].filter(Boolean).join(". ");
      await buildFromText(merged);
    } catch {
      toast.error("Network error during transcription. You can type the details instead.");
    } finally {
      setProcessing(false);
    }
  }, [typed, buildFromText]);

  async function startRecording() {
    if (!canRecord) { toast.error("Recording isn't supported on this browser — type instead."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        stopTracks();
        if (blob.size > 0) void transcribeAndBuild(blob);
        else { toast.error("No audio captured — try again."); }
      };
      recorder.start();
      recorderRef.current = recorder;
      setListening(true);
    } catch (e) {
      const name = (e as { name?: string })?.name;
      toast.error(name === "NotAllowedError" ? "Microphone permission denied." : "Couldn't start the microphone.");
      stopTracks();
      setListening(false);
    }
  }

  function stopRecording() {
    setListening(false);
    try { if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop(); } catch { /* ignore */ }
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
          <button type="button" onClick={() => { stopRecording(); stopTracks(); onClose(); }} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 shrink-0" aria-label="Close dictation">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {processing ? (
        /* Transcribing + parsing — no transcript shown */
        <div className="rounded-xl border border-medical-200 bg-medical-50/60 px-4 py-6 flex flex-col items-center gap-3">
          <Loader2 className="w-7 h-7 text-medical-600 animate-spin" />
          <p className="text-sm font-semibold text-medical-700">Transcribing your dictation…</p>
          <p className="text-[11px] text-slate-400">This takes just a moment.</p>
        </div>
      ) : listening ? (
        /* Recording — animated, NO transcript shown */
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
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Recording…
          </p>
          <p className="text-[11px] text-slate-400">Speak naturally. Your words are captured privately.</p>
          <button
            type="button"
            onClick={stopRecording}
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
            placeholder={canRecord ? "Tap “Speak” and talk, or type here…" : "Type the referral here…"}
            rows={3}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[15px] leading-7 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-400 resize-none"
          />

          <div className="flex items-center gap-2 mt-2.5">
            {canRecord && (
              <button
                type="button"
                onClick={startRecording}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shrink-0 bg-white border border-medical-200 text-medical-700 hover:bg-medical-50 animate-dictate-glow"
              >
                <Mic className="w-4 h-4" /> Speak
              </button>
            )}
            <button
              type="button"
              onClick={handleBuildTyped}
              disabled={parsing || typed.trim().length < 3}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-medical-600 to-indigo-600 text-white text-sm font-bold shadow-sm shadow-medical-600/30 hover:from-medical-700 hover:to-indigo-700 disabled:opacity-50 transition-all"
            >
              {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              {parsing ? "Filling in…" : "Fill in the form"}
            </button>
          </div>
          {!canRecord && (
            <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
              <Keyboard className="w-3 h-3" /> Voice input isn’t available on this browser — typing works the same.
            </p>
          )}
        </>
      )}
    </div>
  );
}
