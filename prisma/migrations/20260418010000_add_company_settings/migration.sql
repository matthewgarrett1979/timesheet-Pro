-- Add company, invoice, and bank settings fields to AppSettings

ALTER TABLE "AppSettings"
  ADD COLUMN IF NOT EXISTS "companyName"         TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "companyLegalName"     TEXT,
  ADD COLUMN IF NOT EXISTS "companyAddress"       TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "companyEmail"         TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "companyPhone"         TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "companyWebsite"       TEXT,
  ADD COLUMN IF NOT EXISTS "vatNumber"            TEXT,
  ADD COLUMN IF NOT EXISTS "vatRegistered"        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "companyRegNumber"     TEXT,
  ADD COLUMN IF NOT EXISTS "logoUrl"              TEXT,
  ADD COLUMN IF NOT EXISTS "bankName"             TEXT,
  ADD COLUMN IF NOT EXISTS "accountName"          TEXT,
  ADD COLUMN IF NOT EXISTS "sortCode"             TEXT,
  ADD COLUMN IF NOT EXISTS "accountNumber"        TEXT,
  ADD COLUMN IF NOT EXISTS "iban"                 TEXT,
  ADD COLUMN IF NOT EXISTS "swiftBic"             TEXT,
  ADD COLUMN IF NOT EXISTS "invoicePrefix"        TEXT    NOT NULL DEFAULT 'INV',
  ADD COLUMN IF NOT EXISTS "nextInvoiceNumber"    INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "defaultPaymentTerms"  INTEGER NOT NULL DEFAULT 30;
