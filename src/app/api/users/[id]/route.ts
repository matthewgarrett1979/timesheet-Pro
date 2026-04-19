/**
 * GET    /api/users/[id]  — self or ADMIN: fetch user
 * PATCH  /api/users/[id]  — self: update name/password; ADMIN: also update role/unlock
 * DELETE /api/users/[id]  — ADMIN only; cannot delete self or last admin
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { hashPassword, verifyPassword } from "@/lib/password"
import { audit, getClientIp } from "@/lib/audit"
import { checkRateLimit } from "@/lib/rate-limit"
import { AuditAction, Role } from "@prisma/client"
import { z } from "zod"

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  // Password change requires current password (unless admin resetting for someone else)
  currentPassword: z.string().optional(),
  newPassword: z.string().min(14, "Password must be at least 14 characters").optional(),
  // ADMIN-only fields
  role: z.enum(["ADMIN", "MANAGER", "USER"]).optional(),
  unlock: z.boolean().optional(),
}).refine(
  (d) => !d.newPassword || d.currentPassword,
  { message: "currentPassword is required when changing password", path: ["currentPassword"] }
)

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

  const isSelf = id === session.user.id
  const isAdmin = (session.user.role as Role) === Role.ADMIN

  if (!isSelf && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true, email: true, name: true, role: true,
      mfaEnabled: true, failedLogins: true, lockedUntil: true,
      mustChangePassword: true, createdAt: true, updatedAt: true,
    },
  })

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json(user)
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

  const isSelf = id === session.user.id
  const isAdmin = (session.user.role as Role) === Role.ADMIN

  if (!isSelf && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: z.infer<typeof patchSchema>
  try {
    body = patchSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  // Non-admins cannot change roles or unlock accounts
  if (!isAdmin && (body.role || body.unlock)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const user = await db.user.findUnique({ where: { id } })
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Verify current password when changing password
  let passwordHash: string | undefined
  if (body.newPassword) {
    if (!body.currentPassword) {
      return NextResponse.json({ error: "Current password required" }, { status: 400 })
    }
    const valid = await verifyPassword(body.currentPassword, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 })
    }
    passwordHash = await hashPassword(body.newPassword)
  }

  const updated = await db.user.update({
    where: { id },
    data: {
      ...(body.name ? { name: body.name } : {}),
      ...(passwordHash ? { passwordHash, mustChangePassword: false } : {}),
      ...(body.role && isAdmin ? { role: body.role as Role } : {}),
      ...(body.unlock && isAdmin ? { failedLogins: 0, lockedUntil: null } : {}),
    },
    select: {
      id: true, email: true, name: true, role: true,
      mfaEnabled: true, mustChangePassword: true, createdAt: true, updatedAt: true,
    },
  })

  const action = body.newPassword ? AuditAction.PASSWORD_CHANGED : AuditAction.USER_UPDATED
  await audit({
    userId: session.user.id,
    action,
    resource: "user",
    resourceId: id,
    metadata: {
      changedBy: session.user.id,
      fields: Object.keys(body).filter((k) => k !== "currentPassword" && k !== "newPassword"),
    },
    ipAddress: getClientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
    success: true,
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

  const isAdmin = (session.user.role as Role) === Role.ADMIN
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  if (id === session.user.id) {
    return NextResponse.json({ error: "You cannot delete your own account" }, { status: 409 })
  }

  const target = await db.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true },
  })
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (target.role === Role.ADMIN) {
    const adminCount = await db.user.count({ where: { role: Role.ADMIN } })
    if (adminCount <= 1) {
      return NextResponse.json({ error: "Cannot delete the last admin account" }, { status: 409 })
    }
  }

  // Check for owned data
  const [timesheets, timeEntries, expenses, projects, clients] = await Promise.all([
    db.timesheet.count({ where: { managerId: id } }),
    db.timeEntry.count({ where: { managerId: id } }),
    db.expense.count({ where: { managerId: id } }),
    db.project.count({ where: { managerId: id } }),
    db.client.count({ where: { managerId: id } }),
  ])

  const total = timesheets + timeEntries + expenses + projects + clients
  let body: { cascade?: boolean } = {}
  try {
    const raw = await req.json().catch(() => ({}))
    body = raw
  } catch {
    // no body
  }

  if (total > 0 && !body.cascade) {
    return NextResponse.json(
      {
        error: "User has associated data. Pass cascade=true to delete all their records.",
        counts: { timesheets, timeEntries, expenses, projects, clients },
      },
      { status: 409 }
    )
  }

  if (body.cascade && total > 0) {
    await db.$transaction([
      db.resourceAllocation.deleteMany({ where: { userId: id } }),
      db.resourceAllocation.deleteMany({ where: { createdById: id } }),
      db.timeEntry.deleteMany({ where: { managerId: id } }),
      db.expense.deleteMany({ where: { managerId: id } }),
      db.timesheet.deleteMany({ where: { managerId: id } }),
      db.project.updateMany({ where: { managerId: id }, data: { managerId: session.user.id } }),
      db.client.updateMany({ where: { managerId: id }, data: { managerId: session.user.id } }),
    ])
  }

  // UserProject, Account, Session have onDelete: Cascade — handled by DB
  await db.user.delete({ where: { id } })

  await audit({
    userId: session.user.id,
    action: AuditAction.USER_DELETED,
    resource: "user",
    resourceId: id,
    metadata: {
      email: target.email,
      name: target.name,
      role: target.role,
      cascade: body.cascade ?? false,
    },
    ipAddress: getClientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
    success: true,
  })

  return new NextResponse(null, { status: 204 })
}
