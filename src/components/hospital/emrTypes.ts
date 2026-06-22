// Shared types for the super-admin EMR tabs.

export interface EmrDepartment {
  id: string;
  key: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  queue: number;
}

export interface EmrStaff {
  id: string;
  full_name: string;
  role: string;
  email: string | null;
  phone: string | null;
  department_key: string | null;
  is_active: boolean;
  has_pin: boolean;
  created_at: string;
}

export interface EmrPatient {
  id: string;
  hospital_number: string;
  full_name: string;
  age: number | null;
  sex: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  blood_group: string | null;
  genotype: string | null;
  allergies: string | null;
  created_at: string;
}
