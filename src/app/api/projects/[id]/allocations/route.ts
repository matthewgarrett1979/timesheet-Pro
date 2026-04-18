/**
 * GET  /api/projects/[id]/allocations  — list resource allocations
 * POST /api/projects/[id]/allocations  — create allocation (ADMIN/MANAGER)
 *
 * Query params for GET:
 *   userId   — filter by user
 *   dateFrom — ISO date (inclusive)
 *   dateTo   — ISO date (inclusive)
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getProjectForUser } from "@/lib/authorization"
import { audit, getClientIp } from "@/lib/audit"
import { checkRateLimit } from "@/lib/rate-limit"
import { AuditAction, Role } from "@prisma/client"
import { z } from "zod"
import { db } from "@/lib/db"

const createSchema = z.object({
  userId:       z.string().cuid(),
  date:         z.string().datetime(),
  plannedHours: z.number().min(0.25).max(24),
  notes:        z.string().max(500).nullish(),
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })

  const project = await getProjectForUser(id, session.user.id, session.user.role as Role)
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { searchParams } = req.nextUrl
  const userId   = searchParams.get("userId")   ?? undefined
  const dateFrom = searchParams.get("dateFrom") ?? undefined
  const dateTo   = searchParams.get("dateTo")   ?? undefined

  const allocations = await db.resourceAllocation.findMany({
    where: {
      projectId: id,
      ...(userId ? { userId } : {}),
      ...(dateFrom || dateTo
        ? {
            date: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo   ? { lte: new Date(dateTo) }   : {}),
            },
          }
        : {}),
    },
    include: {
      user:      { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: [{ date: "asc" }, { userId: "asc" }],
  })

  return NextResponse.json(allocations)
}

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
  if (session.user.role === Role.USER) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const project = await getProjectForUser(id, session.user.id, session.user.role as Role)
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 })

  let body: z.infer<typeof createSchema>
  try {
    body = createSchema.parse(await req.json())
  } catch (err) {
    return NextResponse.json({ error: "Invalid request body", detail: err }, { status: 400 })
  }

  const allocation = await db.resourceAllocation.upsert({
    where: {
      projectId_userId_date: {
        projectId: id,
        userId:    body.userId,
        date:      new Date(body.date),
      },
    },
    update: {
      plannedHours: body.plannedHours,
      notes:        body.notes ?? null,
      createdById:  session.user.id,
    },
    create: {
      projectId:    id,
      userId:       body.userId,
      date:         new Date(body.date),
      plannedHours: body.plannedHours,
      notes:        body.notes ?? null,
      createdById:  session.user.id,
    },
    include: {
      user:      { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
    },
  })

  await audit({
    userId:     session.user.id,
    action:     AuditAction.RESOURCE_ALLOCATED,
    resource:   "resource-allocation",
    resourceId: allocation.id,
    metadata:   { projectId: id, userId: body.userId, date: body.date, hours: body.plannedHours },
    ipAddress:  getClientIp(req),
    userAgent:  req.headers.get("user-agent") ?? undefined,
    success:    true,
  })

  return NextResponse.json(allocation, { status: 201 })
}
