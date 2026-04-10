-- CreateTable TestKnowledgeBase
CREATE TABLE "test_knowledge_bases" (
    "id" TEXT NOT NULL,
    "canonical_name" TEXT NOT NULL,
    "synonyms" JSONB NOT NULL DEFAULT '[]',
    "variants" JSONB NOT NULL DEFAULT '[]',
    "category" TEXT,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "test_knowledge_bases_pkey" PRIMARY KEY ("id")
);

-- CreateTable LabTestKnowledgeBaseMapping
CREATE TABLE "lab_test_kb_mappings" (
    "id" TEXT NOT NULL,
    "lab_id" TEXT NOT NULL,
    "lab_test_name" TEXT NOT NULL,
    "knowledge_base_id" TEXT NOT NULL,
    "variants_available" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_test_kb_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "test_knowledge_bases_canonical_name_key" ON "test_knowledge_bases"("canonical_name");

-- CreateIndex
CREATE INDEX "test_knowledge_bases_canonical_name_idx" ON "test_knowledge_bases"("canonical_name");

-- CreateIndex
CREATE UNIQUE INDEX "lab_test_kb_mappings_lab_id_lab_test_name_key" ON "lab_test_kb_mappings"("lab_id", "lab_test_name");

-- CreateIndex
CREATE INDEX "lab_test_kb_mappings_lab_id_knowledge_base_id_idx" ON "lab_test_kb_mappings"("lab_id", "knowledge_base_id");

-- AddForeignKey
ALTER TABLE "lab_test_kb_mappings" ADD CONSTRAINT "lab_test_kb_mappings_lab_id_fkey" FOREIGN KEY ("lab_id") REFERENCES "labs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_test_kb_mappings" ADD CONSTRAINT "lab_test_kb_mappings_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "test_knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
