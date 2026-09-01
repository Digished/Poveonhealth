"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * A section of a patient's care a doctor can fold away.
 *
 * A care-plan patient's page stacks the treatment plan, the tests due and the
 * medication list, and a doctor working on one of them has to scroll past the
 * other two every time. Each is foldable, and what is folded is remembered per
 * doctor per section, so the page opens the way they left it.
 *
 * The title is the toggle and any action sits beside it — a button inside a
 * button is invalid, and a doctor who taps "Schedule" must not have the
 * section collapse under them. Collapsed content is unmounted rather than
 * hidden, so a folded list costs nothing to render.
 */
export function CollapsibleSection({
  id,
  title,
  icon,
  count,
  action,
  defaultOpen = true,
  /** Forces the section open — e.g. a form was opened inside it. */
  forceOpen = false,
  /**
   * Something inside wants the doctor. Shown as a dot on the header, so a
   * folded section can still say so — folding it open permanently instead
   * would mean a section that can never be folded at all.
   */
  alert = false,
  children,
  className = "",
}: {
  /** Stable key the open/closed state is remembered under. */
  id: string;
  title: string;
  icon?: React.ReactNode;
  count?: number;
  action?: React.ReactNode;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  alert?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [ready, setReady] = useState(false);

  // Read once on mount rather than during render: the server has no
  // localStorage, and reading it in the initial state would make the first
  // client render disagree with the markup it is hydrating.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(`section:${id}`);
      if (saved === "open") setOpen(true);
      else if (saved === "shut") setOpen(false);
    } catch {
      /* private browsing, blocked storage — the default stands */
    }
    setReady(true);
  }, [id]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(`section:${id}`, open ? "open" : "shut");
    } catch {
      /* nothing to do; the section still works, it just won't be remembered */
    }
  }, [id, open, ready]);

  const shown = open || forceOpen;

  return (
    <section className={`rounded-2xl border border-slate-100 bg-white shadow-sm ${className}`}>
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={shown}
          aria-controls={`section-body-${id}`}
          className="-my-1 flex min-w-0 flex-1 items-center gap-1.5 rounded-lg py-1 text-left text-sm font-bold text-slate-800 transition hover:text-medical-700"
        >
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
              shown ? "" : "-rotate-90"
            }`}
          />
          {icon}
          <span className="truncate">{title}</span>
          {alert && (
            <span
              title="Something here needs your attention"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
            />
          )}
          {count != null && count > 0 && (
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
              {count}
            </span>
          )}
        </button>
        {action}
      </div>

      {shown && (
        <div id={`section-body-${id}`} className="px-4 pb-4">
          {children}
        </div>
      )}
    </section>
  );
}
