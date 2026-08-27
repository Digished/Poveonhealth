"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Loader2, QrCode as QrIcon, Download, Copy, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";
import { labUrl } from "@/lib/lab-urls";

/**
 * The lab's public onboarding QR + link, for printing/physical display.
 * Lives in Lab Profile settings (download to print) rather than the Onboarding
 * tab — patients scan the printed code to self-register before arriving.
 */
export function LabQrCard({ slug }: { slug: string | null }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!slug || typeof window === "undefined") return;
    const link = labUrl(slug, "/o", window.location.origin);
    setUrl(link);
    QRCode.toDataURL(link, { width: 480, margin: 1, color: { dark: "#0f172a", light: "#ffffff" } })
      .then(setQrDataUrl)
      .catch(() => {});
  }, [slug]);

  function download() {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `${slug ?? "lab"}-onboarding-qr.png`;
    a.click();
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-white"><QrIcon className="h-4 w-4 text-medical-300" /> Patient onboarding QR</p>
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
  );
}
