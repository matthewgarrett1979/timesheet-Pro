/**
 * Email delivery via Resend.
 *
 * All emails are plain-HTML; the Resend SDK handles delivery.
 * Set RESEND_API_KEY and RESEND_FROM_ADDRESS in environment variables.
 *
 * If RESEND_API_KEY is not set, emails are logged to console (dev mode).
 */

import { Resend } from "resend"

const apiKey = process.env.RESEND_API_KEY
const FROM   = process.env.RESEND_FROM_ADDRESS ?? "noreply@timesheet.app"
const APP    = process.env.NEXT_PUBLIC_APP_NAME ?? "Tech Timesheet"
const BASE   = process.env.NEXTAUTH_URL ?? "http://localhost:3000"

const resend = apiKey ? new Resend(apiKey) : null

async function send(to: string, subject: string, html: string): Promise<void> {
  if (!resend) {
    console.log(`[email dev] To: ${to} | Subject: ${subject}`)
    return
  }
  const { error } = await resend.emails.send({ from: FROM, to, subject, html })
  if (error) console.error("[email] send failed:", error)
}

// ---------------------------------------------------------------------------
// Template helpers
// ---------------------------------------------------------------------------

function layout(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${title}</title>
<style>
  body{font-family:Arial,sans-serif;background:#f9fafb;color:#111827;margin:0;padding:0}
  .wrap{max-width:600px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb}
  .header{background:#1e293b;padding:24px 32px}
  .header h1{color:#fff;margin:0;font-size:20px}
  .body{padding:32px}
  .footer{padding:16px 32px;background:#f3f4f6;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb}
  table{width:100%;border-collapse:collapse;margin:16px 0}
  th{text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;padding:6px 8px}
  td{padding:8px;border-bottom:1px solid #f3f4f6;font-size:14px}
  .btn{display:inline-block;padding:12px 24px;border-radius:6px;color:#fff;text-decoration:none;font-weight:600;margin:4px 4px 4px 0}
  .btn-primary{background:#2563eb}
  .btn-danger{background:#dc2626}
  .highlight{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:16px;margin:16px 0}
</style></head><body>
<div class="wrap">
  <div class="header"><h1>${APP}</h1></div>
  <div class="body">${body}</div>
  <div class="footer">This email was sent by ${APP}. Do not reply to this message.</div>
</div></body></html>`
}

function entriesTable(entries: EmailEntry[]): string {
  const rows = entries.map(e =>
    `<tr><td>${fmtDate(e.date)}</td><td>${e.project ?? "—"}</td><td>${e.phase ?? "—"}</td>
     <td style="text-align:right">${Number(e.hours).toFixed(2)}</td>
     <td>${e.billable ? "Yes" : "No"}</td><td>${e.description}</td></tr>`
  ).join("")
  return `<table>
    <thead><tr><th>Date</th><th>Project</th><th>Phase</th><th>Hours</th><th>Billable</th><th>Description</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`
}

function fmtDate(d: string | Date): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function fmtPeriod(start: Date, end: Date): string {
  return `${fmtDate(start)} – ${fmtDate(end)}`
}

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface EmailEntry {
  date: string | Date
  project?: string | null
  phase?: string | null
  hours: number | string
  billable: boolean
  description: string
}

export interface TimesheetEmailData {
  clientName: string
  managerName: string
  managerEmail: string
  periodStart: Date
  periodEnd: Date
  totalHours: number
  billableHours: number
  totalValue: number
  currency: string
  entries: EmailEntry[]
  timesheetId: string
  adminEmail: string
}

// ---------------------------------------------------------------------------
// 1. Customer approval request (external, token link)
// ---------------------------------------------------------------------------

export async function sendCustomerApprovalRequest(
  to: string,
  data: TimesheetEmailData,
  approvalToken: string
): Promise<void> {
  const approveUrl = `${BASE}/api/approvals/${approvalToken}?action=approve`
  const rejectUrl  = `${BASE}/api/approvals/${approvalToken}?action=reject`
  const period     = fmtPeriod(data.periodStart, data.periodEnd)
  const currency   = data.currency

  const body = `
    <p>Dear ${data.clientName},</p>
    <p>Please review and approve the timesheet for the period <strong>${period}</strong>.</p>
    <table style="width:auto;margin:12px 0"><tbody>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Manager</td><td>${data.managerName}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Period</td><td>${period}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Total hours</td><td>${data.totalHours.toFixed(2)}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Billable hours</td><td>${data.billableHours.toFixed(2)}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Total value</td><td>${currency} ${data.totalValue.toFixed(2)}</td></tr>
    </tbody></table>
    <h3 style="font-size:14px;margin-top:24px">Timesheet entries</h3>
    ${entriesTable(data.entries)}
    <p style="margin-top:24px">To approve this timesheet, click the button below:</p>
    <a href="${approveUrl}" class="btn btn-primary">Approve Timesheet</a>
    <a href="${rejectUrl}" class="btn btn-danger">Request Changes</a>
    <p style="font-size:12px;color:#6b7280;margin-top:16px">
      This link expires in 30 days and can only be used once.
      If you need a new link, contact ${data.managerEmail}.
    </p>`

  await send(
    to,
    `Timesheet approval required — ${data.clientName} ${period}`,
    layout(`Timesheet Approval — ${data.clientName}`, body)
  )
}

// ---------------------------------------------------------------------------
// 2. Manager approval request (internal, app link)
// ---------------------------------------------------------------------------

export async function sendManagerApprovalRequest(
  to: string,
  data: TimesheetEmailData
): Promise<void> {
  const appUrl = `${BASE}/approvals`
  const period = fmtPeriod(data.periodStart, data.periodEnd)

  const body = `
    <p>A timesheet has been submitted for your approval.</p>
    <table style="width:auto;margin:12px 0"><tbody>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Client</td><td>${data.clientName}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Period</td><td>${period}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Total hours</td><td>${data.totalHours.toFixed(2)}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Billable hours</td><td>${data.billableHours.toFixed(2)}</td></tr>
    </tbody></table>
    ${entriesTable(data.entries)}
    <p style="margin-top:24px">
      <a href="${appUrl}" class="btn btn-primary">Review in ${APP}</a>
    </p>`

  await send(
    to,
    `Timesheet approval required — ${data.clientName} ${period}`,
    layout(`Timesheet Approval Request`, body)
  )
}

// ---------------------------------------------------------------------------
// 3. Approval confirmed (to Admin)
// ---------------------------------------------------------------------------

export async function sendApprovalConfirmed(
  to: string,
  data: Pick<TimesheetEmailData, "clientName" | "periodStart" | "periodEnd" | "timesheetId">,
  approvedBy: string
): Promise<void> {
  const period = fmtPeriod(data.periodStart, data.periodEnd)
  const appUrl = `${BASE}/timesheets`
  const body = `
    <div class="highlight">
      <p>✅ Timesheet approved by <strong>${approvedBy}</strong></p>
    </div>
    <table style="width:auto;margin:12px 0"><tbody>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Client</td><td>${data.clientName}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Period</td><td>${period}</td></tr>
    </tbody></table>
    <a href="${appUrl}" class="btn btn-primary">View in ${APP}</a>`

  await send(
    to,
    `Timesheet approved — ${data.clientName} ${period}`,
    layout("Timesheet Approved", body)
  )
}

// ---------------------------------------------------------------------------
// 4. Rejection / changes requested (to Admin)
// ---------------------------------------------------------------------------

export async function sendRejectionNotification(
  to: string,
  data: Pick<TimesheetEmailData, "clientName" | "periodStart" | "periodEnd" | "timesheetId">,
  rejectedBy: string,
  note: string
): Promise<void> {
  const period = fmtPeriod(data.periodStart, data.periodEnd)
  const appUrl = `${BASE}/timesheets`
  const body = `
    <p>A timesheet has been rejected / changes requested.</p>
    <table style="width:auto;margin:12px 0"><tbody>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Client</td><td>${data.clientName}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Period</td><td>${period}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Rejected by</td><td>${rejectedBy}</td></tr>
    </tbody></table>
    ${note ? `<p><strong>Note:</strong> ${note}</p>` : ""}
    <a href="${appUrl}" class="btn btn-primary">View in ${APP}</a>`

  await send(
    to,
    `Timesheet rejected — ${data.clientName} ${period}`,
    layout("Timesheet Rejected", body)
  )
}

// ---------------------------------------------------------------------------
// 5. Approval reminder (resend of original request)
// ---------------------------------------------------------------------------

export async function sendApprovalReminder(
  to: string,
  data: TimesheetEmailData,
  approvalToken: string | null,
  isManager: boolean
): Promise<void> {
  const period = fmtPeriod(data.periodStart, data.periodEnd)
  if (isManager) {
    await sendManagerApprovalRequest(to, data)
  } else if (approvalToken) {
    await sendCustomerApprovalRequest(to, data, approvalToken)
  }
  void period // used in the called functions
}

// ---------------------------------------------------------------------------
// 6. Partial approval notification (to Admin)
// ---------------------------------------------------------------------------

export async function sendPartialApprovalNotification(
  to: string,
  data: Pick<TimesheetEmailData, "clientName" | "periodStart" | "periodEnd" | "timesheetId">,
  approvedCount: number,
  rejectedCount: number,
  approvedBy: string
): Promise<void> {
  const period = fmtPeriod(data.periodStart, data.periodEnd)
  const appUrl = `${BASE}/timesheets`
  const body = `
    <p>A timesheet has been partially approved.</p>
    <table style="width:auto;margin:12px 0"><tbody>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Client</td><td>${data.clientName}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Period</td><td>${period}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Approved by</td><td>${approvedBy}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Entries approved</td><td>${approvedCount}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Entries rejected</td><td>${rejectedCount}</td></tr>
    </tbody></table>
    <a href="${appUrl}" class="btn btn-primary">View in ${APP}</a>`

  await send(
    to,
    `Timesheet partially approved — ${data.clientName} ${period}`,
    layout("Partial Approval", body)
  )
}

// ---------------------------------------------------------------------------
// 7. Budget alert
// ---------------------------------------------------------------------------

export async function sendBudgetAlert(
  to: string,
  projectName: string,
  clientName: string,
  billingType: string,
  budgetHours: number | null,
  usedHours: number,
  threshold: number,
  projectId: string
): Promise<void> {
  const pct = budgetHours ? Math.round((usedHours / budgetHours) * 100) : 0
  const appUrl = `${BASE}/projects/${projectId}`
  const body = `
    <p>Budget threshold reached for project <strong>${projectName}</strong>.</p>
    <table style="width:auto;margin:12px 0"><tbody>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Client</td><td>${clientName}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Billing type</td><td>${billingType}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Budget hours</td><td>${budgetHours ?? "N/A"}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Hours used</td><td>${usedHours.toFixed(2)}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">% consumed</td><td><strong>${pct}%</strong> (threshold: ${threshold}%)</td></tr>
    </tbody></table>
    <a href="${appUrl}" class="btn btn-primary">View Project</a>`

  await send(
    to,
    `Budget alert: ${projectName} at ${pct}%`,
    layout("Budget Alert", body)
  )
}

// ---------------------------------------------------------------------------
// 8. Weekly hours reminder
// ---------------------------------------------------------------------------

export async function sendWeeklyReminder(
  to: string,
  name: string,
  hoursLogged: number,
  threshold: number
): Promise<void> {
  const appUrl = `${BASE}/time-entries`
  const missing = Math.max(0, threshold - hoursLogged).toFixed(2)
  const body = `
    <p>Hi ${name},</p>
    <p>You've logged <strong>${hoursLogged.toFixed(2)} hours</strong> this week.
       Your target is <strong>${threshold} hours</strong> — you're ${missing} hours short.</p>
    <a href="${appUrl}" class="btn btn-primary">Log time now</a>`

  await send(
    to,
    `Reminder: log your time for this week`,
    layout("Weekly Time Reminder", body)
  )
}
