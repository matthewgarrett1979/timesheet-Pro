-- AlterEnum: Add AuditAction values added to schema after initial migration
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'USER_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'USER_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PROJECT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PROJECT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EXPENSE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EXPENSE_UPDATED';

-- CreateEnum: ExpenseStatus
CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateTable: Project
CREATE TABLE "Project" (
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

-- CreateTable: Expense
CREATE TABLE "Expense" (
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
ALTER TABLE "Client" ADD COLUMN "companyName"         TEXT;
ALTER TABLE "Client" ADD COLUMN "tradingName"         TEXT;
ALTER TABLE "Client" ADD COLUMN "addressLine1"        TEXT;
ALTER TABLE "Client" ADD COLUMN "addressLine2"        TEXT;
ALTER TABLE "Client" ADD COLUMN "city"                TEXT;
ALTER TABLE "Client" ADD COLUMN "county"              TEXT;
ALTER TABLE "Client" ADD COLUMN "postcode"            TEXT;
ALTER TABLE "Client" ADD COLUMN "country"             TEXT NOT NULL DEFAULT 'United Kingdom';
ALTER TABLE "Client" ADD COLUMN "vatNumber"           TEXT;
ALTER TABLE "Client" ADD COLUMN "contactName"         TEXT;
ALTER TABLE "Client" ADD COLUMN "contactEmail"        TEXT;
ALTER TABLE "Client" ADD COLUMN "contactPhone"        TEXT;
ALTER TABLE "Client" ADD COLUMN "purchaseOrderNumber" TEXT;
ALTER TABLE "Client" ADD COLUMN "invoicePaymentTerms" INTEGER;
ALTER TABLE "Client" ADD COLUMN "invoiceCurrency"     TEXT NOT NULL DEFAULT 'GBP';
ALTER TABLE "Client" ADD COLUMN "notes"               TEXT;

-- CreateIndex: Project
CREATE INDEX "Project_managerId_idx" ON "Project"("managerId");
CREATE INDEX "Project_clientId_idx" ON "Project"("clientId");

-- CreateIndex: Expense
CREATE INDEX "Expense_managerId_idx" ON "Expense"("managerId");
CREATE INDEX "Expense_clientId_idx" ON "Expense"("clientId");

-- AddForeignKey: Project
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Expense
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
