/**
 * GET   /api/expenses/[id]  — fetch an expense (ownership enforced)
 * PATCH /api/expenses/[id]  — update an expense (DRAFT only)
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { getExpenseForUser } from "@/lib/authorization"
import { audit, getClientIp } from "@/lib/audit"
import { checkRateLimit } from "@/lib/rate-limit"
import { AuditAction, ExpenseStatus, Role } from "@prisma/client"
import { z } from "zod"

const updateSchema = z.object({
  description: z.string().trim().min(1).max(500).optional(),
  amount: z.number().positive().optional(),
  currency: z.string().length(3).optional(),
  date: z.string().datetime().optional(),
  category: z.string().trim().min(1).max(100).optional(),
  clientId: z.string().cuid().nullable().optional(),
  status: z.enum(["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"]).optional(),
})

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

  const expense = await getExpenseForUser(id, session.user.id, session.user.role as Role)
  if (!expense) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json(expense)
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

  const existing = await getExpenseForUser(id, session.user.id, session.user.role as Role)
  if (!existing) {
    await audit({
      userId: session.user.id,
      action: AuditAction.UNAUTHORISED_ACCESS,
      resource: "expense",
      resourceId: id,
      metadata: { action: "update" },
      ipAddress: getClientIp(req),
      success: false,
    })
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (existing.status !== ExpenseStatus.DRAFT && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Only DRAFT expenses can be edited" }, { status: 409 })
  }

  let body: z.infer<typeof updateSchema>
  try {
    body = updateSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const updated = await db.expense.update({
    where: { id },
    data: {
      ...body,
      date: body.date ? new Date(body.date) : undefined,
      status: body.status as ExpenseStatus | undefined,
    },
    include: { client: { select: { id: true, name: true } } },
  })

  await audit({
    userId: session.user.id,
    action: AuditAction.EXPENSE_UPDATED,
    resource: "expense",
    resourceId: id,
    metadata: { changes: body },
    ipAddress: getClientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
    success: true,
  })

  return NextResponse.json(updated)
}
