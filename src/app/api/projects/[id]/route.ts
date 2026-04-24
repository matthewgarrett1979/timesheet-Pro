/**
 * GET    /api/projects/[id]  — fetch a project (ownership enforced)
 * PATCH  /api/projects/[id]  — update a project (ownership enforced)
 * DELETE /api/projects/[id]  — ADMIN only; cascade=true to force-delete all data
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { getProjectForUser } from "@/lib/authorization"
import { audit, getClientIp } from "@/lib/audit"
import { checkRateLimit } from "@/lib/rate-limit"
import { AuditAction, Role } from "@prisma/client"
import { z } from "zod"

const updateSchema = z.object({
  name:             z.string().trim().min(1).max(200).optional(),
  description:      z.string().trim().max(1000).optional(),
  active:           z.boolean().optional(),
  billingType:      z.enum(["TM", "DRAWDOWN", "FIXED"]).optional(),
  budgetHours:      z.number().positive().nullish(),
  contingencyHours: z.number().positive().nullish(),
  budgetValue:      z.number().positive().nullish(),
  drawdownRate:     z.number().positive().nullish(),
  rateOverride:     z.number().positive().nullish(),
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

  return NextResponse.json(project)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })

  const existing = await getProjectForUser(id, session.user.id, session.user.role as Role)
  if (!existing) {
    await audit({
      userId: session.user.id,
      action: AuditAction.UNAUTHORISED_ACCESS,
      resource: "project",
      resourceId: id,
      metadata: { action: "update" },
      ipAddress: getClientIp(req),
      success: false,
    })
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  let body: z.infer<typeof updateSchema>
  try {
    body = updateSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const updated = await db.project.update({
    where: { id },
    data: body,
    include: { client: { select: { id: true, name: true } } },
  })

  await audit({
    userId: session.user.id,
    action: AuditAction.PROJECT_UPDATED,
    resource: "project",
    resourceId: id,
    metadata: { changes: body },
    ipAddress: getClientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
    success: true,
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })
  if ((session.user.role as Role) !== Role.ADMIN) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const project = await db.project.findUnique({
    where: { id },
    include: { client: { select: { id: true, name: true } } },
  })
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const [timeEntryCount, phaseCount, poCount] = await Promise.all([
    db.timeEntry.count({ where: { projectId: id } }),
    db.projectPhase.count({ where: { projectId: id } }),
    db.purchaseOrder.count({ where: { projectId: id } }),
  ])
  const counts = { timeEntries: timeEntryCount, phases: phaseCount, purchaseOrders: poCount }

  let body: { cascade?: boolean } = {}
  try { body = await req.json() } catch { /* no body */ }

  const hasAssociations = Object.values(counts).some((n) => n > 0)
  if (hasAssociations && !body.cascade) {
    return NextResponse.json({ error: "Project has associated records.", counts }, { status: 409 })
  }

  if (body.cascade) {
    await db.$transaction([
      db.timeEntry.updateMany({ where: { projectId: id }, data: { projectId: null, phaseId: null, purchaseOrderId: null } }),
      db.projectPhase.deleteMany({ where: { projectId: id } }),
      // Project cascade → UserProject, PurchaseOrder, ResourceAllocation
      db.project.delete({ where: { id } }),
    ])
  } else {
    await db.project.delete({ where: { id } })
  }

  await audit({
    userId: session.user.id,
    action: AuditAction.PROJECT_DELETED,
    resource: "project",
    resourceId: id,
    metadata: { name: project.name, clientName: project.client.name, cascade: body.cascade ?? false, counts },
    ipAddress: getClientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
    success: true,
  })

  return new NextResponse(null, { status: 204 })
}
