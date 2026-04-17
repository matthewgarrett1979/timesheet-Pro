/**
 * GET  /api/projects/[id]/purchase-orders  — list POs for a project
 * POST /api/projects/[id]/purchase-orders  — create a new PO (ADMIN/MANAGER only)
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

const createSchema = z.object({
  poNumber:        z.string().trim().min(1).max(100),
  sowReference:    z.string().trim().max(100).nullish(),
  description:     z.string().trim().max(1000).nullish(),
  value:           z.number().positive().nullish(),
  currency:        z.string().length(3).default("GBP"),
  issueDate:       z.string().nullish(),
  expiryDate:      z.string().nullish(),
  status:          z.nativeEnum(PurchaseOrderStatus).default(PurchaseOrderStatus.ACTIVE),
  sowSigned:       z.boolean().default(false),
  poSigned:        z.boolean().default(false),
  documentUrl:     z.string().url().nullish(),
  documentFileName: z.string().max(255).nullish(),
  notes:           z.string().trim().max(2000).nullish(),
  phaseId:         z.string().cuid().nullish(),
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

  const pos = await db.purchaseOrder.findMany({
    where: { projectId: id },
    include: {
      phase:     { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(pos)
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

  if (session.user.role === "USER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const project = await getProjectForUser(id, session.user.id, session.user.role as Role)
  if (!project) {
    await audit({
      userId: session.user.id,
      action: AuditAction.UNAUTHORISED_ACCESS,
      resource: "purchase-order",
      resourceId: id,
      metadata: { action: "create" },
      ipAddress: getClientIp(req),
      success: false,
    })
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  let body: z.infer<typeof createSchema>
  try {
    body = createSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const po = await db.purchaseOrder.create({
    data: {
      projectId:        id,
      phaseId:          body.phaseId        ?? null,
      poNumber:         body.poNumber,
      sowReference:     body.sowReference    ?? null,
      description:      body.description     ?? null,
      value:            body.value           ?? null,
      currency:         body.currency,
      issueDate:        body.issueDate  ? new Date(body.issueDate)  : null,
      expiryDate:       body.expiryDate ? new Date(body.expiryDate) : null,
      status:           body.status,
      sowSigned:        body.sowSigned,
      poSigned:         body.poSigned,
      documentUrl:      body.documentUrl      ?? null,
      documentFileName: body.documentFileName ?? null,
      notes:            body.notes            ?? null,
      createdById:      session.user.id,
    },
    include: {
      phase:     { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  })

  await audit({
    userId: session.user.id,
    action: AuditAction.PO_CREATED,
    resource: "purchase-order",
    resourceId: po.id,
    metadata: { projectId: id, poNumber: body.poNumber },
    ipAddress: getClientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
    success: true,
  })

  return NextResponse.json(po, { status: 201 })
}
