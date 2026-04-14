/**
 * POST /api/timesheets/[id]/submit
 *
 * Transitions a DRAFT timesheet to SUBMITTED.
 * Triggers approval email based on client.approvalType:
 *   EMAIL  → HMAC-signed token emailed to client contactEmail
 *   PORTAL → notification email sent to assigned manager
 *   NONE   → timesheet and entries immediately APPROVED (no email)
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getTimesheetForUser } from "@/lib/authorization"
import { db } from "@/lib/db"
import { createApprovalToken } from "@/lib/tokens"
import { audit, getClientIp } from "@/lib/audit"
import { checkRateLimit } from "@/lib/rate-limit"
import {
  sendCustomerApprovalRequest,
  sendManagerApprovalRequest,
  type EmailEntry,
} from "@/lib/email"
import { AuditAction, Role, TimesheetStatus, TimeEntryStatus } from "@prisma/client"

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
    await audit({ userId: session.user.id, action: AuditAction.UNAUTHORISED_ACCESS, resource: "timesheet", resourceId: id, metadata: { action: "submit" }, ipAddress: getClientIp(req), success: false })
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (timesheet.status !== TimesheetStatus.DRAFT) {
    return NextResponse.json({ error: `Cannot submit a timesheet with status ${timesheet.status}` }, { status: 409 })
  }

  const client = await db.client.findUnique({
    where: { id: timesheet.clientId },
    select: { approvalType: true, contactEmail: true, defaultRate: true, invoiceCurrency: true, name: true },
  })

  const approvalType = client?.approvalType ?? "EMAIL"

  // Build email data (needed for EMAIL and PORTAL types)
  const emailEntries: EmailEntry[] = (timesheet.entries as Array<{
    date: Date; hours: unknown; isBillable: boolean; description: string
    project?: { name?: string | null } | null
    phase?:   { name?: string | null } | null
  }>).map(e => ({
    date: e.date,
    project: e.project?.name,
    phase:   e.phase?.name,
    hours:   Number(e.hours),
    billable: e.isBillable,
    description: e.description,
  }))

  const totalHours    = emailEntries.reduce((s, e) => s + Number(e.hours), 0)
  const billableHours = emailEntries.filter(e => e.billable).reduce((s, e) => s + Number(e.hours), 0)
  const rate          = Number(client?.defaultRate ?? 0)
  const totalValue    = billableHours * rate

  const manager = await db.user.findUnique({ where: { id: timesheet.managerId }, select: { name: true, email: true } })
  const admin   = await db.user.findFirst({ where: { role: Role.ADMIN }, select: { email: true } })

  const emailData = {
    clientName:   timesheet.client.name,
    managerName:  manager?.name ?? "Manager",
    managerEmail: manager?.email ?? "",
    periodStart:  timesheet.periodStart,
    periodEnd:    timesheet.periodEnd,
    totalHours, billableHours, totalValue,
    currency:    client?.invoiceCurrency ?? "GBP",
    entries:     emailEntries,
    timesheetId: id,
    adminEmail:  admin?.email ?? "",
  }

  let approvalToken: string | null = null

  if (approvalType === "NONE") {
    // Auto-approve immediately
    await db.$transaction(async (tx) => {
      await tx.timesheet.update({ where: { id }, data: { status: TimesheetStatus.APPROVED, submittedAt: new Date(), approvedAt: new Date(), approvedBy: "Auto-approved (NONE)" } })
      await tx.timeEntry.updateMany({ where: { timesheetId: id }, data: { status: TimeEntryStatus.APPROVED } })
    })
  } else {
    await db.timesheet.update({ where: { id }, data: { status: TimesheetStatus.SUBMITTED, submittedAt: new Date() } })

    if (approvalType === "EMAIL" && client?.contactEmail) {
      approvalToken = await createApprovalToken({ timesheetId: id, clientId: timesheet.clientId, createdById: session.user.id })
      sendCustomerApprovalRequest(client.contactEmail, emailData, approvalToken).catch(() => {})
    } else if (approvalType === "PORTAL" && manager?.email) {
      approvalToken = await createApprovalToken({ timesheetId: id, clientId: timesheet.clientId, createdById: session.user.id })
      sendManagerApprovalRequest(manager.email, emailData).catch(() => {})
    }
  }

  await audit({ userId: session.user.id, action: AuditAction.TIMESHEET_SUBMITTED, resource: "timesheet", resourceId: id, metadata: { clientId: timesheet.clientId, approvalType }, ipAddress: getClientIp(req), userAgent: req.headers.get("user-agent") ?? undefined, success: true })

  return NextResponse.json({
    ok: true,
    timesheetId: id,
    status: approvalType === "NONE" ? TimesheetStatus.APPROVED : TimesheetStatus.SUBMITTED,
    approvalToken,
  })
}
