-- Allow doctor_email to be NULL for self-service patient requests
ALTER TABLE "requests" ALTER COLUMN "doctor_email" DROP NOT NULL;
