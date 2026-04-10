-- CreateTable LabSynonymGenerationJob
CREATE TABLE "lab_synonym_generation_jobs" (
    "id" TEXT NOT NULL,
    "lab_id" TEXT NOT NULL,
    "total_tests" INTEGER NOT NULL,
    "completed_tests" INTEGER NOT NULL DEFAULT 0,
    "failed_tests" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "error_message" TEXT,
    "initiated_by" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_synonym_generation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable LabSynonymGenerationTestResult
CREATE TABLE "lab_synonym_generation_test_results" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "test_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "generated_synonyms" JSONB,
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "last_attempted_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_synonym_generation_test_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lab_synonym_generation_jobs_lab_id_status_idx" ON "lab_synonym_generation_jobs"("lab_id", "status");

-- CreateIndex
CREATE INDEX "lab_synonym_generation_jobs_status_idx" ON "lab_synonym_generation_jobs"("status");

-- CreateIndex
CREATE INDEX "lab_synonym_generation_jobs_started_at_idx" ON "lab_synonym_generation_jobs"("started_at");

-- CreateIndex
CREATE UNIQUE INDEX "lab_synonym_generation_test_results_job_id_test_id_key" ON "lab_synonym_generation_test_results"("job_id", "test_id");

-- CreateIndex
CREATE INDEX "lab_synonym_generation_test_results_job_id_status_idx" ON "lab_synonym_generation_test_results"("job_id", "status");

-- CreateIndex
CREATE INDEX "lab_synonym_generation_test_results_status_idx" ON "lab_synonym_generation_test_results"("status");

-- AddForeignKey
ALTER TABLE "lab_synonym_generation_jobs" ADD CONSTRAINT "lab_synonym_generation_jobs_lab_id_fkey" FOREIGN KEY ("lab_id") REFERENCES "labs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_synonym_generation_test_results" ADD CONSTRAINT "lab_synonym_generation_test_results_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "lab_synonym_generation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
