/**
 * POST /api/timesheets/[id]/submit
 *
 * Transitions a DRAFT timesheet to SUBMITTED and issues a single-use
 * HMAC-signed JWT approval token for the client contact.
 *
 * Returns the token so the caller can embed it in an email link.
 * The token is NOT returned again after this point.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getTimesheetForUser } from "@/lib/authorization"
import { db } from "@/lib/db"
import { createApprovalToken } from "@/lib/tokens"
import { audit, getClientIp } from "@/lib/audit"
import { checkRateLimit } from "@/lib/rate-limit"
import { AuditAction, Role, TimesheetStatus } from "@prisma/client"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Next.js 15: params is a Promise
  const { id } = await params

  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })

  const timesheet = await getTimesheetForUser(
    id,
    session.user.id,
    session.user.role as Role
  )

  if (!timesheet) {
    await audit({
      userId: session.user.id,
      action: AuditAction.UNAUTHORISED_ACCESS,
      resource: "timesheet",
      resourceId: id,
      metadata: { action: "submit" },
      ipAddress: getClientIp(req),
      success: false,
    })
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (timesheet.status !== TimesheetStatus.DRAFT) {
    return NextResponse.json(
      { error: `Cannot submit a timesheet with status ${timesheet.status}` },
      { status: 409 }
    )
  }

  // Transition to SUBMITTED
  await db.timesheet.update({
    where: { id },
    data: {
      status: TimesheetStatus.SUBMITTED,
      submittedAt: new Date(),
    },
  })

  // Issue single-use approval token
  const token = await createApprovalToken({
    timesheetId: id,
    clientId: timesheet.clientId,
    createdById: session.user.id,
  })

  await audit({
    userId: session.user.id,
    action: AuditAction.TIMESHEET_SUBMITTED,
    resource: "timesheet",
    resourceId: id,
    metadata: { clientId: timesheet.clientId },
    ipAddress: getClientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
    success: true,
  })

  return NextResponse.json({
    ok: true,
    timesheetId: id,
    status: TimesheetStatus.SUBMITTED,
    // Embed this in the approval email link: /approve?token=<approvalToken>
    approvalToken: token,
  })
}
