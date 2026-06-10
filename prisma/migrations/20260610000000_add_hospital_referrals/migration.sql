-- AlterTable
ALTER TABLE "hospitals" ADD COLUMN     "address" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "pin_hash" TEXT,
ADD COLUMN     "specialties" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "state" TEXT;

-- CreateTable
CREATE TABLE "hospital_otps" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hospital_otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospital_sessions" (
    "id" TEXT NOT NULL,
    "hospital_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hospital_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospital_doctors" (
    "id" TEXT NOT NULL,
    "hospital_id" TEXT NOT NULL,
    "doctor_email" TEXT NOT NULL,
    "doctor_name" TEXT,
    "added_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hospital_doctors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "patient_name" TEXT NOT NULL,
    "patient_age" INTEGER,
    "patient_sex" TEXT,
    "patient_phone" TEXT NOT NULL,
    "patient_email" TEXT,
    "hospital_number" TEXT,
    "doctor_email" TEXT NOT NULL,
    "doctor_name" TEXT NOT NULL,
    "doctor_phone" TEXT,
    "from_hospital" TEXT NOT NULL,
    "to_hospital_id" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "urgency" TEXT NOT NULL DEFAULT 'routine',
    "clinical_note" TEXT NOT NULL,
    "provisional_diagnosis" TEXT,
    "response_note" TEXT,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_events" (
    "id" TEXT NOT NULL,
    "referral_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_label" TEXT NOT NULL,
    "from_hospital_id" TEXT,
    "to_hospital_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hospital_otps_email_idx" ON "hospital_otps"("email");

-- CreateIndex
CREATE INDEX "hospital_sessions_hospital_id_idx" ON "hospital_sessions"("hospital_id");

-- CreateIndex
CREATE INDEX "hospital_doctors_doctor_email_idx" ON "hospital_doctors"("doctor_email");

-- CreateIndex
CREATE UNIQUE INDEX "hospital_doctors_hospital_id_doctor_email_key" ON "hospital_doctors"("hospital_id", "doctor_email");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_code_key" ON "referrals"("code");

-- CreateIndex
CREATE INDEX "referrals_to_hospital_id_status_idx" ON "referrals"("to_hospital_id", "status");

-- CreateIndex
CREATE INDEX "referrals_doctor_email_idx" ON "referrals"("doctor_email");

-- CreateIndex
CREATE INDEX "referrals_patient_phone_idx" ON "referrals"("patient_phone");

-- CreateIndex
CREATE INDEX "referral_events_referral_id_created_at_idx" ON "referral_events"("referral_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "hospitals_email_key" ON "hospitals"("email");

-- AddForeignKey
ALTER TABLE "hospital_doctors" ADD CONSTRAINT "hospital_doctors_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_to_hospital_id_fkey" FOREIGN KEY ("to_hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_events" ADD CONSTRAINT "referral_events_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "referrals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

