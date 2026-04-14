-- AlterTable: Add approval workflow settings to Client
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "approvalType"        TEXT NOT NULL DEFAULT 'EMAIL';
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "approvalGranularity" TEXT NOT NULL DEFAULT 'TIMESHEET';
