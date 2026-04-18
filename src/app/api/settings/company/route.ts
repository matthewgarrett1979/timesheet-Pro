/**
 * GET   /api/settings/company  — fetch company / bank settings
 * PATCH /api/settings/company  — update (ADMIN only)
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { checkRateLimit } from "@/lib/rate-limit"
import { Role } from "@prisma/client"
import { z } from "zod"

const updateSchema = z.object({
  companyName:         z.string().max(200).optional(),
  companyLegalName:    z.string().max(200).optional(),
  companyAddress:      z.string().max(500).optional(),
  companyEmail:        z.string().email().max(200).optional(),
  companyPhone:        z.string().max(50).optional(),
  companyWebsite:      z.string().url().max(200).optional(),
  vatNumber:           z.string().max(50).optional(),
  vatRegistered:       z.boolean().optional(),
  companyRegNumber:    z.string().max(50).optional(),
  bankName:            z.string().max(100).optional(),
  accountName:         z.string().max(200).optional(),
  sortCode:            z.string().max(20).optional(),
  accountNumber:       z.string().max(20).optional(),
  iban:                z.string().max(34).optional(),
  swiftBic:            z.string().max(11).optional(),
  defaultPaymentTerms: z.number().int().min(0).max(365).optional(),
  invoicePrefix:       z.string().max(20).optional(),
  nextInvoiceNumber:   z.number().int().min(1).optional(),
  logoUrl:             z.string().url().max(500).nullish(),
})

export async function GET(req: NextRequest) {
  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })
  if ((session.user.role as Role) !== Role.ADMIN) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const settings = await db.appSettings.findFirst() ?? {}
  return NextResponse.json(settings)
}

export async function PATCH(req: NextRequest) {
  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })
  if ((session.user.role as Role) !== Role.ADMIN) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let body: z.infer<typeof updateSchema>
  try { body = updateSchema.parse(await req.json()) }
  catch (err) { return NextResponse.json({ error: "Invalid body", detail: err }, { status: 400 }) }

  const settings = await db.appSettings.upsert({
    where: { id: "global" },
    update: body,
    create: { id: "global", ...body },
  })

  return NextResponse.json(settings)
}
