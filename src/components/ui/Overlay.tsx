"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Overlay primitives: things that must escape their container.
 *
 * Three problems these solve, all of which bit us:
 *
 *  1. **Clipping.** A dropdown inside `overflow-x-auto` (the sub-menu strip) is
 *     cut off by its own scroll container, and no z-index fixes that.
 *  2. **Containment.** `position: fixed` is relative to the nearest ancestor
 *     with a transform, filter or backdrop-filter — not the viewport. A card
 *     with `animate-fade-in` above a floating button is enough to strand it.
 *  3. **The mobile keyboard.** When it opens, the visual viewport shrinks but
 *     the layout viewport does not, so a centred dialog sits behind the keys
 *     with its input out of reach.
 *
 * So everything here renders into `document.body` and, where it matters, is
 * measured against `window.visualViewport` rather than assuming the viewport
 * and the layout agree.
 */

/** Render outside the React tree, into the body. SSR-safe. */
export function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

type Viewport = { top: number; left: number; width: number; height: number };

/**
 * The part of the screen actually visible right now.
 *
 * On mobile this is not `window.innerHeight`: the keyboard shrinks the visual
 * viewport, and pinch-zoom or a page wider than the screen offsets it. Reading
 * it directly is what keeps a dialog above the keys and a floating button on
 * screen when the page has scrolled sideways.
 */
export function useViewport(active = true): Viewport {
  const [rect, setRect] = useState<Viewport>({ top: 0, left: 0, width: 0, height: 0 });

  useEffect(() => {
    if (!active || typeof window === "undefined") return;

    const read = () => {
      const vv = window.visualViewport;
      setRect(
        vv
          ? { top: vv.offsetTop, left: vv.offsetLeft, width: vv.width, height: vv.height }
          : { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight }
      );
    };

    read();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", read);
    vv?.addEventListener("scroll", read);
    window.addEventListener("resize", read);
    window.addEventListener("orientationchange", read);
    return () => {
      vv?.removeEventListener("resize", read);
      vv?.removeEventListener("scroll", read);
      window.removeEventListener("resize", read);
      window.removeEventListener("orientationchange", read);
    };
  }, [active]);

  return rect;
}

/** Stop the page behind a modal from scrolling while it is open. */
function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, [active]);
}

/**
 * A dialog that behaves on a phone.
 *
 * Sized to the *visual* viewport, so when the keyboard opens the panel shrinks
 * to what is left and its body scrolls — the field being typed into stays
 * reachable instead of hiding behind the keys.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "sm",
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  /** Pinned below the scrolling body — actions stay visible with the keyboard up. */
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const vp = useViewport(open);
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const maxWidth = size === "lg" ? "max-w-2xl" : size === "md" ? "max-w-lg" : "max-w-sm";

  return (
    <Portal>
      <div
        role="dialog"
        aria-modal="true"
        className="fixed z-[300] flex items-end justify-center overscroll-contain p-3 sm:items-center sm:p-4"
        style={
          // Anchored to the visual viewport rather than inset-0, so the
          // keyboard and any sideways pan are accounted for.
          vp.height
            ? { top: vp.top, left: vp.left, width: vp.width, height: vp.height }
            : { inset: 0 }
        }
      >
        <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden />

        <div
          className={`relative flex w-full ${maxWidth} flex-col overflow-hidden rounded-2xl bg-white shadow-2xl`}
          style={{ maxHeight: vp.height ? vp.height - 24 : "85dvh" }}
        >
          {(title || subtitle) && (
            <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                {title && <h4 className="truncate text-sm font-bold text-slate-900">{title}</h4>}
                {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
              </div>
              <button
                onClick={onClose}
                className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* The only scrolling region, so the header and actions stay put. */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>

          {footer && <div className="shrink-0 border-t border-slate-100 px-5 py-3">{footer}</div>}
        </div>
      </div>
    </Portal>
  );
}

/** Yes/no, for anything that destroys something. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Delete",
  tone = "danger",
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      {body && <div className="text-sm text-slate-600">{body}</div>}
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => { onConfirm(); onClose(); }}
          className={`flex-1 rounded-xl py-2.5 text-xs font-bold text-white transition ${
            tone === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-medical-600 hover:bg-medical-700"
          }`}
        >
          {confirmLabel}
        </button>
        <button
          onClick={onClose}
          className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-500 transition hover:text-slate-700"
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}

/**
 * A menu pinned to the element that opened it, rendered at the body so no
 * scroll container can clip it and no stacking context can bury it.
 */
export function AnchoredMenu({
  open,
  anchorRef,
  onClose,
  children,
  align = "left",
  width = 176,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement>;
  onClose: () => void;
  children: React.ReactNode;
  align?: "left" | "right";
  width?: number;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const place = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = align === "right" ? r.right - width : r.left;
    // Keep it on screen even when the anchor sits at the very edge.
    const clamped = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    setPos({ top: r.bottom + 4, left: clamped });
  }, [anchorRef, align, width]);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    // A menu that stays put while the page moves under it is worse than one
    // that closes, so follow scrolls in any container.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, onClose, place, anchorRef]);

  if (!open || !pos) return null;

  return (
    <Portal>
      <div
        ref={menuRef}
        role="menu"
        className="fixed z-[320] overflow-hidden rounded-xl border border-slate-100 bg-white py-1 shadow-lg"
        style={{ top: pos.top, left: pos.left, width }}
      >
        {children}
      </div>
    </Portal>
  );
}
