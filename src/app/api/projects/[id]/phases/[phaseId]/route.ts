/**
 * PATCH  /api/projects/[id]/phases/[phaseId]  — update a phase
 * DELETE /api/projects/[id]/phases/[phaseId]  — delete a phase (only if no time entries)
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { getProjectForUser } from "@/lib/authorization"
import { audit, getClientIp } from "@/lib/audit"
import { checkRateLimit } from "@/lib/rate-limit"
import { AuditAction, BillingType, PhaseStatus, Role } from "@prisma/client"
import { z } from "zod"

const patchSchema = z.object({
  name:             z.string().trim().min(1).max(200).optional(),
  description:      z.string().trim().max(1000).optional(),
  billingType:      z.enum(["TM", "DRAWDOWN", "FIXED"]).optional(),
  budgetHours:      z.number().positive().nullish(),
  contingencyHours: z.number().positive().nullish(),
  budgetValue:      z.number().positive().nullish(),
  startDate:        z.string().datetime().nullish(),
  endDate:          z.string().datetime().nullish(),
  status:           z.enum(["ACTIVE", "COMPLETE", "ON_HOLD"]).optional(),
})

async function getPhaseWithOwnership(
  phaseId: string,
  projectId: string,
  userId: string,
  role: Role
) {
  const project = await getProjectForUser(projectId, userId, role)
  if (!project) return null

  return db.projectPhase.findFirst({
    where: { id: phaseId, projectId },
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; phaseId: string }> }
) {
  const { id, phaseId } = await params

  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })

  const phase = await getPhaseWithOwnership(phaseId, id, session.user.id, session.user.role as Role)
  if (!phase) {
    await audit({
      userId:    session.user.id,
      action:    AuditAction.UNAUTHORISED_ACCESS,
      resource:  "project-phase",
      resourceId: phaseId,
      metadata:  { projectId: id, action: "update" },
      ipAddress: getClientIp(req),
      success:   false,
    })
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  let body: z.infer<typeof patchSchema>
  try {
    body = patchSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const updated = await db.projectPhase.update({
    where: { id: phaseId },
    data: {
      ...(body.name             !== undefined ? { name:             body.name }                           : {}),
      ...(body.description      !== undefined ? { description:      body.description      ?? null }       : {}),
      ...(body.billingType      !== undefined ? { billingType:      body.billingType as BillingType }     : {}),
      ...(body.budgetHours      !== undefined ? { budgetHours:      body.budgetHours      ?? null }       : {}),
      ...(body.contingencyHours !== undefined ? { contingencyHours: body.contingencyHours ?? null }       : {}),
      ...(body.budgetValue      !== undefined ? { budgetValue:      body.budgetValue      ?? null }       : {}),
      ...(body.startDate        !== undefined ? { startDate:        body.startDate ? new Date(body.startDate) : null } : {}),
      ...(body.endDate          !== undefined ? { endDate:          body.endDate   ? new Date(body.endDate)   : null } : {}),
      ...(body.status           !== undefined ? { status:           body.status as PhaseStatus }          : {}),
    },
  })

  await audit({
    userId:     session.user.id,
    action:     AuditAction.PROJECT_UPDATED,
    resource:   "project-phase",
    resourceId: phaseId,
    metadata:   { projectId: id, changes: body },
    ipAddress:  getClientIp(req),
    userAgent:  req.headers.get("user-agent") ?? undefined,
    success:    true,
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; phaseId: string }> }
) {
  const { id, phaseId } = await params

  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })

  const phase = await getPhaseWithOwnership(phaseId, id, session.user.id, session.user.role as Role)
  if (!phase) {
    await audit({
      userId:    session.user.id,
      action:    AuditAction.UNAUTHORISED_ACCESS,
      resource:  "project-phase",
      resourceId: phaseId,
      metadata:  { projectId: id, action: "delete" },
      ipAddress: getClientIp(req),
      success:   false,
    })
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // Refuse if any time entries reference this phase
  const entryCount = await db.timeEntry.count({ where: { phaseId } })
  if (entryCount > 0) {
    return NextResponse.json(
      { error: `Cannot delete phase with ${entryCount} time ${entryCount === 1 ? "entry" : "entries"}` },
      { status: 409 }
    )
  }

  await db.projectPhase.delete({ where: { id: phaseId } })

  await audit({
    userId:     session.user.id,
    action:     AuditAction.PROJECT_UPDATED,
    resource:   "project-phase",
    resourceId: phaseId,
    metadata:   { projectId: id, name: phase.name },
    ipAddress:  getClientIp(req),
    userAgent:  req.headers.get("user-agent") ?? undefined,
    success:    true,
  })

  return new NextResponse(null, { status: 204 })
}
