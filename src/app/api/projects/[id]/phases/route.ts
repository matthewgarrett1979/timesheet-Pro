/**
 * GET  /api/projects/[id]/phases  — list phases for a project
 * POST /api/projects/[id]/phases  — create a new phase
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { getProjectForUser } from "@/lib/authorization"
import { audit, getClientIp } from "@/lib/audit"
import { checkRateLimit } from "@/lib/rate-limit"
import { AuditAction, BillingType, Role } from "@prisma/client"
import { z } from "zod"

const createSchema = z.object({
  name:             z.string().trim().min(1).max(200),
  description:      z.string().trim().max(1000).optional(),
  billingType:      z.enum(["TM", "DRAWDOWN", "FIXED"]).default("TM"),
  budgetHours:      z.number().positive().optional(),
  contingencyHours: z.number().positive().optional(),
  budgetValue:      z.number().positive().optional(),
  startDate:        z.string().datetime().optional(),
  endDate:          z.string().datetime().optional(),
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })

  const project = await getProjectForUser(id, session.user.id, session.user.role as Role)
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const phases = await db.projectPhase.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json(phases)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })

  const project = await getProjectForUser(id, session.user.id, session.user.role as Role)
  if (!project) {
    await audit({
      userId:    session.user.id,
      action:    AuditAction.UNAUTHORISED_ACCESS,
      resource:  "project-phase",
      metadata:  { projectId: id, action: "create" },
      ipAddress: getClientIp(req),
      success:   false,
    })
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  let body: z.infer<typeof createSchema>
  try {
    body = createSchema.parse(await req.json())
  } catch (err) {
    return NextResponse.json({ error: "Invalid request body", detail: err }, { status: 400 })
  }

  const phase = await db.projectPhase.create({
    data: {
      projectId:        id,
      name:             body.name,
      description:      body.description ?? null,
      billingType:      body.billingType as BillingType,
      budgetHours:      body.budgetHours      ?? null,
      contingencyHours: body.contingencyHours ?? null,
      budgetValue:      body.budgetValue      ?? null,
      startDate:        body.startDate ? new Date(body.startDate) : null,
      endDate:          body.endDate   ? new Date(body.endDate)   : null,
    },
  })

  await audit({
    userId:     session.user.id,
    action:     AuditAction.PROJECT_UPDATED,
    resource:   "project-phase",
    resourceId: phase.id,
    metadata:   { projectId: id, name: body.name },
    ipAddress:  getClientIp(req),
    userAgent:  req.headers.get("user-agent") ?? undefined,
    success:    true,
  })

  return NextResponse.json(phase, { status: 201 })
}
