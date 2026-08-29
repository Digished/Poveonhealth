import { prisma } from "@/lib/prisma";

let ensured: Promise<void> | null = null;

/**
 * Guarantees the care-plan and pharmacy tables exist.
 *
 * Vercel doesn't run Prisma migrations on deploy — `scripts/run-migration.mjs`
 * does, at build time, and every step there is `continueOnError`, so a single
 * failed statement is logged as "already applied" and the table quietly never
 * appears. That is how `pharmacy_otps` went missing in production while the
 * rest of the feature deployed fine.
 *
 * So the care-plan routes call this defensively, exactly as the doctor-charging
 * routes call ensureEncounterSchema. Memoised per process, so repeated calls
 * are free after the first, and every statement is IF NOT EXISTS.
 *
 * @param force re-run even if already ensured this process
 */
export async function ensureCarePlanSchema(force = false): Promise<void> {
  if (ensured && !force) return ensured;
  ensured = runEnsure();
  return ensured;
}

async function runEnsure(): Promise<void> {
  try {
    // One statement per call — a combined block fails as a unit, which is the
    // trap the build-time migration fell into.
    const exec = (sql: string) => prisma.$executeRawUnsafe(sql);

    await exec(`
      CREATE TABLE IF NOT EXISTS consult_settings (
        id TEXT PRIMARY KEY DEFAULT 'default',
        price_naira DECIMAL(12,2) NOT NULL DEFAULT 10000,
        doctor_share_naira DECIMAL(12,2) NOT NULL DEFAULT 6000,
        message_allowance INTEGER NOT NULL DEFAULT 40,
        release_months INTEGER NOT NULL DEFAULT 12,
        default_doctor_cap INTEGER NOT NULL DEFAULT 200,
        lab_discount_percent INTEGER NOT NULL DEFAULT 15,
        pharmacy_discount_percent INTEGER NOT NULL DEFAULT 10,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_by TEXT
      );
    `);
    await exec(`INSERT INTO consult_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;`);

    await exec(`
      CREATE TABLE IF NOT EXISTS consult_patients (
        id TEXT PRIMARY KEY,
        code TEXT,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        sex TEXT,
        date_of_birth DATE,
        state TEXT,
        city TEXT,
        conditions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        consent_at TIMESTAMP(3),
        preferred_pharmacy_id TEXT,
        preferred_lab_id TEXT,
        doctor_email TEXT,
        assigned_at TIMESTAMP(3),
        status TEXT NOT NULL DEFAULT 'pending_payment',
        subscribed_at TIMESTAMP(3),
        expires_at TIMESTAMP(3),
        amount_paid DECIMAL(12,2),
        paystack_ref TEXT,
        messages_used INTEGER NOT NULL DEFAULT 0,
        message_allowance INTEGER NOT NULL DEFAULT 40,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // Brings a database created by the first version of this feature up to date.
    await exec(`ALTER TABLE consult_patients ALTER COLUMN code DROP NOT NULL;`);
    await exec(`ALTER TABLE consult_patients ADD COLUMN IF NOT EXISTS consent_at TIMESTAMP(3);`);
    await exec(`ALTER TABLE consult_patients DROP COLUMN IF EXISTS goal;`);
    await exec(`ALTER TABLE consult_patients DROP COLUMN IF EXISTS goal_metric;`);
    await exec(`CREATE UNIQUE INDEX IF NOT EXISTS consult_patients_code_key ON consult_patients(code);`);
    await exec(`CREATE UNIQUE INDEX IF NOT EXISTS consult_patients_email_key ON consult_patients(email);`);
    await exec(`CREATE INDEX IF NOT EXISTS consult_patients_doctor_status_idx ON consult_patients(doctor_email, status);`);
    await exec(`CREATE INDEX IF NOT EXISTS consult_patients_status_expires_idx ON consult_patients(status, expires_at);`);
    await exec(`CREATE INDEX IF NOT EXISTS consult_patients_email_idx ON consult_patients(email);`);

    await exec(`ALTER TABLE consult_patients ADD COLUMN IF NOT EXISTS preferred_pharmacy_id TEXT;`);
    await exec(`ALTER TABLE consult_patients ADD COLUMN IF NOT EXISTS preferred_lab_id TEXT;`);
    await exec(`CREATE INDEX IF NOT EXISTS doctor_patients_patient_email_idx ON doctor_patients(patient_email);`);

    await exec(`DROP TABLE IF EXISTS consult_patient_sessions;`);

    await exec(`
      CREATE TABLE IF NOT EXISTS consult_messages (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL,
        sender TEXT NOT NULL,
        body TEXT NOT NULL,
        read_at TIMESTAMP(3),
        counted BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await exec(`CREATE INDEX IF NOT EXISTS consult_messages_patient_created_idx ON consult_messages(patient_id, created_at);`);

    await exec(`
      CREATE TABLE IF NOT EXISTS consult_earnings (
        id TEXT PRIMARY KEY,
        doctor_email TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        total_naira DECIMAL(12,2) NOT NULL,
        released_naira DECIMAL(12,2) NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // The first version had one entitlement per member; renewals need one per year.
    await exec(`DROP INDEX IF EXISTS consult_earnings_patient_id_key;`);
    await exec(`CREATE INDEX IF NOT EXISTS consult_earnings_doctor_status_idx ON consult_earnings(doctor_email, status);`);
    await exec(`CREATE INDEX IF NOT EXISTS consult_earnings_patient_created_idx ON consult_earnings(patient_id, created_at);`);

    await exec(`
      CREATE TABLE IF NOT EXISTS consult_earning_releases (
        id TEXT PRIMARY KEY,
        doctor_email TEXT NOT NULL,
        earning_id TEXT NOT NULL,
        amount_naira DECIMAL(12,2) NOT NULL,
        period TEXT NOT NULL,
        note TEXT,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // This unique key is what makes the monthly release run idempotent.
    await exec(`CREATE UNIQUE INDEX IF NOT EXISTS consult_earning_releases_earning_period_key ON consult_earning_releases(earning_id, period);`);
    await exec(`CREATE INDEX IF NOT EXISTS consult_earning_releases_doctor_period_idx ON consult_earning_releases(doctor_email, period);`);

    await exec(`
      CREATE TABLE IF NOT EXISTS pharmacies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        code TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        city TEXT,
        state TEXT,
        logo_url TEXT,
        discount_percent INTEGER NOT NULL DEFAULT 10,
        active BOOLEAN NOT NULL DEFAULT true,
        pin_hash TEXT,
        onboarded_at TIMESTAMP(3),
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await exec(`CREATE UNIQUE INDEX IF NOT EXISTS pharmacies_slug_key ON pharmacies(slug);`);
    await exec(`CREATE UNIQUE INDEX IF NOT EXISTS pharmacies_code_key ON pharmacies(code);`);
    await exec(`CREATE UNIQUE INDEX IF NOT EXISTS pharmacies_email_key ON pharmacies(email);`);

    await exec(`
      CREATE TABLE IF NOT EXISTS pharmacy_otps (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        expires_at TIMESTAMP(3) NOT NULL,
        used BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await exec(`CREATE INDEX IF NOT EXISTS pharmacy_otps_email_idx ON pharmacy_otps(email);`);

    await exec(`
      CREATE TABLE IF NOT EXISTS pharmacy_sessions (
        id TEXT PRIMARY KEY,
        pharmacy_id TEXT NOT NULL,
        expires_at TIMESTAMP(3) NOT NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await exec(`CREATE INDEX IF NOT EXISTS pharmacy_sessions_pharmacy_idx ON pharmacy_sessions(pharmacy_id);`);

    await exec(`
      CREATE TABLE IF NOT EXISTS pharmacy_customers (
        id TEXT PRIMARY KEY,
        pharmacy_id TEXT NOT NULL,
        patient_id TEXT,
        full_name TEXT NOT NULL,
        phone TEXT,
        code TEXT,
        visits INTEGER NOT NULL DEFAULT 0,
        total_spend DECIMAL(12,2) NOT NULL DEFAULT 0,
        last_visit_at TIMESTAMP(3),
        notes TEXT,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await exec(`CREATE UNIQUE INDEX IF NOT EXISTS pharmacy_customers_pharmacy_patient_key ON pharmacy_customers(pharmacy_id, patient_id);`);
    await exec(`CREATE INDEX IF NOT EXISTS pharmacy_customers_pharmacy_visit_idx ON pharmacy_customers(pharmacy_id, last_visit_at);`);

    await exec(`
      CREATE TABLE IF NOT EXISTS consult_redemptions (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL,
        pharmacy_id TEXT,
        kind TEXT NOT NULL,
        description TEXT,
        gross_naira DECIMAL(12,2) NOT NULL,
        discount_naira DECIMAL(12,2) NOT NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await exec(`CREATE INDEX IF NOT EXISTS consult_redemptions_patient_created_idx ON consult_redemptions(patient_id, created_at);`);
    await exec(`CREATE INDEX IF NOT EXISTS consult_redemptions_pharmacy_created_idx ON consult_redemptions(pharmacy_id, created_at);`);

    await exec(`ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS logo_url TEXT;`);
    await exec(`ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS pin_hash TEXT;`);
    await exec(`CREATE INDEX IF NOT EXISTS pharmacies_state_active_idx ON pharmacies(state, active);`);

    // The column default only applies to new rows; the live settings row and
    // everyone enrolled under it were created at 10. One-shot by construction —
    // the CTE only yields a row while settings is still 10, so an admin who
    // later chooses 10 on purpose isn't overridden on the next request.
    await exec(`
      WITH bumped AS (
        UPDATE consult_settings SET message_allowance = 40
        WHERE id = 'default' AND message_allowance = 10
        RETURNING 1
      )
      UPDATE consult_patients SET message_allowance = 40
      WHERE message_allowance = 10 AND EXISTS (SELECT 1 FROM bumped);
    `);

    await exec(`ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS consult_accepting BOOLEAN NOT NULL DEFAULT true;`);
    await exec(`ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS consult_patient_cap INTEGER;`);
    await exec(`ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS consult_approved BOOLEAN NOT NULL DEFAULT false;`);

    await exec(`
      CREATE TABLE IF NOT EXISTS doctor_credentials (
        email TEXT PRIMARY KEY,
        mdcn_number TEXT,
        license_expires_at DATE,
        license_doc_url TEXT,
        id_doc_url TEXT,
        cv_url TEXT,
        qualifications TEXT,
        specialty TEXT,
        years_experience INTEGER,
        note TEXT,
        status TEXT NOT NULL DEFAULT 'unsubmitted',
        submitted_at TIMESTAMP(3),
        reviewed_at TIMESTAMP(3),
        reviewed_by TEXT,
        review_note TEXT,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await exec(`CREATE INDEX IF NOT EXISTS doctor_credentials_status_idx ON doctor_credentials(status, submitted_at);`);

    await exec(`
      CREATE TABLE IF NOT EXISTS consult_prescriptions (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL,
        doctor_email TEXT NOT NULL,
        medication TEXT NOT NULL,
        dosage TEXT,
        frequency TEXT,
        duration_days INTEGER,
        instructions TEXT,
        start_date DATE,
        end_date DATE,
        status TEXT NOT NULL DEFAULT 'active',
        stopped_note TEXT,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await exec(`CREATE INDEX IF NOT EXISTS consult_prescriptions_patient_created_idx ON consult_prescriptions(patient_id, created_at);`);
    await exec(`CREATE INDEX IF NOT EXISTS consult_prescriptions_doctor_status_idx ON consult_prescriptions(doctor_email, status);`);

    await exec(`
      CREATE TABLE IF NOT EXISTS consult_test_orders (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL,
        doctor_email TEXT NOT NULL,
        tests TEXT NOT NULL,
        reason TEXT,
        due_date DATE,
        recurrence TEXT NOT NULL DEFAULT 'once',
        status TEXT NOT NULL DEFAULT 'scheduled',
        completed_at TIMESTAMP(3),
        result_note TEXT,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await exec(`CREATE INDEX IF NOT EXISTS consult_test_orders_patient_created_idx ON consult_test_orders(patient_id, created_at);`);
    await exec(`CREATE INDEX IF NOT EXISTS consult_test_orders_doctor_status_idx ON consult_test_orders(doctor_email, status);`);
    await exec(`CREATE INDEX IF NOT EXISTS consult_test_orders_status_due_idx ON consult_test_orders(status, due_date);`);
  } catch (err) {
    // Never block a request on this — the caller's own query will surface a
    // real problem, and the next call retries.
    console.error("[ensure-care-plan-schema]", err instanceof Error ? err.message : err);
    ensured = null;
  }
}
