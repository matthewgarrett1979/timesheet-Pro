-- =============================================================================
-- v2.5.0 — Approval workflow rework, reminder infrastructure, partial approval
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TimesheetStatus: add PARTIALLY_APPROVED
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  ALTER TYPE "TimesheetStatus" ADD VALUE 'PARTIALLY_APPROVED';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------------------------------------------------------
-- 2. AuditAction: add override and partial-approval audit values
-- -----------------------------------------------------------------------------

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'FORCE_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'FORCE_REJECTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RESET_TO_DRAFT';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PARTIALLY_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RESEND_EMAIL';

-- -----------------------------------------------------------------------------
-- 3. Timesheet: add reminderCount
-- -----------------------------------------------------------------------------

ALTER TABLE "Timesheet" ADD COLUMN IF NOT EXISTS "reminderCount" INTEGER NOT NULL DEFAULT 0;

-- -----------------------------------------------------------------------------
-- 4. AppSettings: add notification / reminder configuration columns
-- -----------------------------------------------------------------------------

ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "notificationsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "reminderThreshold"    INTEGER NOT NULL DEFAULT 35;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "reminderDayOfWeek"    INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "reminderTime"         TEXT    NOT NULL DEFAULT '17:00';

-- Extend ApprovalToken expiry from 7 days to 30 days for new tokens
-- (existing tokens keep their original expiresAt; only new inserts use 30 days)
-- No schema column change needed — expiresAt is computed at token creation time.
