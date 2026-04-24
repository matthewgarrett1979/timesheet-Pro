/**
 * GET   /api/settings/organisation  — ADMIN: fetch org/domain/licence settings
 * PATCH /api/settings/organisation  — ADMIN: update licence seats and features
 *
 * organizationDomain is read-only after initial setup.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { checkRateLimit } from "@/lib/rate-limit"
import { Role } from "@prisma/client"
import { z } from "zod"

const patchSchema = z.object({
  licenceSeats:             z.number().int().min(1).max(9999).optional(),
  feature_po:               z.boolean().optional(),
  feature_resource_planning: z.boolean().optional(),
  feature_expenses:         z.boolean().optional(),
  feature_xero:             z.boolean().optional(),
  feature_onedrive:         z.boolean().optional(),
})

export async function GET(req: NextRequest) {
  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })
  if ((session.user.role as Role) !== Role.ADMIN) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const settings = await db.appSettings.findUnique({
    where: { id: "global" },
    select: {
      organizationDomain:       true,
      domainVerifiedAt:         true,
      domainVerificationToken:  true,
      licenceSeats:             true,
      feature_po:               true,
      feature_resource_planning: true,
      feature_expenses:         true,
      feature_xero:             true,
      feature_onedrive:         true,
    },
  })

  // Count active users for seat usage
  const usedSeats = await db.user.count()

  return NextResponse.json({ ...settings, usedSeats })
}

export async function PATCH(req: NextRequest) {
  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })
  if ((session.user.role as Role) !== Role.ADMIN) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let body: z.infer<typeof patchSchema>
  try {
    body = patchSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const updated = await db.appSettings.update({
    where: { id: "global" },
    data:  body,
    select: {
      organizationDomain:       true,
      domainVerifiedAt:         true,
      licenceSeats:             true,
      feature_po:               true,
      feature_resource_planning: true,
      feature_expenses:         true,
      feature_xero:             true,
      feature_onedrive:         true,
    },
  })

  return NextResponse.json(updated)
}
