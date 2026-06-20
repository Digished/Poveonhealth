"use client";

import { useEffect, useState, useCallback } from "react";
import QRCode from "qrcode";
import { Loader2, QrCode, UserPlus, Download, Copy, X, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";
import { LabOnboardForm, OnboardTemplate } from "@/components/lab/LabOnboardForm";

export function OnboardingPanel({
  labId,
  labName,
  slug,
}: {
  labId: string;
  labName: string;
  slug: string | null;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [templates, setTemplates] = useState<OnboardTemplate[]>([]);
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!slug || typeof window === "undefined") return;
    const link = `${window.location.origin}/o/${slug}`;
    setUrl(link);
    QRCode.toDataURL(link, { width: 480, margin: 1, color: { dark: "#0f172a", light: "#ffffff" } })
      .then(setQrDataUrl)
      .catch(() => {});
  }, [slug]);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/lab/templates", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setTemplates((data.templates ?? []).map((t: { id: string; name: string; test_names: string[] }) => ({ id: t.id, name: t.name, test_names: t.test_names })));
      }
    } catch { /* non-fatal */ }
  }, []);

  function openWalkIn() { loadTemplates(); setWalkInOpen(true); }

  function download() {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `${slug ?? "lab"}-onboarding-qr.png`;
    a.click();
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* QR card */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-white"><QrCode className="h-4 w-4 text-medical-300" /> Patient onboarding QR</p>
        <p className="mt-1 text-xs text-slate-400">Print and display this code. Patients scan it to self-register before arriving.</p>

        {!slug ? (
          <div className="mt-4 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-200">Set a public URL slug for your lab to enable the QR onboarding link.</div>
        ) : (
          <div className="mt-4 flex flex-col items-center">
            <div className="rounded-2xl bg-white p-3">
              {qrDataUrl ? <img src={qrDataUrl} alt="Onboarding QR" className="h-44 w-44" /> : <div className="flex h-44 w-44 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>}
            </div>
            <div className="mt-3 flex w-full items-center gap-2">
              <input readOnly value={url} className="min-w-0 flex-1 truncate rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-300" />
              <button onClick={() => { navigator.clipboard?.writeText(url); toast.success("Link copied"); }} className="rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/5" title="Copy link"><Copy className="h-4 w-4" /></button>
              <a href={url} target="_blank" rel="noreferrer" className="rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/5" title="Open"><ExternalLink className="h-4 w-4" /></a>
            </div>
            <button onClick={download} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 py-2 text-sm font-medium text-slate-200 hover:bg-white/5"><Download className="h-4 w-4" /> Download QR</button>
          </div>
        )}
      </div>

      {/* Walk-in card */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-white"><UserPlus className="h-4 w-4 text-medical-300" /> Register a walk-in</p>
        <p className="mt-1 text-xs text-slate-400">Quickly register a client who arrives without a Poveon request. They&apos;ll be tracked as a walk-in.</p>
        <button onClick={openWalkIn} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-medical-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-medical-700"><UserPlus className="h-4 w-4" /> New walk-in client</button>
      </div>

      {walkInOpen && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={() => setWalkInOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Register walk-in</h3>
              <button onClick={() => setWalkInOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <LabOnboardForm
              lab={{ id: labId, name: labName, slug: slug ?? undefined }}
              source="walk_in"
              templates={templates}
              onSuccess={() => { setTimeout(() => setWalkInOpen(false), 2500); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
