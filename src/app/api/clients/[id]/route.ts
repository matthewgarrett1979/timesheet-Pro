/**
 * GET   /api/clients/[id]  — fetch a single client (ownership enforced)
 * PATCH /api/clients/[id]  — update a client (ownership enforced)
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { getClientForUser } from "@/lib/authorization"
import { audit, getClientIp } from "@/lib/audit"
import { checkRateLimit } from "@/lib/rate-limit"
import { AuditAction, Role } from "@prisma/client"
import { z } from "zod"

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  reference: z.string().trim().max(50).nullish(),
  // Company Details
  companyName: z.string().trim().max(200).nullish(),
  tradingName: z.string().trim().max(200).nullish(),
  addressLine1: z.string().trim().max(200).nullish(),
  addressLine2: z.string().trim().max(200).nullish(),
  city: z.string().trim().max(100).nullish(),
  county: z.string().trim().max(100).nullish(),
  postcode: z.string().trim().max(20).nullish(),
  country: z.string().trim().max(100).optional(),     // non-nullable in DB, has default
  // Contact
  contactName: z.string().trim().max(200).nullish(),
  contactEmail: z.string().trim().email().nullish(),
  contactPhone: z.string().trim().max(50).nullish(),
  // Invoice Settings
  vatNumber: z.string().trim().max(50).nullish(),
  purchaseOrderNumber: z.string().trim().max(100).nullish(),
  invoicePaymentTerms: z.number().int().positive().nullish(),
  invoiceCurrency: z.string().trim().length(3).optional(), // non-nullable in DB, has default
  // Internal
  notes: z.string().trim().max(2000).nullish(),
  // Approval workflow
  approvalType: z.enum(["EMAIL", "PORTAL", "NONE"]).optional(),
  approvalGranularity: z.enum(["TIMESHEET", "MONTHLY", "QUARTERLY"]).optional(),
})

async function getAuthedSession(req: NextRequest) {
  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return { error: "Too many requests", status: rl.status }

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return { error: "Unauthenticated", status: 401 }
  if (!session.user.mfaVerified) return { error: "MFA verification required", status: 403 }

  return { session }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Next.js 15: params is a Promise
  const { id } = await params

  const auth = await getAuthedSession(req)
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const client = await getClientForUser(
    id,
    auth.session.user.id,
    auth.session.user.role as Role
  )

  if (!client) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json(client)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Next.js 15: params is a Promise
  const { id } = await params

  const auth = await getAuthedSession(req)
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  // Verify ownership before updating
  const existing = await getClientForUser(
    id,
    auth.session.user.id,
    auth.session.user.role as Role
  )

  if (!existing) {
    await audit({
      userId: auth.session.user.id,
      action: AuditAction.UNAUTHORISED_ACCESS,
      resource: "client",
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

  const updated = await db.client.update({
    where: { id },
    data: body,
  })

  await audit({
    userId: auth.session.user.id,
    action: AuditAction.CLIENT_UPDATED,
    resource: "client",
    resourceId: id,
    metadata: { changes: body },
    ipAddress: getClientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
    success: true,
  })

  return NextResponse.json(updated)
}
