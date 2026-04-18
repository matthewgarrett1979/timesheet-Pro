/**
 * GET  /api/invoices/[id]  — fetch a single invoice
 * PATCH /api/invoices/[id] — update status (ADMIN/MANAGER)
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { checkRateLimit } from "@/lib/rate-limit"
import { Role, InvoiceStatus } from "@prisma/client"
import { z } from "zod"

const INVOICE_INCLUDE = {
  client: {
    select: {
      id: true, name: true, companyName: true, tradingName: true,
      addressLine1: true, addressLine2: true, city: true, county: true,
      postcode: true, country: true, vatNumber: true,
      contactName: true, contactEmail: true, contactPhone: true,
      purchaseOrderNumber: true, invoicePaymentTerms: true, invoiceCurrency: true,
      defaultRate: true,
    },
  },
} as const

const patchSchema = z.object({
  status: z.nativeEnum(InvoiceStatus).optional(),
})

async function resolve(invoiceId: string, userId: string, role: Role) {
  return db.invoice.findFirst({
    where: {
      id: invoiceId,
      ...(role !== Role.ADMIN ? { managerId: userId } : {}),
    },
    include: INVOICE_INCLUDE,
  })
}

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
  if (session.user.role === Role.USER) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const invoice = await resolve(id, session.user.id, session.user.role as Role)
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Strip encrypted fields
  const { xeroAccessTokenEnc: _a, xeroRefreshTokenEnc: _r, ...safe } = invoice
  return NextResponse.json(safe)
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
  if (session.user.role === Role.USER) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const existing = await resolve(id, session.user.id, session.user.role as Role)
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  let body: z.infer<typeof patchSchema>
  try { body = patchSchema.parse(await req.json()) }
  catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }) }

  const updated = await db.invoice.update({
    where: { id },
    data: { ...(body.status ? { status: body.status } : {}) },
    include: INVOICE_INCLUDE,
  })

  const { xeroAccessTokenEnc: _a, xeroRefreshTokenEnc: _r, ...safe } = updated
  return NextResponse.json(safe)
}
