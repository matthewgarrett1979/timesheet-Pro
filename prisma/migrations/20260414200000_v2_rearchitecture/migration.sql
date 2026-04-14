-- =============================================================================
-- v2.0.0-alpha — Full rearchitecture migration
--
-- Changes:
--   • New enums: TimeEntryStatus, TimesheetGranularity, BillingType, PhaseStatus
--   • New tables: TimeCategory (with seed data), ProjectPhase, TimeEntry
--   • TimeEntry replaces TimesheetEntry — data migrated, old table dropped
--   • Timesheet: weekStart → periodStart + periodEnd, add granularity/rejectionNote
--   • Project: add billingType + budget fields, remove old timesheetEntries relation
--   • User: add costRate
--   • AuditAction enum: add TIME_ENTRY_* values
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. New enums
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "TimeEntryStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TimesheetGranularity" AS ENUM ('WEEKLY', 'MONTHLY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BillingType" AS ENUM ('TM', 'DRAWDOWN', 'FIXED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PhaseStatus" AS ENUM ('ACTIVE', 'COMPLETE', 'ON_HOLD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Extend AuditAction enum with new time-entry values
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TIME_ENTRY_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TIME_ENTRY_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TIME_ENTRY_DELETED';

-- -----------------------------------------------------------------------------
-- 2. User: add costRate
-- -----------------------------------------------------------------------------

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "costRate" DECIMAL(10,2);

-- -----------------------------------------------------------------------------
-- 3. Project: add billing type and budget fields
-- -----------------------------------------------------------------------------

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "billingType"      "BillingType" NOT NULL DEFAULT 'TM';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "budgetHours"      DECIMAL(10,2);
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "contingencyHours" DECIMAL(10,2);
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "budgetValue"      DECIMAL(10,2);
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "drawdownRate"     DECIMAL(10,2);

-- -----------------------------------------------------------------------------
-- 4. TimeCategory — new lookup table with seed data
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "TimeCategory" (
  "id"         TEXT        NOT NULL,
  "name"       TEXT        NOT NULL,
  "colour"     TEXT        NOT NULL DEFAULT '#6366f1',
  "isBillable" BOOLEAN     NOT NULL DEFAULT true,
  "sortOrder"  INTEGER     NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimeCategory_pkey" PRIMARY KEY ("id")
);

INSERT INTO "TimeCategory" ("id", "name", "colour", "isBillable", "sortOrder")
VALUES
  ('cat_dev',     'Development',  '#3b82f6', true,  1),
  ('cat_meet',    'Meetings',     '#f59e0b', true,  2),
  ('cat_travel',  'Travel',       '#10b981', true,  3),
  ('cat_admin',   'Admin',        '#6b7280', false, 4),
  ('cat_consult', 'Consultancy',  '#8b5cf6', true,  5),
  ('cat_review',  'Review',       '#ef4444', true,  6)
ON CONFLICT ("id") DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5. ProjectPhase — new table
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "ProjectPhase" (
  "id"               TEXT         NOT NULL,
  "projectId"        TEXT         NOT NULL,
  "name"             TEXT         NOT NULL,
  "description"      TEXT,
  "billingType"      "BillingType" NOT NULL DEFAULT 'TM',
  "budgetHours"      DECIMAL(10,2),
  "contingencyHours" DECIMAL(10,2),
  "budgetValue"      DECIMAL(10,2),
  "startDate"        DATE,
  "endDate"          DATE,
  "status"           "PhaseStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectPhase_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "ProjectPhase"
    ADD CONSTRAINT "ProjectPhase_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "ProjectPhase_projectId_idx" ON "ProjectPhase"("projectId");

-- -----------------------------------------------------------------------------
-- 6. Timesheet: replace weekStart with periodStart/periodEnd, add new fields
-- -----------------------------------------------------------------------------

ALTER TABLE "Timesheet" ADD COLUMN IF NOT EXISTS "periodStart"   DATE;
ALTER TABLE "Timesheet" ADD COLUMN IF NOT EXISTS "periodEnd"     DATE;
ALTER TABLE "Timesheet" ADD COLUMN IF NOT EXISTS "granularity"   "TimesheetGranularity" NOT NULL DEFAULT 'WEEKLY';
ALTER TABLE "Timesheet" ADD COLUMN IF NOT EXISTS "rejectionNote" TEXT;

-- Backfill period columns from weekStart (weekly = Mon to Sun)
-- Guard: only runs if weekStart column still exists (idempotent — safe if already dropped)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'Timesheet'
      AND column_name  = 'weekStart'
  ) THEN
    UPDATE "Timesheet"
    SET
      "periodStart" = "weekStart"::DATE,
      "periodEnd"   = ("weekStart"::DATE + INTERVAL '6 days')::DATE
    WHERE "periodStart" IS NULL AND "weekStart" IS NOT NULL;

    ALTER TABLE "Timesheet" DROP COLUMN "weekStart";
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 7. TimeEntry — create table, migrate data from TimesheetEntry, drop old table
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "TimeEntry" (
  "id"          TEXT             NOT NULL,
  "date"        DATE             NOT NULL,
  "clientId"    TEXT,
  "projectId"   TEXT,
  "phaseId"     TEXT,
  "categoryId"  TEXT,
  "managerId"   TEXT,
  "timesheetId" TEXT,
  "hours"       DECIMAL(5,2)     NOT NULL,
  "description" TEXT             NOT NULL,
  "isBillable"  BOOLEAN          NOT NULL DEFAULT true,
  "status"      "TimeEntryStatus" NOT NULL DEFAULT 'DRAFT',
  "invoiced"    BOOLEAN          NOT NULL DEFAULT false,
  "receiptPath" TEXT,
  "createdAt"   TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- Migrate existing TimesheetEntry rows → TimeEntry
-- Guard: only runs if TimesheetEntry table still exists (idempotent — safe if already dropped)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'TimesheetEntry'
  ) THEN
    INSERT INTO "TimeEntry" (
      "id", "date", "clientId", "projectId", "managerId", "timesheetId",
      "hours", "description", "isBillable", "status", "invoiced",
      "receiptPath", "createdAt", "updatedAt"
    )
    SELECT
      te."id",
      te."date",
      ts."clientId",
      te."projectId",
      ts."managerId",
      te."timesheetId",
      te."hours",
      te."description",
      true,
      CASE ts."status"
        WHEN 'APPROVED'  THEN 'APPROVED' ::"TimeEntryStatus"
        WHEN 'SUBMITTED' THEN 'SUBMITTED'::"TimeEntryStatus"
        ELSE                  'DRAFT'    ::"TimeEntryStatus"
      END,
      false,
      te."receiptPath",
      te."createdAt",
      te."updatedAt"
    FROM "TimesheetEntry" te
    LEFT JOIN "Timesheet" ts ON te."timesheetId" = ts."id"
    ON CONFLICT ("id") DO NOTHING;
  END IF;
END $$;

-- Foreign key constraints on TimeEntry
DO $$ BEGIN
  ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_managerId_fkey"
    FOREIGN KEY ("managerId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_phaseId_fkey"
    FOREIGN KEY ("phaseId") REFERENCES "ProjectPhase"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "TimeCategory"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_timesheetId_fkey"
    FOREIGN KEY ("timesheetId") REFERENCES "Timesheet"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Indexes on TimeEntry
CREATE INDEX IF NOT EXISTS "TimeEntry_managerId_idx"   ON "TimeEntry"("managerId");
CREATE INDEX IF NOT EXISTS "TimeEntry_clientId_idx"    ON "TimeEntry"("clientId");
CREATE INDEX IF NOT EXISTS "TimeEntry_projectId_idx"   ON "TimeEntry"("projectId");
CREATE INDEX IF NOT EXISTS "TimeEntry_timesheetId_idx" ON "TimeEntry"("timesheetId");
CREATE INDEX IF NOT EXISTS "TimeEntry_date_idx"        ON "TimeEntry"("date");

-- Drop the old TimesheetEntry table (data migrated above)
DROP TABLE IF EXISTS "TimesheetEntry";
