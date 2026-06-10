// Shared types for the hospital portal dashboard

export interface HospitalInfo {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  specialties: string[];
  has_pin: boolean;
}

export interface HospitalCounts {
  pending_referrals: number;
  accepted_referrals: number;
  doctors: number;
}

export type ReferralStatus = "pending" | "accepted" | "rejected" | "redirected";
export type ReferralUrgency = "routine" | "urgent" | "emergency";

export interface ReferralEvent {
  type: string;
  actor_type: string;
  actor_label: string | null;
  note: string | null;
  created_at: string;
}

export interface Referral {
  id: string;
  code: string;
  status: ReferralStatus;
  patient_name: string;
  patient_age: string | number | null;
  patient_sex: string | null;
  patient_phone: string | null;
  patient_email: string | null;
  hospital_number: string | null;
  doctor_email: string | null;
  doctor_name: string | null;
  doctor_phone: string | null;
  from_hospital: string | null;
  specialty: string | null;
  urgency: ReferralUrgency;
  clinical_note: string | null;
  provisional_diagnosis: string | null;
  response_note: string | null;
  responded_at: string | null;
  created_at: string;
  events: ReferralEvent[];
}

export interface HospitalDoctor {
  id: string;
  doctor_email: string;
  doctor_name: string | null;
  specialty: string | null;
  phone: string | null;
  has_profile: boolean;
  created_at: string;
}

export interface SuggestedHospital {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  address: string | null;
  specialties: string[];
}

export function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
