/**
 * Database seed — creates the initial ADMIN user.
 *
 * Usage (run once after `prisma migrate deploy`):
 *   npx prisma db seed
 *
 * Credentials are read from environment variables so they are never
 * hard-coded. If the vars are absent a secure random password is generated
 * and printed to stdout — copy it before it scrolls away.
 *
 *   SEED_ADMIN_EMAIL=admin@example.com \
 *   SEED_ADMIN_PASSWORD=MyStr0ngP@ss \
 *   npx prisma db seed
 */
import { PrismaClient } from "@prisma/client"
import argon2 from "argon2"
import { randomBytes } from "crypto"

const db = new PrismaClient()

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
} satisfies argon2.Options

async function main() {
  const email =
    process.env.SEED_ADMIN_EMAIL ?? "admin@timesheet.local"

  // Use supplied password or generate a strong random one
  const supplied = process.env.SEED_ADMIN_PASSWORD
  const password = supplied ?? randomBytes(18).toString("base64url")
  const generated = !supplied

  const passwordHash = await argon2.hash(password, ARGON2_OPTIONS)

  const user = await db.user.upsert({
    where: { email },
    update: {}, // don't overwrite an existing admin
    create: {
      email,
      name: "Administrator",
      passwordHash,
      role: "ADMIN",
    },
  })

  console.log("\n✅  Admin user ready")
  console.log(`   ID:    ${user.id}`)
  console.log(`   Email: ${user.email}`)
  if (generated) {
    console.log(`   Password (generated — save this now): ${password}`)
  } else {
    console.log(`   Password: (as supplied via SEED_ADMIN_PASSWORD)`)
  }
  console.log(
    "\n   Next: log in, then go to Account → Security to enable MFA.\n"
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
