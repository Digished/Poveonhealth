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
 * On a healthy database the only thing that runs is a single probe query — see
 * `alreadyCurrent`. The DDL is a repair path, not a per-request cost.
 *
 * @param force re-run even if already ensured this process
 */
export async function ensureCarePlanSchema(force = false): Promise<void> {
  if (ensured && !force) return ensured;
  ensured = runEnsure();
  return ensured;
}

/**
 * Everything the current code needs that a partly-migrated database might not
 * have. Checked in one query before doing any work — see `alreadyCurrent`.
 */
const SENTINEL_TABLES = [
  "consult_settings",
  "consult_patients",
  "consult_messages",
  "consult_earnings",
  "consult_earning_releases",
  "consult_redemptions",
  "consult_prescriptions",
  "consult_test_orders",
  "doctor_credentials",
  "pharmacies",
  "pharmacy_otps",
  "pharmacy_sessions",
  "pharmacy_customers",
  "consult_treatment_plans",
  "consult_treatment_items",
  "consult_templates",
  "consult_fulfilments",
  "consult_plan_logs",
  "push_subscriptions",
  "consult_topups",
  "consult_screenings",
  "pharmacy_medications",
  "pharmacy_price_batches",
  "medication_orders",
  "medication_order_items",
  "doctor_bonus_pools",
  "doctor_bonus_shares",
];

/** "table.column", so one text array can check them all. */
const SENTINEL_COLUMNS = [
  "pharmacies.pin_hash",
  "pharmacies.logo_url",
  "consult_patients.consent_at",
  "consult_patients.preferred_pharmacy_id",
  "consult_patients.preferred_lab_id",
  "consult_patients.medication_adherence",
  "consult_patients.baseline_captured_at",
  "consult_patients.baseline_self_care",
  "consult_patients.share_history",
  "consult_messages.image_url",
  "consult_prescriptions.raw_text",
  "consult_prescriptions.cancel_reason",
  "consult_test_orders.code",
  "consult_test_orders.request_id",
  "consult_treatment_items.measure",
  "consult_patients.risk_level",
  "consult_patients.risk_manual",
  "consult_patients.reminded_at",
  "pharmacies.margin_percent",
  "consult_settings.doctor_monthly_naira",
  "consult_settings.topup_price_naira",
  "consult_treatment_plans.source",
  "consult_prescriptions.source",
  "patient_profiles.state",
  "doctor_profiles.consult_approved",
];

/**
 * Is the schema already up to date?
 *
 * The DDL below is ~55 sequential round-trips. Running it on every cold start
 * made the first care-plan request on each serverless instance take seconds —
 * the credentials page in particular. This is one query, and on a healthy
 * database it is the only thing that runs.
 */
async function alreadyCurrent(): Promise<boolean> {
  try {
    const [row] = await prisma.$queryRaw<{ tables: bigint; columns: bigint }[]>`
      SELECT
        (SELECT count(*) FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = ANY(${SENTINEL_TABLES}::text[])) AS tables,
        (SELECT count(*) FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name || '.' || column_name = ANY(${SENTINEL_COLUMNS}::text[])) AS columns
    `;
    return (
      Number(row?.tables ?? 0) === SENTINEL_TABLES.length &&
      Number(row?.columns ?? 0) === SENTINEL_COLUMNS.length
    );
  } catch {
    // Can't tell — fall through and run the DDL, which is all IF NOT EXISTS.
    return false;
  }
}

async function runEnsure(): Promise<void> {
  try {
    if (await alreadyCurrent()) return;

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
    await exec(`ALTER TABLE consult_patients
      ADD COLUMN IF NOT EXISTS baseline_medications TEXT,
      ADD COLUMN IF NOT EXISTS medication_adherence TEXT,
      ADD COLUMN IF NOT EXISTS hypertension_years INTEGER,
      ADD COLUMN IF NOT EXISTS diabetes_years INTEGER,
      ADD COLUMN IF NOT EXISTS baseline_bp_systolic INTEGER,
      ADD COLUMN IF NOT EXISTS baseline_bp_diastolic INTEGER,
      ADD COLUMN IF NOT EXISTS baseline_bp_taken_on DATE,
      ADD COLUMN IF NOT EXISTS baseline_glucose_mg_dl DECIMAL(6,1),
      ADD COLUMN IF NOT EXISTS baseline_glucose_context TEXT,
      ADD COLUMN IF NOT EXISTS baseline_glucose_taken_on DATE,
      ADD COLUMN IF NOT EXISTS baseline_notes TEXT,
      ADD COLUMN IF NOT EXISTS baseline_last_visit TEXT,
      ADD COLUMN IF NOT EXISTS baseline_self_care TEXT,
      ADD COLUMN IF NOT EXISTS baseline_captured_at TIMESTAMP(3);`);
    await exec(`ALTER TABLE consult_patients
      ADD COLUMN IF NOT EXISTS share_history BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS previous_doctors TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];`);
    await exec(`CREATE INDEX IF NOT EXISTS consult_patients_adherence_idx ON consult_patients(medication_adherence);`);
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
    await exec(`ALTER TABLE consult_messages ADD COLUMN IF NOT EXISTS image_url TEXT;`);
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

    await exec(`ALTER TABLE consult_prescriptions
      ADD COLUMN IF NOT EXISTS form TEXT,
      ADD COLUMN IF NOT EXISTS raw_text TEXT,
      ADD COLUMN IF NOT EXISTS cancel_reason TEXT;`);

    await exec(`
      CREATE TABLE IF NOT EXISTS consult_treatment_plans (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL,
        doctor_email TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT 'Treatment plan',
        note TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        notified_at TIMESTAMP(3),
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await exec(`CREATE INDEX IF NOT EXISTS consult_treatment_plans_patient_idx ON consult_treatment_plans(patient_id, status);`);
    await exec(`CREATE INDEX IF NOT EXISTS consult_treatment_plans_doctor_idx ON consult_treatment_plans(doctor_email, status);`);

    await exec(`
      CREATE TABLE IF NOT EXISTS consult_treatment_items (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL,
        label TEXT NOT NULL,
        detail TEXT,
        cadence TEXT NOT NULL DEFAULT 'weekly',
        remind BOOLEAN NOT NULL DEFAULT true,
        position INTEGER NOT NULL DEFAULT 0,
        last_done_at TIMESTAMP(3),
        done_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await exec(`CREATE INDEX IF NOT EXISTS consult_treatment_items_plan_idx ON consult_treatment_items(plan_id, position);`);

    await exec(`
      CREATE TABLE IF NOT EXISTS consult_templates (
        id TEXT PRIMARY KEY,
        doctor_email TEXT NOT NULL,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        payload JSONB NOT NULL,
        uses INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await exec(`CREATE INDEX IF NOT EXISTS consult_templates_doctor_kind_idx ON consult_templates(doctor_email, kind);`);

    await exec(`
      CREATE TABLE IF NOT EXISTS consult_fulfilments (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        prescription_id TEXT,
        test_order_id TEXT,
        pharmacy_id TEXT,
        lab_id TEXT,
        status TEXT NOT NULL,
        quantity INTEGER,
        note TEXT,
        gross_naira DECIMAL(12,2),
        discount_naira DECIMAL(12,2),
        recorded_by TEXT,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await exec(`CREATE INDEX IF NOT EXISTS consult_fulfilments_patient_idx ON consult_fulfilments(patient_id, created_at);`);
    await exec(`CREATE INDEX IF NOT EXISTS consult_fulfilments_prescription_idx ON consult_fulfilments(prescription_id);`);
    await exec(`CREATE INDEX IF NOT EXISTS consult_fulfilments_test_order_idx ON consult_fulfilments(test_order_id);`);
    await exec(`CREATE INDEX IF NOT EXISTS consult_fulfilments_pharmacy_idx ON consult_fulfilments(pharmacy_id, created_at);`);
    await exec(`CREATE INDEX IF NOT EXISTS consult_fulfilments_lab_idx ON consult_fulfilments(lab_id, created_at);`);

    await exec(`
      CREATE TABLE IF NOT EXISTS consult_plan_logs (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        note TEXT,
        systolic INTEGER,
        diastolic INTEGER,
        glucose_mg_dl DECIMAL(6,1),
        weight_kg DECIMAL(5,1),
        value_number DECIMAL(10,2),
        value_text TEXT,
        logged_for DATE NOT NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await exec(`CREATE INDEX IF NOT EXISTS consult_plan_logs_patient_idx ON consult_plan_logs(patient_id, created_at);`);
    await exec(`CREATE INDEX IF NOT EXISTS consult_plan_logs_item_idx ON consult_plan_logs(item_id, logged_for);`);
    await exec(`ALTER TABLE consult_treatment_items
      ADD COLUMN IF NOT EXISTS measure TEXT NOT NULL DEFAULT 'none',
      ADD COLUMN IF NOT EXISTS measure_label TEXT;`);
    await exec(`ALTER TABLE consult_test_orders ADD COLUMN IF NOT EXISTS code TEXT;`);
    await exec(`ALTER TABLE consult_test_orders ADD COLUMN IF NOT EXISTS request_id TEXT;`);
    await exec(`
    CREATE TABLE IF NOT EXISTS consult_topups (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      messages INTEGER NOT NULL,
      amount_naira DECIMAL(12,2) NOT NULL,
      paystack_ref TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      paid_at TIMESTAMP(3)
    );
    `);
    await exec(`CREATE UNIQUE INDEX IF NOT EXISTS consult_topups_ref_key ON consult_topups(paystack_ref);`);
    await exec(`CREATE INDEX IF NOT EXISTS consult_topups_patient_idx ON consult_topups(patient_id, created_at);`);
    await exec(`ALTER TABLE consult_settings
      ADD COLUMN IF NOT EXISTS topup_price_naira DECIMAL(12,2) NOT NULL DEFAULT 10000,
      ADD COLUMN IF NOT EXISTS topup_messages INTEGER NOT NULL DEFAULT 40;`);
    await exec(`ALTER TABLE consult_treatment_plans
      ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'doctor',
      ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS reviewed_by TEXT;`);
    await exec(`ALTER TABLE consult_prescriptions ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'doctor';`);
    await exec(`
    CREATE TABLE IF NOT EXISTS consult_screenings (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'routine',
      answers JSONB NOT NULL DEFAULT '{}',
      severity TEXT NOT NULL DEFAULT 'none',
      flagged TEXT[] NOT NULL DEFAULT '{}',
      due_on DATE NOT NULL,
      seen_at TIMESTAMP(3),
      seen_by TEXT,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    `);
    await exec(`CREATE INDEX IF NOT EXISTS consult_screenings_patient_idx ON consult_screenings(patient_id, created_at);`);
    await exec(`CREATE INDEX IF NOT EXISTS consult_screenings_due_idx ON consult_screenings(severity, due_on);`);
    await exec(`ALTER TABLE consult_patients ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMP(3);`);
    await exec(`ALTER TABLE pharmacies
      ADD COLUMN IF NOT EXISTS margin_percent DECIMAL(5,2) NOT NULL DEFAULT 5,
      ADD COLUMN IF NOT EXISTS paystack_subaccount_code TEXT,
      ADD COLUMN IF NOT EXISTS bank_code TEXT,
      ADD COLUMN IF NOT EXISTS account_number TEXT,
      ADD COLUMN IF NOT EXISTS account_name TEXT;`);
    await exec(`
    CREATE TABLE IF NOT EXISTS pharmacy_medications (
      id TEXT PRIMARY KEY,
      pharmacy_id TEXT NOT NULL,
      name TEXT NOT NULL,
      form TEXT,
      strength TEXT,
      pack TEXT,
      key TEXT NOT NULL,
      list_price DECIMAL(12,2) NOT NULL,
      concession DECIMAL(12,2) NOT NULL DEFAULT 0,
      margin_percent DECIMAL(5,2),
      in_stock BOOLEAN NOT NULL DEFAULT true,
      active BOOLEAN NOT NULL DEFAULT true,
      notes TEXT,
      batch_id TEXT,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    `);
    await exec(`CREATE UNIQUE INDEX IF NOT EXISTS pharmacy_medications_key ON pharmacy_medications(pharmacy_id, key);`);
    await exec(`CREATE INDEX IF NOT EXISTS pharmacy_medications_active_idx ON pharmacy_medications(pharmacy_id, active);`);
    await exec(`CREATE INDEX IF NOT EXISTS pharmacy_medications_name_idx ON pharmacy_medications(name);`);
    await exec(`
    CREATE TABLE IF NOT EXISTS pharmacy_price_batches (
      id TEXT PRIMARY KEY,
      pharmacy_id TEXT NOT NULL,
      filename TEXT,
      rows_seen INTEGER NOT NULL DEFAULT 0,
      rows_written INTEGER NOT NULL DEFAULT 0,
      rows_skipped INTEGER NOT NULL DEFAULT 0,
      problems JSONB NOT NULL DEFAULT '[]',
      uploaded_by TEXT,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    `);
    await exec(`CREATE INDEX IF NOT EXISTS pharmacy_price_batches_idx ON pharmacy_price_batches(pharmacy_id, created_at);`);
    await exec(`
    CREATE TABLE IF NOT EXISTS medication_orders (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      pharmacy_id TEXT NOT NULL,
      for_month DATE NOT NULL,
      total_naira DECIMAL(12,2) NOT NULL,
      pharmacy_naira DECIMAL(12,2) NOT NULL,
      poveon_naira DECIMAL(12,2) NOT NULL,
      saving_naira DECIMAL(12,2) NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      paystack_ref TEXT,
      paid_at TIMESTAMP(3),
      ready_at TIMESTAMP(3),
      collected_at TIMESTAMP(3),
      collected_by TEXT,
      cancel_reason TEXT,
      reminded_at TIMESTAMP(3),
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    `);
    await exec(`CREATE UNIQUE INDEX IF NOT EXISTS medication_orders_ref_key ON medication_orders(paystack_ref);`);
    await exec(`CREATE INDEX IF NOT EXISTS medication_orders_patient_idx ON medication_orders(patient_id, created_at);`);
    await exec(`CREATE INDEX IF NOT EXISTS medication_orders_pharmacy_idx ON medication_orders(pharmacy_id, status);`);
    await exec(`CREATE INDEX IF NOT EXISTS medication_orders_month_idx ON medication_orders(status, for_month);`);
    await exec(`
    CREATE TABLE IF NOT EXISTS medication_order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      medication_id TEXT,
      prescription_id TEXT,
      name TEXT NOT NULL,
      strength TEXT,
      form TEXT,
      quantity INTEGER NOT NULL DEFAULT 1,
      list_price DECIMAL(12,2) NOT NULL,
      concession DECIMAL(12,2) NOT NULL,
      margin_percent DECIMAL(5,2) NOT NULL,
      member_naira DECIMAL(12,2) NOT NULL,
      pharmacy_naira DECIMAL(12,2) NOT NULL,
      poveon_naira DECIMAL(12,2) NOT NULL
    );
    `);
    await exec(`CREATE INDEX IF NOT EXISTS medication_order_items_order_idx ON medication_order_items(order_id);`);
    await exec(`CREATE INDEX IF NOT EXISTS medication_order_items_med_idx ON medication_order_items(medication_id);`);
    await exec(`ALTER TABLE consult_settings
      ADD COLUMN IF NOT EXISTS doctor_monthly_naira DECIMAL(12,2) NOT NULL DEFAULT 500,
      ADD COLUMN IF NOT EXISTS bonus_pool_percent DECIMAL(5,2) NOT NULL DEFAULT 10;`);
    await exec(`
    CREATE TABLE IF NOT EXISTS doctor_bonus_pools (
      id TEXT PRIMARY KEY,
      period TEXT NOT NULL,
      revenue_naira DECIMAL(14,2) NOT NULL,
      pool_percent DECIMAL(5,2) NOT NULL,
      pool_naira DECIMAL(14,2) NOT NULL,
      revenue_medication DECIMAL(14,2) NOT NULL DEFAULT 0,
      revenue_onboarding DECIMAL(14,2) NOT NULL DEFAULT 0,
      revenue_topups DECIMAL(14,2) NOT NULL DEFAULT 0,
      total_weight INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft',
      computed_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      paid_at TIMESTAMP(3),
      paid_by TEXT
    );
    `);
    await exec(`CREATE UNIQUE INDEX IF NOT EXISTS doctor_bonus_pools_period_key ON doctor_bonus_pools(period);`);
    await exec(`CREATE INDEX IF NOT EXISTS doctor_bonus_pools_status_idx ON doctor_bonus_pools(status, period);`);
    await exec(`
    CREATE TABLE IF NOT EXISTS doctor_bonus_shares (
      id TEXT PRIMARY KEY,
      pool_id TEXT NOT NULL,
      doctor_email TEXT NOT NULL,
      patients INTEGER NOT NULL DEFAULT 0,
      messages INTEGER NOT NULL DEFAULT 0,
      weight INTEGER NOT NULL DEFAULT 0,
      share_percent DECIMAL(6,3) NOT NULL,
      amount_naira DECIMAL(12,2) NOT NULL
    );
    `);
    await exec(`CREATE UNIQUE INDEX IF NOT EXISTS doctor_bonus_shares_key ON doctor_bonus_shares(pool_id, doctor_email);`);
    await exec(`CREATE INDEX IF NOT EXISTS doctor_bonus_shares_doctor_idx ON doctor_bonus_shares(doctor_email);`);
    await exec(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      role TEXT NOT NULL,
      email TEXT NOT NULL,
      user_agent TEXT,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_used TIMESTAMP(3),
      failed_at TIMESTAMP(3)
    );
    `);
    await exec(`CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_key ON push_subscriptions(endpoint);`);
    await exec(`CREATE INDEX IF NOT EXISTS push_subscriptions_owner_idx ON push_subscriptions(role, email);`);
    await exec(`CREATE INDEX IF NOT EXISTS consult_test_orders_request_idx ON consult_test_orders(request_id);`);
    await exec(`CREATE UNIQUE INDEX IF NOT EXISTS consult_test_orders_code_key ON consult_test_orders(code);`);
    await exec(`ALTER TABLE consult_patients
      ADD COLUMN IF NOT EXISTS risk_level TEXT NOT NULL DEFAULT 'none',
      ADD COLUMN IF NOT EXISTS risk_reason TEXT,
      ADD COLUMN IF NOT EXISTS risk_rated_at TIMESTAMP(3);`);
    await exec(`CREATE INDEX IF NOT EXISTS consult_patients_risk_idx ON consult_patients(doctor_email, risk_level);`);
    await exec(`CREATE INDEX IF NOT EXISTS consult_patients_pref_pharmacy_idx ON consult_patients(preferred_pharmacy_id);`);
    await exec(`CREATE INDEX IF NOT EXISTS consult_patients_pref_lab_idx ON consult_patients(preferred_lab_id);`);
    await exec(`ALTER TABLE patient_profiles
      ADD COLUMN IF NOT EXISTS state TEXT,
      ADD COLUMN IF NOT EXISTS city TEXT;`);
    await exec(`ALTER TABLE consult_patients
      ADD COLUMN IF NOT EXISTS risk_manual TEXT,
      ADD COLUMN IF NOT EXISTS risk_note TEXT,
      ADD COLUMN IF NOT EXISTS risk_set_by TEXT;`);
  } catch (err) {
    // Never block a request on this — the caller's own query will surface a
    // real problem, and the next call retries.
    console.error("[ensure-care-plan-schema]", err instanceof Error ? err.message : err);
    ensured = null;
  }
}
