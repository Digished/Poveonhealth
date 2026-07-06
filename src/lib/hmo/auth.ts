import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type { HmoMember, HmoPatientSession, Hmo } from "@prisma/client";

export const HMO_COOKIE = "hmo_token";
export const HMO_SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type AuthedHmoMember = {
  member: HmoMember & { hmo: Hmo };
  session: HmoPatientSession;
};

/**
 * Resolves the logged-in HMO member from the hmo_token cookie.
 * Returns null when there is no valid, unexpired session or the
 * member has been deactivated (e.g. removed from the roster).
 */
export async function getHmoMemberFromRequest(
  req: NextRequest
): Promise<AuthedHmoMember | null> {
  const token = req.cookies.get(HMO_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.hmoPatientSession.findUnique({
    where: { id: token },
    include: { member: { include: { hmo: true } } },
  });
  if (!session || session.expires_at < new Date()) return null;

  const { member, ...bare } = session;
  if (!member.active || !member.hmo.active) return null;

  return { member, session: bare as HmoPatientSession };
}

/**
 * Resolves the logged-in doctor (doc_token cookie → DoctorSession),
 * used by the monitoring API routes.
 */
export async function getDoctorFromRequest(
  req: NextRequest
): Promise<{ doctor_email: string } | null> {
  const token = req.cookies.get("doc_token")?.value;
  if (!token) return null;

  const session = await prisma.doctorSession.findUnique({ where: { id: token } });
  if (!session || session.expires_at < new Date()) return null;

  return { doctor_email: session.doctor_email };
}

/**
 * Member IDs the doctor is allowed to monitor: everyone in HMOs they
 * cover plus individually assigned members.
 */
export async function getDoctorMemberScope(doctorEmail: string): Promise<{
  hmoIds: string[];
  directMemberIds: string[];
}> {
  const [coverages, directs] = await Promise.all([
    prisma.hmoDoctorCoverage.findMany({
      where: { doctor_email: doctorEmail },
      select: { hmo_id: true },
    }),
    prisma.hmoDoctorPatient.findMany({
      where: { doctor_email: doctorEmail },
      select: { member_id: true },
    }),
  ]);
  return {
    hmoIds: coverages.map((c) => c.hmo_id),
    directMemberIds: directs.map((d) => d.member_id),
  };
}

/** Whether the doctor may view/act on this member. */
export async function doctorCoversMember(
  doctorEmail: string,
  member: { id: string; hmo_id: string }
): Promise<boolean> {
  const { hmoIds, directMemberIds } = await getDoctorMemberScope(doctorEmail);
  return hmoIds.includes(member.hmo_id) || directMemberIds.includes(member.id);
}
