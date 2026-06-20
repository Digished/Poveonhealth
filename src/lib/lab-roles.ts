import { prisma } from "@/lib/prisma";

/** The full set of toggleable LabRole permission flags (shared by role routes). */
export const ROLE_PERMISSION_KEYS = [
  "can_view_requests",
  "can_mark_seen",
  "can_mark_done",
  "can_send_results",
  "can_manage_team",
  "can_manage_api_keys",
  "can_view_referrals",
  "can_view_clients",
  "can_view_analytics",
  "can_view_activity",
  "can_view_feedback",
  "can_view_wallet",
  "can_view_marketers",
  "can_manage_roles",
  "can_manage_professionals",
  "can_manage_templates",
] as const;

export type PermissionKey = (typeof ROLE_PERMISSION_KEYS)[number];
export type PermissionMap = Record<PermissionKey, boolean>;

/** Build a full permission map: everything false except the granted keys. */
function grant(...keys: PermissionKey[]): PermissionMap {
  const map = Object.fromEntries(ROLE_PERMISSION_KEYS.map((k) => [k, false])) as PermissionMap;
  for (const k of keys) map[k] = true;
  return map;
}

export interface PresetRole {
  name: string;
  description: string;
  permissions: PermissionMap;
  /** Dashboard tab a member with this role lands on when no ?tab= is present. */
  default_tab: string;
  /** Optional department this role is scoped to. */
  department?: string;
}

/**
 * Seeded role presets giving each lab sensible, separated dashboards per staff
 * type. Auto-created for every lab (existing via migration, new via create-lab)
 * and freely editable/deletable by the lab admin afterwards.
 */
export const PRESET_ROLES: PresetRole[] = [
  {
    name: "Lab Admin",
    description: "Full access to everything, including roles, team and API keys.",
    permissions: grant(...ROLE_PERMISSION_KEYS),
    default_tab: "workspace",
  },
  {
    name: "Lab Manager",
    description: "Broad operational and financial access; cannot manage roles, team or API keys.",
    permissions: grant(
      "can_view_requests", "can_mark_seen", "can_mark_done", "can_send_results",
      "can_view_referrals", "can_view_clients", "can_view_analytics", "can_view_activity",
      "can_view_feedback", "can_view_wallet", "can_view_marketers",
      "can_manage_professionals", "can_manage_templates",
    ),
    default_tab: "workspace",
  },
  {
    name: "Front Desk",
    description: "Onboard clients (QR + walk-in), check patients in, view clients.",
    permissions: grant("can_view_requests", "can_mark_seen", "can_view_clients"),
    default_tab: "workspace",
  },
  {
    name: "Sample Collector",
    description: "Move samples through the journey; check patients in.",
    permissions: grant("can_view_requests", "can_mark_seen"),
    default_tab: "workspace",
  },
  {
    name: "Lab Scientist",
    description: "Verify and report results; manage result templates.",
    permissions: grant("can_view_requests", "can_mark_seen", "can_mark_done", "can_send_results", "can_manage_templates"),
    default_tab: "workspace",
  },
  {
    name: "Sonographer",
    description: "Run the Sonography (ultrasound) department: perform scans, verify & send reports.",
    permissions: grant("can_view_requests", "can_mark_seen", "can_mark_done", "can_send_results", "can_manage_templates"),
    default_tab: "workspace",
    department: "Sonography",
  },
  {
    name: "Radiographer",
    description: "Run the Radiology (X-ray/CT/MRI) department: perform imaging, verify & send reports.",
    permissions: grant("can_view_requests", "can_mark_seen", "can_mark_done", "can_send_results", "can_manage_templates"),
    default_tab: "workspace",
    department: "Radiology",
  },
  {
    name: "Accountant",
    description: "Revenue, commissions, price list and analytics — no clinical actions.",
    permissions: grant("can_view_wallet", "can_manage_professionals", "can_view_analytics"),
    default_tab: "poveon",
  },
];

/** Map a role name to its preset default landing tab (used when no ?tab= is set). */
export function defaultTabForRole(roleName: string | null | undefined): string | null {
  if (!roleName) return null;
  return PRESET_ROLES.find((r) => r.name === roleName)?.default_tab ?? null;
}

/**
 * Create the preset roles for a lab. Idempotent — relies on the
 * unique([lab_id, name]) constraint via createMany skipDuplicates.
 */
export async function seedPresetRoles(labId: string): Promise<void> {
  await prisma.labRole.createMany({
    data: PRESET_ROLES.map((r) => ({ lab_id: labId, name: r.name, ...r.permissions, department: r.department ?? null })),
    skipDuplicates: true,
  });
}
