-- AlterTable
ALTER TABLE "skin_consults" ADD COLUMN     "amount_paid" DECIMAL(12,2),
ADD COLUMN     "is_paid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paid_at" TIMESTAMP(3),
ADD COLUMN     "payment_reference" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "skin_consults_payment_reference_key" ON "skin_consults"("payment_reference");

-- CreateIndex
CREATE INDEX "skin_consults_is_paid_created_at_idx" ON "skin_consults"("is_paid", "created_at");

