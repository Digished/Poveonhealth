import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import type { StaffRole } from "@/lib/emr/constants";

export type AuthedStaff = {
  id: string;
  hospital_id: string;
  full_name: string;
  role: StaffRole;
  email: string | null;
  phone: string | null;
  department_key: string | null;
};

export const STAFF_SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function hashPin(pin: string): string {
  return createHash("sha256").update(String(pin).trim()).digest("hex");
}

/**
 * Validates the emr_token staff session cookie and returns the staff member,
 * or null if not authenticated / session expired / staff deactivated.
 */
export async function getStaffFromRequest(req: NextRequest): Promise<AuthedStaff | null> {
  const token = req.cookies.get("emr_token")?.value;
  if (!token) return null;

  const session = await prisma.hospitalStaffSession.findUnique({ where: { id: token } });
  if (!session || session.expires_at < new Date()) return null;

  const staff = await prisma.hospitalStaff.findUnique({ where: { id: session.staff_id } });
  if (!staff || !staff.is_active) return null;

  return {
    id: staff.id,
    hospital_id: staff.hospital_id,
    full_name: staff.full_name,
    role: staff.role as StaffRole,
    email: staff.email,
    phone: staff.phone,
    department_key: staff.department_key,
  };
}

/** True if the staff member holds one of the allowed roles (super_admin always passes). */
export function hasRole(staff: AuthedStaff, allowed: StaffRole[]): boolean {
  return staff.role === "super_admin" || allowed.includes(staff.role);
}
