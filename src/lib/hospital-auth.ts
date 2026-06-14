import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export type AuthedHospital = {
  id: string;
  name: string;
  email: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  phone: string | null;
  specialties: string[];
  pin_hash: string | null;
  is_active: boolean;
};

/**
 * Validates the hospital_token session cookie and returns the hospital,
 * or null if not authenticated / session expired / hospital deactivated.
 */
export async function getHospitalFromRequest(req: NextRequest): Promise<AuthedHospital | null> {
  const token = req.cookies.get("hospital_token")?.value;
  if (!token) return null;

  const session = await prisma.hospitalSession.findUnique({ where: { id: token } });
  if (!session || session.expires_at < new Date()) return null;

  const hospital = await prisma.hospital.findUnique({ where: { id: session.hospital_id } });
  if (!hospital || !hospital.is_active) return null;

  return {
    id: hospital.id,
    name: hospital.name,
    email: hospital.email,
    city: hospital.city,
    state: hospital.state,
    address: hospital.address,
    phone: hospital.phone,
    specialties: Array.isArray(hospital.specialties) ? (hospital.specialties as string[]) : [],
    pin_hash: hospital.pin_hash,
    is_active: hospital.is_active,
  };
}
