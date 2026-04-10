/**
 * POST /api/auth/mfa/verify
 *
 * Verifies a TOTP code for the authenticated user.
 *
 * Two modes:
 *   setup=true  — First-time verification: activates MFA on the account.
 *   setup=false — Per-session verification: marks the current DB session
 *                 as mfaVerified=true.
 *
 * Body: { code: string }
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { verifyTotp } from "@/lib/mfa"
import { audit, getClientIp } from "@/lib/audit"
import { checkRateLimit } from "@/lib/rate-limit"
import { AuditAction } from "@prisma/client"
import { z } from "zod"
import { cookies } from "next/headers"

const bodySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "TOTP code must be exactly 6 digits"),
  setup: z.boolean().optional().default(false),
})

export async function POST(req: NextRequest) {
  // Rate limit — strict: 5 attempts per minute per IP
  const rl = await checkRateLimit(req, "auth")
  if (rl.denied) {
    return NextResponse.json({ error: "Too many requests" }, { status: rl.status })
  }

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  }

  const userId = session.user.id
  const ip = getClientIp(req)
  const ua = req.headers.get("user-agent") ?? "unknown"

  // Parse body
  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  // Load user's encrypted MFA secret
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { mfaSecretEnc: true, mfaEnabled: true },
  })

  if (!user?.mfaSecretEnc) {
    return NextResponse.json(
      { error: "MFA not configured. Call /api/auth/mfa/setup first." },
      { status: 400 }
    )
  }

  // Verify TOTP code
  const valid = verifyTotp(user.mfaSecretEnc, body.code)

  if (!valid) {
    await audit({
      userId,
      action: AuditAction.MFA_FAILED,
      resource: "auth",
      resourceId: userId,
      metadata: { setup: body.setup },
      ipAddress: ip,
      userAgent: ua,
      success: false,
    })
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 })
  }

  // -----------------------------------------------------------------------
  // Success path
  // -----------------------------------------------------------------------

  if (body.setup) {
    // First-time setup — activate MFA on the account
    await db.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaVerifiedAt: new Date(),
      },
    })

    await audit({
      userId,
      action: AuditAction.MFA_SETUP,
      resource: "auth",
      resourceId: userId,
      metadata: { step: "mfa_activated" },
      ipAddress: ip,
      userAgent: ua,
      success: true,
    })
  }

  // Mark the current database session as MFA-verified.
  // NextAuth stores the session token in the next-auth.session-token cookie.
  const sessionToken = (await cookies()).get("next-auth.session-token")?.value
    ?? (await cookies()).get("__Secure-next-auth.session-token")?.value

  if (sessionToken) {
    await db.session.updateMany({
      where: { sessionToken, userId },
      data: { mfaVerified: true },
    })
  }

  await audit({
    userId,
    action: AuditAction.MFA_VERIFIED,
    resource: "auth",
    resourceId: userId,
    metadata: { setup: body.setup },
    ipAddress: ip,
    userAgent: ua,
    success: true,
  })

  return NextResponse.json({ ok: true, mfaVerified: true })
}
