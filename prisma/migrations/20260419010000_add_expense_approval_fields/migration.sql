-- Add approval workflow fields to Expense table

ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "billable"      BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "invoiced"      BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "submittedAt"   TIMESTAMPTZ;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "approvedById"  TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "approvedAt"    TIMESTAMPTZ;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "rejectionNote" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Expense_approvedById_fkey'
      AND table_name = 'Expense'
  ) THEN
    ALTER TABLE "Expense" ADD CONSTRAINT "Expense_approvedById_fkey"
      FOREIGN KEY ("approvedById") REFERENCES "User"(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Expense_status_idx" ON "Expense"("status");
