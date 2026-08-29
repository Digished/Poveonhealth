/**
 * When is a medication still live?
 *
 * A doctor schedules a medication, which starts it at "scheduled"; it becomes
 * "active" once anyone confirms it, and ends at "completed" or "cancelled".
 * Every view that lists "what they are on" needs the same answer.
 *
 * This exists because it was written out five separate times and one of them
 * drifted: the patient's care page still filtered on `status === "active"`
 * after scheduling moved the starting status to "scheduled", so a doctor could
 * schedule medication and the patient would never see it.
 */
export const MED_LIVE_STATUSES = ["scheduled", "active"] as const;

/** For a Prisma `where` clause. */
export const medLiveWhere = { status: { in: [...MED_LIVE_STATUSES] } };

export function isMedicationLive(status: string): boolean {
  return (MED_LIVE_STATUSES as readonly string[]).includes(status);
}

/** How a medication's state reads to a member, who never saw the word "scheduled". */
export const MED_STATUS_LABEL: Record<string, string> = {
  scheduled: "Just added",
  active: "Ongoing",
  completed: "Course finished",
  cancelled: "Stopped",
};
