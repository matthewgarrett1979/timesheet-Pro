import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"

type RecentTimesheet = Prisma.TimesheetGetPayload<{
  include: { client: { select: { name: true } } }
}>

function settled<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === "fulfilled" ? result.value : fallback
}

/** Returns the Monday of the week containing `date` */
function weekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() || 7 // Sun=0 → 7
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - day + 1)
  return d
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect("/login")

  const userId = session.user.id
  const isAdmin = session.user.role === "ADMIN"
  const scope = isAdmin ? {} : { managerId: userId }

  const now = new Date()
  const thisMonday = weekStart(now)
  const lastMonday = new Date(thisMonday)
  lastMonday.setDate(thisMonday.getDate() - 7)
  const thisSunday = new Date(thisMonday)
  thisSunday.setDate(thisMonday.getDate() + 6)
  thisSunday.setHours(23, 59, 59, 999)
  const lastSunday = new Date(lastMonday)
  lastSunday.setDate(lastMonday.getDate() + 6)
  lastSunday.setHours(23, 59, 59, 999)

  const [
    r0, r1, r2, r3, r4, r5, r6,
    r7, r8, r9, r10, r11,
  ] = await Promise.allSettled([
    // 0: client count
    db.client.count({ where: scope }),
    // 1: active project count
    db.project.count({ where: { ...scope, active: true } }),
    // 2: draft timesheets
    db.timesheet.count({ where: { ...scope, status: "DRAFT" } }),
    // 3: submitted (pending approval)
    db.timesheet.count({ where: { ...scope, status: "SUBMITTED" } }),
    // 4: approved timesheets
    db.timesheet.count({ where: { ...scope, status: "APPROVED" } }),
    // 5: invoice count
    db.invoice.count({ where: scope }),
    // 6: recent timesheets
    db.timesheet.findMany({
      where: scope,
      include: { client: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    // 7: this week's time entries (for hours)
    db.timeEntry.findMany({
      where: {
        ...(isAdmin ? {} : { timesheet: { managerId: userId } }),
        date: { gte: thisMonday, lte: thisSunday },
      },
      select: { hours: true },
    }),
    // 8: last week's time entries (for hours)
    db.timeEntry.findMany({
      where: {
        ...(isAdmin ? {} : { timesheet: { managerId: userId } }),
        date: { gte: lastMonday, lte: lastSunday },
      },
      select: { hours: true },
    }),
    // 9: approved billable non-invoiced entries for uninvoiced value
    db.timeEntry.findMany({
      where: {
        ...(isAdmin ? {} : { timesheet: { managerId: userId } }),
        isBillable: true,
        invoiced: false,
        timesheet: { status: "APPROVED" },
      },
      select: {
        hours: true,
        project: {
          select: {
            rateOverride: true,
            client: { select: { defaultRate: true } },
          },
        },
      },
    }),
    // 10: projects at risk (logged hours > 75% of budget)
    db.project.findMany({
      where: {
        ...scope,
        active: true,
        budgetHours: { not: null },
      },
      select: {
        id: true,
        budgetHours: true,
        timeEntries: { select: { hours: true } },
      },
    }),
    // 11: partially approved timesheets count (also pending)
    db.timesheet.count({ where: { ...scope, status: "PARTIALLY_APPROVED" } }),
  ] as const)

  ;[r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11].forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(`[dashboard] query[${i}] failed:`, r.reason)
    }
  })

  const clientCount      = settled(r0, 0)
  const projectCount     = settled(r1, 0)
  const draftCount       = settled(r2, 0)
  const submittedCount   = settled(r3, 0)
  const approvedCount    = settled(r4, 0)
  const invoiceCount     = settled(r5, 0)
  const recentTimesheets = settled<RecentTimesheet[]>(r6 as PromiseSettledResult<RecentTimesheet[]>, [])
  const partialCount     = settled(r11, 0)

  // This week / last week hours
  const thisWeekEntries = settled(r7, [])
  const lastWeekEntries = settled(r8, [])
  const thisWeekHours = thisWeekEntries.reduce((acc: number, e: { hours: Prisma.Decimal | number }) => acc + Number(e.hours), 0)
  const lastWeekHours = lastWeekEntries.reduce((acc: number, e: { hours: Prisma.Decimal | number }) => acc + Number(e.hours), 0)

  // Uninvoiced value
  type UninvoicedEntry = {
    hours: Prisma.Decimal | number
    project: { rateOverride: Prisma.Decimal | null; client: { defaultRate: Prisma.Decimal | null } } | null
  }
  const uninvoicedEntries = settled(r9, []) as UninvoicedEntry[]
  const uninvoicedValue = uninvoicedEntries.reduce((acc, e) => {
    const rate = e.project?.rateOverride
      ? Number(e.project.rateOverride)
      : e.project?.client?.defaultRate
      ? Number(e.project.client.defaultRate)
      : 0
    return acc + Number(e.hours) * rate
  }, 0)

  // Projects at risk
  type AtRiskProject = {
    id: string
    budgetHours: Prisma.Decimal | null
    timeEntries: Array<{ hours: Prisma.Decimal | number }>
  }
  const atRiskProjects = settled(r10, []) as unknown as AtRiskProject[]
  const projectsAtRiskCount = atRiskProjects.filter((p) => {
    if (!p.budgetHours) return false
    const logged = p.timeEntries.reduce((acc, e) => acc + Number(e.hours), 0)
    return logged > Number(p.budgetHours) * 0.75
  }).length

  // Pending approvals = SUBMITTED + PARTIALLY_APPROVED
  const pendingApprovals = submittedCount + partialCount

  const stats = [
    { label: "Clients",            value: clientCount,          href: "/clients" },
    { label: "Active Projects",    value: projectCount,         href: "/projects" },
    { label: "Timesheets (Draft)", value: draftCount,           href: "/timesheets?status=DRAFT" },
    { label: "Pending Approval",   value: pendingApprovals,     href: "/approvals" },
    { label: "Approved",           value: approvedCount,        href: "/timesheets?status=APPROVED" },
    { label: "Invoices",           value: invoiceCount,         href: "/invoices" },
  ]

  const statusClass: Record<string, string> = {
    DRAFT:     "badge-draft",
    SUBMITTED: "badge-submitted",
    APPROVED:  "badge-approved",
    REJECTED:  "badge-rejected",
    INVOICED:  "badge-invoiced",
  }

  const hoursChange = lastWeekHours > 0
    ? ((thisWeekHours - lastWeekHours) / lastWeekHours) * 100
    : null

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Welcome back, {session.user.name}</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card p-4 hover:shadow-md transition-shadow">
            <p className="text-3xl font-bold text-gray-900">{s.value}</p>
            <p className="text-sm text-gray-500 mt-1">{s.label}</p>
          </Link>
        ))}
      </div>

      {/* Extra insight cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {/* This week hours */}
        <div className="card p-4">
          <p className="text-2xl font-bold text-gray-900">{thisWeekHours.toFixed(1)}</p>
          <p className="text-sm text-gray-500 mt-1">Hours this week</p>
          {hoursChange !== null && (
            <p className={`text-xs mt-1 font-medium ${hoursChange >= 0 ? "text-green-600" : "text-red-500"}`}>
              {hoursChange >= 0 ? "+" : ""}{hoursChange.toFixed(0)}% vs last week
            </p>
          )}
          {hoursChange === null && lastWeekHours === 0 && (
            <p className="text-xs mt-1 text-gray-400">{lastWeekHours.toFixed(1)} hrs last week</p>
          )}
        </div>

        {/* Last week hours */}
        <div className="card p-4">
          <p className="text-2xl font-bold text-gray-900">{lastWeekHours.toFixed(1)}</p>
          <p className="text-sm text-gray-500 mt-1">Hours last week</p>
        </div>

        {/* Uninvoiced value */}
        <div className="card p-4">
          <p className="text-2xl font-bold text-gray-900">
            £{uninvoicedValue.toFixed(2)}
          </p>
          <p className="text-sm text-gray-500 mt-1">Uninvoiced value</p>
          <Link href="/invoices" className="text-xs text-blue-600 hover:underline mt-1 inline-block">
            Create invoice →
          </Link>
        </div>

        {/* Projects at risk */}
        <Link
          href="/reports"
          className={`card p-4 hover:shadow-md transition-shadow ${projectsAtRiskCount > 0 ? "border-amber-300 border" : ""}`}
        >
          <p className={`text-2xl font-bold ${projectsAtRiskCount > 0 ? "text-amber-600" : "text-gray-900"}`}>
            {projectsAtRiskCount}
          </p>
          <p className="text-sm text-gray-500 mt-1">Projects at risk</p>
          {projectsAtRiskCount > 0 && (
            <p className="text-xs text-amber-600 mt-1">≥75% budget used</p>
          )}
        </Link>
      </div>

      {/* Recent timesheets */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">Recent Timesheets</h2>
          <Link href="/timesheets" className="text-sm text-blue-600 hover:underline">
            View all
          </Link>
        </div>
        {recentTimesheets.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            No timesheets yet.{" "}
            <Link href="/timesheets" className="text-blue-600 hover:underline">
              Create one
            </Link>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Period</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {recentTimesheets.map((ts) => (
                <tr key={ts.id}>
                  <td className="font-medium text-gray-900">{ts.client.name}</td>
                  <td>{new Date(ts.periodStart).toLocaleDateString("en-GB")}</td>
                  <td>
                    <span className={`badge ${statusClass[ts.status] ?? "badge-draft"}`}>
                      {ts.status}
                    </span>
                  </td>
                  <td className="text-gray-400">
                    {new Date(ts.updatedAt).toLocaleDateString("en-GB")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
