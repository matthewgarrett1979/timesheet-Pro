-- Add soft-delete / archive flag to Client
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN NOT NULL DEFAULT false;

-- Add new audit action enum values
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CLIENT_DELETED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CLIENT_ARCHIVED';
