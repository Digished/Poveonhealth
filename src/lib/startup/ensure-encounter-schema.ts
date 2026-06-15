import { prisma } from "@/lib/prisma";

let ensured: Promise<void> | null = null;

/**
 * Ensures the doctor per-encounter charging schema exists in the production
 * database (new doctor_profiles columns + encounters + doctor_patients).
 *
 * Vercel doesn't auto-run Prisma migrations, so this runs on server start AND
 * can be called defensively from the charging routes. Memoised per process so
 * repeated calls are free after the first. All statements use IF NOT EXISTS.
 *
 * @param force re-run even if already ensured this process (used by route retries)
 */
export async function ensureEncounterSchema(force = false): Promise<void> {
  if (ensured && !force) return ensured;
  ensured = runEnsure();
  return ensured;
}

async function runEnsure(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS bank_code TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS consultation_fee DECIMAL(12,2);
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS retainer_monthly DECIMAL(12,2);
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS retainer_yearly DECIMAL(12,2);
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS encounter_slug TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS paystack_subaccount_code TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS encounter_theme TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS encounter_show_workplace BOOLEAN NOT NULL DEFAULT true;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS doctor_profiles_encounter_slug_key ON doctor_profiles(encounter_slug);
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS encounters (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        doctor_email TEXT NOT NULL,
        patient_name TEXT NOT NULL,
        patient_email TEXT NOT NULL,
        patient_phone TEXT NOT NULL,
        patient_age INTEGER,
        patient_sex TEXT,
        image_urls TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        conversation JSONB NOT NULL DEFAULT '[]',
        ai_summary TEXT,
        plan_type TEXT NOT NULL DEFAULT 'single',
        status TEXT NOT NULL DEFAULT 'awaiting_payment',
        doctor_note TEXT,
        is_paid BOOLEAN NOT NULL DEFAULT false,
        amount_paid DECIMAL(12,2),
        doctor_share DECIMAL(12,2),
        poveon_share DECIMAL(12,2),
        payment_reference TEXT,
        paid_at TIMESTAMP(3),
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        responded_at TIMESTAMP(3)
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS encounters_code_key ON encounters(code);`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS encounters_payment_reference_key ON encounters(payment_reference);`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS encounters_doctor_email_created_at_idx ON encounters(doctor_email, created_at);`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS encounters_patient_email_idx ON encounters(patient_email);`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS encounters_status_created_at_idx ON encounters(status, created_at);`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS doctor_patients (
        id TEXT PRIMARY KEY,
        doctor_email TEXT NOT NULL,
        patient_email TEXT NOT NULL,
        patient_name TEXT,
        patient_phone TEXT,
        subscription_type TEXT NOT NULL DEFAULT 'none',
        subscription_expires_at TIMESTAMP(3),
        total_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
        encounter_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS doctor_patients_doctor_email_patient_email_key ON doctor_patients(doctor_email, patient_email);`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS doctor_patients_doctor_email_idx ON doctor_patients(doctor_email);`);

    await prisma.$executeRawUnsafe(`ALTER TABLE encounters ADD COLUMN IF NOT EXISTS coupon_code TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE encounters ADD COLUMN IF NOT EXISTS discount_percent INTEGER;`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS encounter_coupons (
        id TEXT PRIMARY KEY,
        doctor_email TEXT NOT NULL,
        code TEXT NOT NULL,
        percent_off INTEGER NOT NULL,
        active BOOLEAN NOT NULL DEFAULT true,
        times_used INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS encounter_coupons_doctor_email_code_key ON encounter_coupons(doctor_email, code);`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS encounter_coupons_doctor_email_idx ON encounter_coupons(doctor_email);`);

    console.log("[startup] ensure-encounter-schema: schema ready");
  } catch (err) {
    console.error("[startup] ensure-encounter-schema failed:", err);
    ensured = null; // allow a later call to retry
    throw err;
  }
}
