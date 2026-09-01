"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import {
  X, Loader2, Upload, Download, HeartHandshake, Phone, Mail, MapPin, Trash2, AlertCircle,
} from "lucide-react";
import type { Lab } from "@/lib/types";
import { AdminOverlay } from "@/components/admin/AdminOverlay";

interface Partner {
  id: string;
  type: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

interface UploadSummary {
  total: number;
  created: number;
  updated: number;
  skipped: { row: number; name: string; reason: string }[];
}

const TYPE_META: Record<string, { label: string; cls: string }> = {
  hmo: { label: "HMO", cls: "bg-violet-500/15 text-violet-300" },
  hospital: { label: "Hospital", cls: "bg-sky-500/15 text-sky-300" },
  company: { label: "Company", cls: "bg-amber-500/15 text-amber-300" },
};

const TEMPLATE_CSV =
  "type,name,contact_name,phone,email,address,notes\n" +
  "hmo,Hygeia HMO,Jane Doe,+2348012345678,corporate@hygeiahmo.com,Lagos,Tariff plan B\n" +
  "hospital,St. Mary's Hospital,Dr. John Smith,+2348098765432,frontdesk@stmarys.ng,Ikeja Lagos,\n" +
  "company,Acme Ltd,,,hr@acme.ng,,Staff annual screening\n";

/**
 * Admin tool — view a lab's partners (HMOs, hospitals, companies) and bulk-upload
 * them from a CSV/Excel spreadsheet on the lab's behalf.
 */
export function AdminLabPartnersModal({ lab, onClose }: { lab: Lab; onClose: () => void }) {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeF, setTypeF] = useState<"" | "hmo" | "hospital" | "company">("");
  const [defaultType, setDefaultType] = useState<"hmo" | "hospital" | "company">("hospital");
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/labs/${lab.id}/partners`, { cache: "no-store" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed");
      setPartners(data.partners ?? []);
    } catch {
      toast.error("Failed to load partners");
    } finally {
      setLoading(false);
    }
  }, [lab.id]);

  useEffect(() => { load(); }, [load]);

  async function handleUpload(file: File) {
    setUploading(true);
    setSummary(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("default_type", defaultType);
      const res = await fetch(`/api/admin/labs/${lab.id}/partners/upload`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Upload failed");
      setSummary(data.summary);
      toast.success(`${data.summary.created} added, ${data.summary.updated} updated`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(p: Partner) {
    if (!window.confirm(`Remove ${p.name} from ${lab.name}'s partners?`)) return;
    setBusyId(p.id);
    try {
      const res = await fetch(`/api/admin/labs/${lab.id}/partners/${p.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to remove");
      setPartners((prev) => prev.filter((x) => x.id !== p.id));
      toast.success("Partner removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    } finally {
      setBusyId(null);
    }
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "partners-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const shown = useMemo(() => partners.filter((p) => !typeF || p.type === typeF), [partners, typeF]);
  const counts = useMemo(() => ({
    hmo: partners.filter((p) => p.type === "hmo").length,
    hospital: partners.filter((p) => p.type === "hospital").length,
    company: partners.filter((p) => p.type === "company").length,
  }), [partners]);

  return (
    <AdminOverlay onClose={() => onClose()}>
      <div
        className="flex max-h-modal w-full max-w-3xl flex-col rounded-t-3xl border border-white/10 bg-slate-900 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 p-5">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
              <HeartHandshake className="h-5 w-5 text-medical-400" /> Partners — {lab.name}
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              Upload the lab&apos;s partnered HMOs, hospitals and companies from a spreadsheet, on their behalf.
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Upload controls */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 rounded-xl bg-medical-600 px-4 py-2 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? "Uploading…" : "Upload spreadsheet"}
              </button>
              <label className="flex items-center gap-1.5 text-xs text-slate-400">
                Default type
                <select
                  value={defaultType}
                  onChange={(e) => setDefaultType(e.target.value as typeof defaultType)}
                  className="rounded-lg border border-white/10 bg-slate-800 px-2 py-1.5 text-xs text-white focus:border-medical-400 focus:outline-none"
                >
                  <option value="hospital">Hospital</option>
                  <option value="hmo">HMO</option>
                  <option value="company">Company</option>
                </select>
              </label>
              <button
                onClick={downloadTemplate}
                className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5"
              >
                <Download className="h-3.5 w-3.5" /> Template
              </button>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              CSV or Excel with a <span className="text-slate-400">name</span> column. Optional:{" "}
              <span className="text-slate-400">type</span> (hmo / hospital / company — the default type is used when missing),{" "}
              <span className="text-slate-400">contact_name, phone, email, address, notes</span>. Existing partners with the
              same name and type are updated, not duplicated.
            </p>
          </div>

          {/* Last upload summary */}
          {summary && (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs">
              <p className="font-semibold text-emerald-300">
                {summary.created} added · {summary.updated} updated
                {summary.skipped.length > 0 && <span className="text-amber-300"> · {summary.skipped.length} skipped</span>}
              </p>
              {summary.skipped.length > 0 && (
                <ul className="mt-2 space-y-1 text-amber-300/90">
                  {summary.skipped.slice(0, 8).map((s, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                      Row {s.row} ({s.name}): {s.reason}
                    </li>
                  ))}
                  {summary.skipped.length > 8 && <li>…and {summary.skipped.length - 8} more</li>}
                </ul>
              )}
            </div>
          )}

          {/* Type filter */}
          <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-white/5 p-1">
            {([["", `All (${partners.length})`], ["hmo", `HMOs (${counts.hmo})`], ["hospital", `Hospitals (${counts.hospital})`], ["company", `Companies (${counts.company})`]] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setTypeF(v)}
                className={`shrink-0 flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-xs font-semibold transition ${typeF === v ? "bg-medical-600 text-white shadow-sm" : "text-slate-400 hover:text-white"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Partner list */}
          {loading ? (
            <div className="flex justify-center py-14"><Loader2 className="h-6 w-6 animate-spin text-medical-400" /></div>
          ) : shown.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 py-12 text-center">
              <HeartHandshake className="mx-auto mb-3 h-8 w-8 text-slate-500" />
              <p className="text-sm font-medium text-slate-300">No partners yet</p>
              <p className="mt-1 text-xs text-slate-500">Upload a spreadsheet to add this lab&apos;s HMOs, hospitals and companies.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {shown.map((p) => {
                const meta = TYPE_META[p.type] ?? TYPE_META.company;
                return (
                  <div key={p.id} className={`rounded-2xl border p-4 ${p.is_active ? "border-white/10 bg-white/5" : "border-white/5 bg-white/3 opacity-60"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-white">{p.name}</p>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.cls}`}>{meta.label}</span>
                          {!p.is_active && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-400">inactive</span>}
                        </div>
                        {p.contact_name && <p className="mt-0.5 text-xs text-slate-400">Contact: {p.contact_name}</p>}
                      </div>
                      <button
                        onClick={() => remove(p)}
                        disabled={busyId === p.id}
                        className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-50"
                        title="Remove"
                      >
                        {busyId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-slate-400">
                      {p.phone && <p className="flex items-center gap-1.5"><Phone className="h-3 w-3 shrink-0" /> {p.phone}</p>}
                      {p.email && <p className="flex items-center gap-1.5"><Mail className="h-3 w-3 shrink-0" /> {p.email}</p>}
                      {p.address && <p className="flex items-center gap-1.5"><MapPin className="h-3 w-3 shrink-0" /> {p.address}</p>}
                      {p.notes && <p className="mt-1.5 text-slate-500">{p.notes}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AdminOverlay>
  );
}
