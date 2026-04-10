/**
 * Approval token generation and verification.
 *
 * Tokens are HMAC-SHA256 signed JWTs (HS256) containing:
 *   - jti  : unique ID stored in DB for single-use enforcement
 *   - sub  : timesheetId
 *   - cid  : clientId (prevents cross-client replay)
 *   - iss  : "timesheet-pro"
 *   - exp  : 7-day expiry
 *
 * On use, the DB row is marked usedAt = now() — subsequent calls with
 * the same token are rejected even if the JWT has not expired.
 */
import { SignJWT, jwtVerify } from "jose"
import { randomUUID } from "crypto"
import { env } from "./env"
import { db } from "./db"
import { AuditAction } from "@prisma/client"
import { audit } from "./audit"

const ISSUER = "timesheet-pro"
const EXPIRY = "7d"

function getSigningKey(): Uint8Array {
  return new TextEncoder().encode(env.APPROVAL_SIGNING_SECRET)
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

interface CreateTokenParams {
  timesheetId: string
  clientId: string
  createdById: string
}

/**
 * Create a signed single-use approval token and persist its JTI to the DB.
 * Returns the compact JWT string to embed in the approval email/link.
 */
export async function createApprovalToken(
  params: CreateTokenParams
): Promise<string> {
  const jti = randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  const token = await new SignJWT({
    cid: params.clientId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(params.timesheetId)
    .setIssuer(ISSUER)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(getSigningKey())

  await db.approvalToken.create({
    data: {
      jti,
      clientId: params.clientId,
      timesheetId: params.timesheetId,
      createdById: params.createdById,
      expiresAt,
    },
  })

  await audit({
    userId: params.createdById,
    action: AuditAction.APPROVAL_TOKEN_CREATED,
    resource: "timesheet",
    resourceId: params.timesheetId,
    metadata: { clientId: params.clientId, expiresAt },
    success: true,
  })

  return token
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

interface VerifiedToken {
  jti: string
  timesheetId: string
  clientId: string
}

/**
 * Verify and consume an approval token.
 * Throws a descriptive error if the token is invalid, expired, or already used.
 */
export async function consumeApprovalToken(
  rawToken: string
): Promise<VerifiedToken> {
  // 1. Verify JWT signature and expiry
  let payload: { jti?: string; sub?: string; cid?: string }
  try {
    const result = await jwtVerify(rawToken, getSigningKey(), {
      issuer: ISSUER,
      algorithms: ["HS256"],
    })
    payload = result.payload as typeof payload
  } catch {
    throw new Error("INVALID_TOKEN")
  }

  const { jti, sub: timesheetId, cid: clientId } = payload

  if (!jti || !timesheetId || !clientId) {
    throw new Error("MALFORMED_TOKEN")
  }

  // 2. Look up in DB — single-use check
  const stored = await db.approvalToken.findUnique({ where: { jti } })

  if (!stored) {
    throw new Error("TOKEN_NOT_FOUND")
  }

  if (stored.usedAt) {
    await audit({
      action: AuditAction.APPROVAL_TOKEN_EXPIRED,
      resource: "timesheet",
      resourceId: timesheetId,
      metadata: { jti, reason: "already_used", usedAt: stored.usedAt },
      success: false,
    })
    throw new Error("TOKEN_ALREADY_USED")
  }

  if (stored.expiresAt < new Date()) {
    await audit({
      action: AuditAction.APPROVAL_TOKEN_EXPIRED,
      resource: "timesheet",
      resourceId: timesheetId,
      metadata: { jti, reason: "expired" },
      success: false,
    })
    throw new Error("TOKEN_EXPIRED")
  }

  // 3. Claim it — mark as used atomically
  await db.approvalToken.update({
    where: { jti },
    data: { usedAt: new Date() },
  })

  await audit({
    action: AuditAction.APPROVAL_TOKEN_USED,
    resource: "timesheet",
    resourceId: timesheetId,
    metadata: { jti, clientId },
    success: true,
  })

  return { jti, timesheetId, clientId }
}
