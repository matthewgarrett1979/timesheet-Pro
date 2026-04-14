/**
 * GET  /api/categories  — list all TimeCategory entries (sorted by sortOrder)
 * POST /api/categories  — create a new TimeCategory (ADMIN only)
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { audit, getClientIp } from "@/lib/audit"
import { checkRateLimit } from "@/lib/rate-limit"
import { AuditAction, Role } from "@prisma/client"
import { z } from "zod"

const createSchema = z.object({
  name:       z.string().trim().min(1).max(100),
  colour:     z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex colour e.g. #3b82f6").default("#6366f1"),
  isBillable: z.boolean().default(true),
  sortOrder:  z.number().int().min(0).default(0),
})

export async function GET(req: NextRequest) {
  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })

  const categories = await db.timeCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  })

  return NextResponse.json(categories)
}

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })

  // Only ADMINs may create categories
  if (session.user.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: z.infer<typeof createSchema>
  try {
    body = createSchema.parse(await req.json())
  } catch (err) {
    return NextResponse.json({ error: "Invalid request body", detail: err }, { status: 400 })
  }

  const category = await db.timeCategory.create({
    data: {
      name:       body.name,
      colour:     body.colour,
      isBillable: body.isBillable,
      sortOrder:  body.sortOrder,
    },
  })

  await audit({
    userId:     session.user.id,
    action:     AuditAction.ADMIN_ACTION,
    resource:   "time-category",
    resourceId: category.id,
    metadata:   { name: body.name },
    ipAddress:  getClientIp(req),
    userAgent:  req.headers.get("user-agent") ?? undefined,
    success:    true,
  })

  return NextResponse.json(category, { status: 201 })
}
