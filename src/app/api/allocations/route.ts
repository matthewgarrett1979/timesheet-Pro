/**
 * GET /api/allocations — cross-project resource allocations view
 * Query: dateFrom, dateTo, userId (optional for ADMIN/MANAGER)
 * USER role is always scoped to their own allocations.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { checkRateLimit } from "@/lib/rate-limit"
import { Role } from "@prisma/client"

export async function GET(req: NextRequest) {
  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })

  const { searchParams } = req.nextUrl
  const dateFrom = searchParams.get("dateFrom") ?? undefined
  const dateTo   = searchParams.get("dateTo")   ?? undefined
  const userId   = searchParams.get("userId")   ?? undefined

  const role = session.user.role as Role

  // Project scope: USER sees only projects assigned to them; MANAGER sees managed projects; ADMIN sees all
  const projectScope =
    role === Role.USER
      ? { project: { userProjects: { some: { userId: session.user.id } } } }
      : role === Role.ADMIN
        ? {}
        : { project: { managerId: session.user.id } }

  // User scope: USER always sees only self
  const userScope =
    role === Role.USER
      ? { userId: session.user.id }
      : userId ? { userId } : {}

  const allocations = await db.resourceAllocation.findMany({
    where: {
      ...projectScope,
      ...userScope,
      ...(dateFrom || dateTo
        ? {
            date: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo   ? { lte: new Date(dateTo)   } : {}),
            },
          }
        : {}),
    },
    include: {
      user:    { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
    },
    orderBy: [{ date: "asc" }, { userId: "asc" }],
  })

  return NextResponse.json(allocations)
}
