-- Add PurchaseOrderStatus enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PurchaseOrderStatus') THEN
    CREATE TYPE "PurchaseOrderStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED', 'COMPLETED');
  END IF;
END $$;

-- Add new AuditAction values
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PO_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PO_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PO_DELETED';

-- Create PurchaseOrder table
CREATE TABLE IF NOT EXISTS "PurchaseOrder" (
    "id"               TEXT                  NOT NULL,
    "projectId"        TEXT                  NOT NULL,
    "phaseId"          TEXT,
    "poNumber"         TEXT                  NOT NULL,
    "sowReference"     TEXT,
    "description"      TEXT,
    "value"            DECIMAL(10,2),
    "currency"         TEXT                  NOT NULL DEFAULT 'GBP',
    "issueDate"        DATE,
    "expiryDate"       DATE,
    "status"           "PurchaseOrderStatus" NOT NULL DEFAULT 'ACTIVE',
    "sowSigned"        BOOLEAN               NOT NULL DEFAULT false,
    "poSigned"         BOOLEAN               NOT NULL DEFAULT false,
    "documentUrl"      TEXT,
    "documentFileName" TEXT,
    "notes"            TEXT,
    "createdById"      TEXT                  NOT NULL,
    "createdAt"        TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- FK: PurchaseOrder → Project
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'PurchaseOrder_projectId_fkey' AND table_name = 'PurchaseOrder'
  ) THEN
    ALTER TABLE "PurchaseOrder"
      ADD CONSTRAINT "PurchaseOrder_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- FK: PurchaseOrder → ProjectPhase (nullable)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'PurchaseOrder_phaseId_fkey' AND table_name = 'PurchaseOrder'
  ) THEN
    ALTER TABLE "PurchaseOrder"
      ADD CONSTRAINT "PurchaseOrder_phaseId_fkey"
      FOREIGN KEY ("phaseId") REFERENCES "ProjectPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- FK: PurchaseOrder → User (createdBy)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'PurchaseOrder_createdById_fkey' AND table_name = 'PurchaseOrder'
  ) THEN
    ALTER TABLE "PurchaseOrder"
      ADD CONSTRAINT "PurchaseOrder_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON UPDATE CASCADE;
  END IF;
END $$;

-- Indexes on PurchaseOrder
CREATE INDEX IF NOT EXISTS "PurchaseOrder_projectId_idx"   ON "PurchaseOrder" ("projectId");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_phaseId_idx"     ON "PurchaseOrder" ("phaseId");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_createdById_idx" ON "PurchaseOrder" ("createdById");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_status_idx"      ON "PurchaseOrder" ("status");

-- Add purchaseOrderId to TimeEntry (nullable)
ALTER TABLE "TimeEntry" ADD COLUMN IF NOT EXISTS "purchaseOrderId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'TimeEntry_purchaseOrderId_fkey' AND table_name = 'TimeEntry'
  ) THEN
    ALTER TABLE "TimeEntry"
      ADD CONSTRAINT "TimeEntry_purchaseOrderId_fkey"
      FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "TimeEntry_purchaseOrderId_idx" ON "TimeEntry" ("purchaseOrderId");

-- Add purchaseOrderId to Invoice (nullable)
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "purchaseOrderId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Invoice_purchaseOrderId_fkey' AND table_name = 'Invoice'
  ) THEN
    ALTER TABLE "Invoice"
      ADD CONSTRAINT "Invoice_purchaseOrderId_fkey"
      FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Invoice_purchaseOrderId_idx" ON "Invoice" ("purchaseOrderId");
