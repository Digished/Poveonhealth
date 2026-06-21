"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Near-fullscreen modal shell for rich detail views (request drawer, journey,
 * referral history). Gives detail popups room to breathe with a two-column body
 * on desktop. Portal-rendered, body-scroll locked, dark-themed to match the
 * dashboard. Close on backdrop click, Escape, or the header button.
 */
export function FullViewModal({
  title,
  subtitle,
  headerExtra,
  onClose,
  children,
  maxWidth = "max-w-6xl",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Optional node rendered in the header, before the close button. */
  headerExtra?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-stretch justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4 lg:p-8"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full flex-col overflow-hidden border-white/10 bg-slate-900 shadow-2xl animate-slide-up sm:h-[92vh] sm:rounded-3xl sm:border lg:max-h-[900px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`mx-auto flex h-full w-full flex-col ${maxWidth}`}>
          {/* Sticky header */}
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold text-white sm:text-xl">{title}</h3>
              {subtitle && <div className="mt-0.5 truncate font-mono text-xs text-slate-400">{subtitle}</div>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {headerExtra}
              <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          {/* Scrollable body */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
