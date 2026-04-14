/**
 * PATCH  /api/categories/[id]  — update a TimeCategory (ADMIN only)
 * DELETE /api/categories/[id]  — delete a TimeCategory (ADMIN only; blocked if entries exist)
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { audit, getClientIp } from "@/lib/audit"
import { checkRateLimit } from "@/lib/rate-limit"
import { AuditAction, Role } from "@prisma/client"
import { z } from "zod"

const patchSchema = z.object({
  name:       z.string().trim().min(1).max(100).optional(),
  colour:     z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex colour").optional(),
  isBillable: z.boolean().optional(),
  sortOrder:  z.number().int().min(0).optional(),
})

function adminOnly(role: string) {
  return role !== Role.ADMIN
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
  if (adminOnly(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const category = await db.timeCategory.findUnique({ where: { id } })
  if (!category) return NextResponse.json({ error: "Not found" }, { status: 404 })

  let body: z.infer<typeof patchSchema>
  try {
    body = patchSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const updated = await db.timeCategory.update({
    where: { id },
    data: body,
  })

  await audit({
    userId:     session.user.id,
    action:     AuditAction.ADMIN_ACTION,
    resource:   "time-category",
    resourceId: id,
    metadata:   { changes: body },
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
  if (adminOnly(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const category = await db.timeCategory.findUnique({ where: { id } })
  if (!category) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const entryCount = await db.timeEntry.count({ where: { categoryId: id } })
  if (entryCount > 0) {
    return NextResponse.json(
      { error: `Cannot delete category with ${entryCount} time ${entryCount === 1 ? "entry" : "entries"}` },
      { status: 409 }
    )
  }

  await db.timeCategory.delete({ where: { id } })

  await audit({
    userId:     session.user.id,
    action:     AuditAction.ADMIN_ACTION,
    resource:   "time-category",
    resourceId: id,
    metadata:   { name: category.name },
    ipAddress:  getClientIp(req),
    userAgent:  req.headers.get("user-agent") ?? undefined,
    success:    true,
  })

  return new NextResponse(null, { status: 204 })
}
