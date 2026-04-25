/**
 * Database seed — idempotent, safe to re-run at any time.
 *
 * Execution order:
 *   1. seedPermissions        — upserts all 60 Permission rows
 *   2. seedPersonas           — upserts 7 Persona rows + PersonaPermission junctions
 *   3. migrateRolesToPersonas — backfills User.personaId for existing users
 *   4. promoteFirstAdminToOwner — assigns Company Owner persona to the earliest
 *                                 ADMIN who has no personaId yet (idempotent)
 *   5. seedAdminUser          — upserts the initial ADMIN user (original behaviour)
 *
 * Environment variables (all optional):
 *   SEED_ADMIN_EMAIL     — defaults to admin@timesheet.local
 *   SEED_ADMIN_PASSWORD  — if absent, a secure random password is generated
 */
import { PrismaClient } from "@prisma/client"
import argon2 from "argon2"
import { randomBytes } from "crypto"
import { seedPermissions } from "./seeds/permissions"
import { seedPersonas } from "./seeds/personas"
import { migrateRolesToPersonas, promoteFirstAdminToOwner } from "./seeds/migrate-roles"

const db = new PrismaClient()

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
} satisfies argon2.Options

async function seedAdminUser() {
  const email     = process.env.SEED_ADMIN_EMAIL ?? "admin@timesheet.local"
  const supplied  = process.env.SEED_ADMIN_PASSWORD
  const password  = supplied ?? randomBytes(18).toString("base64url")
  const generated = !supplied

  const passwordHash = await argon2.hash(password, ARGON2_OPTIONS)

  const user = await db.user.upsert({
    where:  { email },
    update: {},
    create: {
      email,
      name:         "Administrator",
      passwordHash,
      role:         "ADMIN",
    },
  })

  console.log("\n✅  Admin user ready")
  console.log(`   ID:    ${user.id}`)
  console.log(`   Email: ${user.email}`)
  if (generated) {
    console.log(`   Password (generated — save this now): ${password}`)
  } else {
    console.log("   Password: (as supplied via SEED_ADMIN_PASSWORD)")
  }
  console.log("\n   Next: log in, then go to Account → Security to enable MFA.\n")
}

async function main() {
  console.log("\n── Seeding database ───────────────────────────────────────")

  console.log("\n[1/5] Permissions")
  await seedPermissions(db)

  console.log("\n[2/5] Personas")
  await seedPersonas(db)

  console.log("\n[3/5] Role → Persona migration")
  await migrateRolesToPersonas(db)

  console.log("\n[4/5] First admin → Company Owner promotion")
  await promoteFirstAdminToOwner(db)

  console.log("\n[5/5] Admin user")
  await seedAdminUser()

  console.log("\n── Seed complete ──────────────────────────────────────────\n")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
