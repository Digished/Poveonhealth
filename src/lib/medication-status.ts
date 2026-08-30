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

/**
 * A draft the doctor has not confirmed yet.
 *
 * Suggestions are written from the member's own baseline the moment they join,
 * so the doctor edits rather than starts from nothing. Deliberately outside
 * MED_LIVE_STATUSES: nothing suggested is shown to the member or honoured at a
 * pharmacy until a doctor has confirmed it.
 */
export const MED_SUGGESTED_STATUS = "suggested";

/** For a Prisma `where` clause. */
export const medLiveWhere = { status: { in: [...MED_LIVE_STATUSES] } };

export function isMedicationLive(status: string): boolean {
  return (MED_LIVE_STATUSES as readonly string[]).includes(status);
}

/** How a medication's state reads to a member, who never saw the word "scheduled". */
export const MED_STATUS_LABEL: Record<string, string> = {
  suggested: "Awaiting your doctor",
  scheduled: "Just added",
  active: "Ongoing",
  completed: "Course finished",
  cancelled: "Stopped",
};
