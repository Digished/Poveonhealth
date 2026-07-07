"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Plus, X, Search, Loader2, Upload, FileSpreadsheet, AlertTriangle,
  CheckCircle2, ChevronLeft, Building2, Users, Stethoscope, UserPlus,
  Trash2, RefreshCw, Flag,
} from "lucide-react";
import { toast } from "react-hot-toast";

// ── Types ──────────────────────────────────────────────────────────────────────

interface HmoRow {
  id: string;
  name: string;
  code: string;
  contact_email: string | null;
  contact_phone: string | null;
  active: boolean;
  member_count: number;
  doctor_count: number;
}

interface MemberRow {
  id: string;
  email: string;
  policy_number: string;
  full_name: string;
  phone: string | null;
  date_of_birth: string | null;
  sex: string | null;
  active: boolean;
  flagged: boolean;
  assigned_doctors: string[];
}

interface MonitoringDoctor {
  email: string;
  profile: { prefix: string | null; full_name: string | null; specialty: string | null; claimed: boolean } | null;
  hmos: { id: string; name: string; code: string }[];
  patients: { id: string; full_name: string; policy_number: string; hmo: { name: string } }[];
}

type CsvRow = {
  email: string;
  policy_number: string;
  full_name: string;
  phone: string;
  _valid: boolean;
  _error?: string;
};

// ── CSV parsing (same conventions as the professionals importer) ──────────────

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseRosterCSV(text: string): CsvRow[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z_]/g, ""));
  const col = (name: string, aliases: string[] = []) => {
    const idx = [name, ...aliases].map((n) => headers.indexOf(n)).find((i) => i >= 0) ?? -1;
    return (cols: string[]) => cols[idx]?.trim() ?? "";
  };
  const getEmail  = col("email");
  const getPolicy = col("policy_number", ["policy_no", "policy", "policynumber"]);
  const getName   = col("full_name", ["name"]);
  const getPhone  = col("phone", ["phone_number", "mobile"]);

  return lines.slice(1).map((line) => {
    const cols = parseCSVLine(line);
    const row: CsvRow = {
      email: getEmail(cols).toLowerCase(),
      policy_number: getPolicy(cols),
      full_name: getName(cols),
      phone: getPhone(cols),
      _valid: true,
    };
    if (!row.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
      row._valid = false; row._error = "Invalid or missing email";
    } else if (!row.policy_number) {
      row._valid = false; row._error = "Policy number required";
    } else if (!row.full_name) {
      row._valid = false; row._error = "Full name required";
    }
    return row;
  }).filter((r) => r.email || r.full_name || r.policy_number);
}

// ── Create HMO modal ───────────────────────────────────────────────────────────

const inputCls =
  "w-full px-3 py-2.5 rounded-xl border border-white/15 bg-white/8 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition";
const labelCls = "block text-xs font-medium text-slate-300 mb-1.5";

function CreateHmoModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/hmo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          code: code.trim(),
          contact_email: contactEmail.trim(),
          contact_phone: contactPhone.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to create HMO."); return; }
      toast.success("HMO created");
      onCreated();
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-white font-semibold flex items-center gap-2"><Building2 className="w-4 h-4 text-emerald-400" /> New HMO Partner</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className={labelCls}>HMO Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Reliance HMO" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Short Code</label>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required placeholder="e.g. RELIANCE" className={inputCls} />
            <p className="text-[11px] text-slate-500 mt-1">Letters, numbers, - and _ only. Used to identify the HMO internally.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Contact Email (optional)</label>
              <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="ops@hmo.com" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Contact Phone (optional)</label>
              <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+234…" className={inputCls} />
            </div>
          </div>
          {error && <p className="text-xs text-red-400 bg-red-900/20 border border-red-500/20 rounded-xl px-3 py-2">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold transition">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create HMO
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Roster CSV import modal ────────────────────────────────────────────────────

type ImportResult = {
  created: number;
  skipped_duplicate: number;
  errors: { row: number; email: string; reason: string }[];
};

function RosterImportModal({ hmo, onClose, onImported }: { hmo: HmoRow; onClose: () => void; onImported: () => void }) {
  const [rows, setRows] = useState<CsvRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setRows(parseRosterCSV(text));
    };
    reader.readAsText(file);
  }

  const validRows = (rows ?? []).filter((r) => r._valid);
  const invalidRows = (rows ?? []).filter((r) => !r._valid);

  async function doImport() {
    if (validRows.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch(`/api/admin/hmo/${hmo.id}/import-roster`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: validRows.map(({ _valid, _error, ...r }) => r),
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Import failed"); return; }
      setResult(data);
      onImported();
    } catch { toast.error("Network error"); }
    finally { setImporting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-3xl max-h-[90dvh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> Upload Roster — {hmo.name}
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition"><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto flex-1">
          {result ? (
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <p className="text-white font-medium">
                  {result.created} member{result.created !== 1 ? "s" : ""} imported
                  {result.skipped_duplicate > 0 && `, ${result.skipped_duplicate} already on the roster`}
                </p>
              </div>
              {result.errors.length > 0 && (
                <div className="rounded-xl border border-white/8 overflow-hidden">
                  <div className="overflow-x-auto max-h-60">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-white/5 border-b border-white/8">
                          <th className="px-3 py-2 text-left text-slate-400 font-semibold">Row</th>
                          <th className="px-3 py-2 text-left text-slate-400 font-semibold">Email</th>
                          <th className="px-3 py-2 text-left text-slate-400 font-semibold">Skipped because</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {result.errors.map((e, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2 text-slate-500">{e.row}</td>
                            <td className="px-3 py-2 text-slate-300 font-mono">{e.email || "—"}</td>
                            <td className="px-3 py-2 text-amber-400">{e.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <button onClick={onClose}
                className="w-full px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-semibold transition">
                Done
              </button>
            </div>
          ) : rows === null ? (
            <div className="p-5">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault(); setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFile(f);
                }}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition ${
                  dragOver ? "border-emerald-400 bg-emerald-500/10" : "border-white/15 hover:border-white/30"
                }`}
              >
                <Upload className="w-8 h-8 text-slate-500 mx-auto mb-3" />
                <p className="text-sm text-slate-300 font-medium">Drop a CSV file here, or click to choose</p>
                <p className="text-xs text-slate-500 mt-2">
                  Columns: <span className="font-mono">email, policy_number, full_name, phone</span>
                </p>
                <input ref={fileRef} type="file" accept=".csv,text/csv" hidden
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </div>
            </div>
          ) : (
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm text-emerald-400 font-medium">{validRows.length} ready to import</span>
                </div>
                {invalidRows.length > 0 && (
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <span className="text-sm text-red-400 font-medium">{invalidRows.length} with errors (will be skipped)</span>
                  </div>
                )}
                <span className="text-xs text-slate-500">{fileName}</span>
                <button onClick={() => { setRows(null); setFileName(""); }}
                  className="ml-auto text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2 transition-colors">
                  Change file
                </button>
              </div>

              <div className="rounded-xl border border-white/8 overflow-hidden">
                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-white/5 border-b border-white/8">
                        <th className="px-3 py-2 text-left text-slate-400 font-semibold w-6">#</th>
                        <th className="px-3 py-2 text-left text-slate-400 font-semibold">Email</th>
                        <th className="px-3 py-2 text-left text-slate-400 font-semibold">Policy No</th>
                        <th className="px-3 py-2 text-left text-slate-400 font-semibold">Name</th>
                        <th className="px-3 py-2 text-left text-slate-400 font-semibold">Phone</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {rows.map((row, i) => (
                        <tr key={i} title={row._valid ? undefined : row._error}
                          className={row._valid ? "hover:bg-white/3" : "bg-red-900/10"}>
                          <td className="px-3 py-2 text-slate-600">{i + 2}</td>
                          <td className="px-3 py-2 text-slate-300 font-mono max-w-[160px] truncate">{row.email || "—"}</td>
                          <td className="px-3 py-2 text-slate-300 font-mono">{row.policy_number || "—"}</td>
                          <td className="px-3 py-2 text-white max-w-[140px] truncate">{row.full_name || "—"}</td>
                          <td className="px-3 py-2 text-slate-400 font-mono">{row.phone || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {rows !== null && !result && (
          <div className="px-5 py-4 border-t border-white/10 flex items-center justify-between gap-3 shrink-0">
            <p className="text-xs text-slate-500">Members already on this HMO&apos;s roster are skipped automatically.</p>
            <button onClick={doImport} disabled={importing || validRows.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors shrink-0">
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {importing ? "Importing…" : `Import ${validRows.length} member${validRows.length !== 1 ? "s" : ""}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Create doctor modal ────────────────────────────────────────────────────────

function CreateDoctorModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/hmo/doctors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          full_name: fullName.trim(),
          specialty: specialty.trim() || undefined,
          phone: phone.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to create doctor."); return; }
      toast.success(data.existed ? "Doctor already exists — you can assign them now" : "Doctor created — they can sign in at /doc-login");
      onCreated();
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-white font-semibold flex items-center gap-2"><Stethoscope className="w-4 h-4 text-emerald-400" /> New Monitoring Doctor</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className={labelCls}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="doctor@example.com" className={inputCls} />
            <p className="text-[11px] text-slate-500 mt-1">The doctor signs in at /doc-login with a code sent to this email.</p>
          </div>
          <div>
            <label className={labelCls}>Full Name</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Ada Obi" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Specialty (optional)</label>
              <input value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Cardiologist" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Phone (optional)</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234…" className={inputCls} />
            </div>
          </div>
          {error && <p className="text-xs text-red-400 bg-red-900/20 border border-red-500/20 rounded-xl px-3 py-2">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold transition">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Create Doctor
          </button>
        </form>
      </div>
    </div>
  );
}

// ── HMO detail (roster + coverage) ─────────────────────────────────────────────

function HmoDetail({ hmo, onBack, onChanged }: { hmo: HmoRow; onBack: () => void; onChanged: () => void }) {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [coverageDoctors, setCoverageDoctors] = useState<string[]>([]);
  const [newCoverageEmail, setNewCoverageEmail] = useState("");
  const [assignRow, setAssignRow] = useState<string | null>(null); // member id with open assign input
  const [assignEmail, setAssignEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/hmo/${hmo.id}/members?page=${page}&search=${encodeURIComponent(search)}`
      );
      const data = await res.json();
      if (data.success) { setMembers(data.members); setTotal(data.total); }
    } catch { toast.error("Network error"); }
    finally { setLoading(false); }
  }, [hmo.id, page, search]);

  const fetchCoverage = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/hmo/doctors");
      const data = await res.json();
      if (data.success) {
        setCoverageDoctors(
          (data.doctors as MonitoringDoctor[])
            .filter((d) => d.hmos.some((h) => h.id === hmo.id))
            .map((d) => d.email)
        );
      }
    } catch { /* non-fatal */ }
  }, [hmo.id]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);
  useEffect(() => { fetchCoverage(); }, [fetchCoverage]);

  async function assign(body: { doctor_email: string; hmo_id?: string; member_id?: string }) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/hmo/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed to assign"); return false; }
      toast.success("Doctor assigned");
      onChanged();
      return true;
    } catch { toast.error("Network error"); return false; }
    finally { setBusy(false); }
  }

  async function unassign(body: { doctor_email: string; hmo_id?: string; member_id?: string }) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/hmo/assignments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed to remove"); return false; }
      toast.success("Assignment removed");
      onChanged();
      return true;
    } catch { toast.error("Network error"); return false; }
    finally { setBusy(false); }
  }

  const totalPages = Math.max(Math.ceil(total / 50), 1);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-400 hover:text-white transition">
          <ChevronLeft className="w-4 h-4" /> All HMOs
        </button>
        <h3 className="text-white font-semibold text-lg">{hmo.name}</h3>
        <span className="text-xs font-mono text-slate-500 bg-white/5 px-2 py-0.5 rounded-lg">{hmo.code}</span>
        <button onClick={() => setShowImport(true)}
          className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition">
          <Upload className="w-4 h-4" /> Upload Roster CSV
        </button>
      </div>

      {/* Coverage doctors */}
      <div className="bg-white/5 border border-white/8 rounded-2xl p-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
          <Stethoscope className="w-3.5 h-3.5" /> Doctors covering this entire roster
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {coverageDoctors.length === 0 && <span className="text-xs text-slate-500">None yet.</span>}
          {coverageDoctors.map((email) => (
            <span key={email} className="inline-flex items-center gap-1.5 bg-white/8 text-slate-200 text-xs px-2.5 py-1 rounded-full">
              {email}
              <button disabled={busy}
                onClick={async () => { if (await unassign({ doctor_email: email, hmo_id: hmo.id })) fetchCoverage(); }}
                className="text-slate-500 hover:text-red-400 transition">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <form
            className="flex items-center gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newCoverageEmail.trim()) return;
              if (await assign({ doctor_email: newCoverageEmail.trim(), hmo_id: hmo.id })) {
                setNewCoverageEmail("");
                fetchCoverage();
              }
            }}
          >
            <input type="email" value={newCoverageEmail} onChange={(e) => setNewCoverageEmail(e.target.value)}
              placeholder="doctor@example.com"
              className="px-3 py-1.5 rounded-lg border border-white/15 bg-white/8 text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 w-52" />
            <button type="submit" disabled={busy || !newCoverageEmail.trim()}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-50 text-white text-xs font-semibold transition">
              <Plus className="w-3 h-3" /> Assign
            </button>
          </form>
        </div>
      </div>

      {/* Members table */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search name, email or policy number…"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-white/15 bg-white/8 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
        </div>
        <button onClick={fetchMembers} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/8 transition">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
        <span className="text-xs text-slate-500 ml-auto">{total} member{total !== 1 ? "s" : ""}</span>
      </div>

      <div className="rounded-xl border border-white/8 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-white/5 border-b border-white/8">
                <th className="px-3 py-2.5 text-left text-slate-400 font-semibold">Member</th>
                <th className="px-3 py-2.5 text-left text-slate-400 font-semibold">Policy No</th>
                <th className="px-3 py-2.5 text-left text-slate-400 font-semibold">Phone</th>
                <th className="px-3 py-2.5 text-left text-slate-400 font-semibold">Assigned Doctors</th>
                <th className="px-3 py-2.5 text-left text-slate-400 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {members.length === 0 && !loading && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                  No members yet — upload a roster CSV to get started.
                </td></tr>
              )}
              {members.map((m) => (
                <tr key={m.id} className="hover:bg-white/3 transition-colors">
                  <td className="px-3 py-2.5">
                    <p className="text-white font-medium flex items-center gap-1.5">
                      {m.flagged && <Flag className="w-3 h-3 text-red-400" aria-label="Flagged by doctor" />}
                      {m.full_name}
                    </p>
                    <p className="text-slate-500 font-mono">{m.email}</p>
                  </td>
                  <td className="px-3 py-2.5 text-slate-300 font-mono">{m.policy_number}</td>
                  <td className="px-3 py-2.5 text-slate-400 font-mono">{m.phone || "—"}</td>
                  <td className="px-3 py-2.5">
                    {m.assigned_doctors.length === 0
                      ? <span className="text-slate-600">Roster doctors only</span>
                      : m.assigned_doctors.map((email) => (
                        <span key={email} className="inline-flex items-center gap-1 bg-white/8 text-slate-300 px-2 py-0.5 rounded-full mr-1 mb-0.5">
                          {email}
                          <button disabled={busy}
                            onClick={async () => { if (await unassign({ doctor_email: email, member_id: m.id })) fetchMembers(); }}
                            className="text-slate-500 hover:text-red-400 transition">
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      ))}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {assignRow === m.id ? (
                      <form className="flex items-center gap-1.5"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (!assignEmail.trim()) return;
                          if (await assign({ doctor_email: assignEmail.trim(), member_id: m.id })) {
                            setAssignRow(null); setAssignEmail("");
                            fetchMembers();
                          }
                        }}>
                        <input autoFocus type="email" value={assignEmail} onChange={(e) => setAssignEmail(e.target.value)}
                          placeholder="doctor@example.com"
                          className="px-2 py-1 rounded-lg border border-white/15 bg-white/8 text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 w-44" />
                        <button type="submit" disabled={busy} className="text-emerald-400 hover:text-emerald-300 font-semibold">Add</button>
                        <button type="button" onClick={() => { setAssignRow(null); setAssignEmail(""); }} className="text-slate-500 hover:text-slate-300">
                          <X className="w-3 h-3" />
                        </button>
                      </form>
                    ) : (
                      <button onClick={() => { setAssignRow(m.id); setAssignEmail(""); }}
                        className="text-emerald-400 hover:text-emerald-300 font-semibold transition">
                        + Assign doctor
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 rounded-lg bg-white/8 text-slate-300 text-xs disabled:opacity-40">Previous</button>
          <span className="text-xs text-slate-500">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded-lg bg-white/8 text-slate-300 text-xs disabled:opacity-40">Next</button>
        </div>
      )}

      {showImport && (
        <RosterImportModal hmo={hmo} onClose={() => setShowImport(false)}
          onImported={() => { fetchMembers(); onChanged(); }} />
      )}
    </div>
  );
}

// ── Main tab ───────────────────────────────────────────────────────────────────

export function AdminHmoTab() {
  const [hmos, setHmos] = useState<HmoRow[]>([]);
  const [doctors, setDoctors] = useState<MonitoringDoctor[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<HmoRow | null>(null);
  const [showCreateHmo, setShowCreateHmo] = useState(false);
  const [showCreateDoctor, setShowCreateDoctor] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [hmoRes, docRes] = await Promise.all([
        fetch("/api/admin/hmo"),
        fetch("/api/admin/hmo/doctors"),
      ]);
      const hmoData = await hmoRes.json();
      const docData = await docRes.json();
      if (hmoData.success) setHmos(hmoData.hmos);
      if (docData.success) setDoctors(docData.doctors);
    } catch { toast.error("Network error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (selected) {
    const current = hmos.find((h) => h.id === selected.id) ?? selected;
    return <HmoDetail hmo={current} onBack={() => setSelected(null)} onChanged={fetchAll} />;
  }

  return (
    <div className="space-y-6">
      {/* HMO list */}
      <div className="flex items-center gap-3">
        <h3 className="text-white font-semibold text-lg flex items-center gap-2">
          <Building2 className="w-5 h-5 text-emerald-400" /> HMO Partners
        </h3>
        {loading && <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setShowCreateDoctor(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-semibold transition">
            <Stethoscope className="w-4 h-4" /> New Doctor
          </button>
          <button onClick={() => setShowCreateHmo(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition">
            <Plus className="w-4 h-4" /> New HMO
          </button>
        </div>
      </div>

      {hmos.length === 0 && !loading ? (
        <div className="bg-white/5 border border-white/8 rounded-2xl p-10 text-center">
          <Building2 className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No HMO partners yet. Create one, then upload its member roster.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {hmos.map((h) => (
            <button key={h.id} onClick={() => setSelected(h)}
              className="text-left bg-white/5 hover:bg-white/8 border border-white/8 rounded-2xl p-4 transition group">
              <div className="flex items-center justify-between mb-2">
                <p className="text-white font-semibold group-hover:text-emerald-300 transition">{h.name}</p>
                <span className="text-[10px] font-mono text-slate-500 bg-white/5 px-2 py-0.5 rounded-lg">{h.code}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {h.member_count} members</span>
                <span className="flex items-center gap-1"><Stethoscope className="w-3.5 h-3.5" /> {h.doctor_count} doctors</span>
                {!h.active && <span className="text-red-400 font-medium ml-auto">Inactive</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Monitoring doctors */}
      <div>
        <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
          <Stethoscope className="w-4 h-4 text-emerald-400" /> Monitoring Doctors
        </h4>
        {doctors.length === 0 ? (
          <p className="text-sm text-slate-500">
            No doctors assigned yet. Create a doctor, then open an HMO to assign them to its roster (or to individual members).
          </p>
        ) : (
          <div className="rounded-xl border border-white/8 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/5 border-b border-white/8">
                    <th className="px-3 py-2.5 text-left text-slate-400 font-semibold">Doctor</th>
                    <th className="px-3 py-2.5 text-left text-slate-400 font-semibold">Covers HMOs</th>
                    <th className="px-3 py-2.5 text-left text-slate-400 font-semibold">Individual Patients</th>
                    <th className="px-3 py-2.5 text-left text-slate-400 font-semibold">Account</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {doctors.map((d) => (
                    <tr key={d.email} className="hover:bg-white/3 transition-colors">
                      <td className="px-3 py-2.5">
                        <p className="text-white font-medium">
                          {d.profile?.full_name
                            ? `${d.profile.prefix ? d.profile.prefix + " " : ""}${d.profile.full_name}`
                            : "—"}
                        </p>
                        <p className="text-slate-500 font-mono">{d.email}</p>
                      </td>
                      <td className="px-3 py-2.5 text-slate-300">
                        {d.hmos.length === 0 ? "—" : d.hmos.map((h) => h.name).join(", ")}
                      </td>
                      <td className="px-3 py-2.5 text-slate-300">
                        {d.patients.length === 0
                          ? "—"
                          : `${d.patients.length} patient${d.patients.length !== 1 ? "s" : ""}`}
                      </td>
                      <td className="px-3 py-2.5">
                        {d.profile?.claimed
                          ? <span className="text-emerald-400">Active</span>
                          : <span className="text-amber-400">Awaiting first login</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showCreateHmo && (
        <CreateHmoModal onClose={() => setShowCreateHmo(false)}
          onCreated={() => { setShowCreateHmo(false); fetchAll(); }} />
      )}
      {showCreateDoctor && (
        <CreateDoctorModal onClose={() => setShowCreateDoctor(false)}
          onCreated={() => { setShowCreateDoctor(false); fetchAll(); }} />
      )}
    </div>
  );
}
