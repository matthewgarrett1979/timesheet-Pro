-- v3.0.0 migration: PurchaseOrder, ResourceAllocation, AppSettings company/bank fields
-- All statements are idempotent and safe to re-run.

-- ---------------------------------------------------------------------------
-- Enums (ADD VALUE IF NOT EXISTS is idempotent in PostgreSQL 9.1+)
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PurchaseOrderStatus') THEN
    CREATE TYPE "PurchaseOrderStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED', 'COMPLETED');
  END IF;
END $$;

DO $$ BEGIN
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PO_CREATED';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PO_UPDATED';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PO_DELETED';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RESOURCE_ALLOCATED';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RESOURCE_DEALLOCATED';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- PurchaseOrder table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "PurchaseOrder" (
  "id"               TEXT NOT NULL,
  "projectId"        TEXT NOT NULL,
  "phaseId"          TEXT,
  "poNumber"         TEXT,
  "sowReference"     TEXT,
  "description"      TEXT,
  "value"            DECIMAL(12,2),
  "currency"         TEXT NOT NULL DEFAULT 'GBP',
  "issueDate"        DATE,
  "expiryDate"       DATE,
  "status"           "PurchaseOrderStatus" NOT NULL DEFAULT 'ACTIVE',
  "sowSigned"        BOOLEAN NOT NULL DEFAULT false,
  "poSigned"         BOOLEAN NOT NULL DEFAULT false,
  "documentUrl"      TEXT,
  "documentFileName" TEXT,
  "notes"            TEXT,
  "createdById"      TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseOrder_projectId_fkey') THEN
    ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseOrder_phaseId_fkey') THEN
    ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_phaseId_fkey"
      FOREIGN KEY ("phaseId") REFERENCES "ProjectPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseOrder_createdById_fkey') THEN
    ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "PurchaseOrder_projectId_idx"   ON "PurchaseOrder"("projectId");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_phaseId_idx"     ON "PurchaseOrder"("phaseId");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_createdById_idx" ON "PurchaseOrder"("createdById");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_status_idx"      ON "PurchaseOrder"("status");

-- ---------------------------------------------------------------------------
-- ResourceAllocation table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "ResourceAllocation" (
  "id"           TEXT NOT NULL,
  "projectId"    TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "date"         DATE NOT NULL,
  "plannedHours" DECIMAL(5,2) NOT NULL,
  "notes"        TEXT,
  "createdById"  TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ResourceAllocation_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ResourceAllocation_projectId_userId_date_key') THEN
    ALTER TABLE "ResourceAllocation"
      ADD CONSTRAINT "ResourceAllocation_projectId_userId_date_key"
      UNIQUE ("projectId", "userId", "date");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ResourceAllocation_projectId_fkey') THEN
    ALTER TABLE "ResourceAllocation" ADD CONSTRAINT "ResourceAllocation_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ResourceAllocation_userId_fkey') THEN
    ALTER TABLE "ResourceAllocation" ADD CONSTRAINT "ResourceAllocation_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ResourceAllocation_createdById_fkey') THEN
    ALTER TABLE "ResourceAllocation" ADD CONSTRAINT "ResourceAllocation_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ResourceAllocation_projectId_idx" ON "ResourceAllocation"("projectId");
CREATE INDEX IF NOT EXISTS "ResourceAllocation_userId_idx"    ON "ResourceAllocation"("userId");
CREATE INDEX IF NOT EXISTS "ResourceAllocation_date_idx"      ON "ResourceAllocation"("date");

-- ---------------------------------------------------------------------------
-- TimeEntry: add purchaseOrderId column
-- ---------------------------------------------------------------------------

ALTER TABLE "TimeEntry" ADD COLUMN IF NOT EXISTS "purchaseOrderId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TimeEntry_purchaseOrderId_fkey') THEN
    ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_purchaseOrderId_fkey"
      FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "TimeEntry_purchaseOrderId_idx" ON "TimeEntry"("purchaseOrderId");

-- ---------------------------------------------------------------------------
-- Invoice: add purchaseOrderId column
-- ---------------------------------------------------------------------------

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "purchaseOrderId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_purchaseOrderId_fkey') THEN
    ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_purchaseOrderId_fkey"
      FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Invoice_purchaseOrderId_idx" ON "Invoice"("purchaseOrderId");

-- ---------------------------------------------------------------------------
-- AppSettings: add company / bank detail columns
-- ---------------------------------------------------------------------------

ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "companyName"         TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "companyLegalName"    TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "companyAddress"      TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "companyEmail"        TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "companyPhone"        TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "companyWebsite"      TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "vatNumber"           TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "vatRegistered"       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "companyRegNumber"    TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "bankName"            TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "accountName"         TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "sortCode"            TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "accountNumber"       TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "iban"                TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "swiftBic"            TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "defaultPaymentTerms" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "invoicePrefix"       TEXT NOT NULL DEFAULT 'INV';
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "nextInvoiceNumber"   INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "logoUrl"             TEXT;
