"use client";

/**
 * The shell every admin dialog sits in.
 *
 * The admin dialogs were each hand-rolled as a `fixed inset-0` div, and all
 * twenty-four shared the same four faults: nothing portalled them, so an
 * `overflow` or `transform` ancestor could clip them; none listened for Escape;
 * none locked the page, so the background scrolled behind the dialog; and every
 * one capped its panel at `max-h-[90vh]`, which is 90% of the *window* — on a
 * phone with the keyboard up, the bottom of the dialog (where the buttons are)
 * sits underneath the keys.
 *
 * This fixes all four in one place. The panel inside is left exactly as it was:
 * the wrapper publishes `--admin-modal-max-h` from the real visual viewport,
 * and panels use `max-h-modal` to read it, so a dialog is as tall as the space
 * that actually exists rather than the space the window claims.
 */

import { useEffect } from "react";
import { Portal, useViewport } from "@/components/ui/Overlay";

export function AdminOverlay({
  onClose,
  children,
  /**
   * "sheet" — bottom sheet on phones, centred card from `sm` up (most dialogs).
   * "center" — always centred.
   * "fullscreen" — the panel owns the whole screen, with no backdrop or
   *   padding. The long lab forms work this way; they still need the viewport
   *   sizing and the scroll lock, just not the card treatment.
   */
  align = "sheet",
  labelledBy,
}: {
  onClose: () => void;
  children: React.ReactNode;
  align?: "sheet" | "center" | "fullscreen";
  labelledBy?: string;
}) {
  const vp = useViewport(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const height = vp.height || undefined;
  const full = align === "fullscreen";

  return (
    <Portal>
      <div
        className={
          full
            ? "fixed z-[300] flex flex-col overflow-hidden"
            : `fixed z-[300] flex justify-center overflow-y-auto bg-slate-950/65 p-0 backdrop-blur-sm sm:items-center sm:p-4 ${
                align === "sheet" ? "items-end" : "items-center"
              }`
        }
        style={{
          top: vp.top || 0,
          left: vp.left || 0,
          width: vp.width || "100%",
          height,
          // Panels read this instead of 90vh, so the keyboard cannot bury the
          // footer: visualViewport already excludes it.
          ["--admin-modal-max-h" as string]: height ? `${Math.round(height * 0.92)}px` : "92dvh",
        }}
        onClick={full ? undefined : (e) => { if (e.target === e.currentTarget) onClose(); }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        {children}
      </div>
    </Portal>
  );
}
