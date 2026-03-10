// =============================================================================
// POVEON HEALTH - SHARED TYPESCRIPT TYPES
// =============================================================================

export type RequestStatus = "incoming" | "seen" | "done";
export type Sex = "male" | "female";

export interface Lab {
  id: string;
  name: string;
  prefix: string;
  address: string;
  description: string;
  phones: string[];
  email: string;
  notification_email: string | null;
  logo_url: string | null;
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
  created_at: string;
  _count?: { members: number };
}

export interface LabMember {
  id: string;
  lab_id: string;
  user_id: string;
  role_id: string;
  role: { id: string; name: string };
  created_at: string;
}

export interface LabRequest {
  id: string;
  code: string;
  lab_id: string;
  patient_name: string;
  dob: string;
  sex: Sex;
  address: string | null;
  patient_email: string | null;
  patient_phone: string | null;
  doctor_prefix: string | null;
  doctor_name: string;
  doctor_email: string;
  doctor_phone: string | null;
  doctor_bank_name: string | null;
  doctor_account_number: string | null;
  doctor_account_name: string | null;
  diagnosis: string | null;
  tests: string;
  status: RequestStatus;
  created_at: string;
  seen_at: string | null;
  completed_at: string | null;
  // Joined field from labs table
  labs?: {
    name: string;
    address: string;
  };
}

// API request/response types
export interface CreateRequestPayload {
  patient_name: string;
  dob: string;
  sex: Sex;
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
