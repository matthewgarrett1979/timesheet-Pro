/**
 * DELETE /api/projects/[id]/allocations/[allocId]
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getProjectForUser } from "@/lib/authorization"
import { audit, getClientIp } from "@/lib/audit"
import { checkRateLimit } from "@/lib/rate-limit"
import { AuditAction, Role } from "@prisma/client"
import { db } from "@/lib/db"

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; allocId: string }> }
) {
  const { id, allocId } = await params

  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })
  if (session.user.role === Role.USER) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const project = await getProjectForUser(id, session.user.id, session.user.role as Role)
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const alloc = await db.resourceAllocation.findFirst({ where: { id: allocId, projectId: id } })
  if (!alloc) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await db.resourceAllocation.delete({ where: { id: allocId } })

  await audit({
    userId:     session.user.id,
    action:     AuditAction.RESOURCE_DEALLOCATED,
    resource:   "resource-allocation",
    resourceId: allocId,
    metadata:   { projectId: id, userId: alloc.userId, date: alloc.date },
    ipAddress:  getClientIp(req),
    userAgent:  req.headers.get("user-agent") ?? undefined,
    success:    true,
  })

  return new NextResponse(null, { status: 204 })
}
