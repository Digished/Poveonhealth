import { prisma } from "@/lib/prisma";
import type { HmoMember, PatientProfile } from "@prisma/client";

/**
 * Consolidates an HMO roster entry with the platform-wide patient account
 * (PatientProfile, keyed by verified email) so one person keeps a single
 * identity — and a single PIN — across the patient portal and HMO portal.
 *
 * - Fills gaps in the member record (phone, date_of_birth, sex) from the
 *   patient's own verified profile.
 * - Fills gaps in the profile (name, phone, dob, sex) from the roster entry.
 * - When `createProfile` is true (the member has just proven control of the
 *   email via OTP), a profile is created if none exists yet, so the account
 *   is recognised everywhere and a shared PIN can be attached to it.
 */
export async function consolidateMemberAccount(
  member: HmoMember,
  { createProfile = false }: { createProfile?: boolean } = {}
): Promise<void> {
  const profile = await prisma.patientProfile.findUnique({
    where: { email: member.email },
  });

  if (!profile) {
    if (!createProfile) return;
    await prisma.patientProfile.upsert({
      where: { email: member.email },
      create: {
        email: member.email,
        name: member.full_name,
        phone: member.phone,
        dob: member.date_of_birth,
        sex: member.sex,
      },
      update: {},
    });
    return;
  }

  const memberUpdates: Partial<Pick<HmoMember, "phone" | "date_of_birth" | "sex">> = {};
  if (!member.phone && profile.phone) memberUpdates.phone = profile.phone;
  if (!member.date_of_birth && profile.dob) memberUpdates.date_of_birth = profile.dob;
  if (!member.sex && profile.sex) memberUpdates.sex = profile.sex;

  const profileUpdates: Partial<Pick<PatientProfile, "name" | "phone" | "dob" | "sex">> = {};
  if (!profile.name && member.full_name) profileUpdates.name = member.full_name;
  if (!profile.phone && member.phone) profileUpdates.phone = member.phone;
  if (!profile.dob && member.date_of_birth) profileUpdates.dob = member.date_of_birth;
  if (!profile.sex && member.sex) profileUpdates.sex = member.sex;

  await Promise.all([
    Object.keys(memberUpdates).length > 0
      ? prisma.hmoMember.update({ where: { id: member.id }, data: memberUpdates })
      : Promise.resolve(),
    Object.keys(profileUpdates).length > 0
      ? prisma.patientProfile.update({ where: { email: profile.email }, data: profileUpdates })
      : Promise.resolve(),
  ]);
}
