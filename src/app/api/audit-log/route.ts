/**
 * GET /api/audit-log
 *
 * ADMIN-only endpoint. Returns paginated audit log entries.
 * Middleware also enforces ADMIN-only access to /api/audit-log.
 *
 * Query params:
 *   page     — page number (default: 1)
 *   limit    — results per page (max: 100, default: 50)
 *   userId   — filter by user
 *   action   — filter by AuditAction
 *   from     — ISO-8601 start date
 *   to       — ISO-8601 end date
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { checkRateLimit } from "@/lib/rate-limit"
import { AuditAction, Role } from "@prisma/client"

export async function GET(req: NextRequest) {
  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })

  // Double-check role — middleware is a first line, this is defence-in-depth
  if ((session.user.role as Role) !== Role.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = req.nextUrl

  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50")))
  const userId = searchParams.get("userId") ?? undefined
  const action = searchParams.get("action") as AuditAction | null
  const from = searchParams.get("from")
  const to = searchParams.get("to")

  const where = {
    ...(userId ? { userId } : {}),
    ...(action ? { action } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {}),
  }

  const [entries, total] = await db.$transaction([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    }),
    db.auditLog.count({ where }),
  ])

  return NextResponse.json({
    data: entries,
    meta: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  })
}
