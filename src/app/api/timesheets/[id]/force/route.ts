/**
 * POST /api/timesheets/[id]/force  — Admin override actions
 *
 * Body: { action: "FORCE_APPROVE" | "FORCE_REJECT" | "RESET_TO_DRAFT", reason: string }
 *
 * All actions require a mandatory reason and are written to the audit log.
 * ADMIN only.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { getTimesheetForUser } from "@/lib/authorization"
import { audit, getClientIp } from "@/lib/audit"
import { checkRateLimit } from "@/lib/rate-limit"
import { AuditAction, Role, TimesheetStatus, TimeEntryStatus } from "@prisma/client"
import { z } from "zod"

const schema = z.object({
  action: z.enum(["FORCE_APPROVE", "FORCE_REJECT", "RESET_TO_DRAFT"]),
  reason: z.string().trim().min(1, "A reason is required for admin overrides").max(1000),
})

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

  const timesheet = await getTimesheetForUser(id, session.user.id, session.user.role as Role)
  if (!timesheet) {
    await audit({ userId: session.user.id, action: AuditAction.UNAUTHORISED_ACCESS, resource: "timesheet", resourceId: id, metadata: { action: "force" }, ipAddress: getClientIp(req), success: false })
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  let body: z.infer<typeof schema>
  try { body = schema.parse(await req.json()) }
  catch (err) { return NextResponse.json({ error: "Invalid request body", detail: err }, { status: 400 }) }

  const adminName = session.user.name ?? session.user.email ?? session.user.id

  if (body.action === "FORCE_APPROVE") {
    await db.$transaction(async (tx) => {
      await tx.timesheet.update({ where: { id }, data: { status: TimesheetStatus.APPROVED, approvedAt: new Date(), approvedBy: `${adminName} (admin override)`, rejectionNote: null } })
      await tx.timeEntry.updateMany({ where: { timesheetId: id }, data: { status: TimeEntryStatus.APPROVED } })
    })
    await audit({ userId: session.user.id, action: AuditAction.FORCE_APPROVED, resource: "timesheet", resourceId: id, metadata: { reason: body.reason, admin: adminName }, ipAddress: getClientIp(req), userAgent: req.headers.get("user-agent") ?? undefined, success: true })

  } else if (body.action === "FORCE_REJECT") {
    await db.$transaction(async (tx) => {
      await tx.timesheet.update({ where: { id }, data: { status: TimesheetStatus.REJECTED, rejectionNote: body.reason } })
      await tx.timeEntry.updateMany({ where: { timesheetId: id }, data: { status: TimeEntryStatus.REJECTED } })
    })
    await audit({ userId: session.user.id, action: AuditAction.FORCE_REJECTED, resource: "timesheet", resourceId: id, metadata: { reason: body.reason, admin: adminName }, ipAddress: getClientIp(req), userAgent: req.headers.get("user-agent") ?? undefined, success: true })

  } else if (body.action === "RESET_TO_DRAFT") {
    // Unlink entries from timesheet, reset all to DRAFT
    await db.$transaction(async (tx) => {
      await tx.timeEntry.updateMany({ where: { timesheetId: id }, data: { timesheetId: null, status: TimeEntryStatus.DRAFT } })
      await tx.timesheet.update({ where: { id }, data: { status: TimesheetStatus.DRAFT, submittedAt: null, approvedAt: null, approvedBy: null, rejectionNote: body.reason, reminderCount: 0 } })
    })
    await audit({ userId: session.user.id, action: AuditAction.RESET_TO_DRAFT, resource: "timesheet", resourceId: id, metadata: { reason: body.reason, admin: adminName }, ipAddress: getClientIp(req), userAgent: req.headers.get("user-agent") ?? undefined, success: true })
  }

  const updated = await db.timesheet.findUnique({ where: { id } })
  return NextResponse.json(updated)
}
