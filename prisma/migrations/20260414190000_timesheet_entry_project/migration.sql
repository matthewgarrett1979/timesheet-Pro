-- Add defaultRate to Client
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "defaultRate" DECIMAL(10,2);

-- Add rateOverride to Project
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "rateOverride" DECIMAL(10,2);

-- Add projectId to TimesheetEntry (nullable to preserve existing data)
ALTER TABLE "TimesheetEntry" ADD COLUMN IF NOT EXISTS "projectId" TEXT;

-- Add FK constraint idempotently
DO $$ BEGIN
  ALTER TABLE "TimesheetEntry"
    ADD CONSTRAINT "TimesheetEntry_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add index
CREATE INDEX IF NOT EXISTS "TimesheetEntry_projectId_idx" ON "TimesheetEntry"("projectId");
