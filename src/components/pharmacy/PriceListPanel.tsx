"use client";

/**
 * A pharmacy's price list: upload it, see what it does, then commit it.
 *
 * The concession is a trade discount **to Poveon**, not a discount the pharmacy
 * hands a member directly. The pharmacy agrees a price with us; we decide what
 * the member is charged out of it. Same arithmetic either way, but the wording
 * matters to a pharmacist reading the screen — they are quoting us, not running
 * a promotion.
 *
 * The upload is two steps on purpose. A price list is the pharmacy's own money,
 * and a spreadsheet is easy to get wrong in ways that are invisible until
 * someone is standing at the counter. So a file is parsed and priced first,
 * shown back with every row the parser could not use and the row number to fix,
 * and only written when they say go.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import {
  AlertTriangle, Check, Download, FileSpreadsheet, Loader2, Pencil,
  Search, Trash2, TrendingUp, Upload, X,
} from "lucide-react";
import { AdminOverlay } from "@/components/admin/AdminOverlay";

const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

type Med = {
  id: string;
  name: string;
  strength: string | null;
  form: string | null;
  pack: string | null;
  list_price: number;
  concession: number;
  margin_percent: number;
  in_stock: boolean;
  updated_at: string;
  member_pays: number;
  you_receive: number;
  member_saves: number;
  saving_percent: number;
  clamped: boolean;
};

type PreviewRow = {
  row: number;
  name: string;
  strength: string | null;
  list_price: number;
  concession: number;
  from_percent: boolean;
  member_pays: number;
  you_receive: number;
  member_saves: number;
  clamped: boolean;
  is_new: boolean;
};

type Preview = {
  seen: number;
  mapping: Record<string, string>;
  problems: { row: number; reason: string; value?: string }[];
  would_add: number;
  would_update: number;
  clamped: number;
  margin_percent: number;
  rows: PreviewRow[];
};

export function PriceListPanel() {
  const [meds, setMeds] = useState<Med[]>([]);
  const [margin, setMargin] = useState(5);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);
  const [editing, setEditing] = useState<Med | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/pharmacy/catalogue");
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) return;
      setMeds(d.medications ?? []);
      setMargin(d.margin_percent ?? 5);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function runPreview(f: File) {
    setBusy("preview");
    setPreview(null);
    try {
      const body = new FormData();
      body.append("file", f);
      const res = await fetch("/api/pharmacy/catalogue?preview=1", { method: "POST", body });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) {
        toast.error(d?.error ?? "We could not read that file.");
        setFile(null);
        return;
      }
      setPreview(d);
    } finally {
      setBusy(null);
    }
  }

  async function commit() {
    if (!file) return;
    setBusy("commit");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/pharmacy/catalogue", { method: "POST", body });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) {
        toast.error(d?.error ?? "Could not save that price list.");
        return;
      }
      toast.success(`${d.written} medication${d.written === 1 ? "" : "s"} saved`);
      setFile(null);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      void load();
    } finally {
      setBusy(null);
    }
  }

  const shown = query.trim()
    ? meds.filter((m) => `${m.name} ${m.strength ?? ""} ${m.form ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()))
    : meds;

  const clampedCount = meds.filter((m) => m.clamped).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <FileSpreadsheet className="h-5 w-5" /> Your price list
          </h2>
          <p className="mt-0.5 max-w-xl text-xs text-slate-500">
            Tell us your shop price for each medication and what you will take off for Poveon. You
            are always paid your price less that discount — we set what the member is charged out of
            it, and never charge them more than your shop price.
          </p>
        </div>
        <a
          href="/api/pharmacy/catalogue/template"
          download="poveon-price-list.xlsx"
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-800 transition hover:bg-emerald-100"
        >
          <Download className="h-4 w-4" /> Download template
        </a>
      </div>

      {/* ── Upload ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            if (f) void runPreview(f);
          }}
        />

        {!preview ? (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy === "preview"}
            className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 py-8 text-center transition hover:border-emerald-400 hover:bg-emerald-50/50 disabled:opacity-60"
          >
            {busy === "preview" ? (
              <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
            ) : (
              <Upload className="h-6 w-6 text-slate-500" />
            )}
            <span className="text-sm font-semibold text-slate-900">
              {busy === "preview" ? "Reading your file…" : "Upload your price list"}
            </span>
            <span className="text-xs text-slate-500">
              Excel or CSV. Any column names — we work out which is which.
            </span>
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold text-slate-900">
                {file?.name} · {preview.seen} row{preview.seen === 1 ? "" : "s"} read
              </p>
              <button
                onClick={() => { setPreview(null); setFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                className="text-xs font-semibold text-slate-500 hover:text-slate-900"
              >
                Choose a different file
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tally label="New" value={preview.would_add} tone="emerald" />
              <Tally label="Updated" value={preview.would_update} tone="sky" />
              <Tally label="Skipped" value={preview.problems.length} tone={preview.problems.length ? "amber" : "slate"} />
              <Tally label="No saving" value={preview.clamped} tone={preview.clamped ? "amber" : "slate"} />
            </div>

            {preview.clamped > 0 && (
              <Note tone="amber">
                {preview.clamped} medication{preview.clamped === 1 ? "" : "s"} would leave the member
                no saving, because the discount you gave Poveon is smaller than our{" "}
                {preview.margin_percent}% margin. We never charge a member more than your shop price,
                so on those rows we take less instead. A bigger discount to us is what creates the
                member&apos;s saving.
              </Note>
            )}

            {preview.problems.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="flex items-center gap-1.5 text-xs font-bold text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  These rows were skipped
                </p>
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                  {preview.problems.slice(0, 40).map((p, i) => (
                    <li key={i} className="text-[11px] text-amber-800">
                      {p.row > 0 && <span className="font-mono font-bold">Row {p.row}: </span>}
                      {p.reason}
                      {p.value ? ` — "${p.value}"` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {preview.rows.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-white/10">
                <div className="slim-scroll overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-[11px] text-slate-500">
                        <th className="px-3 py-2 font-semibold">Medication</th>
                        <th className="px-3 py-2 font-semibold">Your price</th>
                        <th className="px-3 py-2 font-semibold">Off for Poveon</th>
                        <th className="px-3 py-2 font-semibold">Member pays</th>
                        <th className="px-3 py-2 font-semibold">You receive</th>
                        <th className="px-3 py-2 font-semibold">They save</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {preview.rows.map((r) => (
                        <tr key={r.row}>
                          <td className="px-3 py-2" data-label="Medication">
                            <p className="font-semibold text-slate-900">
                              {r.name}{r.strength ? ` ${r.strength}` : ""}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              Row {r.row} · {r.is_new ? "new" : "updates an existing row"}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-600" data-label="Your price">{naira(r.list_price)}</td>
                          <td className="px-3 py-2 text-xs text-slate-600" data-label="Off for Poveon">
                            {naira(r.concession)}
                            {r.from_percent && <span className="ml-1 text-[10px] text-slate-500">(from %)</span>}
                          </td>
                          <td className="px-3 py-2 text-xs font-bold text-slate-900" data-label="Member pays">{naira(r.member_pays)}</td>
                          <td className="px-3 py-2 text-xs text-emerald-700" data-label="You receive">{naira(r.you_receive)}</td>
                          <td className="px-3 py-2 text-xs" data-label="They save">
                            <span className={r.clamped ? "text-amber-600" : "text-emerald-700"}>
                              {naira(r.member_saves)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.seen > preview.rows.length && (
                  <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
                    Showing the first {preview.rows.length}. All {preview.would_add + preview.would_update} will be saved.
                  </p>
                )}
              </div>
            )}

            <button
              onClick={commit}
              disabled={busy === "commit" || preview.would_add + preview.would_update === 0}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-slate-900 transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy === "commit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {busy === "commit"
                ? "Saving…"
                : `Save ${preview.would_add + preview.would_update} medication${preview.would_add + preview.would_update === 1 ? "" : "s"}`}
            </button>
          </div>
        )}
      </div>

      {/* ── The catalogue ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900">
          {meds.length} medication{meds.length === 1 ? "" : "s"} listed
        </h3>
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a medication"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {clampedCount > 0 && (
        <Note tone="amber">
          {clampedCount} medication{clampedCount === 1 ? " leaves" : "s leave"} members no saving —
          your discount to Poveon is smaller than our margin. Members still pay no more than your
          shop price, but there is nothing in it for them.
        </Note>
      )}

      {loading ? (
        <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      ) : shown.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white py-10 text-center text-sm text-slate-500">
          {meds.length === 0 ? "No price list yet. Upload one above." : `Nothing matches "${query}".`}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="slim-scroll overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] text-slate-500">
                  <th className="px-3 py-2.5 font-semibold">Medication</th>
                  <th className="px-3 py-2.5 font-semibold">Your price</th>
                  <th className="px-3 py-2.5 font-semibold">Off for Poveon</th>
                  <th className="px-3 py-2.5 font-semibold">Member pays</th>
                  <th className="px-3 py-2.5 font-semibold">You receive</th>
                  <th className="px-3 py-2.5 font-semibold">Stock</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.slice(0, 300).map((m) => (
                  <tr key={m.id} className={m.in_stock ? "" : "opacity-60"}>
                    <td className="px-3 py-3" data-label="Medication">
                      <p className="font-semibold text-slate-900">
                        {m.name}{m.strength ? ` ${m.strength}` : ""}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {[m.form, m.pack].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600" data-label="Your price">{naira(m.list_price)}</td>
                    <td className="px-3 py-3 text-xs text-slate-600" data-label="Off for Poveon">{naira(m.concession)}</td>
                    <td className="px-3 py-3 text-xs font-bold text-slate-900" data-label="Member pays">
                      {naira(m.member_pays)}
                      <span className={`ml-1.5 text-[10px] ${m.clamped ? "text-amber-600" : "text-emerald-600"}`}>
                        {m.clamped ? "no saving" : `−${m.saving_percent}%`}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-emerald-700" data-label="You receive">{naira(m.you_receive)}</td>
                    <td className="px-3 py-3 text-xs" data-label="Stock">
                      <span className={m.in_stock ? "text-slate-600" : "text-amber-600"}>
                        {m.in_stock ? "In stock" : "Out"}
                      </span>
                    </td>
                    <td className="px-3 py-3" data-label="" data-card-actions>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setEditing(m)}
                          title="Correct this row"
                          className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/10 hover:text-slate-900"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={async () => {
                            const res = await fetch(`/api/pharmacy/catalogue?id=${m.id}`, { method: "DELETE" });
                            if (res.ok) { toast.success("Removed"); void load(); }
                            else toast.error("Could not remove that");
                          }}
                          title="Remove from your list"
                          className="rounded-lg p-1.5 text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {shown.length > 300 && (
            <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
              Showing 300 of {shown.length}. Search to narrow it down.
            </p>
          )}
        </div>
      )}

      {editing && (
        <EditRow med={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />
      )}
    </div>
  );
}

function EditRow({ med, onClose, onSaved }: { med: Med; onClose: () => void; onSaved: () => void }) {
  const [price, setPrice] = useState(String(med.list_price));
  const [off, setOff] = useState(String(med.concession));
  const [inStock, setInStock] = useState(med.in_stock);
  const [saving, setSaving] = useState(false);

  // The same sum the server will do, so the numbers move as they type.
  const list = Number(price) || 0;
  const concession = Math.min(list, Number(off) || 0);
  const wanted = Math.round((list * med.margin_percent) / 100);
  const marginTaken = Math.min(wanted, concession);
  const receives = list - concession;
  const pays = receives + marginTaken;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/pharmacy/catalogue", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: med.id, list_price: list, concession, in_stock: inStock }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) { toast.error(d?.error ?? "Could not save that."); return; }
      toast.success("Updated");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminOverlay onClose={onClose}>
      <div className="flex max-h-modal w-full flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-white sm:max-w-md sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900">
              {med.name}{med.strength ? ` ${med.strength}` : ""}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">{[med.form, med.pack].filter(Boolean).join(" · ") || "—"}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          <Field label="Your shop price" value={price} onChange={setPrice} />
          <Field label="What you take off for Poveon" value={off} onChange={setOff} />

          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={inStock}
              onChange={(e) => setInStock(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 bg-white"
            />
            <span className="text-sm text-slate-600">In stock</span>
          </label>

          <div className="rounded-xl border border-slate-200 bg-white p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <TrendingUp className="h-3 w-3" /> What that means
            </p>
            <dl className="mt-2.5 space-y-1.5 text-xs">
              <Line label="Member pays" value={naira(pays)} strong />
              <Line label="You receive" value={naira(receives)} tone="emerald" />
              <Line label="Member saves" value={naira(list - pays)} tone={list - pays > 0 ? "emerald" : "amber"} />
              <Line label={`Poveon margin (${med.margin_percent}%)`} value={naira(marginTaken)} />
            </dl>
            {marginTaken < wanted && (
              <p className="mt-2.5 text-[11px] leading-relaxed text-amber-700">
                Your discount to Poveon is smaller than our {med.margin_percent}% margin, so we
                take less rather than charge a member more than your shop price. A bigger discount
                is what creates their saving.
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2 border-t border-slate-200 p-4">
          <button onClick={onClose} className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-semibold text-slate-600">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || list <= 0}
            className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </AdminOverlay>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
        <span className="text-sm text-slate-500">₦</span>
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
          className="w-full bg-transparent py-2.5 text-sm text-slate-900 outline-none"
        />
      </div>
    </label>
  );
}

function Line({ label, value, tone, strong }: { label: string; value: string; tone?: "emerald" | "amber"; strong?: boolean }) {
  const colour = tone === "emerald" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : "text-slate-700";
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`${strong ? "text-sm font-bold text-slate-900" : colour} tabular-nums`}>{value}</dd>
    </div>
  );
}

function Tally({ label, value, tone }: { label: string; value: number; tone: "emerald" | "sky" | "amber" | "slate" }) {
  const tones = {
    emerald: "text-emerald-700 border-emerald-200 bg-emerald-50",
    sky: "text-sky-700 border-sky-200 bg-sky-50",
    amber: "text-amber-700 border-amber-200 bg-amber-50",
    slate: "text-slate-700 border-slate-200 bg-slate-50",
  }[tone];
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${tones}`}>
      <p className="text-lg font-black tabular-nums">{value}</p>
      <p className="text-[11px] font-semibold opacity-80">{label}</p>
    </div>
  );
}

function Note({ tone, children }: { tone: "amber"; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] leading-relaxed text-amber-800 ${tone}`}>
      {children}
    </div>
  );
}
