-- Add organization domain, verification, and licence fields to AppSettings

ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "organizationDomain" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "domainVerifiedAt" TIMESTAMP(3);
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "domainVerificationToken" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "licenceSeats" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "feature_po" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "feature_resource_planning" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "feature_expenses" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "feature_xero" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "feature_onedrive" BOOLEAN NOT NULL DEFAULT false;
