-- Radiology / Imaging departments never collect a sample — ensure they use the
-- imaging pipeline even when previously saved with the default specimen pipeline.
UPDATE "lab_departments" SET "workflow" = 'imaging'
WHERE "workflow" IS DISTINCT FROM 'imaging'
  AND (lower("name") LIKE '%radiolog%' OR lower("name") LIKE '%imaging%');

-- Backfill any missing workflow to the specimen default.
UPDATE "lab_departments" SET "workflow" = 'specimen'
WHERE "workflow" IS NULL OR "workflow" = '';
