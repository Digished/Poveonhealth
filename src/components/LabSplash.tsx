"use client";

import { useState, useEffect } from "react";

interface LabSplashProps {
  logoUrl: string | null;
  labName: string;
}

/**
 * Branded splash screen shown for ~1.6 s when a lab-specific page loads.
 * Renders over the whole viewport, then fades out and unmounts.
 */
export function LabSplash({ logoUrl, labName }: LabSplashProps) {
  // "in" → animate enters; "out" → animate exits; "gone" → unmounted
  const [phase, setPhase] = useState<"in" | "out" | "gone">("in");

  useEffect(() => {
    // Give browser a tick to paint, then trigger enter animation
    const t1 = requestAnimationFrame(() => setPhase("in"));
    // Start exit after 1 400 ms
    const t2 = setTimeout(() => setPhase("out"), 1400);
    // Unmount after exit transition (500 ms)
    const t3 = setTimeout(() => setPhase("gone"), 1900);
    return () => {
      cancelAnimationFrame(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  if (phase === "gone") return null;

  const exiting = phase === "out";

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden
        bg-white
        transition-opacity duration-500 ease-in-out
        ${exiting ? "opacity-0 pointer-events-none" : "opacity-100"}`}
    >
      {/* Blurred logo tints the splash background to match the lab's colours */}
      {logoUrl && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url(${logoUrl})`,
            backgroundSize: "200% 200%",
            backgroundPosition: "center",
            filter: "blur(80px) saturate(2) brightness(1.1)",
            opacity: 0.18,
            transform: "scale(1.3)",
          }}
        />
      )}
      {!logoUrl && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-sky-100/80 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-indigo-100/60 rounded-full blur-3xl" />
        </div>
      )}
      <div className="absolute inset-0 bg-white/75 pointer-events-none" />
      <div
        className={`flex flex-col items-center gap-4 transition-transform duration-500 ease-out
          ${exiting ? "scale-95" : "scale-100"}`}
      >
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={labName}
            className="w-28 h-28 sm:w-36 sm:h-36 rounded-3xl object-contain shadow-xl
              animate-[splash-logo_0.6s_cubic-bezier(0.34,1.56,0.64,1)_both]"
          />
        ) : (
          <div
            className="w-28 h-28 sm:w-36 sm:h-36 rounded-3xl
              bg-gradient-to-br from-sky-500 to-indigo-600
              flex items-center justify-center shadow-xl
              animate-[splash-logo_0.6s_cubic-bezier(0.34,1.56,0.64,1)_both]"
          >
            <svg className="w-14 h-14 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158
                   a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172
                   a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828
                   c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
              />
            </svg>
          </div>
        )}

        <p
          className="text-lg sm:text-xl font-bold text-slate-800 tracking-tight
            animate-[splash-text_0.4s_ease-out_0.3s_both]"
        >
          {labName}
        </p>

        {/* Subtle loading pulse bar */}
        <div className="w-16 h-1 rounded-full bg-slate-200 overflow-hidden animate-[splash-text_0.4s_ease-out_0.5s_both]">
          <div className="h-full bg-sky-400 rounded-full animate-[loading-bar_1s_ease-in-out_0.5s_infinite]" />
        </div>
      </div>
    </div>
  );
}
