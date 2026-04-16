-- Add USER to Role enum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'USER';

-- Add TIMESHEET_DELETED and TIME_ENTRY_DELETED to AuditAction enum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TIMESHEET_DELETED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TIME_ENTRY_DELETED';

-- Add mustChangePassword to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- Create UserProject join table
CREATE TABLE IF NOT EXISTS "UserProject" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "projectId"  TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT NOT NULL,

    CONSTRAINT "UserProject_pkey" PRIMARY KEY ("id")
);

-- Foreign key: UserProject → User
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'UserProject_userId_fkey'
      AND table_name = 'UserProject'
  ) THEN
    ALTER TABLE "UserProject"
      ADD CONSTRAINT "UserProject_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Foreign key: UserProject → Project
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'UserProject_projectId_fkey'
      AND table_name = 'UserProject'
  ) THEN
    ALTER TABLE "UserProject"
      ADD CONSTRAINT "UserProject_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Unique constraint: one assignment per (user, project)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'UserProject_userId_projectId_key'
      AND table_name = 'UserProject'
  ) THEN
    ALTER TABLE "UserProject"
      ADD CONSTRAINT "UserProject_userId_projectId_key"
      UNIQUE ("userId", "projectId");
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "UserProject_userId_idx"    ON "UserProject" ("userId");
CREATE INDEX IF NOT EXISTS "UserProject_projectId_idx" ON "UserProject" ("projectId");
