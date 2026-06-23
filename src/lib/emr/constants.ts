// Shared constants for the Hospital EMR — departments, roles, and the mapping
// between a staff role and the department workspace they land in.

export const DEPARTMENT_KEYS = [
  "onboarding",
  "vitals",
  "consultation",
  "pharmacy",
  "laboratory",
  "ward",
] as const;

export type DepartmentKey = (typeof DEPARTMENT_KEYS)[number];

export const DEFAULT_DEPARTMENTS: { key: DepartmentKey; name: string; sort_order: number }[] = [
  { key: "onboarding", name: "Onboarding", sort_order: 0 },
  { key: "vitals", name: "Vitals", sort_order: 1 },
  { key: "consultation", name: "Consultation", sort_order: 2 },
  { key: "pharmacy", name: "Pharmacy", sort_order: 3 },
  { key: "laboratory", name: "Laboratory", sort_order: 4 },
  { key: "ward", name: "Ward", sort_order: 5 },
];

export const STAFF_ROLES = [
  "super_admin",
  "doctor",
  "nurse",
  "pharmacist",
  "lab_tech",
  "ward_nurse",
  "onboarding_clerk",
  "records",
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export const ROLE_LABELS: Record<StaffRole, string> = {
  super_admin: "Super Admin",
  doctor: "Doctor",
  nurse: "Nurse",
  pharmacist: "Pharmacist",
  lab_tech: "Lab Scientist",
  ward_nurse: "Ward Nurse",
  onboarding_clerk: "Onboarding Clerk",
  records: "Records Officer",
};

// Which department workspace each role lands in by default.
export const ROLE_HOME: Record<StaffRole, DepartmentKey | "all"> = {
  super_admin: "all",
  doctor: "consultation",
  nurse: "vitals",
  pharmacist: "pharmacy",
  lab_tech: "laboratory",
  ward_nurse: "ward",
  onboarding_clerk: "onboarding",
  records: "all",
};

// Roles allowed to act in a given department workspace.
export const DEPARTMENT_ROLES: Record<DepartmentKey, StaffRole[]> = {
  onboarding: ["onboarding_clerk", "nurse", "records", "super_admin"],
  vitals: ["nurse", "ward_nurse", "super_admin"],
  consultation: ["doctor", "super_admin"],
  pharmacy: ["pharmacist", "super_admin"],
  laboratory: ["lab_tech", "super_admin"],
  ward: ["ward_nurse", "nurse", "doctor", "super_admin"],
};

export function canAccessDepartment(role: string, dept: DepartmentKey): boolean {
  return (DEPARTMENT_ROLES[dept] ?? []).includes(role as StaffRole);
}

// Encounter status → the department that should action it next.
export const STATUS_DEPARTMENT: Record<string, DepartmentKey | null> = {
  waiting_vitals: "vitals",
  waiting_consult: "consultation",
  in_consult: "consultation",
  pharmacy: "pharmacy",
  lab: "laboratory",
  ward: "ward",
  closed: null,
};

export const ROLE_OPTIONS = STAFF_ROLES.filter((r) => r !== "super_admin").map((value) => ({
  value,
  label: ROLE_LABELS[value],
}));
