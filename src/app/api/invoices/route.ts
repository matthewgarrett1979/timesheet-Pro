/**
 * GET  /api/invoices  — list invoices (row-level scoped)
 * POST /api/invoices  — generate an invoice from one or more approved timesheets
 *
 * Xero tokens are encrypted at rest using AES-256-GCM before storage.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { listInvoicesForUser, getClientForUser } from "@/lib/authorization"
import { encrypt } from "@/lib/crypto"
import { audit, getClientIp } from "@/lib/audit"
import { checkRateLimit } from "@/lib/rate-limit"
import { AuditAction, Role, TimesheetStatus } from "@prisma/client"
import { z } from "zod"

const createSchema = z.object({
  clientId:        z.string().cuid(),
  timesheetIds:    z.array(z.string().cuid()).min(1).max(50),
  amount:          z.number().positive(),
  currency:        z.string().length(3).default("GBP"),
  purchaseOrderId: z.string().cuid().nullish(),
  // Xero tokens are optional — supply if pushing to Xero at the same time
  xeroAccessToken:  z.string().optional(),
  xeroRefreshToken: z.string().optional(),
})

export async function GET(req: NextRequest) {
  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })

  const invoices = await listInvoicesForUser(
    session.user.id,
    session.user.role as Role
  )
  return NextResponse.json(invoices)
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

  // Verify client ownership
  const client = await getClientForUser(
    body.clientId,
    session.user.id,
    session.user.role as Role
  )
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 })
  }

  // All referenced timesheets must be APPROVED and owned by the same user
  const timesheets = await db.timesheet.findMany({
    where: {
      id: { in: body.timesheetIds },
      managerId: session.user.id,
      clientId: body.clientId,
      status: TimesheetStatus.APPROVED,
    },
  })

  if (timesheets.length !== body.timesheetIds.length) {
    return NextResponse.json(
      {
        error:
          "One or more timesheets are not found, not approved, or do not belong to the specified client.",
      },
      { status: 422 }
    )
  }

  // Encrypt Xero tokens before storage (never store plaintext)
  const xeroAccessTokenEnc = body.xeroAccessToken
    ? encrypt(body.xeroAccessToken)
    : null
  const xeroRefreshTokenEnc = body.xeroRefreshToken
    ? encrypt(body.xeroRefreshToken)
    : null

  const invoice = await db.$transaction(async (tx) => {
    const inv = await tx.invoice.create({
      data: {
        clientId:        body.clientId,
        managerId:       session.user.id,
        timesheetIds:    body.timesheetIds,
        amount:          body.amount,
        currency:        body.currency,
        purchaseOrderId: body.purchaseOrderId ?? null,
        xeroAccessTokenEnc,
        xeroRefreshTokenEnc,
      },
      // Include all client billing fields needed for invoice rendering and
      // Xero push. Xero field mapping:
      //   contact.Name          → client.companyName ?? client.name
      //   contact.EmailAddress  → client.contactEmail
      //   contact.TaxNumber     → client.vatNumber          (GB VAT reg)
      //   contact.Addresses[0]  → addressLine1/2, city, county, postcode, country
      //   invoice.Reference     → client.purchaseOrderNumber
      //   invoice.DueDateDays   → client.invoicePaymentTerms
      //   invoice.CurrencyCode  → client.invoiceCurrency
      include: {
        client: {
          select: {
            id: true,
            name: true,
            companyName: true,
            tradingName: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            county: true,
            postcode: true,
            country: true,
            vatNumber: true,
            contactName: true,
            contactEmail: true,
            contactPhone: true,
            purchaseOrderNumber: true,
            invoicePaymentTerms: true,
            invoiceCurrency: true,
          },
        },
      },
    })

    // Mark timesheets as INVOICED
    await tx.timesheet.updateMany({
      where: { id: { in: body.timesheetIds } },
      data: { status: TimesheetStatus.INVOICED, invoiceId: inv.id },
    })

    return inv
  })

  await audit({
    userId: session.user.id,
    action: AuditAction.INVOICE_GENERATED,
    resource: "invoice",
    resourceId: invoice.id,
    metadata: {
      clientId: body.clientId,
      timesheetCount: body.timesheetIds.length,
      amount: body.amount,
      currency: body.currency,
      // Never log token values — just note they were provided
      xeroConnected: !!(body.xeroAccessToken),
    },
    ipAddress: getClientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
    success: true,
  })

  // Strip encrypted token fields from the response
  const { xeroAccessTokenEnc: _a, xeroRefreshTokenEnc: _r, ...safeInvoice } = invoice

  return NextResponse.json(safeInvoice, { status: 201 })
}
