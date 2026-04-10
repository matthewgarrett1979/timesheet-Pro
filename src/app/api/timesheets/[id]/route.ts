/**
 * GET   /api/timesheets/[id]  — fetch a single timesheet
 * PATCH /api/timesheets/[id]  — update entries (DRAFT only)
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
  entries: z
    .array(
      z.object({
        id: z.string().cuid().optional(), // omit to add new entry
        date: z.string().datetime(),
        hours: z.number().min(0.25).max(24),
        description: z.string().trim().min(1).max(500),
      })
    )
    .min(1)
    .max(7),
})

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })

  const timesheet = await getTimesheetForUser(
    params.id,
    session.user.id,
    session.user.role as Role
  )

  if (!timesheet) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json(timesheet)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })

  const timesheet = await getTimesheetForUser(
    params.id,
    session.user.id,
    session.user.role as Role
  )

  if (!timesheet) {
    await audit({
      userId: session.user.id,
      action: AuditAction.UNAUTHORISED_ACCESS,
      resource: "timesheet",
      resourceId: params.id,
      metadata: { action: "update" },
      ipAddress: getClientIp(req),
      success: false,
    })
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (timesheet.status !== TimesheetStatus.DRAFT) {
    return NextResponse.json(
      { error: "Only DRAFT timesheets can be edited" },
      { status: 409 }
    )
  }

  let body: z.infer<typeof patchSchema>
  try {
    body = patchSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  // Replace all entries atomically
  await db.$transaction([
    db.timesheetEntry.deleteMany({ where: { timesheetId: params.id } }),
    db.timesheetEntry.createMany({
      data: body.entries.map((e) => ({
        timesheetId: params.id,
        date: new Date(e.date),
        hours: e.hours,
        description: e.description,
      })),
    }),
    db.timesheet.update({
      where: { id: params.id },
      data: { updatedAt: new Date() },
    }),
  ])

  await audit({
    userId: session.user.id,
    action: AuditAction.TIMESHEET_UPDATED,
    resource: "timesheet",
    resourceId: params.id,
    metadata: { entryCount: body.entries.length },
    ipAddress: getClientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
    success: true,
  })

  const updated = await getTimesheetForUser(
    params.id,
    session.user.id,
    session.user.role as Role
  )
  return NextResponse.json(updated)
}
