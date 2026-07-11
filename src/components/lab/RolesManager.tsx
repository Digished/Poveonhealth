"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Plus, Trash2, Shield } from "lucide-react";
import toast from "react-hot-toast";

const PERMISSION_LABELS: Record<string, string> = {
  can_view_requests: "View requests, workstation & queue",
  can_mark_seen: "Onboarding & queue actions (arrive, register, pay, attend)",
  can_mark_done: "Mark done / enter results",
  can_send_results: "Send results",
  can_manage_team: "Add & remove team members",
  can_manage_api_keys: "Manage API keys",
  can_view_referrals: "View referrals",
  can_view_clients: "View clients & customers (incl. spreadsheet export)",
  can_view_analytics: "View analytics & TAT",
  can_view_activity: "View activity log",
  can_view_feedback: "View feedback (incl. QR reviews)",
  can_view_wallet: "View revenue, wallet & price list",
  can_view_marketers: "View & manage marketers",
  can_manage_roles: "Manage roles & team",
  can_manage_professionals: "Manage referral doctors & partners",
  can_manage_templates: "Manage test templates & SOPs",
};

interface Role {
  id: string;
  name: string;
  _count?: { members: number };
  [key: string]: unknown;
}

export function RolesManager() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [keys, setKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/lab/roles", { cache: "no-store" });
      const data = await res.json();
      setRoles(data.roles ?? []);
      setKeys(data.permission_keys ?? []);
    } catch {
      toast.error("Failed to load roles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function startCreate() {
    setEditing(null);
    setCreating(true);
    setName("");
    setPerms(Object.fromEntries(keys.map((k) => [k, k === "can_view_requests"])));
  }

  function startEdit(role: Role) {
    setCreating(false);
    setEditing(role);
    setName(role.name);
    setPerms(Object.fromEntries(keys.map((k) => [k, Boolean(role[k])])));
  }

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = { name: name.trim(), ...perms };
      const res = editing
        ? await fetch(`/api/lab/roles/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/lab/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(editing ? "Role updated" : "Role created");
      setEditing(null); setCreating(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function remove(role: Role) {
    if (!confirm(`Delete role "${role.name}"?`)) return;
    try {
      const res = await fetch(`/api/lab/roles/${role.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Role deleted");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  const editorOpen = creating || editing;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold text-white"><Shield className="h-4 w-4 text-medical-300" /> Roles & permissions</p>
        {!editorOpen && <button onClick={startCreate} className="inline-flex items-center gap-1.5 rounded-lg bg-medical-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-medical-700"><Plus className="h-3.5 w-3.5" /> New role</button>}
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-medical-400" /></div>
      ) : editorOpen ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Role name (e.g. Front desk)"
            className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-medical-400 focus:outline-none"
          />
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {keys.map((k) => (
              <label key={k} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-300 hover:bg-white/5">
                <input type="checkbox" checked={!!perms[k]} onChange={(e) => setPerms({ ...perms, [k]: e.target.checked })} className="h-4 w-4 rounded border-white/20 bg-transparent text-medical-600" />
                {PERMISSION_LABELS[k] ?? k}
              </label>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={() => { setCreating(false); setEditing(null); }} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5">Cancel</button>
            <button onClick={save} disabled={!name.trim() || saving} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-medical-600 py-2 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} {editing ? "Update role" : "Create role"}
            </button>
          </div>
        </div>
      ) : roles.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-white/5 py-8 text-center text-sm text-slate-400">No roles yet. Create one to control what team members can access.</p>
      ) : (
        <div className="space-y-2">
          {roles.map((role) => {
            const granted = keys.filter((k) => role[k]).length;
            return (
              <div key={role.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-white">{role.name}</p>
                  <p className="text-xs text-slate-400">{granted} permission{granted === 1 ? "" : "s"} · {role._count?.members ?? 0} member{(role._count?.members ?? 0) === 1 ? "" : "s"}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => startEdit(role)} className="rounded-lg px-2 py-1 text-xs font-medium text-medical-300 hover:bg-white/5">Edit</button>
                  <button onClick={() => remove(role)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
