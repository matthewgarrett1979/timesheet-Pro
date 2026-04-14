/**
 * GET  /api/clients   — list clients owned by the authenticated user
 * POST /api/clients   — create a new client (scoped to authenticated user)
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { listClientsForUser } from "@/lib/authorization"
import { audit, getClientIp } from "@/lib/audit"
import { checkRateLimit } from "@/lib/rate-limit"
import { AuditAction, Role } from "@prisma/client"
import { z } from "zod"

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  reference: z.string().trim().max(50).nullish(),
  // Company Details
  companyName: z.string().trim().max(200).nullish(),
  tradingName: z.string().trim().max(200).nullish(),
  addressLine1: z.string().trim().max(200).nullish(),
  addressLine2: z.string().trim().max(200).nullish(),
  city: z.string().trim().max(100).nullish(),
  county: z.string().trim().max(100).nullish(),
  postcode: z.string().trim().max(20).nullish(),
  country: z.string().trim().max(100).nullish(),
  // Contact
  contactName: z.string().trim().max(200).nullish(),
  contactEmail: z.string().trim().email().nullish(),
  contactPhone: z.string().trim().max(50).nullish(),
  // Invoice Settings
  vatNumber: z.string().trim().max(50).nullish(),
  purchaseOrderNumber: z.string().trim().max(100).nullish(),
  invoicePaymentTerms: z.number().int().positive().nullish(),
  invoiceCurrency: z.string().trim().length(3).nullish(),
  // Internal
  notes: z.string().trim().max(2000).nullish(),
  // Approval workflow
  approvalType: z.enum(["EMAIL", "PORTAL", "NONE"]).optional(),
  approvalGranularity: z.enum(["TIMESHEET", "MONTHLY", "QUARTERLY"]).optional(),
})

export async function GET(req: NextRequest) {
  const rl = await checkRateLimit(req, "api")
  if (rl.denied) {
    return NextResponse.json({ error: "Too many requests" }, { status: rl.status })
  }

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  }

  if (!session.user.mfaVerified) {
    return NextResponse.json({ error: "MFA verification required" }, { status: 403 })
  }

  const clients = await listClientsForUser(session.user.id, session.user.role as Role)
  return NextResponse.json(clients)
}

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, "api")
  if (rl.denied) {
    return NextResponse.json({ error: "Too many requests" }, { status: rl.status })
  }

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  }

  if (!session.user.mfaVerified) {
    return NextResponse.json({ error: "MFA verification required" }, { status: 403 })
  }

  let body: z.infer<typeof createSchema>
  try {
    body = createSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const client = await db.client.create({
    data: {
      name: body.name,
      reference: body.reference,
      companyName: body.companyName,
      tradingName: body.tradingName,
      addressLine1: body.addressLine1,
      addressLine2: body.addressLine2,
      city: body.city,
      county: body.county,
      postcode: body.postcode,
      country: body.country ?? "United Kingdom",
      contactName: body.contactName,
      contactEmail: body.contactEmail,
      contactPhone: body.contactPhone,
      vatNumber: body.vatNumber,
      purchaseOrderNumber: body.purchaseOrderNumber,
      invoicePaymentTerms: body.invoicePaymentTerms,
      invoiceCurrency: body.invoiceCurrency ?? "GBP",
      notes: body.notes,
      approvalType: body.approvalType ?? "EMAIL",
      approvalGranularity: body.approvalGranularity ?? "TIMESHEET",
      managerId: session.user.id,
    },
  })

  await audit({
    userId: session.user.id,
    action: AuditAction.CLIENT_CREATED,
    resource: "client",
    resourceId: client.id,
    metadata: { name: client.name, reference: client.reference },
    ipAddress: getClientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
    success: true,
  })

  return NextResponse.json(client, { status: 201 })
}
