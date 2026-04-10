/**
 * POST /api/auth/recovery
 *
 * Use a single-use recovery code to bypass TOTP when the authenticator
 * app is unavailable.
 *
 * The matched recovery code hash is removed from the array after use
 * (single-use enforcement).
 *
 * Body: { code: string }
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { findMatchingRecoveryCode } from "@/lib/mfa"
import { audit, getClientIp } from "@/lib/audit"
import { checkRateLimit } from "@/lib/rate-limit"
import { AuditAction } from "@prisma/client"
import { z } from "zod"
import { cookies } from "next/headers"

const bodySchema = z.object({
  code: z.string().trim().min(1, "Recovery code is required"),
})

export async function POST(req: NextRequest) {
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

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { recoveryCodes: true, mfaEnabled: true },
  })

  if (!user?.mfaEnabled || user.recoveryCodes.length === 0) {
    return NextResponse.json(
      { error: "MFA is not enabled on this account" },
      { status: 400 }
    )
  }

  // Find and consume the matching code
  const matchIndex = await findMatchingRecoveryCode(body.code, user.recoveryCodes)

  if (matchIndex === -1) {
    await audit({
      userId,
      action: AuditAction.MFA_FAILED,
      resource: "auth",
      resourceId: userId,
      metadata: { method: "recovery_code", reason: "no_match" },
      ipAddress: ip,
      userAgent: ua,
      success: false,
    })
    return NextResponse.json({ error: "Invalid recovery code" }, { status: 401 })
  }

  // Remove the used code from the array (single-use)
  const updatedCodes = user.recoveryCodes.filter((_, i) => i !== matchIndex)

  await db.user.update({
    where: { id: userId },
    data: { recoveryCodes: updatedCodes },
  })

  // Mark the current session as MFA-verified
  const sessionToken =
    (await cookies()).get("next-auth.session-token")?.value ??
    (await cookies()).get("__Secure-next-auth.session-token")?.value

  if (sessionToken) {
    await db.session.updateMany({
      where: { sessionToken, userId },
      data: { mfaVerified: true },
    })
  }

  await audit({
    userId,
    action: AuditAction.MFA_RECOVERY_USED,
    resource: "auth",
    resourceId: userId,
    metadata: {
      remainingCodes: updatedCodes.length,
      method: "recovery_code",
    },
    ipAddress: ip,
    userAgent: ua,
    success: true,
  })

  return NextResponse.json({
    ok: true,
    mfaVerified: true,
    remainingCodes: updatedCodes.length,
    warning:
      updatedCodes.length <= 2
        ? "You have few recovery codes remaining. Generate new ones from your account settings."
        : undefined,
  })
}
