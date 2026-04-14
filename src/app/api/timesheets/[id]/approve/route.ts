/**
 * POST /api/timesheets/[id]/approve
 *
 * Manager or Admin approves / rejects a SUBMITTED timesheet, with optional
 * partial approval (approve/reject individual entries).
 *
 * Body:
 *   { action: "APPROVE" | "REJECT", rejectionNote?: string }
 *   or partial:
 *   { action: "PARTIAL", approvedEntryIds: string[], rejectedEntryIds: string[], rejectionNote?: string }
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { getTimesheetForUser } from "@/lib/authorization"
import { audit, getClientIp } from "@/lib/audit"
import { checkRateLimit } from "@/lib/rate-limit"
import { sendApprovalConfirmed, sendRejectionNotification, sendPartialApprovalNotification } from "@/lib/email"
import { AuditAction, Role, TimesheetStatus, TimeEntryStatus } from "@prisma/client"
import { z } from "zod"

const schema = z.discriminatedUnion("action", [
  z.object({
    action:        z.literal("APPROVE"),
    rejectionNote: z.string().trim().max(1000).optional(),
  }),
  z.object({
    action:        z.literal("REJECT"),
    rejectionNote: z.string().trim().min(1).max(1000),
  }),
  z.object({
    action:            z.literal("PARTIAL"),
    approvedEntryIds:  z.array(z.string().cuid()).min(1),
    rejectedEntryIds:  z.array(z.string().cuid()).min(1),
    rejectionNote:     z.string().trim().max(1000).optional(),
  }),
])

export async function POST(
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
  if (!timesheet) {
    await audit({ userId: session.user.id, action: AuditAction.UNAUTHORISED_ACCESS, resource: "timesheet", resourceId: id, metadata: { action: "approve" }, ipAddress: getClientIp(req), success: false })
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (timesheet.status !== TimesheetStatus.SUBMITTED) {
    return NextResponse.json({ error: `Cannot approve a timesheet with status ${timesheet.status}` }, { status: 409 })
  }

  let body: z.infer<typeof schema>
  try { body = schema.parse(await req.json()) }
  catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }) }

  const approverName = session.user.name ?? session.user.email ?? session.user.id

  // Load admin email for notifications
  const admin = await db.user.findFirst({ where: { role: Role.ADMIN }, select: { email: true } })
  const adminEmail = admin?.email ?? ""

  if (body.action === "APPROVE") {
    await db.$transaction(async (tx) => {
      await tx.timesheet.update({ where: { id }, data: { status: TimesheetStatus.APPROVED, approvedAt: new Date(), approvedBy: approverName, rejectionNote: null } })
      await tx.timeEntry.updateMany({ where: { timesheetId: id, status: TimeEntryStatus.SUBMITTED }, data: { status: TimeEntryStatus.APPROVED } })
    })
    await audit({ userId: session.user.id, action: AuditAction.TIMESHEET_APPROVED, resource: "timesheet", resourceId: id, metadata: { approver: approverName }, ipAddress: getClientIp(req), userAgent: req.headers.get("user-agent") ?? undefined, success: true })
    if (adminEmail && session.user.email !== adminEmail) {
      sendApprovalConfirmed(adminEmail, { clientName: timesheet.client.name, periodStart: timesheet.periodStart, periodEnd: timesheet.periodEnd, timesheetId: id }, approverName).catch(() => {})
    }

  } else if (body.action === "REJECT") {
    await db.$transaction(async (tx) => {
      await tx.timesheet.update({ where: { id }, data: { status: TimesheetStatus.REJECTED, rejectionNote: body.rejectionNote } })
      await tx.timeEntry.updateMany({ where: { timesheetId: id, status: TimeEntryStatus.SUBMITTED }, data: { status: TimeEntryStatus.REJECTED } })
    })
    await audit({ userId: session.user.id, action: AuditAction.TIMESHEET_REJECTED, resource: "timesheet", resourceId: id, metadata: { approver: approverName, note: body.rejectionNote }, ipAddress: getClientIp(req), userAgent: req.headers.get("user-agent") ?? undefined, success: true })
    if (adminEmail && session.user.email !== adminEmail) {
      sendRejectionNotification(adminEmail, { clientName: timesheet.client.name, periodStart: timesheet.periodStart, periodEnd: timesheet.periodEnd, timesheetId: id }, approverName, body.rejectionNote ?? "").catch(() => {})
    }

  } else if (body.action === "PARTIAL") {
    const { approvedEntryIds, rejectedEntryIds } = body as Extract<z.infer<typeof schema>, { action: "PARTIAL" }>
    await db.$transaction(async (tx) => {
      await tx.timeEntry.updateMany({ where: { id: { in: approvedEntryIds }, timesheetId: id }, data: { status: TimeEntryStatus.APPROVED } })
      await tx.timeEntry.updateMany({ where: { id: { in: rejectedEntryIds }, timesheetId: id }, data: { status: TimeEntryStatus.REJECTED, timesheetId: null } })
      await tx.timesheet.update({ where: { id }, data: { status: TimesheetStatus.PARTIALLY_APPROVED, rejectionNote: body.rejectionNote ?? null } })
    })
    await audit({ userId: session.user.id, action: AuditAction.PARTIALLY_APPROVED, resource: "timesheet", resourceId: id, metadata: { approver: approverName, approved: approvedEntryIds.length, rejected: rejectedEntryIds.length }, ipAddress: getClientIp(req), userAgent: req.headers.get("user-agent") ?? undefined, success: true })
    if (adminEmail) {
      sendPartialApprovalNotification(adminEmail, { clientName: timesheet.client.name, periodStart: timesheet.periodStart, periodEnd: timesheet.periodEnd, timesheetId: id }, approvedEntryIds.length, rejectedEntryIds.length, approverName).catch(() => {})
    }
  }

  const updated = await db.timesheet.findUnique({ where: { id } })
  return NextResponse.json(updated)
}
