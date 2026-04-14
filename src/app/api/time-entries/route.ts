/**
 * GET  /api/time-entries  — list time entries (row-level scoped)
 * POST /api/time-entries  — create a new time entry
 *
 * Query params for GET:
 *   clientId, projectId, phaseId, categoryId
 *   status       — TimeEntryStatus
 *   isBillable   — "true" | "false"
 *   timesheetId  — filter by timesheet; pass "null" to find unsubmitted entries
 *   dateFrom     — ISO date string (inclusive)
 *   dateTo       — ISO date string (inclusive)
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import {
  listTimeEntriesForUser,
  assertClientOwnership,
} from "@/lib/authorization"
import { audit, getClientIp } from "@/lib/audit"
import { checkRateLimit } from "@/lib/rate-limit"
import { AuditAction, Role } from "@prisma/client"
import { z } from "zod"
import { db } from "@/lib/db"

const createSchema = z.object({
  date:        z.string().datetime({ message: "date must be ISO-8601" }),
  clientId:    z.string().cuid("Invalid client ID"),
  projectId:   z.string().cuid().nullish(),
  phaseId:     z.string().cuid().nullish(),
  categoryId:  z.string().cuid().nullish(),
  hours:       z.number().min(0.25).max(24),
  description: z.string().trim().min(1).max(1000),
  isBillable:  z.boolean().default(true),
})

export async function GET(req: NextRequest) {
  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })

  const { searchParams } = req.nextUrl
  const tsParam = searchParams.get("timesheetId")

  const entries = await listTimeEntriesForUser(
    session.user.id,
    session.user.role as Role,
    {
      clientId:    searchParams.get("clientId")   ?? undefined,
      projectId:   searchParams.get("projectId")  ?? undefined,
      phaseId:     searchParams.get("phaseId")    ?? undefined,
      categoryId:  searchParams.get("categoryId") ?? undefined,
      status:      searchParams.get("status")     ?? undefined,
      isBillable:  searchParams.has("isBillable")
        ? searchParams.get("isBillable") === "true"
        : undefined,
      // "null" string → null (match entries with no timesheet)
      timesheetId: tsParam === "null" ? null : tsParam ?? undefined,
      dateFrom:    searchParams.get("dateFrom") ?? undefined,
      dateTo:      searchParams.get("dateTo")   ?? undefined,
    }
  )

  return NextResponse.json(entries)
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

  // Enforce row-level security on the client
  try {
    await assertClientOwnership(body.clientId, session.user.id, session.user.role as Role)
  } catch {
    await audit({
      userId: session.user.id,
      action: AuditAction.UNAUTHORISED_ACCESS,
      resource: "time-entry",
      metadata: { clientId: body.clientId, action: "create" },
      ipAddress: getClientIp(req),
      success: false,
    })
    return NextResponse.json({ error: "Client not found" }, { status: 404 })
  }

  const entry = await db.timeEntry.create({
    data: {
      date:        new Date(body.date),
      clientId:    body.clientId,
      projectId:   body.projectId  ?? null,
      phaseId:     body.phaseId    ?? null,
      categoryId:  body.categoryId ?? null,
      managerId:   session.user.id,
      hours:       body.hours,
      description: body.description,
      isBillable:  body.isBillable,
    },
    include: {
      client:   { select: { id: true, name: true } },
      project:  { select: { id: true, name: true } },
      phase:    { select: { id: true, name: true } },
      category: { select: { id: true, name: true, colour: true } },
    },
  })

  await audit({
    userId: session.user.id,
    action: AuditAction.TIME_ENTRY_CREATED,
    resource: "time-entry",
    resourceId: entry.id,
    metadata: {
      clientId:  body.clientId,
      projectId: body.projectId,
      date:      body.date,
      hours:     body.hours,
    },
    ipAddress:  getClientIp(req),
    userAgent:  req.headers.get("user-agent") ?? undefined,
    success:    true,
  })

  return NextResponse.json(entry, { status: 201 })
}
