/** The doctor's own record, as the portal and the profile form both see it. */
export interface DoctorProfileData {
  prefix: string | null;
  full_name: string | null;
  phone: string | null;
  hospitals: string[];
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
}

/** The three steps of first-time profile set-up. */
export type OnboardStep = 1 | 2 | 3;
