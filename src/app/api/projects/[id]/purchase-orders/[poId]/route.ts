/**
 * GET    /api/projects/[id]/purchase-orders/[poId]  — fetch a single PO
 * PATCH  /api/projects/[id]/purchase-orders/[poId]  — update a PO (ADMIN/MANAGER only)
 * DELETE /api/projects/[id]/purchase-orders/[poId]  — delete a PO (ADMIN only)
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { getProjectForUser } from "@/lib/authorization"
import { audit, getClientIp } from "@/lib/audit"
import { checkRateLimit } from "@/lib/rate-limit"
import { AuditAction, PurchaseOrderStatus, Role } from "@prisma/client"
import { z } from "zod"

const updateSchema = z.object({
  poNumber:         z.string().trim().min(1).max(100).optional(),
  sowReference:     z.string().trim().max(100).nullish(),
  description:      z.string().trim().max(1000).nullish(),
  value:            z.number().positive().nullish(),
  currency:         z.string().length(3).optional(),
  issueDate:        z.string().nullish(),
  expiryDate:       z.string().nullish(),
  status:           z.nativeEnum(PurchaseOrderStatus).optional(),
  sowSigned:        z.boolean().optional(),
  poSigned:         z.boolean().optional(),
  documentUrl:      z.string().url().nullish(),
  documentFileName: z.string().max(255).nullish(),
  notes:            z.string().trim().max(2000).nullish(),
  phaseId:          z.string().cuid().nullish(),
})

async function resolvePo(projectId: string, poId: string, userId: string, role: Role) {
  const project = await getProjectForUser(projectId, userId, role)
  if (!project) return null
  return db.purchaseOrder.findFirst({ where: { id: poId, projectId } })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; poId: string }> }
) {
  const { id, poId } = await params

  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })

  const po = await resolvePo(id, poId, session.user.id, session.user.role as Role)
  if (!po) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const full = await db.purchaseOrder.findUnique({
    where: { id: poId },
    include: {
      phase:     { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json(full)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; poId: string }> }
) {
  const { id, poId } = await params

  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })

  if (session.user.role === "USER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const po = await resolvePo(id, poId, session.user.id, session.user.role as Role)
  if (!po) {
    await audit({
      userId: session.user.id,
      action: AuditAction.UNAUTHORISED_ACCESS,
      resource: "purchase-order",
      resourceId: poId,
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

  const updated = await db.purchaseOrder.update({
    where: { id: poId },
    data: {
      ...(body.poNumber         !== undefined ? { poNumber: body.poNumber }               : {}),
      ...(body.sowReference     !== undefined ? { sowReference: body.sowReference }       : {}),
      ...(body.description      !== undefined ? { description: body.description }         : {}),
      ...(body.value            !== undefined ? { value: body.value }                     : {}),
      ...(body.currency         !== undefined ? { currency: body.currency }               : {}),
      ...(body.issueDate        !== undefined ? { issueDate: body.issueDate ? new Date(body.issueDate) : null } : {}),
      ...(body.expiryDate       !== undefined ? { expiryDate: body.expiryDate ? new Date(body.expiryDate) : null } : {}),
      ...(body.status           !== undefined ? { status: body.status }                   : {}),
      ...(body.sowSigned        !== undefined ? { sowSigned: body.sowSigned }             : {}),
      ...(body.poSigned         !== undefined ? { poSigned: body.poSigned }               : {}),
      ...(body.documentUrl      !== undefined ? { documentUrl: body.documentUrl }         : {}),
      ...(body.documentFileName !== undefined ? { documentFileName: body.documentFileName } : {}),
      ...(body.notes            !== undefined ? { notes: body.notes }                     : {}),
      ...(body.phaseId          !== undefined ? { phaseId: body.phaseId }                 : {}),
    },
    include: {
      phase:     { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  })

  await audit({
    userId: session.user.id,
    action: AuditAction.PO_UPDATED,
    resource: "purchase-order",
    resourceId: poId,
    metadata: { changes: body },
    ipAddress: getClientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
    success: true,
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; poId: string }> }
) {
  const { id, poId } = await params

  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const po = await resolvePo(id, poId, session.user.id, session.user.role as Role)
  if (!po) {
    await audit({
      userId: session.user.id,
      action: AuditAction.UNAUTHORISED_ACCESS,
      resource: "purchase-order",
      resourceId: poId,
      metadata: { action: "delete" },
      ipAddress: getClientIp(req),
      success: false,
    })
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  await db.purchaseOrder.delete({ where: { id: poId } })

  await audit({
    userId: session.user.id,
    action: AuditAction.PO_DELETED,
    resource: "purchase-order",
    resourceId: poId,
    metadata: { projectId: id, poNumber: po.poNumber },
    ipAddress: getClientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
    success: true,
  })

  return new NextResponse(null, { status: 204 })
}
