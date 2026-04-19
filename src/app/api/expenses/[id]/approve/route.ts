/**
 * POST /api/expenses/[id]/approve — ADMIN or MANAGER approve/reject a SUBMITTED expense.
 * Body: { action: "APPROVE" | "REJECT", rejectionNote?: string }
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { audit, getClientIp } from "@/lib/audit"
import { checkRateLimit } from "@/lib/rate-limit"
import { AuditAction, ExpenseStatus, Role } from "@prisma/client"
import { z } from "zod"

const actionSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  rejectionNote: z.string().trim().min(1).max(1000).optional(),
})

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

  const role = session.user.role as Role
  if (role === Role.USER) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const expense = await db.expense.findUnique({
    where: { id },
    include: {
      manager: { select: { id: true, name: true, email: true } },
      client: { select: { id: true, name: true } },
    },
  })
  if (!expense) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (expense.status !== ExpenseStatus.SUBMITTED) {
    return NextResponse.json({ error: "Only SUBMITTED expenses can be approved or rejected" }, { status: 409 })
  }

  let body: z.infer<typeof actionSchema>
  try {
    body = actionSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  if (body.action === "REJECT" && !body.rejectionNote) {
    return NextResponse.json({ error: "A rejection note is required" }, { status: 400 })
  }

  const isApprove = body.action === "APPROVE"

  const updated = await db.expense.update({
    where: { id },
    data: isApprove
      ? {
          status: ExpenseStatus.APPROVED,
          approvedById: session.user.id,
          approvedAt: new Date(),
          rejectionNote: null,
        }
      : {
          status: ExpenseStatus.REJECTED,
          rejectionNote: body.rejectionNote,
          approvedById: null,
          approvedAt: null,
        },
    include: { client: { select: { id: true, name: true } } },
  })

  await audit({
    userId: session.user.id,
    action: isApprove ? AuditAction.EXPENSE_APPROVED : AuditAction.EXPENSE_REJECTED,
    resource: "expense",
    resourceId: id,
    metadata: {
      ownerId: expense.managerId,
      ownerName: expense.manager.name,
      amount: expense.amount.toString(),
      currency: expense.currency,
      category: expense.category,
      ...(body.rejectionNote ? { rejectionNote: body.rejectionNote } : {}),
    },
    ipAddress: getClientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
    success: true,
  })

  return NextResponse.json(updated)
}
