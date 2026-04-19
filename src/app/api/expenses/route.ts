/**
 * GET  /api/expenses   — list expenses (row-level scoped)
 * POST /api/expenses   — create a new expense
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { listExpensesForUser } from "@/lib/authorization"
import { audit, getClientIp } from "@/lib/audit"
import { checkRateLimit } from "@/lib/rate-limit"
import { AuditAction, Role } from "@prisma/client"
import { z } from "zod"

const createSchema = z.object({
  description: z.string().trim().min(1).max(500),
  amount: z.number().positive(),
  currency: z.string().length(3).default("GBP"),
  date: z.string().datetime({ message: "date must be an ISO-8601 date" }),
  category: z.string().trim().min(1).max(100),
  clientId: z.string().cuid().optional(),
})

export async function GET(req: NextRequest) {
  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })

  const { searchParams } = req.nextUrl
  const expenses = await listExpensesForUser(
    session.user.id,
    session.user.role as Role,
    {
      clientId: searchParams.get("clientId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      forReview: searchParams.get("forReview") === "true",
    }
  )

  return NextResponse.json(expenses)
}

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })

  let body: z.infer<typeof createSchema>
  try {
    body = createSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const expense = await db.expense.create({
    data: {
      description: body.description,
      amount: body.amount,
      currency: body.currency,
      date: new Date(body.date),
      category: body.category,
      clientId: body.clientId ?? null,
      managerId: session.user.id,
    },
    include: { client: { select: { id: true, name: true } } },
  })

  await audit({
    userId: session.user.id,
    action: AuditAction.EXPENSE_CREATED,
    resource: "expense",
    resourceId: expense.id,
    metadata: { amount: body.amount, currency: body.currency, category: body.category },
    ipAddress: getClientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
    success: true,
  })

  return NextResponse.json(expense, { status: 201 })
}
