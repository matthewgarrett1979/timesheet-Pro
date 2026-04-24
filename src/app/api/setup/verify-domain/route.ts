/**
 * POST /api/setup/verify-domain
 *
 * Public endpoint — no auth required (called during setup wizard).
 * Performs a live DNS TXT lookup to confirm the verification token is in place.
 *
 * Body: { domain: string; token: string }
 */
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

const schema = z.object({
  domain: z.string().min(3).max(253),
  token:  z.string().min(10),
})

export async function POST(req: NextRequest) {
  let body: z.infer<typeof schema>
  try {
    body = schema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const expected = `tech-timesheet-verify=${body.token}`

  try {
    const dns     = await import("dns/promises")
    const records = await dns.resolveTxt(body.domain)
    const flat    = records.flat()

    if (flat.includes(expected)) {
      return NextResponse.json({ verified: true })
    }

    return NextResponse.json({
      verified: false,
      error:    "TXT record not found. DNS changes can take up to 48 hours to propagate — try again shortly.",
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    // ENOTFOUND / ENODATA means the domain doesn't exist or has no TXT records yet
    return NextResponse.json({
      verified: false,
      error:    `DNS lookup failed: ${msg}. Check the domain is spelled correctly.`,
    })
  }
}
