// =============================================================================
// POVEON HEALTH - SHARED TYPESCRIPT TYPES
// =============================================================================

export type RequestStatus = "incoming" | "seen" | "done";
export type Sex = "male" | "female";

export interface Lab {
  id: string;
  name: string;
  prefix: string;
  addresses: string[];
  email: string;
  created_at: string;
}

export interface LabUser {
  id: string;
  user_id: string;
  lab_id: string;
  created_at: string;
}

export interface LabRequest {
  id: string;
  code: string;
  lab_id: string;
  patient_name: string;
  dob: string;
  sex: Sex;
  address: string;
  patient_email: string | null;
  doctor_name: string;
  doctor_email: string;
  doctor_phone: string | null;
  diagnosis: string | null;
  tests: string;
  status: RequestStatus;
  created_at: string;
  seen_at: string | null;
  completed_at: string | null;
  // Joined field from labs table
  labs?: {
    name: string;
    addresses: string[];
  };
}

// API request/response types
export interface CreateRequestPayload {
  patient_name: string;
  dob: string;
  sex: Sex;
  address: string;
  patient_email?: string;
  doctor_name: string;
  doctor_email: string;
  doctor_phone?: string;
  diagnosis?: string;
  tests: string;
  lab_id: string;
}

export interface CreateRequestResponse {
  success: boolean;
  code?: string;
  lab?: Pick<Lab, "name" | "addresses">;
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
  addresses: string[];
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
