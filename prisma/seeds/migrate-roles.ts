import { PrismaClient, Role } from "@prisma/client"

export const ROLE_TO_PERSONA: Record<string, string> = {
  ADMIN:   "company_admin",
  MANAGER: "project_manager",
  USER:    "consultant",
}

export async function migrateRolesToPersonas(db: PrismaClient) {
  console.log("  Migrating existing users to personas…")
  let total = 0

  for (const [role, personaKey] of Object.entries(ROLE_TO_PERSONA)) {
    const persona = await db.persona.findUnique({ where: { key: personaKey } })
    if (!persona) {
      console.warn(`    ⚠ Persona '${personaKey}' not found — skipping role ${role}`)
      continue
    }

    const result = await db.user.updateMany({
      where: { role: role as Role, personaId: null },
      data:  { personaId: persona.id },
    })
    console.log(`    ✓ ${role} → ${personaKey} (${result.count} users updated)`)
    total += result.count
  }

  console.log(`  ✓ ${total} users assigned to personas`)
}

export async function promoteFirstAdminToOwner(db: PrismaClient) {
  const firstAdmin = await db.user.findFirst({
    where:   { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
  })
  const ownerPersona = await db.persona.findUnique({ where: { key: "company_owner" } })

  if (!firstAdmin || !ownerPersona) return

  // Guard: do not override a previously-set persona
  if (firstAdmin.personaId) {
    console.log("  ℹ First admin already has a persona — skipping owner promotion")
    return
  }

  await db.user.update({
    where: { id: firstAdmin.id },
    data:  { personaId: ownerPersona.id },
  })
  console.log(`  ✓ Promoted first admin (${firstAdmin.email}) to Company Owner`)
}
