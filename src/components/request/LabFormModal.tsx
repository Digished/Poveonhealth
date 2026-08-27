"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, MapPin, Phone, MessageCircle, ShieldCheck, Loader2, ChevronRight, FlaskConical } from "lucide-react";
import { parsePhones, type PhoneEntry } from "@/lib/phones";
import { RequestFormToggle } from "@/components/RequestFormToggle";
import { preloadCatalog } from "@/lib/catalog-index";
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
  const [detailsOpen, setDetailsOpen] = useState(false);
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

  // Pull the lab's catalogue into memory while the clinician is still reading
  // the letterhead — by the time they reach the tests field, search is local.
  useEffect(() => {
    if (open && lab) preloadCatalog(lab.id);
  }, [open, lab]);

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

        <div ref={bodyRef} className="paper-sheet paper-form relative flex-1 overflow-y-auto overscroll-contain">
          {/* Sticky header — 64px tall, so the form's own step rail sticks
              directly below it. Tapping the lab opens its full details. */}
          <div className="sticky top-0 z-20 h-16 border-b border-stone-200 bg-white">
            <div className="flex h-full items-center gap-2 px-4 sm:px-6">
              <button
                type="button"
                onClick={() => setDetailsOpen(true)}
                className="group -ml-1.5 flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-left transition-colors hover:bg-stone-50"
                aria-label={`About ${lab.name}`}
              >
                {lab.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={lab.logo_url} alt="" className="h-9 w-9 shrink-0 rounded-lg bg-white object-contain ring-1 ring-stone-200" />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
                    <PoveonLogo className="h-4 w-4" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1">
                    <span className="truncate text-[14px] font-semibold leading-tight text-slate-900">{lab.name}</span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-stone-300 transition-all group-hover:translate-x-0.5 group-hover:text-stone-500" />
                  </span>
                  <span className="block text-[11px] leading-tight text-stone-400">Lab details</span>
                </span>
              </button>

              {/* Header actions — the form portals its "scan slip" control here */}
              <div id="paper-sheet-actions" className="flex shrink-0 items-center" />

              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-lg p-2 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
                aria-label="Close form"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Form title block — same typeface as the rest of the UI, just set
              the way a printed form sets it. */}
          <div className="px-4 pt-5 sm:px-6">
            <h2 className="text-[12px] font-bold uppercase tracking-[0.16em] text-slate-800">
              Laboratory request form
            </h2>
            <p className="mt-1 text-[11px] tabular-nums tracking-[0.06em] text-stone-400">
              NO. {formNo} · {today.toUpperCase()}
            </p>
            <div className="mt-4 border-t border-stone-200" />

            {loadingBranches && (
              <p className="flex items-center gap-2 pt-2 text-[11px] text-stone-400">
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
          <div className="mt-2 border-t border-stone-200 px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[10.5px] text-stone-400">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                Encrypted · sent only to {lab.name}
              </p>
              <p className="flex items-center gap-1.5 text-[10.5px] text-stone-400">
                <PoveonLogo className="h-3 w-3 opacity-50" />
                Poveon
              </p>
            </div>
          </div>
        </div>
      </div>
      {/* Lab details — opened from the header */}
      {detailsOpen && (
        <div className="absolute inset-0 z-30 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={`${lab.name} details`}>
          <div className="animate-backdrop-in absolute inset-0 bg-slate-900/30" onClick={() => setDetailsOpen(false)} />
          <div className="animate-sheet-up relative max-h-[85%] w-full overflow-y-auto rounded-t-2xl bg-white shadow-[0_-10px_40px_-20px_rgba(15,23,42,0.5)] sm:animate-scale-in sm:max-w-md sm:rounded-2xl">
            <div className="flex items-start gap-3 border-b border-stone-200 px-5 py-4">
              {lab.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={lab.logo_url} alt="" className="h-12 w-12 shrink-0 rounded-xl bg-white object-contain ring-1 ring-stone-200" />
              ) : (
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
                  <PoveonLogo className="h-6 w-6" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-semibold leading-tight text-slate-900">{lab.name}</h3>
                {lab.address && (
                  <p className="mt-1 flex items-start gap-1.5 text-[12px] leading-relaxed text-stone-500">
                    <MapPin className="mt-[2px] h-3.5 w-3.5 shrink-0 text-stone-400" />
                    <span>{lab.address}</span>
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                className="shrink-0 rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
                aria-label="Close details"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {categories.length > 0 && (
              <div className="border-b border-stone-100 px-5 py-4">
                <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-stone-400">Services</p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {categories.map((c) => (
                    <span key={c} className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 px-2.5 py-1 text-[11.5px] text-stone-600">
                      <FlaskConical className="h-3 w-3 text-stone-400" />
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(phones.length > 0 || waNumbers.length > 0) && (
              <div className="px-5 py-4">
                <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-stone-400">Contact</p>
                <div className="mt-2.5 space-y-1.5">
                  {waNumbers.map((w) => (
                    <a
                      key={w}
                      href={`https://wa.me/${w.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3.5 py-2.5 text-[13px] font-medium text-emerald-800 transition-colors hover:bg-emerald-50"
                    >
                      <MessageCircle className="h-4 w-4 shrink-0 text-emerald-600" />
                      {w}
                      <span className="ml-auto text-[11px] text-emerald-600">WhatsApp</span>
                    </a>
                  ))}
                  {phones.map((ph) => (
                    <a
                      key={ph.number}
                      href={`tel:${ph.number}`}
                      className="flex items-center gap-2.5 rounded-xl border border-stone-200 px-3.5 py-2.5 text-[13px] font-medium text-slate-700 transition-colors hover:bg-stone-50"
                    >
                      <Phone className="h-4 w-4 shrink-0 text-stone-400" />
                      {ph.number}
                      {ph.label && <span className="ml-auto text-[11px] text-stone-400">{ph.label}</span>}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {locations.length > 1 && (
              <div className="border-t border-stone-100 px-5 py-4">
                <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-stone-400">
                  {locations.length} locations
                </p>
                <ul className="mt-2.5 space-y-1.5">
                  {locations.map((l) => (
                    <li key={`${l.lab_id}-${l.lab_branch_id ?? "main"}`} className="text-[12.5px] leading-snug text-stone-600">
                      <span className="font-medium text-slate-800">{l.name}</span>
                      {l.address && <span className="block text-[11.5px] text-stone-400">{l.address}</span>}
                    </li>
                  ))}
                </ul>
                <p className="mt-2.5 text-[11px] text-stone-400">Pick the one you want on the form&apos;s first step.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
