// =============================================================================
// POVEON HEALTH - SHARED TYPESCRIPT TYPES
// =============================================================================

export type RequestStatus = "incoming" | "seen" | "done";
export type Sex = "male" | "female";

export interface Lab {
  id: string;
  name: string;
  prefix: string;
  slug: string | null;
  address: string;
  description: string;
  phones: string[];
  email: string;
  notification_email: string | null;
  logo_url: string | null;
  whatsapp: string | null;
  request_email: string | null;
  hidden: boolean;
  service_categories: string[];
  certifications: string[];
  created_at: string;
}

export interface ApiLog {
  id: string;
  method: string;
  path: string;
  status: number;
  lab_id: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface ApiLogSummary {
  today: number;
  week: number;
  topEndpoints: { path: string; count: number }[];
  byStatus: { status: number; count: number }[];
}

export interface LabUser {
  id: string;
  user_id: string;
  lab_id: string;
  created_at: string;
}

export interface LabApiKey {
  id: string;
  name: string;
  key_prefix: string;
  last_used: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface LabRole {
  id: string;
  lab_id: string;
  name: string;
  can_view_requests: boolean;
  can_mark_seen: boolean;
  can_mark_done: boolean;
  can_send_results: boolean;
  can_manage_team: boolean;
  can_manage_api_keys: boolean;
  can_view_referrals: boolean;
  can_view_clients: boolean;
  can_view_analytics: boolean;
  can_view_activity: boolean;
  can_view_feedback: boolean;
  created_at: string;
  _count?: { members: number };
}

export interface LabFeedback {
  id: string;
  lab_id: string;
  reviewer_email: string;
  reviewer_type: "patient" | "doctor";
  is_anonymous: boolean;
  display_name: string | null;
  rating_overall: number;
  rating_accuracy: number | null;
  rating_speed: number | null;
  rating_staff: number | null;
  rating_environment: number | null;
  comment: string | null;
  created_at: string;
  updated_at: string;
}

export interface LabMember {
  id: string;
  lab_id: string;
  user_id: string;
  email: string | null;
  role_id: string;
  role: { id: string; name: string };
  created_at: string;
  last_sign_in_at?: string | null;
}

export interface LabRequest {
  id: string;
  code: string;
  lab_id: string;
  patient_name: string | null;
  dob: string | null;
  sex: Sex | null;
  address: string | null;
  patient_email: string | null;
  patient_phone: string | null;
  doctor_prefix: string | null;
  doctor_name: string;
  doctor_email: string;
  doctor_phone: string | null;
  doctor_hospital: string | null;
  doctor_bank_name: string | null;
  doctor_account_number: string | null;
  doctor_account_name: string | null;
  schedule: string | null;
  diagnosis: string | null;
  tests: string;
  status: RequestStatus;
  created_at: string;
  updated_at: string | null;
  seen_at: string | null;
  completed_at: string | null;
  test_image_url: string | null;
  is_critical: boolean | null;
  needs_ambulance: boolean | null;
  // Joined field from lab relation (Prisma relation name is "lab")
  lab?: {
    name: string;
    address: string;
    whatsapp?: string | null;
  };
}

// API request/response types
export interface CreateRequestPayload {
  patient_name?: string;
  dob?: string;
  sex?: Sex;
  address?: string;
  patient_email?: string;
  patient_phone?: string;
  doctor_prefix?: string;
  doctor_name: string;
  doctor_email: string;
  doctor_phone?: string;
  doctor_bank_name?: string;
  doctor_account_number?: string;
  doctor_account_name?: string;
  diagnosis?: string;
  tests: string;
  lab_id: string;
}

export interface CreateRequestResponse {
  success: boolean;
  code?: string;
  requestId?: string;
  lab?: Pick<Lab, "name" | "address" | "phones">;
  error?: string;
}

export interface RetrieveRequestPayload {
  code: string;
}

export interface RetrieveRequestResponse {
  success: boolean;
  request?: LabRequest;
  error?: string;
}

export interface UpdateStatusPayload {
  requestId: string;
  status: "seen" | "done";
}

export interface CreateLabPayload {
  name: string;
  email: string;
  address: string;
  phones: string[];
  tempPassword: string;
}

export interface AdminMetrics {
  total: number;
  incoming: number;
  seen: number;
  done: number;
  byLab: {
    lab_id: string;
    lab_name: string;
    total: number;
  }[];
}
