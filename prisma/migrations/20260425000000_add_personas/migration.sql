-- CreateEnum
CREATE TYPE "PersonaCompanySize" AS ENUM ('SIZE_0_10', 'SIZE_11_50', 'SIZE_51_250', 'SIZE_250_PLUS');

-- CreateTable
CREATE TABLE "Persona" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "minCompanySize" "PersonaCompanySize" NOT NULL DEFAULT 'SIZE_0_10',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Persona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonaPermission" (
    "personaId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "PersonaPermission_pkey" PRIMARY KEY ("personaId","permissionId")
);

-- AlterTable: add personaId to User (nullable, no default)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "personaId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Persona_key_key" ON "Persona"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_personaId_fkey"
    FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaPermission" ADD CONSTRAINT "PersonaPermission_personaId_fkey"
    FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaPermission" ADD CONSTRAINT "PersonaPermission_permissionId_fkey"
    FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
