-- CreateTable ResourceAllocation

CREATE TABLE IF NOT EXISTS "ResourceAllocation" (
    "id"           TEXT        NOT NULL,
    "projectId"    TEXT        NOT NULL,
    "userId"       TEXT        NOT NULL,
    "date"         DATE        NOT NULL,
    "plannedHours" DECIMAL(5,2) NOT NULL,
    "notes"        TEXT,
    "createdById"  TEXT        NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceAllocation_pkey" PRIMARY KEY ("id")
);

-- Unique constraint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ResourceAllocation_projectId_userId_date_key'
  ) THEN
    ALTER TABLE "ResourceAllocation"
      ADD CONSTRAINT "ResourceAllocation_projectId_userId_date_key"
      UNIQUE ("projectId", "userId", "date");
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "ResourceAllocation_projectId_idx" ON "ResourceAllocation"("projectId");
CREATE INDEX IF NOT EXISTS "ResourceAllocation_userId_idx"    ON "ResourceAllocation"("userId");
CREATE INDEX IF NOT EXISTS "ResourceAllocation_date_idx"      ON "ResourceAllocation"("date");

-- Foreign keys
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ResourceAllocation_projectId_fkey'
  ) THEN
    ALTER TABLE "ResourceAllocation"
      ADD CONSTRAINT "ResourceAllocation_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ResourceAllocation_userId_fkey'
  ) THEN
    ALTER TABLE "ResourceAllocation"
      ADD CONSTRAINT "ResourceAllocation_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ResourceAllocation_createdById_fkey'
  ) THEN
    ALTER TABLE "ResourceAllocation"
      ADD CONSTRAINT "ResourceAllocation_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT;
  END IF;
END $$;
