-- CreateTable
CREATE TABLE "skin_consults" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "patient_name" TEXT NOT NULL,
    "patient_email" TEXT NOT NULL,
    "patient_whatsapp" TEXT NOT NULL,
    "patient_age" INTEGER,
    "patient_sex" TEXT,
    "image_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "conversation" JSONB NOT NULL DEFAULT '[]',
    "ai_summary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "admin_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "skin_consults_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "skin_consults_code_key" ON "skin_consults"("code");

-- CreateIndex
CREATE INDEX "skin_consults_status_created_at_idx" ON "skin_consults"("status", "created_at");

-- CreateIndex
CREATE INDEX "skin_consults_patient_email_idx" ON "skin_consults"("patient_email");

