/**
 * Immutable audit log.
 *
 * Rows are INSERT-only — the application never issues UPDATE or DELETE
 * against the AuditLog table. Enforce this at the database level with
 * a PostgreSQL row-security policy in production.
 *
 * Sensitive fields (passwords, tokens, secrets) are NEVER written to
 * metadata — callers are responsible for sanitising before passing metadata.
 */
import { AuditAction } from "@prisma/client"
import { db } from "./db"

interface AuditParams {
  userId?: string
  action: AuditAction
  resource: string
  resourceId?: string
  /** Must not contain passwords, tokens, or PII beyond what is needed. */
  metadata?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
  success: boolean
}

/**
 * Write a single audit event. Never throws — a logging failure must not
 * interrupt the main request flow; it is caught and logged to stderr.
 */
export async function audit(params: AuditParams): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId ?? null,
        metadata: params.metadata,
        ipAddress: params.ipAddress ?? null,
        userAgent: truncate(params.userAgent, 512) ?? null,
        success: params.success,
      },
    })
  } catch (err) {
    console.error("[audit] Failed to write audit log entry:", err)
  }
}

/**
 * Extract a clean IP address from common proxy headers.
 * Returns only the first IP in X-Forwarded-For to avoid spoofed extras.
 */
export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for")
  if (xff) {
    return xff.split(",")[0].trim()
  }
  return request.headers.get("x-real-ip") ?? "unknown"
}

function truncate(value: string | undefined, maxLength: number): string | undefined {
  if (!value) return value
  return value.length > maxLength ? value.slice(0, maxLength) : value
}
