/**
 * POST /api/timesheets/[id]/resend-approval
 *
 * Admin only. Generates a new approval token for a SUBMITTED timesheet and
 * resends the approval email to the client contact (approvalType = EMAIL)
 * or re-sends the manager notification.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { getTimesheetForUser } from "@/lib/authorization"
import { createApprovalToken } from "@/lib/tokens"
import { audit, getClientIp } from "@/lib/audit"
import { checkRateLimit } from "@/lib/rate-limit"
import { sendCustomerApprovalRequest, sendManagerApprovalRequest, EmailEntry } from "@/lib/email"
import { AuditAction, Role, TimesheetStatus } from "@prisma/client"

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
  if (session.user.role !== Role.ADMIN) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const timesheet = await getTimesheetForUser(id, session.user.id, Role.ADMIN)
  if (!timesheet) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (timesheet.status !== TimesheetStatus.SUBMITTED) {
    return NextResponse.json({ error: "Only SUBMITTED timesheets can have approval emails resent" }, { status: 409 })
  }

  const client = await db.client.findUnique({
    where: { id: timesheet.clientId },
    select: { name: true, contactEmail: true, managerId: true, approvalType: true, defaultRate: true, invoiceCurrency: true },
  })
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 })

  const manager = await db.user.findUnique({
    where: { id: timesheet.managerId },
    select: { name: true, email: true },
  })

  const entries = timesheet.entries as Array<{
    date: Date; hours: unknown; isBillable: boolean; description: string
    project?: { name: string } | null
    phase?: { name: string } | null
  }>
  const emailEntries: EmailEntry[] = entries.map(e => ({
    date: e.date,
    project: (e as { project?: { name: string } | null }).project?.name,
    phase: (e as { phase?: { name: string } | null }).phase?.name,
    hours: Number(e.hours),
    billable: e.isBillable,
    description: e.description,
  }))

  const totalHours    = emailEntries.reduce((s, e) => s + Number(e.hours), 0)
  const billableHours = emailEntries.filter(e => e.billable).reduce((s, e) => s + Number(e.hours), 0)
  const rate          = Number(client.defaultRate ?? 0)
  const totalValue    = billableHours * rate

  const emailData = {
    clientName:   client.name,
    managerName:  manager?.name ?? "Manager",
    managerEmail: manager?.email ?? "",
    periodStart:  timesheet.periodStart,
    periodEnd:    timesheet.periodEnd,
    totalHours,
    billableHours,
    totalValue,
    currency: client.invoiceCurrency ?? "GBP",
    entries: emailEntries,
    timesheetId: id,
    adminEmail: session.user.email ?? "",
  }

  if (client.approvalType === "EMAIL") {
    const token = await createApprovalToken({ timesheetId: id, clientId: client.name, createdById: session.user.id })
    if (client.contactEmail) {
      await sendCustomerApprovalRequest(client.contactEmail, emailData, token)
    }
  } else if (client.approvalType === "PORTAL" && manager?.email) {
    await sendManagerApprovalRequest(manager.email, emailData)
  }

  await db.timesheet.update({ where: { id }, data: { reminderCount: { increment: 1 } } })

  await audit({ userId: session.user.id, action: AuditAction.RESEND_EMAIL, resource: "timesheet", resourceId: id, metadata: { approvalType: client.approvalType }, ipAddress: getClientIp(req), userAgent: req.headers.get("user-agent") ?? undefined, success: true })

  return NextResponse.json({ ok: true })
}
