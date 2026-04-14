/**
 * GET  /api/timesheets  — list timesheet bundles (row-level scoped)
 * POST /api/timesheets  — create a new timesheet bundle from selected time entries
 *
 * A Timesheet is a submission container: a set of approved time entries
 * grouped for a specific client and period. Entries must be DRAFT and
 * unsubmitted (timesheetId IS NULL) to be eligible for bundling.
 *
 * Query params for GET:
 *   clientId  — filter by client
 *   status    — filter by TimesheetStatus
 *   projectId — filter by project (entry-level)
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  listTimesheetsForUser,
  assertClientOwnership,
} from "@/lib/authorization"
import { audit, getClientIp } from "@/lib/audit"
import { checkRateLimit } from "@/lib/rate-limit"
import { AuditAction, Role, TimesheetGranularity, TimeEntryStatus } from "@prisma/client"
import { z } from "zod"

const createSchema = z.object({
  clientId:    z.string().cuid("Invalid client ID"),
  periodStart: z.string().datetime({ message: "periodStart must be ISO-8601" }),
  periodEnd:   z.string().datetime({ message: "periodEnd must be ISO-8601" }),
  granularity: z.enum(["WEEKLY", "MONTHLY"]).default("WEEKLY"),
  entryIds:    z.array(z.string().cuid()).min(1, "Select at least one time entry"),
})

export async function GET(req: NextRequest) {
  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })

  const { searchParams } = req.nextUrl
  const timesheets = await listTimesheetsForUser(
    session.user.id,
    session.user.role as Role,
    {
      clientId:  searchParams.get("clientId")  ?? undefined,
      status:    searchParams.get("status")    ?? undefined,
      projectId: searchParams.get("projectId") ?? undefined,
    }
  )

  return NextResponse.json(timesheets)
}

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })

  let body: z.infer<typeof createSchema>
  try {
    body = createSchema.parse(await req.json())
  } catch (err) {
    return NextResponse.json({ error: "Invalid request body", detail: err }, { status: 400 })
  }

  // Row-level security: caller must own the target client
  try {
    await assertClientOwnership(body.clientId, session.user.id, session.user.role as Role)
  } catch {
    await audit({
      userId: session.user.id,
      action: AuditAction.UNAUTHORISED_ACCESS,
      resource: "timesheet",
      metadata: { clientId: body.clientId, action: "create" },
      ipAddress: getClientIp(req),
      success: false,
    })
    return NextResponse.json({ error: "Client not found" }, { status: 404 })
  }

  // Prevent duplicate bundles for the same client + period that are still active
  const existing = await db.timesheet.findFirst({
    where: {
      clientId:    body.clientId,
      periodStart: new Date(body.periodStart),
      periodEnd:   new Date(body.periodEnd),
      status:      { in: ["DRAFT", "SUBMITTED", "APPROVED"] },
    },
    select: { id: true, status: true },
  })
  if (existing) {
    return NextResponse.json(
      { error: `A timesheet for this period already exists (${existing.status})`, timesheetId: existing.id },
      { status: 409 }
    )
  }

  // Verify all selected entries:
  //   - belong to the caller
  //   - belong to the requested client
  //   - are DRAFT and unsubmitted
  const userId = session.user.id
  const role   = session.user.role as Role
  const managerFilter = role !== Role.ADMIN ? { managerId: userId } : {}

  const eligible = await db.timeEntry.findMany({
    where: {
      id:          { in: body.entryIds },
      clientId:    body.clientId,
      status:      TimeEntryStatus.DRAFT,
      timesheetId: null,
      ...managerFilter,
    },
    select: { id: true },
  })

  if (eligible.length !== body.entryIds.length) {
    return NextResponse.json(
      {
        error: "Some entries are invalid — they must be DRAFT, unsubmitted, and belong to the selected client",
        requested: body.entryIds.length,
        eligible:  eligible.length,
      },
      { status: 422 }
    )
  }

  // Create timesheet and link entries atomically
  const timesheet = await db.$transaction(async (tx) => {
    const ts = await tx.timesheet.create({
      data: {
        clientId:    body.clientId,
        managerId:   userId,
        periodStart: new Date(body.periodStart),
        periodEnd:   new Date(body.periodEnd),
        granularity: body.granularity as TimesheetGranularity,
      },
    })

    await tx.timeEntry.updateMany({
      where: { id: { in: body.entryIds } },
      data: {
        timesheetId: ts.id,
        status:      TimeEntryStatus.SUBMITTED,
      },
    })

    return tx.timesheet.findUnique({
      where: { id: ts.id },
      include: {
        client:  { select: { id: true, name: true, approvalType: true } },
        entries: {
          include: {
            project:  { select: { id: true, name: true } },
            phase:    { select: { id: true, name: true } },
            category: { select: { id: true, name: true } },
          },
        },
      },
    })
  })

  await audit({
    userId: session.user.id,
    action: AuditAction.TIMESHEET_CREATED,
    resource: "timesheet",
    resourceId: timesheet!.id,
    metadata: {
      clientId:    body.clientId,
      periodStart: body.periodStart,
      periodEnd:   body.periodEnd,
      granularity: body.granularity,
      entryCount:  body.entryIds.length,
    },
    ipAddress: getClientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
    success:   true,
  })

  return NextResponse.json(timesheet, { status: 201 })
}
