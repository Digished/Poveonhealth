// =============================================================================
// POVEON HEALTH — DOCTOR PERKS & FREE RIDES
// Shared logic for the free-ride perk: arrival-code generation, the redemption
// window, and the notification fan-out (patient, lab, assigned logistics
// partner) that fires when a doctor redeems a perk.
// =============================================================================

import { prisma } from "@/lib/prisma";
import { resend, labSender, labRequestRecipients, FROM_ADDRESS } from "@/lib/email/resend";
import {
  ridePatientEmail,
  rideDoctorEmail,
  rideLabEmail,
  rideLogisticsEmail,
  rideRiderPhoneEmail,
  type RidePartnerContact,
} from "@/lib/email/templates";

// A free ride must be redeemed within this many days of being issued. Surfaced
// to the patient and lab in their emails, and enforced by the rider portal.
export const RIDE_REDEEM_DAYS = 7;

// Characters that are visually unambiguous (no 0/O, 1/I/L confusion).
const CODE_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://poveon.com";
}

/** Build a short arrival code, e.g. "RIDE-8X4K2". */
export function buildRideCode(): string {
  let seg = "";
  for (let i = 0; i < 5; i++) {
    seg += CODE_CHARSET[Math.floor(Math.random() * CODE_CHARSET.length)];
  }
  return `RIDE-${seg}`;
}

/** Generate a collision-free arrival code. */
export async function generateRideCode(maxAttempts = 10): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const code = buildRideCode();
    const existing = await prisma.ridePerk.findUnique({ where: { code }, select: { id: true } });
    if (!existing) return code;
  }
  throw new Error("Failed to generate a unique ride code");
}

export interface RedeemInput {
  perkId?: string | null;
  doctorEmail: string;
  labId: string;
  requestId: string;
  patientName: string;
  patientPhone: string;
  pickupAddress: string;
  labName: string;
  labAddress: string;
}

/**
 * Redeem a doctor's active free-ride perk for a request: atomically decrement a
 * use, create the ride, flag the request, and fan out notifications. Returns the
 * created ride, or null if no valid perk was available (already exhausted /
 * inactive / not for this lab). Never throws.
 */
export async function redeemFreeRide(input: RedeemInput) {
  const doctorEmail = input.doctorEmail.trim().toLowerCase();

  // Find a matching, still-usable perk (the given one, else any for this lab).
  const perk = input.perkId
    ? await prisma.doctorPerk.findFirst({
        where: { id: input.perkId, doctor_email: doctorEmail, lab_id: input.labId, is_active: true, remaining_uses: { gt: 0 } },
      })
    : await prisma.doctorPerk.findFirst({
        where: { doctor_email: doctorEmail, lab_id: input.labId, is_active: true, remaining_uses: { gt: 0 } },
        orderBy: { created_at: "asc" },
      });
  if (!perk) return null;

  // Atomically claim a use — guards against a double redemption race.
  const claim = await prisma.doctorPerk.updateMany({
    where: { id: perk.id, remaining_uses: { gt: 0 } },
    data: { remaining_uses: { decrement: 1 } },
  });
  if (claim.count === 0) return null;

  try {
    const code = await generateRideCode();
    const ride = await prisma.ridePerk.create({
      data: {
        code,
        perk_id: perk.id,
        doctor_email: doctorEmail,
        lab_id: input.labId,
        request_id: input.requestId,
        patient_name: input.patientName,
        patient_phone: input.patientPhone,
        pickup_address: input.pickupAddress,
        destination_address: input.labAddress || input.labName,
        destination_lab: input.labName,
        redeem_by: new Date(Date.now() + RIDE_REDEEM_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    await prisma.request.update({
      where: { id: input.requestId },
      data: { has_free_ride: true },
    }).catch(() => {});

    await notifyRideRedeemed(ride.id);
    return ride;
  } catch (e) {
    // Roll the claimed use back so it isn't silently lost.
    await prisma.doctorPerk.update({
      where: { id: perk.id },
      data: { remaining_uses: { increment: 1 } },
    }).catch(() => {});
    console.error("[rides] redeemFreeRide failed:", e);
    return null;
  }
}

/** The logistics partners assigned to a lab (active only). */
export async function partnersForLab(labId: string) {
  const links = await prisma.logisticsPartnerLab.findMany({ where: { lab_id: labId } });
  if (links.length === 0) return [];
  const partnerIds = links.map((l) => l.partner_id);
  return prisma.logisticsPartner.findMany({
    where: { id: { in: partnerIds }, is_active: true },
  });
}

/**
 * Notify everyone about a newly-redeemed ride:
 *  • the patient — free-ride details, arrival code (keep secret until they arrive)
 *  • the lab — this order carries a free ride, redeemable within the window
 *  • the assigned logistics partner(s) — pending ride to fulfil
 *
 * Fire-and-forget: failures are logged, never thrown.
 */
export async function notifyRideRedeemed(rideId: string): Promise<void> {
  try {
    const ride = await prisma.ridePerk.findUnique({ where: { id: rideId } });
    if (!ride) return;

    const lab = await prisma.lab.findUnique({ where: { id: ride.lab_id } });
    if (!lab) return;

    const dashboardUrl = `${appUrl()}/logistics`;
    const sends: Promise<unknown>[] = [];

    // The logistics companies assigned to this lab — their contact details are
    // shared with both the patient and the doctor.
    const partners = await partnersForLab(ride.lab_id);
    const partnerContacts: RidePartnerContact[] = partners.map((p) => ({
      name: p.name,
      contact_name: p.contact_name,
      phone: p.phone,
      email: p.email,
    }));

    // Patient — only if we can reach them by email. The ride email itself is the
    // record of the perk; the rider's phone number follows in a second email
    // once the logistics partner assigns a rider.
    const patientEmail = await resolvePatientEmail(ride.request_id);
    if (patientEmail) {
      sends.push(
        resend.emails.send({
          from: labSender(lab),
          to: patientEmail,
          subject: `Your free ride to ${lab.name}`,
          html: ridePatientEmail({
            patientName: ride.patient_name,
            labName: lab.name,
            pickupAddress: ride.pickup_address,
            destinationAddress: ride.destination_address,
            arrivalCode: ride.code,
            redeemByDays: RIDE_REDEEM_DAYS,
            partners: partnerContacts,
          }),
        }).then((r) => { if (r.error) console.error("[rides] patient email:", JSON.stringify(r.error)); })
      );
    }

    // Doctor — confirmation with the same logistics-company contact details.
    if (ride.doctor_email) {
      const docProfile = await prisma.doctorProfile.findUnique({
        where: { email: ride.doctor_email },
        select: { full_name: true },
      }).catch(() => null);
      sends.push(
        resend.emails.send({
          from: labSender(lab),
          to: ride.doctor_email,
          subject: `Free ride sent for ${ride.patient_name}`,
          html: rideDoctorEmail({
            doctorName: docProfile?.full_name ?? "",
            patientName: ride.patient_name,
            labName: lab.name,
            pickupAddress: ride.pickup_address,
            destinationAddress: ride.destination_address,
            redeemByDays: RIDE_REDEEM_DAYS,
            partners: partnerContacts,
          }),
        }).then((r) => { if (r.error) console.error("[rides] doctor email:", JSON.stringify(r.error)); })
      );
    }

    // Lab — flag the free ride on this order.
    const labRecipients = labRequestRecipients(lab);
    if (labRecipients.length > 0) {
      sends.push(
        resend.emails.send({
          from: labSender(lab),
          to: labRecipients,
          subject: `Order with free patient ride — ${ride.destination_lab}`,
          html: rideLabEmail({
            labName: lab.name,
            patientName: ride.patient_name,
            pickupAddress: ride.pickup_address,
            redeemByDays: RIDE_REDEEM_DAYS,
          }),
        }).then((r) => { if (r.error) console.error("[rides] lab email:", JSON.stringify(r.error)); })
      );
    }

    // Assigned logistics partner(s) — a pending ride to fulfil. They only get the
    // patient's first name, phone and pickup location.
    for (const partner of partners) {
      if (!partner.email) continue;
      sends.push(
        resend.emails.send({
          from: FROM_ADDRESS,
          to: partner.email,
          subject: `New pending ride — ${ride.destination_lab}`,
          html: rideLogisticsEmail({
            partnerName: partner.name,
            patientFirstName: firstName(ride.patient_name),
            patientPhone: ride.patient_phone,
            pickupAddress: ride.pickup_address,
            destinationLab: ride.destination_lab,
            dashboardUrl,
          }),
        }).then((r) => { if (r.error) console.error("[rides] partner email:", JSON.stringify(r.error)); })
      );
    }

    await Promise.all(sends);
  } catch (e) {
    console.error("[rides] notifyRideRedeemed failed:", e);
  }
}

/**
 * Email the patient the assigned rider's phone number to call when ready.
 * Fired when a logistics partner assigns a rider to a ride.
 */
export async function notifyRiderAssigned(rideId: string): Promise<void> {
  try {
    const ride = await prisma.ridePerk.findUnique({ where: { id: rideId } });
    if (!ride || !ride.rider_id) return;

    const [lab, rider] = await Promise.all([
      prisma.lab.findUnique({ where: { id: ride.lab_id } }),
      prisma.rider.findUnique({ where: { id: ride.rider_id } }),
    ]);
    if (!lab || !rider) return;

    const patientEmail = await resolvePatientEmail(ride.request_id);
    if (!patientEmail) return;

    const { error } = await resend.emails.send({
      from: labSender(lab),
      to: patientEmail,
      subject: `Your rider for the trip to ${lab.name}`,
      html: rideRiderPhoneEmail({
        patientName: ride.patient_name,
        labName: lab.name,
        riderName: rider.name,
        riderPhone: rider.phone,
        arrivalCode: ride.code,
      }),
    });
    if (error) console.error("[rides] rider-phone email:", JSON.stringify(error));

    await prisma.ridePerk.update({
      where: { id: ride.id },
      data: { rider_notified_at: new Date() },
    });
  } catch (e) {
    console.error("[rides] notifyRiderAssigned failed:", e);
  }
}

/** Look up the patient's email from the attached request (rides don't store it). */
async function resolvePatientEmail(requestId: string | null): Promise<string | null> {
  if (!requestId) return null;
  const req = await prisma.request.findUnique({
    where: { id: requestId },
    select: { patient_email: true },
  });
  return req?.patient_email?.trim() || null;
}

/** First word of a name — riders/partners only see the patient's first name. */
export function firstName(full: string): string {
  return (full || "").trim().split(/\s+/)[0] || full;
}
