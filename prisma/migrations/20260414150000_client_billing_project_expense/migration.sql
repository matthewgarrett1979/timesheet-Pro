-- AlterEnum: Add AuditAction values added to schema after initial migration
-- IF NOT EXISTS prevents errors if a previous prisma db push already added them
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'USER_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'USER_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PROJECT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PROJECT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EXPENSE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EXPENSE_UPDATED';

-- CreateEnum: ExpenseStatus (safe if already exists from a prior db push)
DO $$ BEGIN
  CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateTable: Project (safe if already exists)
CREATE TABLE IF NOT EXISTS "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "clientId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Expense (safe if already exists)
CREATE TABLE IF NOT EXISTS "Expense" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "date" DATE NOT NULL,
    "category" TEXT NOT NULL,
    "receiptPath" TEXT,
    "managerId" TEXT NOT NULL,
    "clientId" TEXT,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Add UK B2B invoice billing fields to Client
-- ADD COLUMN IF NOT EXISTS is safe to re-run
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "companyName"         TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "tradingName"         TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "addressLine1"        TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "addressLine2"        TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "city"                TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "county"              TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "postcode"            TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "country"             TEXT NOT NULL DEFAULT 'United Kingdom';
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "vatNumber"           TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "contactName"         TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "contactEmail"        TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "contactPhone"        TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "purchaseOrderNumber" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "invoicePaymentTerms" INTEGER;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "invoiceCurrency"     TEXT NOT NULL DEFAULT 'GBP';
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "notes"               TEXT;

-- CreateIndex: Project (safe to re-run)
CREATE INDEX IF NOT EXISTS "Project_managerId_idx" ON "Project"("managerId");
CREATE INDEX IF NOT EXISTS "Project_clientId_idx" ON "Project"("clientId");

-- CreateIndex: Expense (safe to re-run)
CREATE INDEX IF NOT EXISTS "Expense_managerId_idx" ON "Expense"("managerId");
CREATE INDEX IF NOT EXISTS "Expense_clientId_idx" ON "Expense"("clientId");

-- AddForeignKey: Project (DO block avoids error if constraint already exists)
DO $$ BEGIN
  ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "Project" ADD CONSTRAINT "Project_managerId_fkey"
    FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: Expense
DO $$ BEGIN
  ALTER TABLE "Expense" ADD CONSTRAINT "Expense_managerId_fkey"
    FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "Expense" ADD CONSTRAINT "Expense_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
