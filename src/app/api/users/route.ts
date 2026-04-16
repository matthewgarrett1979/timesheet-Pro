/**
 * GET  /api/users   — ADMIN: list all users; others: returns self only
 * POST /api/users   — ADMIN only: create a new user with auto-generated temp password
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { hashPassword } from "@/lib/password"
import { audit, getClientIp } from "@/lib/audit"
import { checkRateLimit } from "@/lib/rate-limit"
import { AuditAction, Role } from "@prisma/client"
import { z } from "zod"
import { randomBytes } from "crypto"

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().email(),
  role: z.enum(["ADMIN", "MANAGER", "USER"]).default("USER"),
})

export async function GET(req: NextRequest) {
  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })

  // Non-admins can only see themselves
  if ((session.user.role as Role) !== Role.ADMIN) {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true, email: true, name: true, role: true,
        mfaEnabled: true, mustChangePassword: true, createdAt: true, updatedAt: true,
      },
    })
    return NextResponse.json([user])
  }

  const users = await db.user.findMany({
    select: {
      id: true, email: true, name: true, role: true,
      mfaEnabled: true, failedLogins: true, lockedUntil: true,
      mustChangePassword: true, createdAt: true, updatedAt: true,
    },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json(users)
}

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })

  if ((session.user.role as Role) !== Role.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: z.infer<typeof createSchema>
  try {
    body = createSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const existing = await db.user.findUnique({ where: { email: body.email.toLowerCase() } })
  if (existing) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 })
  }

  // Auto-generate a secure temporary password
  const tempPassword = randomBytes(12).toString("base64")
  const passwordHash = await hashPassword(tempPassword)

  const user = await db.user.create({
    data: {
      name: body.name,
      email: body.email.toLowerCase(),
      passwordHash,
      role: body.role as Role,
      mustChangePassword: true,
    },
    select: {
      id: true, email: true, name: true, role: true,
      mfaEnabled: true, mustChangePassword: true, createdAt: true,
    },
  })

  await audit({
    userId: session.user.id,
    action: AuditAction.USER_CREATED,
    resource: "user",
    resourceId: user.id,
    metadata: { email: user.email, role: user.role },
    ipAddress: getClientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
    success: true,
  })

  // Return tempPassword once — it is never stored in plaintext
  return NextResponse.json({ ...user, tempPassword }, { status: 201 })
}
