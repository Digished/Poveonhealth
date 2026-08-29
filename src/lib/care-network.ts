import { prisma } from "@/lib/prisma";
import { activeMemberWhere } from "@/lib/consult";

/**
 * What a partner pharmacy or lab is allowed to see about the members who chose
 * them.
 *
 * A member naming a preferred provider is a heads-up, not an introduction: the
 * provider gets the care code and enough of a name to greet the right person,
 * so they can stock the drug or plan the bench. The full name appears only once
 * the member has actually presented there — at that point the provider has met
 * them and holds the record anyway.
 */

/** "Adebayo Okonkwo" → "Adebayo O." — recognisable, not a directory entry. */
export function maskName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Member";
  if (parts.length === 1) return parts[0];
  const initials = parts.slice(1).map((p) => `${p[0].toUpperCase()}.`);
  return [parts[0], ...initials].join(" ");
}

export type RosterMember = {
  id: string;
  code: string | null;
  name: string;
  /** True when the name above is the full one, because they have been here. */
  name_revealed: boolean;
  conditions: string[];
  since: Date | null;
  expires_at: Date | null;
};

/**
 * The members who have picked this pharmacy, and the medication their doctors
 * have scheduled but not yet stopped — so the shelf is stocked before they walk in.
 */
export async function pharmacyRoster(pharmacyId: string) {
  const members = await prisma.consultPatient.findMany({
    where: { ...activeMemberWhere(), preferred_pharmacy_id: pharmacyId },
    orderBy: { full_name: "asc" },
    take: 500,
    select: {
      id: true, code: true, full_name: true, conditions: true,
      subscribed_at: true, expires_at: true,
      prescriptions: {
        where: { status: { in: ["scheduled", "active"] } },
        orderBy: [{ start_date: "desc" }],
        take: 20,
        select: {
          id: true, medication: true, form: true, dosage: true, frequency: true,
          duration_days: true, start_date: true, end_date: true, status: true,
        },
      },
    },
  });

  // Anyone already on the pharmacy's own books has been served here before.
  const known = await prisma.pharmacyCustomer.findMany({
    where: { pharmacy_id: pharmacyId, patient_id: { in: members.map((m) => m.id) } },
    select: { patient_id: true },
  });
  const knownIds = new Set(known.map((k) => k.patient_id).filter(Boolean) as string[]);

  return members.map((m) => ({
    id: m.id,
    code: m.code,
    name: knownIds.has(m.id) ? m.full_name : maskName(m.full_name),
    name_revealed: knownIds.has(m.id),
    conditions: m.conditions,
    since: m.subscribed_at,
    expires_at: m.expires_at,
    prescriptions: m.prescriptions,
  }));
}

/**
 * The members who have picked this lab, and the tests their doctors have
 * scheduled but not yet marked done.
 */
export async function labRoster(labId: string) {
  const members = await prisma.consultPatient.findMany({
    where: { ...activeMemberWhere(), preferred_lab_id: labId },
    orderBy: { full_name: "asc" },
    take: 500,
    select: {
      id: true, code: true, full_name: true, email: true, conditions: true,
      subscribed_at: true, expires_at: true,
      test_orders: {
        where: { status: "scheduled" },
        orderBy: [{ due_date: "asc" }],
        take: 20,
        select: { id: true, tests: true, reason: true, due_date: true, recurrence: true },
      },
    },
  });

  // A member whose test this lab has already run is someone they have met.
  const seen = await prisma.request.findMany({
    where: {
      lab_id: labId,
      patient_email: { in: members.map((m) => m.email.toLowerCase()) },
    },
    select: { patient_email: true },
    distinct: ["patient_email"],
    take: 500,
  });
  const knownEmails = new Set(
    seen.map((r) => (r.patient_email ?? "").toLowerCase()).filter(Boolean)
  );

  return members.map((m) => ({
    id: m.id,
    code: m.code,
    name: knownEmails.has(m.email.toLowerCase()) ? m.full_name : maskName(m.full_name),
    name_revealed: knownEmails.has(m.email.toLowerCase()),
    conditions: m.conditions,
    since: m.subscribed_at,
    expires_at: m.expires_at,
    test_orders: m.test_orders,
  }));
}
