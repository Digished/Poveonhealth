-- Drop the master catalog tables — all pricing is now handled via lab_offered_tests
ALTER TABLE "lab_offered_tests" DROP COLUMN IF EXISTS "catalog_test_id";

DROP TABLE IF EXISTS "lab_test_prices" CASCADE;
DROP TABLE IF EXISTS "lab_category_prices" CASCADE;
DROP TABLE IF EXISTS "test_synonyms" CASCADE;
DROP TABLE IF EXISTS "catalog_tests" CASCADE;
DROP TABLE IF EXISTS "test_categories" CASCADE;
