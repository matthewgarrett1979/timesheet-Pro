/**
 * POST /api/approvals/[token]
 *
 * Public endpoint (no auth session required) — the client contact clicks
 * the link from the approval email, which embeds the signed JWT.
 *
 * The token is:
 *   - HMAC-SHA256 signed (tamper-proof)
 *   - Single-use (DB row marked usedAt after first use)
 *   - Bound to a specific clientId (prevents cross-client replay)
 *   - Short-lived (7 days)
 *
 * On success, the referenced timesheet is moved to APPROVED.
 *
 * Body (optional): { comment: string }
 * Query: token is in the URL path
 */
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { consumeApprovalToken } from "@/lib/tokens"
import { audit, getClientIp } from "@/lib/audit"
import { checkRateLimit } from "@/lib/rate-limit"
import { AuditAction, TimesheetStatus } from "@prisma/client"
import { z } from "zod"

const bodySchema = z.object({
  approverEmail: z.string().email("A valid approver email is required"),
  comment: z.string().trim().max(1000).optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const rl = await checkRateLimit(req, "approvals")
  if (rl.denied) {
    return NextResponse.json({ error: "Too many requests" }, { status: rl.status })
  }

  const ip = getClientIp(req)
  const ua = req.headers.get("user-agent") ?? "unknown"

  // Parse optional body
  let body: z.infer<typeof bodySchema>
  try {
    const raw = await req.json()
    body = bodySchema.parse(raw)
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  // Verify and consume the token
  let verified: Awaited<ReturnType<typeof consumeApprovalToken>>
  try {
    verified = await consumeApprovalToken(params.token)
  } catch (err) {
    const reason = err instanceof Error ? err.message : "UNKNOWN"
    await audit({
      action: AuditAction.APPROVAL_TOKEN_EXPIRED,
      resource: "timesheet",
      metadata: { reason, ip },
      ipAddress: ip,
      userAgent: ua,
      success: false,
    })

    const message =
      reason === "TOKEN_ALREADY_USED"
        ? "This approval link has already been used."
        : reason === "TOKEN_EXPIRED"
        ? "This approval link has expired. Please request a new one."
        : "This approval link is invalid."

    return NextResponse.json({ error: message }, { status: 410 })
  }

  // Load the timesheet and verify it's in SUBMITTED state
  const timesheet = await db.timesheet.findUnique({
    where: { id: verified.timesheetId },
    select: { id: true, status: true, clientId: true },
  })

  if (!timesheet) {
    return NextResponse.json({ error: "Timesheet not found" }, { status: 404 })
  }

  // Guard: token must match the timesheet's client (defence-in-depth)
  if (timesheet.clientId !== verified.clientId) {
    await audit({
      action: AuditAction.UNAUTHORISED_ACCESS,
      resource: "timesheet",
      resourceId: verified.timesheetId,
      metadata: { reason: "client_mismatch" },
      ipAddress: ip,
      success: false,
    })
    return NextResponse.json({ error: "Invalid token" }, { status: 403 })
  }

  if (timesheet.status !== TimesheetStatus.SUBMITTED) {
    return NextResponse.json(
      { error: `Timesheet is not awaiting approval (status: ${timesheet.status})` },
      { status: 409 }
    )
  }

  // Approve
  await db.timesheet.update({
    where: { id: verified.timesheetId },
    data: {
      status: TimesheetStatus.APPROVED,
      approvedAt: new Date(),
      approvedBy: body.approverEmail,
    },
  })

  await audit({
    action: AuditAction.TIMESHEET_APPROVED,
    resource: "timesheet",
    resourceId: verified.timesheetId,
    metadata: {
      approverEmail: body.approverEmail,
      clientId: verified.clientId,
      comment: body.comment,
    },
    ipAddress: ip,
    userAgent: ua,
    success: true,
  })

  return NextResponse.json({
    ok: true,
    timesheetId: verified.timesheetId,
    status: TimesheetStatus.APPROVED,
    message: "Timesheet approved. Thank you.",
  })
}
