/**
 * POST /api/auth/mfa/setup
 *
 * Generates a TOTP secret for the authenticated user, stores it encrypted,
 * and returns a QR code data URI and the list of plaintext recovery codes
 * (shown exactly once).
 *
 * The secret is NOT activated (mfaEnabled stays false) until the user
 * successfully verifies their first TOTP code via /api/auth/mfa/verify.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { generateTotpSecret, generateQrCode, generateRecoveryCodes } from "@/lib/mfa"
import { audit, getClientIp } from "@/lib/audit"
import { checkRateLimit } from "@/lib/rate-limit"
import { AuditAction } from "@prisma/client"

export async function POST(req: NextRequest) {
  // Rate limit
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

  // Generate TOTP secret
  const { encryptedSecret } = generateTotpSecret()

  // Generate recovery codes
  const { plaintext: recoveryCodes, hashes: recoveryHashes } =
    await generateRecoveryCodes()

  // Persist encrypted secret and hashed recovery codes.
  // mfaEnabled remains false until first TOTP verification.
  await db.user.update({
    where: { id: userId },
    data: {
      mfaSecretEnc: encryptedSecret,
      recoveryCodes: recoveryHashes,
    },
  })

  // Build QR code
  const qrCodeDataUri = await generateQrCode(encryptedSecret, session.user.email!)

  await audit({
    userId,
    action: AuditAction.MFA_SETUP,
    resource: "auth",
    resourceId: userId,
    metadata: { step: "secret_generated" },
    ipAddress: ip,
    userAgent: ua,
    success: true,
  })

  return NextResponse.json({
    qrCode: qrCodeDataUri,
    // Recovery codes shown ONCE — the client must display and the user must save them
    recoveryCodes,
    message:
      "Scan the QR code with your authenticator app, then POST to /api/auth/mfa/verify to activate MFA.",
  })
}
