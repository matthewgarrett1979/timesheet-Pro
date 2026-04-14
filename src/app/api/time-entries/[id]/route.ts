/**
 * GET    /api/time-entries/[id]  — fetch a single entry
 * PATCH  /api/time-entries/[id]  — update entry (DRAFT only)
 * DELETE /api/time-entries/[id]  — delete entry (DRAFT only)
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { getTimeEntryForUser } from "@/lib/authorization"
import { audit, getClientIp } from "@/lib/audit"
import { checkRateLimit } from "@/lib/rate-limit"
import { AuditAction, Role, TimeEntryStatus } from "@prisma/client"
import { z } from "zod"

const patchSchema = z.object({
  date:        z.string().datetime().optional(),
  projectId:   z.string().cuid().nullish(),
  phaseId:     z.string().cuid().nullish(),
  categoryId:  z.string().cuid().nullish(),
  hours:       z.number().min(0.25).max(24).optional(),
  description: z.string().trim().min(1).max(1000).optional(),
  isBillable:  z.boolean().optional(),
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

  const entry = await getTimeEntryForUser(id, session.user.id, session.user.role as Role)
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json(entry)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })

  const entry = await getTimeEntryForUser(id, session.user.id, session.user.role as Role)
  if (!entry) {
    await audit({
      userId: session.user.id,
      action: AuditAction.UNAUTHORISED_ACCESS,
      resource: "time-entry",
      resourceId: id,
      metadata: { action: "update" },
      ipAddress: getClientIp(req),
      success: false,
    })
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (entry.status !== TimeEntryStatus.DRAFT) {
    return NextResponse.json(
      { error: "Only DRAFT entries can be edited" },
      { status: 409 }
    )
  }

  let body: z.infer<typeof patchSchema>
  try {
    body = patchSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const updated = await db.timeEntry.update({
    where: { id },
    data: {
      ...(body.date        !== undefined ? { date: new Date(body.date) } : {}),
      ...(body.projectId   !== undefined ? { projectId:  body.projectId  ?? null } : {}),
      ...(body.phaseId     !== undefined ? { phaseId:    body.phaseId    ?? null } : {}),
      ...(body.categoryId  !== undefined ? { categoryId: body.categoryId ?? null } : {}),
      ...(body.hours       !== undefined ? { hours:       body.hours }       : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.isBillable  !== undefined ? { isBillable:  body.isBillable }  : {}),
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
    action: AuditAction.TIME_ENTRY_UPDATED,
    resource: "time-entry",
    resourceId: id,
    metadata: { changes: body },
    ipAddress:  getClientIp(req),
    userAgent:  req.headers.get("user-agent") ?? undefined,
    success:    true,
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })

  const entry = await getTimeEntryForUser(id, session.user.id, session.user.role as Role)
  if (!entry) {
    await audit({
      userId: session.user.id,
      action: AuditAction.UNAUTHORISED_ACCESS,
      resource: "time-entry",
      resourceId: id,
      metadata: { action: "delete" },
      ipAddress: getClientIp(req),
      success: false,
    })
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (entry.status !== TimeEntryStatus.DRAFT) {
    return NextResponse.json(
      { error: "Only DRAFT entries can be deleted" },
      { status: 409 }
    )
  }

  await db.timeEntry.delete({ where: { id } })

  await audit({
    userId: session.user.id,
    action: AuditAction.TIME_ENTRY_DELETED,
    resource: "time-entry",
    resourceId: id,
    metadata: {
      clientId:  entry.clientId,
      projectId: entry.projectId,
      date:      entry.date,
      hours:     entry.hours.toString(),
    },
    ipAddress: getClientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
    success:   true,
  })

  return new NextResponse(null, { status: 204 })
}
