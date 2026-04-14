-- CreateTable: global app appearance/theme settings (singleton row)
CREATE TABLE IF NOT EXISTS "AppSettings" (
    "id"              TEXT    NOT NULL DEFAULT 'global',
    "primaryColor"    TEXT    NOT NULL DEFAULT '#1e293b',
    "accentColor"     TEXT    NOT NULL DEFAULT '#2563eb',
    "backgroundColor" TEXT    NOT NULL DEFAULT '#f9fafb',
    "fontFamily"      TEXT    NOT NULL DEFAULT 'inter',
    "navStyle"        TEXT    NOT NULL DEFAULT 'sidebar',
    "compactMode"     BOOLEAN NOT NULL DEFAULT false,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- Seed the singleton row so reads always return a value
INSERT INTO "AppSettings" ("id", "updatedAt")
VALUES ('global', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
