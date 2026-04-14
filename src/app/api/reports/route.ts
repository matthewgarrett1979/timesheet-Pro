/**
 * GET /api/reports
 *
 * Returns aggregated reporting data. ADMIN only.
 *
 * Query params:
 *   period  — "week" | "month" | "quarter" | "year" | "custom" (default: "month")
 *   from    — ISO date (required when period=custom)
 *   to      — ISO date (required when period=custom)
 *   clientId  — filter
 *   projectId — filter
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { checkRateLimit } from "@/lib/rate-limit"
import { Role } from "@prisma/client"

function periodDates(period: string, from?: string, to?: string): { start: Date; end: Date } {
  const now = new Date()
  if (period === "custom" && from && to) {
    return { start: new Date(from), end: new Date(to) }
  }
  if (period === "week") {
    const day = now.getDay()
    const diff = day === 0 ? -6 : 1 - day
    const start = new Date(now); start.setDate(now.getDate() + diff); start.setHours(0,0,0,0)
    const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23,59,59,999)
    return { start, end }
  }
  if (period === "quarter") {
    const q = Math.floor(now.getMonth() / 3)
    const start = new Date(now.getFullYear(), q * 3, 1)
    const end   = new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999)
    return { start, end }
  }
  if (period === "year") {
    return {
      start: new Date(now.getFullYear(), 0, 1),
      end:   new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
    }
  }
  // month (default)
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end:   new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  }
}

export async function GET(req: NextRequest) {
  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })
  if (session.user.role !== Role.ADMIN) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = req.nextUrl
  const period    = searchParams.get("period")    ?? "month"
  const fromParam = searchParams.get("from")      ?? undefined
  const toParam   = searchParams.get("to")        ?? undefined
  const clientId  = searchParams.get("clientId")  ?? undefined
  const projectId = searchParams.get("projectId") ?? undefined

  const { start, end } = periodDates(period, fromParam, toParam)

  const baseWhere = {
    date: { gte: start, lte: end },
    ...(clientId  ? { clientId }  : {}),
    ...(projectId ? { projectId } : {}),
  }

  // Previous period for comparisons (same duration)
  const dur = end.getTime() - start.getTime()
  const prevStart = new Date(start.getTime() - dur - 1)
  const prevEnd   = new Date(start.getTime() - 1)

  const [entries, prevEntries, invoices, projects, users] = await Promise.all([
    db.timeEntry.findMany({
      where: baseWhere,
      include: {
        client:   { select: { id: true, name: true, defaultRate: true, invoiceCurrency: true } },
        project:  { select: { id: true, name: true, rateOverride: true, billingType: true, budgetHours: true } },
        phase:    { select: { id: true, name: true } },
        category: { select: { id: true, name: true, colour: true } },
        manager:  { select: { id: true, costRate: true } },
      },
    }),
    db.timeEntry.findMany({ where: { ...baseWhere, date: { gte: prevStart, lte: prevEnd } }, select: { hours: true, isBillable: true } }),
    db.invoice.findMany({ where: { createdAt: { gte: start, lte: end } }, select: { amount: true, currency: true } }),
    db.project.findMany({
      select: { id: true, name: true, billingType: true, budgetHours: true, contingencyHours: true },
      where: { active: true, ...(clientId ? { clientId } : {}) },
    }),
    db.user.findMany({ select: { id: true, costRate: true } }),
  ])

  // Aggregations
  const totalHours    = entries.reduce((s, e) => s + Number(e.hours), 0)
  const billableHours = entries.filter(e => e.isBillable).reduce((s, e) => s + Number(e.hours), 0)
  const prevTotal     = prevEntries.reduce((s, e) => s + Number(e.hours), 0)
  const prevBillable  = prevEntries.filter(e => e.isBillable).reduce((s, e) => s + Number(e.hours), 0)

  const invoicedValue = invoices.reduce((s, i) => s + Number(i.amount), 0)

  // Uninvoiced: APPROVED billable entries not yet invoiced
  const uninvoicedEntries = await db.timeEntry.findMany({
    where: { isBillable: true, invoiced: false, status: "APPROVED", ...(clientId ? { clientId } : {}), ...(projectId ? { projectId } : {}) },
    include: { project: { select: { rateOverride: true } }, client: { select: { defaultRate: true } } },
  })
  const uninvoicedValue = uninvoicedEntries.reduce((s, e) => {
    const rate = Number(e.project?.rateOverride ?? e.client?.defaultRate ?? 0)
    return s + Number(e.hours) * rate
  }, 0)

  // By client
  const clientMap: Record<string, { name: string; hours: number; billableHours: number; value: number; invoicedValue: number }> = {}
  for (const e of entries) {
    if (!e.clientId || !e.client) continue
    const rate = Number(e.project?.rateOverride ?? e.client.defaultRate ?? 0)
    const val  = e.isBillable ? Number(e.hours) * rate : 0
    if (!clientMap[e.clientId]) clientMap[e.clientId] = { name: e.client.name, hours: 0, billableHours: 0, value: 0, invoicedValue: 0 }
    clientMap[e.clientId].hours += Number(e.hours)
    if (e.isBillable) clientMap[e.clientId].billableHours += Number(e.hours)
    clientMap[e.clientId].value += val
    if (e.invoiced) clientMap[e.clientId].invoicedValue += val
  }

  // By project (profitability)
  const costRateMap: Record<string, number> = Object.fromEntries(users.map(u => [u.id, Number(u.costRate ?? 0)]))
  const projectMap: Record<string, { name: string; hours: number; cost: number; invoicedValue: number }> = {}
  for (const e of entries) {
    if (!e.projectId || !e.project) continue
    const rate     = Number(e.project?.rateOverride ?? e.client?.defaultRate ?? 0)
    const cost     = Number(e.hours) * (e.managerId ? (costRateMap[e.managerId] ?? 0) : 0)
    const invVal   = e.invoiced && e.isBillable ? Number(e.hours) * rate : 0
    if (!projectMap[e.projectId]) projectMap[e.projectId] = { name: e.project.name, hours: 0, cost: 0, invoicedValue: 0 }
    projectMap[e.projectId].hours += Number(e.hours)
    projectMap[e.projectId].cost  += cost
    projectMap[e.projectId].invoicedValue += invVal
  }

  // By category
  const categoryMap: Record<string, { name: string; colour: string; hours: number }> = {}
  for (const e of entries) {
    const key   = e.categoryId ?? "_none"
    const name  = e.category?.name ?? "Uncategorised"
    const colour = e.category?.colour ?? "#6b7280"
    if (!categoryMap[key]) categoryMap[key] = { name, colour, hours: 0 }
    categoryMap[key].hours += Number(e.hours)
  }

  // Projects at risk: hours logged > 75% of budget
  const projectHoursMap: Record<string, number> = {}
  for (const e of entries) {
    if (e.projectId) projectHoursMap[e.projectId] = (projectHoursMap[e.projectId] ?? 0) + Number(e.hours)
  }
  const projectsAtRisk = projects.filter(p => {
    if (!p.budgetHours) return false
    const used = projectHoursMap[p.id] ?? 0
    return used / Number(p.budgetHours) >= 0.75
  }).map(p => {
    const used = projectHoursMap[p.id] ?? 0
    const pct  = Math.round((used / Number(p.budgetHours!)) * 100)
    return { id: p.id, name: p.name, billingType: p.billingType, budgetHours: Number(p.budgetHours), usedHours: used, pct, status: pct >= 90 ? "OVER_BUDGET" : "AT_RISK" }
  })

  return NextResponse.json({
    period: { start: start.toISOString(), end: end.toISOString() },
    summary: {
      totalHours,
      billableHours,
      nonBillableHours:   totalHours - billableHours,
      utilisationRate:    totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : 0,
      invoicedValue,
      uninvoicedValue,
      prevTotalHours:     prevTotal,
      prevBillableHours:  prevBillable,
      hoursChange:        prevTotal > 0 ? Math.round(((totalHours - prevTotal) / prevTotal) * 100) : 0,
    },
    byClient:   Object.entries(clientMap).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.value - a.value),
    byProject:  Object.entries(projectMap).map(([id, v]) => ({ id, ...v, margin: v.invoicedValue > 0 ? Math.round(((v.invoicedValue - v.cost) / v.invoicedValue) * 100) : 0 })).sort((a, b) => b.hours - a.hours),
    byCategory: Object.entries(categoryMap).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.hours - a.hours),
    projectsAtRisk,
  })
}
