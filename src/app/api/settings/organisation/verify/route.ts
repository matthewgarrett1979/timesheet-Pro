/**
 * POST /api/settings/organisation/verify
 * ADMIN only — re-runs the DNS TXT verification against the stored token.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { checkRateLimit } from "@/lib/rate-limit"
import { Role } from "@prisma/client"

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })
  if ((session.user.role as Role) !== Role.ADMIN) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const settings = await db.appSettings.findUnique({
    where: { id: "global" },
    select: { organizationDomain: true, domainVerificationToken: true },
  })

  if (!settings?.organizationDomain || !settings?.domainVerificationToken) {
    return NextResponse.json({ error: "Organisation domain not configured" }, { status: 400 })
  }

  const expected = `tech-timesheet-verify=${settings.domainVerificationToken}`

  try {
    const dns     = await import("dns/promises")
    const records = await dns.resolveTxt(settings.organizationDomain)
    const flat    = records.flat()

    if (flat.includes(expected)) {
      await db.appSettings.update({
        where: { id: "global" },
        data:  { domainVerifiedAt: new Date() },
      })
      return NextResponse.json({ verified: true })
    }

    return NextResponse.json({
      verified: false,
      error:    "TXT record not found. DNS changes can take up to 48 hours to propagate.",
    })
  } catch (err: unknown) {
    return NextResponse.json({
      verified: false,
      error:    `DNS lookup failed: ${err instanceof Error ? err.message : String(err)}`,
    })
  }
}
