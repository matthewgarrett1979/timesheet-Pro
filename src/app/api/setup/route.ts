/**
 * GET  /api/setup  — public; returns setup status and org info for login page
 * POST /api/setup  — public; completes first-time setup (one-shot, idempotent guard)
 */
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { hashPassword } from "@/lib/password"
import { Role } from "@prisma/client"
import { z } from "zod"
import { randomBytes } from "crypto"

const setupSchema = z.object({
  // Step 1 — domain (already verified client-side via /api/setup/verify-domain)
  domain:            z.string().min(3).max(253),
  verificationToken: z.string().min(10),
  // Step 2 — org details
  companyName:       z.string().trim().min(1).max(200),
  companyLegalName:  z.string().trim().max(200).optional(),
  companyAddress:    z.string().trim().max(500).optional(),
  companyPhone:      z.string().trim().max(50).optional(),
  vatNumber:         z.string().trim().max(50).optional(),
  vatRegistered:     z.boolean().optional(),
  companyRegNumber:  z.string().trim().max(50).optional(),
  // Step 3 — admin user
  adminName:         z.string().trim().min(1).max(200),
  adminEmail:        z.string().email(),
  adminPassword:     z.string().min(14),
  // Step 4 — licence
  licenceSeats:      z.number().int().min(1).max(9999).default(5),
  features: z.object({
    po:               z.boolean().default(true),
    resourcePlanning: z.boolean().default(true),
    expenses:         z.boolean().default(true),
    xero:             z.boolean().default(false),
    onedrive:         z.boolean().default(false),
  }),
})

export async function GET() {
  const [settings, userCount] = await Promise.all([
    db.appSettings.findUnique({
      where: { id: "global" },
      select: {
        organizationDomain: true,
        domainVerifiedAt:   true,
        companyName:        true,
      },
    }),
    db.user.count(),
  ])

  const configured = !!(settings?.organizationDomain && settings?.domainVerifiedAt)

  return NextResponse.json({
    configured,
    orgName:  settings?.companyName       ?? null,
    domain:   settings?.organizationDomain ?? null,
    hasUsers: userCount > 0,
  })
}

export async function POST(req: NextRequest) {
  // Guard: only run if setup has not been completed
  const existing = await db.appSettings.findUnique({
    where: { id: "global" },
    select: { organizationDomain: true, domainVerifiedAt: true },
  })
  if (existing?.organizationDomain && existing?.domainVerifiedAt) {
    return NextResponse.json({ error: "Setup already completed" }, { status: 409 })
  }

  let body: z.infer<typeof setupSchema>
  try {
    body = setupSchema.parse(await req.json())
  } catch (err) {
    return NextResponse.json({ error: "Invalid request body", detail: String(err) }, { status: 400 })
  }

  // Validate admin email matches the domain
  const emailDomain = body.adminEmail.split("@")[1]?.toLowerCase()
  if (emailDomain !== body.domain.toLowerCase()) {
    return NextResponse.json(
      { error: `Admin email must use @${body.domain}` },
      { status: 400 }
    )
  }

  // Verify the DNS token one final time before committing
  try {
    const dns = await import("dns/promises")
    const records = await dns.resolveTxt(body.domain)
    const flat    = records.flat()
    const expected = `tech-timesheet-verify=${body.verificationToken}`
    if (!flat.includes(expected)) {
      return NextResponse.json(
        { error: "Domain verification token not found in DNS. Has the TXT record been added?" },
        { status: 400 }
      )
    }
  } catch {
    return NextResponse.json(
      { error: "DNS lookup failed — check the domain is correct and publicly resolvable." },
      { status: 400 }
    )
  }

  const passwordHash = await hashPassword(body.adminPassword)

  // Persist everything in a transaction
  await db.$transaction(async (tx) => {
    // Upsert AppSettings singleton
    await tx.appSettings.upsert({
      where: { id: "global" },
      create: {
        id: "global",
        companyName:             body.companyName,
        companyLegalName:        body.companyLegalName ?? null,
        companyAddress:          body.companyAddress   ?? "",
        companyPhone:            body.companyPhone     ?? "",
        vatNumber:               body.vatNumber        ?? null,
        vatRegistered:           body.vatRegistered    ?? false,
        companyRegNumber:        body.companyRegNumber ?? null,
        organizationDomain:      body.domain.toLowerCase(),
        domainVerificationToken: body.verificationToken,
        domainVerifiedAt:        new Date(),
        licenceSeats:            body.licenceSeats,
        feature_po:               body.features.po,
        feature_resource_planning: body.features.resourcePlanning,
        feature_expenses:          body.features.expenses,
        feature_xero:              body.features.xero,
        feature_onedrive:          body.features.onedrive,
      },
      update: {
        companyName:             body.companyName,
        companyLegalName:        body.companyLegalName ?? null,
        companyAddress:          body.companyAddress   ?? "",
        companyPhone:            body.companyPhone     ?? "",
        vatNumber:               body.vatNumber        ?? null,
        vatRegistered:           body.vatRegistered    ?? false,
        companyRegNumber:        body.companyRegNumber ?? null,
        organizationDomain:      body.domain.toLowerCase(),
        domainVerificationToken: body.verificationToken,
        domainVerifiedAt:        new Date(),
        licenceSeats:            body.licenceSeats,
        feature_po:               body.features.po,
        feature_resource_planning: body.features.resourcePlanning,
        feature_expenses:          body.features.expenses,
        feature_xero:              body.features.xero,
        feature_onedrive:          body.features.onedrive,
      },
    })

    // Create the admin user (or skip if email already exists)
    const existingUser = await tx.user.findUnique({ where: { email: body.adminEmail.toLowerCase() } })
    if (!existingUser) {
      await tx.user.create({
        data: {
          name:         body.adminName,
          email:        body.adminEmail.toLowerCase(),
          passwordHash,
          role:         Role.ADMIN,
          mustChangePassword: false,
        },
      })
    }
  })

  // Set the app_configured cookie so middleware stops redirecting to /setup
  const response = NextResponse.json({ success: true })
  response.cookies.set("app_configured", "1", {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge:   60 * 60 * 24 * 365 * 10,
    path:     "/",
  })
  return response
}
