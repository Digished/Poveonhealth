"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, X, Check, RefreshCw, Users, Shield, Megaphone, ChevronDown, Activity as ActivityIcon, PenLine } from "lucide-react";
import toast from "react-hot-toast";
import dynamic from "next/dynamic";

const RolesManager = dynamic(() => import("@/components/lab/RolesManager").then((m) => ({ default: m.RolesManager })), { ssr: false });

interface Member {
  id: string;
  email: string;
  name?: string | null;
  signature_url?: string | null;
  role: { id?: string; name: string };
  last_sign_in_at: string | null;
}

interface Role { id: string; name: string }

interface ActorStat {
  actor_email: string;
  actions_7d: number;
  actions_30d: number;
  last_active: string | null;
  recent: { action: string; detail: string | null; created_at: string }[];
}

interface Marketer {
  id: string;
  marketer_id: string;
  marketer: { name: string; email: string };
  doctors_count: number;
}

type TeamTab = "staff" | "marketers" | "roles";

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return mins < 1 ? "just now" : `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * Team — staff members, marketers (a type of team member) and roles &
 * permissions, all in one nav tab (Lite + LIMS). Staff rows include activity
 * counts from the audit log so the lab can gauge each member's efficiency.
 */
export function TeamView({
  labId,
  isOwner,
  canManageRoles,
  canViewMarketers,
}: {
  labId: string;
  isOwner: boolean;
  canManageRoles: boolean;
  canViewMarketers: boolean;
}) {
  const [tab, setTab] = useState<TeamTab>("staff");
  const canManage = isOwner || canManageRoles;

  // ── Staff ────────────────────────────────────────────────────────────────
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRoleId, setNewRoleId] = useState("");
  const [adding, setAdding] = useState(false);
  const [uploadingSig, setUploadingSig] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [stats, setStats] = useState<Map<string, ActorStat>>(new Map());
  const [expandedMember, setExpandedMember] = useState<string | null>(null);

  const loadStaff = useCallback(async () => {
    setLoading(true);
    try {
      const [teamRes, rolesRes, statsRes] = await Promise.all([
        fetch("/api/lab/team", { cache: "no-store" }),
        fetch("/api/lab/roles", { cache: "no-store" }),
        fetch("/api/lab/team/activity", { cache: "no-store" }),
      ]);
      const team = await teamRes.json().catch(() => null);
      if (team?.success) setMembers(team.members ?? []);
      const rolesData = await rolesRes.json().catch(() => null);
      if (rolesData?.roles) setRoles(rolesData.roles.map((r: { id: string; name: string }) => ({ id: r.id, name: r.name })));
      const statsData = await statsRes.json().catch(() => null);
      if (statsData?.success) {
        setStats(new Map((statsData.stats as ActorStat[]).map((s) => [s.actor_email.toLowerCase(), s])));
      }
    } catch {
      toast.error("Failed to load the team");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  async function uploadSignature(memberId: string, file: File) {
    setUploadingSig(memberId);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/lab/team/${memberId}/signature`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, signature_url: data.signature_url } : m)));
      toast.success("Signature uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingSig(null);
    }
  }

  async function addMember() {
    const email = newEmail.trim();
    if (!email || !newRoleId) { toast.error("Enter an email and pick a role"); return; }
    setAdding(true);
    try {
      const res = await fetch("/api/lab/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name: newName.trim() || undefined, role_id: newRoleId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to add member");
      setMembers((prev) => [...prev, { id: data.member.id, email: data.member.email, name: data.member.name ?? null, signature_url: null, role: { id: data.member.role.id, name: data.member.role.name }, last_sign_in_at: null }]);
      setNewEmail("");
      setNewName("");
      setNewRoleId("");
      toast.success(`${email} added — login details emailed`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add member");
    } finally {
      setAdding(false);
    }
  }

  async function assignRole(memberId: string, roleId: string) {
    try {
      const res = await fetch(`/api/lab/team/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role_id: roleId }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role: { id: roleId, name: roles.find((r) => r.id === roleId)?.name ?? m.role.name } } : m)));
      toast.success("Role updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update role");
    }
  }

  async function removeMember(memberId: string, email: string) {
    if (!window.confirm(`Remove ${email}? Their login will be deleted and they'll lose access immediately.`)) return;
    setRemovingId(memberId);
    try {
      const res = await fetch(`/api/lab/team/${memberId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) throw new Error(data.error || "Failed to remove member");
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      toast.success("Member removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove member");
    } finally {
      setRemovingId(null);
    }
  }

  // ── Marketers (a type of team member) ────────────────────────────────────
  const [marketers, setMarketers] = useState<Marketer[]>([]);
  const [marketersLoading, setMarketersLoading] = useState(false);
  const [newMarketerEmail, setNewMarketerEmail] = useState("");
  const [newMarketerName, setNewMarketerName] = useState("");
  const [addingMarketer, setAddingMarketer] = useState(false);
  const [expandedMarketer, setExpandedMarketer] = useState<string | null>(null);
  const [marketerDoctors, setMarketerDoctors] = useState<Record<string, { email: string; name: string; request_count: number }[]>>({});

  const loadMarketers = useCallback(async () => {
    setMarketersLoading(true);
    try {
      const res = await fetch(`/api/lab/${labId}/marketers`, { cache: "no-store" });
      const data = await res.json();
      if (data.success) setMarketers(data.marketers ?? []);
    } catch { /* non-fatal */ } finally {
      setMarketersLoading(false);
    }
  }, [labId]);

  useEffect(() => { if (tab === "marketers" && canViewMarketers) loadMarketers(); }, [tab, canViewMarketers, loadMarketers]);

  async function addMarketer() {
    if (!newMarketerEmail.trim()) { toast.error("Email is required"); return; }
    setAddingMarketer(true);
    try {
      const res = await fetch(`/api/lab/${labId}/marketers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newMarketerEmail.trim(), name: newMarketerName.trim() || undefined }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to add marketer");
      toast.success(`Marketer ${data.marketer_email} added`);
      setNewMarketerEmail("");
      setNewMarketerName("");
      await loadMarketers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add marketer");
    } finally {
      setAddingMarketer(false);
    }
  }

  async function removeMarketer(marketerId: string, name: string) {
    if (!window.confirm(`Remove marketer ${name}? Their doctor assignments stay intact.`)) return;
    try {
      const res = await fetch(`/api/lab/${labId}/marketers/${marketerId}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to remove");
      toast.success("Marketer removed");
      await loadMarketers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    }
  }

  async function loadMarketerDoctors(marketerId: string) {
    try {
      const res = await fetch(`/api/lab/${labId}/marketers/${marketerId}`, { cache: "no-store" });
      const data = await res.json();
      if (data.success) setMarketerDoctors((prev) => ({ ...prev, [marketerId]: data.doctors ?? [] }));
    } catch { /* ignore */ }
  }

  const TABS: { key: TeamTab; label: string; icon: React.ReactNode; show: boolean }[] = [
    { key: "staff", label: "Staff", icon: <Users className="h-3.5 w-3.5" />, show: true },
    { key: "marketers", label: "Marketers", icon: <Megaphone className="h-3.5 w-3.5" />, show: canViewMarketers },
    { key: "roles", label: "Roles & permissions", icon: <Shield className="h-3.5 w-3.5" />, show: canManage },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Team</h2>
        <p className="mt-1 text-sm text-slate-400">Staff, marketers and their roles — with each member&apos;s recent activity so you can see who&apos;s doing what.</p>
      </div>

      <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-white/5 p-1">
        {TABS.filter((t) => t.show).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex shrink-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-2 text-xs font-semibold transition ${tab === t.key ? "bg-medical-600 text-white shadow-sm" : "text-slate-400 hover:text-white"}`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Staff ── */}
      {tab === "staff" && (
        <div className="space-y-4">
          {canManage && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="mb-2 text-xs font-medium text-slate-300">Add a team member</p>
              {roles.length === 0 && !loading ? (
                <p className="text-xs text-slate-500">Create a role in &ldquo;Roles &amp; permissions&rdquo; first, then add members to it.</p>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Full name (e.g. Dr. Ada Obi)"
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-medical-400"
                  />
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="member@email.com"
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-medical-400"
                  />
                  <select
                    value={newRoleId}
                    onChange={(e) => setNewRoleId(e.target.value)}
                    className="cursor-pointer rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm text-slate-200 outline-none sm:max-w-[10rem]"
                  >
                    <option value="" className="bg-slate-800">Role…</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id} className="bg-slate-800">{r.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={addMember}
                    disabled={adding || !newEmail.trim() || !newRoleId}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-medical-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50"
                  >
                    {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
                  </button>
                </div>
              )}
              <p className="mt-2 text-[11px] text-slate-500">They&apos;ll get an email with a temporary password to sign in at the lab login.</p>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-medical-400" /></div>
          ) : members.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 py-14 text-center">
              <Users className="mx-auto mb-3 h-8 w-8 text-slate-500" />
              <p className="text-sm font-medium text-slate-300">No team members yet</p>
              <p className="mt-1 text-xs text-slate-500">Add your first member above — they&apos;ll appear here with their activity.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {members.map((m) => {
                const stat = stats.get((m.email ?? "").toLowerCase());
                const open = expandedMember === m.id;
                return (
                  <div key={m.id} className="rounded-2xl border border-white/10 bg-white/5">
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{m.name || m.email || "—"}</p>
                        {m.name && <p className="truncate text-[11px] text-slate-400">{m.email}</p>}
                        <p className="mt-0.5 text-xs text-slate-500">
                          {stat?.last_active
                            ? <>Active {timeAgo(stat.last_active)}</>
                            : m.last_sign_in_at
                            ? <>Last login {new Date(m.last_sign_in_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</>
                            : "Never logged in"}
                          {stat && <> · <span className="text-medical-300">{stat.actions_7d} action{stat.actions_7d !== 1 ? "s" : ""} / 7d</span> · {stat.actions_30d} / 30d</>}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {canManage && (
                          <label className={`inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1.5 text-xs ${m.signature_url ? "border-emerald-500/30 text-emerald-300" : "border-white/10 text-slate-300 hover:bg-white/5"}`} title={m.signature_url ? "Signature uploaded — click to replace" : "Upload signature image"}>
                            {uploadingSig === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PenLine className="h-3.5 w-3.5" />}
                            {m.signature_url ? "Signature ✓" : "Signature"}
                            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadSignature(m.id, f); }} />
                          </label>
                        )}
                        {canManage && roles.length > 0 ? (
                          <select
                            value={m.role.id ?? ""}
                            onChange={(e) => assignRole(m.id, e.target.value)}
                            className="cursor-pointer rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-slate-200 outline-none max-w-[8.5rem]"
                          >
                            {!m.role.id && <option value="" className="bg-slate-800">{m.role.name}</option>}
                            {roles.map((r) => (
                              <option key={r.id} value={r.id} className="bg-slate-800">{r.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-slate-400">{m.role.name}</span>
                        )}
                        {stat && stat.recent.length > 0 && (
                          <button
                            onClick={() => setExpandedMember(open ? null : m.id)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
                            title="Recent activity"
                          >
                            <ActivityIcon className="h-4 w-4" />
                          </button>
                        )}
                        {canManage && (
                          <button
                            onClick={() => removeMember(m.id, m.email)}
                            disabled={removingId === m.id}
                            title="Remove member"
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-50"
                          >
                            {removingId === m.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                          </button>
                        )}
                      </div>
                    </div>
                    {open && stat && (
                      <div className="space-y-1.5 border-t border-white/5 bg-slate-950/30 px-4 py-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Recent activity</p>
                        {stat.recent.map((a, i) => (
                          <p key={i} className="text-xs text-slate-400">
                            <span className="text-slate-300">{a.action.replace(/_/g, " ")}</span>
                            {a.detail ? ` — ${a.detail}` : ""}
                            <span className="text-slate-600"> · {timeAgo(a.created_at)}</span>
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Marketers ── */}
      {tab === "marketers" && canViewMarketers && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="mb-2 text-xs font-medium text-slate-300">Add a marketer</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="email"
                value={newMarketerEmail}
                onChange={(e) => setNewMarketerEmail(e.target.value)}
                placeholder="marketer@email.com"
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-medical-400"
              />
              <input
                type="text"
                value={newMarketerName}
                onChange={(e) => setNewMarketerName(e.target.value)}
                placeholder="Name (optional)"
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-medical-400"
              />
              <button
                onClick={addMarketer}
                disabled={addingMarketer || !newMarketerEmail.trim()}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {addingMarketer ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
              </button>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">Marketers recruit and manage referring doctors for your lab. Their performance shows in Analytics.</p>
          </div>

          {marketersLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-medical-400" /></div>
          ) : marketers.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 py-14 text-center">
              <Megaphone className="mx-auto mb-3 h-8 w-8 text-slate-500" />
              <p className="text-sm font-medium text-slate-300">No marketers yet</p>
              <p className="mt-1 text-xs text-slate-500">Add one above to start growing your referral network.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {marketers.map((mk) => {
                const open = expandedMarketer === mk.marketer_id;
                return (
                  <div key={mk.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                    <button
                      onClick={() => {
                        if (open) setExpandedMarketer(null);
                        else {
                          setExpandedMarketer(mk.marketer_id);
                          if (!marketerDoctors[mk.marketer_id]) loadMarketerDoctors(mk.marketer_id);
                        }
                      }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/8"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{mk.marketer.name}</p>
                        <p className="truncate text-xs text-slate-400">{mk.marketer.email}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs font-semibold text-emerald-400">{mk.doctors_count} doctor{mk.doctors_count !== 1 ? "s" : ""}</p>
                        <ChevronDown className={`ml-auto mt-1 h-4 w-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
                      </div>
                    </button>
                    {open && (
                      <div className="space-y-2 border-t border-white/8 bg-slate-950/30 px-4 py-3">
                        {(marketerDoctors[mk.marketer_id] ?? []).length === 0 ? (
                          <p className="text-xs text-slate-500">No doctors added yet</p>
                        ) : (
                          (marketerDoctors[mk.marketer_id] ?? []).map((doc) => (
                            <div key={doc.email} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-medium text-white">{doc.name}</p>
                                <p className="truncate text-xs text-slate-400">{doc.email}</p>
                              </div>
                              <span className="ml-2 shrink-0 text-xs text-slate-400">{doc.request_count} requests</span>
                            </div>
                          ))
                        )}
                        <button
                          onClick={() => removeMarketer(mk.marketer_id, mk.marketer.name)}
                          className="mt-1 w-full rounded-lg border border-rose-500/20 px-3 py-1.5 text-xs text-rose-400 hover:border-rose-500/40 hover:text-rose-300"
                        >
                          Remove marketer
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Roles & permissions ── */}
      {tab === "roles" && canManage && (
        <RolesManager />
      )}
    </div>
  );
}
