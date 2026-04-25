/**
 * GET  /api/setup/migrate  — ADMIN: returns pre-fill data for the migration wizard
 * POST /api/setup/migrate  — ADMIN: completes domain migration for an existing instance
 *
 * Unlike POST /api/setup this endpoint does NOT create a new admin user —
 * the authenticated admin already exists. It only updates AppSettings with
 * the verified domain, org details, and licence configuration, then sets the
 * app_configured cookie so the middleware stops redirecting to /setup/migrate.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { Role } from "@prisma/client"
import { z } from "zod"

const migrateSchema = z.object({
  domain:            z.string().min(3).max(253),
  verificationToken: z.string().min(10),
  companyName:       z.string().trim().min(1).max(200),
  companyLegalName:  z.string().trim().max(200).optional(),
  companyAddress:    z.string().trim().max(500).optional(),
  companyPhone:      z.string().trim().max(50).optional(),
  vatNumber:         z.string().trim().max(50).optional(),
  vatRegistered:     z.boolean().optional(),
  companyRegNumber:  z.string().trim().max(50).optional(),
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
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if ((session.user.role as Role) !== Role.ADMIN) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  // Extract the domain hint from the admin's email
  const emailDomain = session.user.email?.split("@")[1]?.toLowerCase() ?? null

  // Load any existing AppSettings company fields for pre-filling
  const settings = await db.appSettings.findUnique({
    where: { id: "global" },
    select: {
      companyName:             true,
      companyLegalName:        true,
      companyAddress:          true,
      companyPhone:            true,
      vatNumber:               true,
      vatRegistered:           true,
      companyRegNumber:        true,
      licenceSeats:            true,
      feature_po:              true,
      feature_resource_planning: true,
      feature_expenses:        true,
      feature_xero:            true,
      feature_onedrive:        true,
    },
  })

  return NextResponse.json({
    detectedDomain:          emailDomain,
    companyName:             settings?.companyName             ?? "",
    companyLegalName:        settings?.companyLegalName         ?? "",
    companyAddress:          settings?.companyAddress           ?? "",
    companyPhone:            settings?.companyPhone             ?? "",
    vatNumber:               settings?.vatNumber                ?? "",
    vatRegistered:           settings?.vatRegistered            ?? false,
    companyRegNumber:        settings?.companyRegNumber         ?? "",
    licenceSeats:            settings?.licenceSeats             ?? 5,
    feature_po:              settings?.feature_po               ?? true,
    feature_resource_planning: settings?.feature_resource_planning ?? true,
    feature_expenses:        settings?.feature_expenses          ?? true,
    feature_xero:            settings?.feature_xero             ?? false,
    feature_onedrive:        settings?.feature_onedrive         ?? false,
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if ((session.user.role as Role) !== Role.ADMIN) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  // Guard: do not re-run if domain is already configured
  const existing = await db.appSettings.findUnique({
    where: { id: "global" },
    select: { organizationDomain: true, domainVerifiedAt: true },
  })
  if (existing?.organizationDomain && existing?.domainVerifiedAt) {
    return NextResponse.json({ error: "Domain already configured" }, { status: 409 })
  }

  let body: z.infer<typeof migrateSchema>
  try {
    body = migrateSchema.parse(await req.json())
  } catch (err) {
    return NextResponse.json({ error: "Invalid request body", detail: String(err) }, { status: 400 })
  }

  // Re-verify the DNS token before committing
  try {
    const dns     = await import("dns/promises")
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

  // Persist domain and org settings — no user creation
  await db.appSettings.upsert({
    where:  { id: "global" },
    create: {
      id: "global",
      companyName:             body.companyName,
      companyLegalName:        body.companyLegalName  ?? null,
      companyAddress:          body.companyAddress    ?? "",
      companyPhone:            body.companyPhone      ?? "",
      vatNumber:               body.vatNumber         ?? null,
      vatRegistered:           body.vatRegistered     ?? false,
      companyRegNumber:        body.companyRegNumber  ?? null,
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
      companyLegalName:        body.companyLegalName  ?? null,
      companyAddress:          body.companyAddress    ?? "",
      companyPhone:            body.companyPhone      ?? "",
      vatNumber:               body.vatNumber         ?? null,
      vatRegistered:           body.vatRegistered     ?? false,
      companyRegNumber:        body.companyRegNumber  ?? null,
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

  // Set the app_configured cookie — middleware will stop redirecting to migrate
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
