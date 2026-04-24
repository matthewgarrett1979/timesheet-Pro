/**
 * GET    /api/timesheets/[id]  — fetch a single timesheet
 * PATCH  /api/timesheets/[id]  — approve or reject a timesheet (ADMIN only)
 * DELETE /api/timesheets/[id]  — ADMIN hard delete; unlinks time entries back to DRAFT
 *
 * Managers submit via POST /api/timesheets/[id]/submit.
 * Time entry management is via /api/time-entries.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { getTimesheetForUser } from "@/lib/authorization"
import { audit, getClientIp } from "@/lib/audit"
import { checkRateLimit } from "@/lib/rate-limit"
import { AuditAction, Role, TimesheetStatus } from "@prisma/client"
import { z } from "zod"

const patchSchema = z.object({
  status:        z.enum(["APPROVED", "REJECTED"]),
  rejectionNote: z.string().trim().max(1000).optional(),
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })

  const timesheet = await getTimesheetForUser(id, session.user.id, session.user.role as Role)
  if (!timesheet) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json(timesheet)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })

  // Only ADMINs may approve or reject
  if (session.user.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const timesheet = await getTimesheetForUser(id, session.user.id, session.user.role as Role)
  if (!timesheet) {
    await audit({
      userId:     session.user.id,
      action:     AuditAction.UNAUTHORISED_ACCESS,
      resource:   "timesheet",
      resourceId: id,
      metadata:   { action: "approve/reject" },
      ipAddress:  getClientIp(req),
      success:    false,
    })
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (timesheet.status !== TimesheetStatus.SUBMITTED) {
    return NextResponse.json(
      { error: "Only SUBMITTED timesheets can be approved or rejected" },
      { status: 409 }
    )
  }

  let body: z.infer<typeof patchSchema>
  try {
    body = patchSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const isApproval = body.status === "APPROVED"

  const updated = await db.timesheet.update({
    where: { id },
    data: {
      status:        body.status as TimesheetStatus,
      rejectionNote: body.rejectionNote ?? null,
      ...(isApproval ? { approvedAt: new Date(), approvedBy: session.user.email ?? session.user.id } : {}),
    },
  })

  // If approved, mark all submitted entries as APPROVED too
  if (isApproval) {
    await db.timeEntry.updateMany({
      where: { timesheetId: id, status: "SUBMITTED" },
      data:  { status: "APPROVED" },
    })
  }

  await audit({
    userId:     session.user.id,
    action:     isApproval ? AuditAction.TIMESHEET_APPROVED : AuditAction.TIMESHEET_REJECTED,
    resource:   "timesheet",
    resourceId: id,
    metadata:   { status: body.status, rejectionNote: body.rejectionNote },
    ipAddress:  getClientIp(req),
    userAgent:  req.headers.get("user-agent") ?? undefined,
    success:    true,
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })
  if ((session.user.role as Role) !== Role.ADMIN) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const timesheet = await db.timesheet.findUnique({
    where: { id },
    select: { id: true, status: true, managerId: true, clientId: true, periodStart: true, periodEnd: true },
  })
  if (!timesheet) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // For INVOICED timesheets require the timesheet ID typed as confirmation
  let body: { confirmId?: string } = {}
  try { body = await req.json() } catch { /* no body */ }

  if (timesheet.status === TimesheetStatus.INVOICED && body.confirmId !== id) {
    return NextResponse.json({ error: "Type the timesheet ID to confirm deletion of an INVOICED timesheet" }, { status: 400 })
  }

  await db.$transaction([
    // Unlink time entries — reset back to DRAFT so they can be re-submitted
    db.timeEntry.updateMany({ where: { timesheetId: id }, data: { timesheetId: null, status: "DRAFT" } }),
    db.approvalToken.deleteMany({ where: { timesheetId: id } }),
    db.timesheet.delete({ where: { id } }),
  ])

  await audit({
    userId: session.user.id,
    action: AuditAction.TIMESHEET_DELETED,
    resource: "timesheet",
    resourceId: id,
    metadata: { status: timesheet.status, managerId: timesheet.managerId, clientId: timesheet.clientId },
    ipAddress: getClientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
    success: true,
  })

  return new NextResponse(null, { status: 204 })
}
