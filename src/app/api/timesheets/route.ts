/**
 * GET  /api/timesheets   — list timesheets (row-level scoped to caller)
 * POST /api/timesheets   — create a new timesheet
 *
 * Query params for GET:
 *   clientId  — filter by client
 *   status    — filter by TimesheetStatus
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
import { AuditAction, Role } from "@prisma/client"
import { z } from "zod"

const createSchema = z.object({
  clientId: z.string().cuid("Invalid client ID"),
  weekStart: z.string().datetime({ message: "weekStart must be an ISO-8601 date" }),
  entries: z
    .array(
      z.object({
        date: z.string().datetime(),
        hours: z.number().min(0.25).max(24),
        description: z.string().trim().min(1).max(500),
      })
    )
    .min(1, "At least one entry is required")
    .max(7, "Maximum 7 entries per timesheet"),
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
      clientId: searchParams.get("clientId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
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

  // Row-level security: verify caller owns the target client
  try {
    await assertClientOwnership(
      body.clientId,
      session.user.id,
      session.user.role as Role
    )
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

  const timesheet = await db.timesheet.create({
    data: {
      clientId: body.clientId,
      managerId: session.user.id,
      weekStart: new Date(body.weekStart),
      entries: {
        create: body.entries.map((e) => ({
          date: new Date(e.date),
          hours: e.hours,
          description: e.description,
        })),
      },
    },
    include: { entries: true, client: true },
  })

  await audit({
    userId: session.user.id,
    action: AuditAction.TIMESHEET_CREATED,
    resource: "timesheet",
    resourceId: timesheet.id,
    metadata: {
      clientId: body.clientId,
      weekStart: body.weekStart,
      entryCount: body.entries.length,
    },
    ipAddress: getClientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
    success: true,
  })

  return NextResponse.json(timesheet, { status: 201 })
}
