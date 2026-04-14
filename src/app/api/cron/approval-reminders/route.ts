/**
 * GET /api/cron/approval-reminders
 *
 * Vercel cron job — runs daily at 09:00 UTC.
 * Sends reminder emails for SUBMITTED timesheets with no action after 5 days.
 * Maximum 2 reminders per timesheet.
 *
 * Protected by CRON_SECRET header.
 */
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { createApprovalToken } from "@/lib/tokens"
import { sendApprovalReminder, type EmailEntry } from "@/lib/email"

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)

  // Find SUBMITTED timesheets older than 5 days with fewer than 2 reminders
  const timesheets = await db.timesheet.findMany({
    where: {
      status:        "SUBMITTED",
      submittedAt:   { lte: fiveDaysAgo },
      reminderCount: { lt: 2 },
    },
    include: {
      client:  { select: { name: true, contactEmail: true, approvalType: true, managerId: true, defaultRate: true, invoiceCurrency: true } },
      manager: { select: { name: true, email: true } },
      entries: {
        include: {
          project:  { select: { name: true, rateOverride: true } },
          phase:    { select: { name: true } },
          category: { select: { name: true } },
        },
      },
    },
  })

  let sent = 0
  for (const ts of timesheets) {
    try {
      const emailEntries: EmailEntry[] = ts.entries.map(e => ({
        date:        e.date,
        project:     e.project?.name,
        phase:       e.phase?.name,
        hours:       Number(e.hours),
        billable:    e.isBillable,
        description: e.description,
      }))

      const totalHours    = emailEntries.reduce((s, e) => s + Number(e.hours), 0)
      const billableHours = emailEntries.filter(e => e.billable).reduce((s, e) => s + Number(e.hours), 0)
      const rate          = Number(ts.client.defaultRate ?? 0)
      const totalValue    = billableHours * rate

      const admin = await db.user.findFirst({ where: { role: "ADMIN" }, select: { email: true } })

      const emailData = {
        clientName:   ts.client.name,
        managerName:  ts.manager?.name ?? "Manager",
        managerEmail: ts.manager?.email ?? "",
        periodStart:  ts.periodStart,
        periodEnd:    ts.periodEnd,
        totalHours,
        billableHours,
        totalValue,
        currency:    ts.client.invoiceCurrency ?? "GBP",
        entries:     emailEntries,
        timesheetId: ts.id,
        adminEmail:  admin?.email ?? "",
      }

      const isManager      = ts.client.approvalType === "PORTAL"
      let token: string | null = null

      if (ts.client.approvalType === "EMAIL") {
        token = await createApprovalToken({ timesheetId: ts.id, clientId: ts.client.name, createdById: ts.managerId })
      }

      const to = isManager
        ? (ts.manager?.email ?? "")
        : (ts.client.contactEmail ?? "")

      if (to) {
        await sendApprovalReminder(to, emailData, token, isManager)
        await db.timesheet.update({ where: { id: ts.id }, data: { reminderCount: { increment: 1 } } })
        sent++
      }
    } catch (err) {
      console.error(`[cron/approval-reminders] failed for ${ts.id}:`, err)
    }
  }

  return NextResponse.json({ ok: true, sent, checked: timesheets.length })
}
