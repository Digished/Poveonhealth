"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, MapPin, Phone, MessageCircle, ShieldCheck, Loader2 } from "lucide-react";
import { parsePhones, type PhoneEntry } from "@/lib/phones";
import { RequestFormToggle } from "@/components/RequestFormToggle";
import { PoveonLogo } from "@/components/PoveonLogo";

export interface ModalLab {
  id: string;
  name: string;
  slug?: string | null;
  address?: string | null;
  logo_url?: string | null;
  phones?: unknown;
  whatsapp?: string | null;
  service_categories?: string[] | null;
}

export interface FormLocation {
  lab_id: string;
  lab_branch_id: string | null;
  name: string;
  address: string;
  phones: PhoneEntry[];
  whatsapp?: string | null;
  logo_url?: string | null;
  is_main: boolean;
  is_parent: boolean;
}

interface LabFormModalProps {
  lab: ModalLab | null;
  open: boolean;
  onClose: () => void;
  /** Pass when the caller already knows the lab's branches (lab pages do). */
  locations?: FormLocation[];
  /** Which side of the form the sheet opens on. */
  initialMode?: "professional" | "patient";
}

/** "LR-260827-4F21" — a plausible requisition number, generated per sheet. */
function makeFormNo(labName: string): string {
  const d = new Date();
  const stamp = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const initials = labName.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase() || "LB";
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${initials}-${stamp}-${rand}`;
}

/**
 * The request form as a sheet of the lab's own headed paper.
 *
 * Chrome (letterhead, requisition number, rules, signature strip) is rendered
 * here; the multi-step form itself is the shared <RequestFormToggle/>, re-skinned
 * by the `.paper-form` rules in globals.css so its fields read as form boxes.
 */
export function LabFormModal({ lab, open, onClose, locations: providedLocations, initialMode = "professional" }: LabFormModalProps) {
  const [mounted, setMounted] = useState(false);
  const [locations, setLocations] = useState<FormLocation[]>(providedLocations ?? []);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // A fresh requisition number per lab per opening — like tearing off a new sheet.
  const formNo = useMemo(
    () => (open && lab ? makeFormNo(lab.name) : ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, lab?.id]
  );

  const today = useMemo(
    () => new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    [open]
  );

  // Look up the lab's branches so the sheet can offer "which location?"
  useEffect(() => {
    if (!open || !lab) return;
    if (providedLocations && providedLocations.length > 0) {
      setLocations(providedLocations);
      return;
    }
    let alive = true;
    setLoadingBranches(true);
    setLocations([]);
    fetch(`/api/labs/${lab.id}/branches`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const branches: Array<Record<string, unknown>> = Array.isArray(d?.branches) ? d.branches : [];
        if (branches.length === 0) { setLocations([]); return; }
        const parent: FormLocation = {
          lab_id: lab.id,
          lab_branch_id: null,
          name: lab.name,
          address: lab.address ?? "",
          phones: parsePhones(lab.phones),
          whatsapp: lab.whatsapp ?? null,
          logo_url: lab.logo_url ?? null,
          is_main: false,
          is_parent: true,
        };
        const rest: FormLocation[] = branches
          .filter((b) => typeof b.branch_lab_id === "string")
          .map((b) => ({
            lab_id: String(b.branch_lab_id),
            lab_branch_id: String(b.id),
            name: String(b.name ?? ""),
            address: String(b.address ?? ""),
            phones: parsePhones(b.phones),
            whatsapp: (b.whatsapp as string | null) ?? null,
            logo_url: lab.logo_url ?? null,
            is_main: Boolean(b.is_main),
            is_parent: false,
          }));
        setLocations(rest.length > 0 ? [parent, ...rest] : []);
      })
      .catch(() => { if (alive) setLocations([]); })
      .finally(() => { if (alive) setLoadingBranches(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lab?.id]);

  // Lock the page behind the sheet, and close on Escape
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!mounted || !open || !lab) return null;

  const phones = parsePhones(lab.phones);
  const waNumbers: string[] = (() => {
    if (!lab.whatsapp) return [];
    try {
      const parsed = JSON.parse(lab.whatsapp);
      return (Array.isArray(parsed) ? parsed : [lab.whatsapp]).filter(
        (w: string) => String(w).replace(/\D/g, "").length >= 7
      );
    } catch {
      return lab.whatsapp.replace(/\D/g, "").length >= 7 ? [lab.whatsapp] : [];
    }
  })();
  const categories = (lab.service_categories ?? []).filter(Boolean).slice(0, 4);

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={`${lab.name} request form`}>
      {/* Desk surface behind the sheet */}
      <div
        className="animate-backdrop-in absolute inset-0 bg-slate-900/45 backdrop-blur-[3px]"
        onClick={onClose}
      />

      <div className="animate-sheet-drop relative flex h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[26px] shadow-[0_40px_90px_-20px_rgba(15,23,42,0.55)] sm:h-[92vh] sm:rounded-[20px]">
        {/* Perforated tear-off edge */}
        <div className="paper-perforation h-2 w-full shrink-0 bg-transparent" aria-hidden="true" />

        <div ref={bodyRef}
          onScroll={(e) => setScrolled((e.target as HTMLDivElement).scrollTop > 24)}
          className="paper-sheet paper-form relative flex-1 overflow-y-auto overscroll-contain"
        >
          {/* Sticky title bar — 64px tall; the form's own step rail sticks below it */}
          <div className="sticky top-0 z-20 h-16 border-b border-stone-300/60 bg-[#fdfbf5] shadow-[0_6px_14px_-12px_rgba(15,23,42,0.5)]">
            <div className="flex h-full items-center gap-3 px-4 sm:px-6">
              <div
                className={`flex min-w-0 flex-1 items-center gap-2.5 transition-all duration-300 ${
                  scrolled ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
                }`}
              >
                {lab.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={lab.logo_url} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover ring-1 ring-stone-300/60" />
                ) : (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
                    <PoveonLogo className="h-4 w-4" />
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-bold leading-tight text-slate-800">{lab.name}</span>
                  <span className="paper-mono block text-[10px] uppercase text-stone-400">{formNo}</span>
                </span>
              </div>

              {!scrolled && (
                <p className="paper-heading flex-1 text-[13px] font-semibold italic text-stone-400">
                  Laboratory request form
                </p>
              )}

              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-full border border-stone-300/70 bg-white/70 p-2 text-stone-500 transition-colors hover:bg-white hover:text-stone-800"
                aria-label="Close form"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* ── Letterhead ─────────────────────────────────────────────── */}
          <div className="px-4 pt-5 sm:px-6">
            <div className="flex items-start gap-3 sm:gap-4">
              {lab.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={lab.logo_url}
                  alt={lab.name}
                  className="h-14 w-14 shrink-0 rounded-xl bg-white object-contain p-1 shadow-sm ring-1 ring-stone-300/60 sm:h-16 sm:w-16"
                />
              ) : (
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm sm:h-16 sm:w-16">
                  <PoveonLogo className="h-7 w-7" />
                </span>
              )}

              <div className="min-w-0 flex-1">
                <h2 className="paper-heading text-[19px] font-bold leading-tight text-slate-900 sm:text-[22px]">
                  {lab.name}
                </h2>
                {lab.address && (
                  <p className="mt-1 flex items-start gap-1.5 text-[12px] leading-relaxed text-stone-500">
                    <MapPin className="mt-[2px] h-3.5 w-3.5 shrink-0 text-stone-400" />
                    <span>{lab.address}</span>
                  </p>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-stone-500">
                  {phones.slice(0, 2).map((p) => (
                    <a key={p.number} href={`tel:${p.number}`} className="inline-flex items-center gap-1 hover:text-medical-700">
                      <Phone className="h-3 w-3 text-stone-400" />
                      {p.number}
                    </a>
                  ))}
                  {waNumbers.slice(0, 1).map((w) => (
                    <a
                      key={w}
                      href={`https://wa.me/${w.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800"
                    >
                      <MessageCircle className="h-3 w-3" />
                      WhatsApp
                    </a>
                  ))}
                </div>
              </div>
            </div>

            {categories.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {categories.map((c) => (
                  <span
                    key={c}
                    className="rounded-full border border-stone-300/70 bg-white/60 px-2.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wide text-stone-500"
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}

            {/* Double rule — printed stationery divider */}
            <div className="mt-4 border-t-2 border-stone-400/40" />
            <div className="mt-[3px] border-t border-stone-300/50" />

            {/* Form title strip */}
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 py-3">
              <h3 className="paper-heading text-[13px] font-bold uppercase tracking-[0.18em] text-slate-700">
                Laboratory request form
              </h3>
              <div className="paper-mono flex items-center gap-4 text-[10.5px] text-stone-500">
                <span>NO. {formNo}</span>
                <span>DATE {today.toUpperCase()}</span>
              </div>
            </div>
            <div className="border-t border-dashed border-stone-300/80" />

            {loadingBranches && (
              <p className="flex items-center gap-2 py-2 text-[11px] text-stone-400">
                <Loader2 className="h-3 w-3 animate-spin" /> Checking this lab&apos;s locations…
              </p>
            )}
          </div>

          {/* ── The form itself ────────────────────────────────────────── */}
          <div className="px-0 pb-4 pt-2 sm:px-2">
            <RequestFormToggle
              chrome="modal"
              initialMode={initialMode}
              preselectedLabId={lab.id}
              preselectedLabName={lab.name}
              preselectedLabAddress={lab.address ?? undefined}
              preselectedServiceCategories={(lab.service_categories ?? []) as string[]}
              preselectedLabPhones={lab.phones}
              locations={locations}
            />
          </div>

          {/* ── Footer strip — the bottom of a printed form ─────────────── */}
          <div className="mt-2 border-t border-stone-300/60 bg-white/40 px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.12em] text-stone-400">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                Encrypted in transit · Sent only to {lab.name}
              </p>
              <p className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.12em] text-stone-400">
                Processed on
                <PoveonLogo className="h-3.5 w-3.5 opacity-60" />
                <span className="font-semibold text-stone-500">Poveon</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
