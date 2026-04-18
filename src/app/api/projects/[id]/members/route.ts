/**
 * GET /api/projects/[id]/members — users assigned to this project via UserProject
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getProjectForUser } from "@/lib/authorization"
import { checkRateLimit } from "@/lib/rate-limit"
import { Role } from "@prisma/client"
import { db } from "@/lib/db"

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

  const members = await db.userProject.findMany({
    where: { projectId: id },
    include: { user: { select: { id: true, name: true, email: true, role: true } } },
    orderBy: { user: { name: "asc" } },
  })

  return NextResponse.json(members.map((m) => m.user))
}
