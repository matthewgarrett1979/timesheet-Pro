/**
 * GET  /api/projects   — list projects (row-level scoped)
 * POST /api/projects   — create a new project
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { listProjectsForUser, getClientForUser } from "@/lib/authorization"
import { audit, getClientIp } from "@/lib/audit"
import { checkRateLimit } from "@/lib/rate-limit"
import { AuditAction, Role } from "@prisma/client"
import { z } from "zod"

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
  clientId: z.string().cuid("Invalid client ID"),
  // Billing
  billingType:      z.enum(["TM", "DRAWDOWN", "FIXED"]).optional(),
  rateOverride:     z.number().positive().nullish(),
  drawdownRate:     z.number().positive().nullish(),
  budgetHours:      z.number().positive().nullish(),
  contingencyHours: z.number().positive().nullish(),
  budgetValue:      z.number().positive().nullish(),
})

export async function GET(req: NextRequest) {
  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })

  const { searchParams } = req.nextUrl
  const projects = await listProjectsForUser(
    session.user.id,
    session.user.role as Role,
    {
      clientId: searchParams.get("clientId") ?? undefined,
      active: searchParams.has("active")
        ? searchParams.get("active") === "true"
        : undefined,
    }
  )

  return NextResponse.json(projects)
}

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })

  let body: z.infer<typeof createSchema>
  try {
    body = createSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  // Verify caller owns the target client
  const client = await getClientForUser(
    body.clientId,
    session.user.id,
    session.user.role as Role
  )
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 })
  }

  const project = await db.project.create({
    data: {
      name: body.name,
      description: body.description,
      clientId: body.clientId,
      managerId: session.user.id,
      billingType:      body.billingType,
      rateOverride:     body.rateOverride,
      drawdownRate:     body.drawdownRate,
      budgetHours:      body.budgetHours,
      contingencyHours: body.contingencyHours,
      budgetValue:      body.budgetValue,
    },
    include: { client: { select: { id: true, name: true } } },
  })

  await audit({
    userId: session.user.id,
    action: AuditAction.PROJECT_CREATED,
    resource: "project",
    resourceId: project.id,
    metadata: { name: project.name, clientId: body.clientId },
    ipAddress: getClientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
    success: true,
  })

  return NextResponse.json(project, { status: 201 })
}
