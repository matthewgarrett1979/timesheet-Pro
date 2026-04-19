/**
 * POST /api/expenses/[id]/submit — transition DRAFT → SUBMITTED
 * Only the expense owner (or ADMIN) can submit.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { getExpenseForUser } from "@/lib/authorization"
import { audit, getClientIp } from "@/lib/audit"
import { checkRateLimit } from "@/lib/rate-limit"
import { AuditAction, ExpenseStatus, Role } from "@prisma/client"

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

  const expense = await getExpenseForUser(id, session.user.id, session.user.role as Role)
  if (!expense) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (expense.status !== ExpenseStatus.DRAFT) {
    return NextResponse.json({ error: "Only DRAFT expenses can be submitted" }, { status: 409 })
  }

  const updated = await db.expense.update({
    where: { id },
    data: { status: ExpenseStatus.SUBMITTED, submittedAt: new Date() },
    include: { client: { select: { id: true, name: true } } },
  })

  await audit({
    userId: session.user.id,
    action: AuditAction.EXPENSE_SUBMITTED,
    resource: "expense",
    resourceId: id,
    metadata: {
      amount: expense.amount.toString(),
      currency: expense.currency,
      category: expense.category,
    },
    ipAddress: getClientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
    success: true,
  })

  return NextResponse.json(updated)
}
