/**
 * GET    /api/projects/[id]/users  — ADMIN/MANAGER: list assigned users
 * POST   /api/projects/[id]/users  — ADMIN/MANAGER: assign a user to the project
 * DELETE /api/projects/[id]/users  — ADMIN/MANAGER: remove a user from the project
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { checkRateLimit } from "@/lib/rate-limit"
import { Role } from "@prisma/client"
import { z } from "zod"

const assignSchema = z.object({
  userId:   z.string().cuid("Invalid user ID"),
  costRate: z.number().positive().nullish(),
})

const removeSchema = z.object({
  userId: z.string().cuid("Invalid user ID"),
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params

  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })

  const role = session.user.role as Role
  if (role === Role.USER) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const assignments = await db.userProject.findMany({
    where: { projectId },
    include: {
      user: { select: { id: true, name: true, email: true, role: true, costRate: true } },
    },
    orderBy: { assignedAt: "asc" },
  })

  return NextResponse.json(assignments)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params

  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })

  const role = session.user.role as Role
  if (role === Role.USER) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: z.infer<typeof assignSchema>
  try {
    body = assignSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const project = await db.project.findUnique({ where: { id: projectId } })
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 })

  const targetUser = await db.user.findUnique({ where: { id: body.userId } })
  if (!targetUser) return NextResponse.json({ error: "User not found" }, { status: 404 })

  // Optionally update the user's global cost rate
  if (body.costRate != null) {
    await db.user.update({
      where: { id: body.userId },
      data: { costRate: body.costRate },
    })
  }

  const assignment = await db.userProject.upsert({
    where: { userId_projectId: { userId: body.userId, projectId } },
    create: {
      userId: body.userId,
      projectId,
      assignedBy: session.user.id,
    },
    update: {},
    include: {
      user: { select: { id: true, name: true, email: true, role: true, costRate: true } },
    },
  })

  return NextResponse.json(assignment, { status: 201 })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params

  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })

  const role = session.user.role as Role
  if (role === Role.USER) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: z.infer<typeof removeSchema>
  try {
    body = removeSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  try {
    await db.userProject.delete({
      where: { userId_projectId: { userId: body.userId, projectId } },
    })
  } catch {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
