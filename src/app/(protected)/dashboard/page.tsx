import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Prisma, Role } from "@prisma/client"
import PersonalCalendar from "@/components/PersonalCalendar"
import TeamAllocationCalendar from "@/components/TeamAllocationCalendar"

export const dynamic = "force-dynamic"

type RecentTimesheet = Prisma.TimesheetGetPayload<{
  include: { client: { select: { name: true } } }
}>

function settled<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === "fulfilled" ? result.value : fallback
}

function weekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() || 7
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - day + 1)
  return d
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

const STATUS_CLS: Record<string, string> = {
  DRAFT: "badge-draft", SUBMITTED: "badge-submitted",
  APPROVED: "badge-approved", REJECTED: "badge-rejected", INVOICED: "badge-invoiced",
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect("/login")

  const userId  = session.user.id
  const role    = session.user.role as Role
  const isUser  = role === Role.USER
  const isAdmin = role === Role.ADMIN

  if (isUser) {
    return <UserDashboard userId={userId} name={session.user.name ?? "there"} />
  }

  return <ManagerDashboard userId={userId} name={session.user.name ?? "there"} isAdmin={isAdmin} />
}

// ---------------------------------------------------------------------------
// USER dashboard
// ---------------------------------------------------------------------------
async function UserDashboard({ userId, name }: { userId: string; name: string }) {
  const now  = new Date()
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999)
  const thisMonday = weekStart(now)
  const thisSunday = addDays(thisMonday, 6); thisSunday.setHours(23, 59, 59, 999)

  const [todayEntries, weekEntries, myProjects, recentEntries] =
    await Promise.all([
      db.timeEntry.findMany({
        where: { managerId: userId, date: { gte: today, lte: todayEnd } },
        select: { hours: true, description: true, isBillable: true },
      }),
      db.timeEntry.findMany({
        where: { managerId: userId, date: { gte: thisMonday, lte: thisSunday } },
        select: { hours: true, date: true },
      }),
      db.userProject.findMany({
        where: { userId },
        include: { project: { include: { client: { select: { id: true, name: true } } } } },
        take: 8,
      }),
      db.timeEntry.findMany({
        where: { managerId: userId },
        orderBy: { date: "desc" },
        take: 10,
        select: { id: true, date: true, hours: true, description: true, isBillable: true },
      }),
    ])

  const todayHours = todayEntries.reduce((s, e) => s + Number(e.hours), 0)

  // Weekly hours by day index (0=Mon … 6=Sun)
  const weekByDay: number[] = [0, 0, 0, 0, 0, 0, 0]
  weekEntries.forEach((e) => {
    const d  = new Date(e.date)
    const dy = (d.getDay() || 7) - 1
    weekByDay[dy] = (weekByDay[dy] ?? 0) + Number(e.hours)
  })
  const weekTotal = weekByDay.reduce((s, h) => s + h, 0)

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Welcome back, {name}</p>
      </div>

      {/* Today panel */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Today</p>
          <p className="text-3xl font-bold text-gray-900">{todayHours.toFixed(1)}h</p>
          <p className="text-sm text-gray-400 mt-1">{now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
          <Link href="/time-entries" className="text-xs text-blue-600 hover:underline mt-2 inline-block">
            Log time →
          </Link>
        </div>
        <div className="card p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">This week</p>
          <p className="text-3xl font-bold text-gray-900">{weekTotal.toFixed(1)}h</p>
          <div className="flex gap-1 mt-3">
            {weekByDay.map((h, i) => (
              <div key={i} className="flex-1 text-center">
                <div
                  className={`mx-auto rounded-sm mb-0.5 ${h > 0 ? "bg-blue-500" : "bg-gray-100"}`}
                  style={{ height: `${Math.max(4, Math.min(32, h * 4))}px`, width: "100%" }}
                />
                <span className="text-xs text-gray-400">{DAY_LABELS[i]?.slice(0, 1)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Projects</p>
          <p className="text-3xl font-bold text-gray-900">{myProjects.length}</p>
          <p className="text-sm text-gray-400 mt-1">assigned to me</p>
          <Link href="/projects" className="text-xs text-blue-600 hover:underline mt-2 inline-block">
            View projects →
          </Link>
        </div>
      </div>

      {/* This week breakdown */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">This week</h2>
        <div className="grid grid-cols-7 gap-1">
          {DAY_LABELS.map((label, i) => {
            const dayDate = addDays(thisMonday, i)
            const isToday = dayDate.toDateString() === now.toDateString()
            return (
              <div key={i} className={`text-center p-2 rounded-lg ${isToday ? "bg-blue-50 border border-blue-200" : ""}`}>
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className="text-xs text-gray-400">{dayDate.getDate()}</p>
                <p className={`text-sm font-semibold mt-1 ${weekByDay[i]! > 0 ? "text-blue-600" : "text-gray-300"}`}>
                  {weekByDay[i]! > 0 ? `${weekByDay[i]!.toFixed(1)}h` : "—"}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My projects */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-700">My Projects</h2>
            <Link href="/projects" className="text-xs text-blue-600 hover:underline">View all</Link>
          </div>
          {myProjects.length === 0 ? (
            <p className="p-4 text-sm text-gray-400">No projects assigned.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {myProjects.map((up) => (
                <li key={up.id} className="px-4 py-3">
                  <Link href={`/projects/${up.project.id}`} className="hover:underline">
                    <p className="text-sm font-medium text-gray-900">{up.project.name}</p>
                  </Link>
                  <p className="text-xs text-gray-400">{up.project.client.name}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent time entries */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-700">Recent Entries</h2>
            <Link href="/time-entries" className="text-xs text-blue-600 hover:underline">View all</Link>
          </div>
          {recentEntries.length === 0 ? (
            <p className="p-4 text-sm text-gray-400">No time entries yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {recentEntries.map((e) => (
                <li key={e.id} className="px-4 py-2 flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-20 shrink-0">
                    {new Date(e.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                  <span className="text-xs font-mono text-blue-600 w-10 shrink-0">{Number(e.hours).toFixed(1)}h</span>
                  <span className="text-sm text-gray-700 truncate">{e.description}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Personal monthly calendar — interactive client component */}
      <PersonalCalendar />
    </div>
  )
}

// ---------------------------------------------------------------------------
// MANAGER / ADMIN dashboard
// ---------------------------------------------------------------------------
async function ManagerDashboard({ userId, name, isAdmin }: { userId: string; name: string; isAdmin: boolean }) {
  const scope = isAdmin ? {} : { managerId: userId }

  const now        = new Date()
  const thisMonday = weekStart(now)
  const lastMonday = addDays(thisMonday, -7)
  const thisSunday = addDays(thisMonday, 6); thisSunday.setHours(23, 59, 59, 999)
  const lastSunday = addDays(lastMonday, 6); lastSunday.setHours(23, 59, 59, 999)

  const [
    r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13,
  ] = await Promise.allSettled([
    db.client.count({ where: scope }),                                          // 0
    db.project.count({ where: { ...scope, active: true } }),                    // 1
    db.timesheet.count({ where: { ...scope, status: "DRAFT" } }),              // 2
    db.timesheet.count({ where: { ...scope, status: "SUBMITTED" } }),          // 3
    db.timesheet.count({ where: { ...scope, status: "APPROVED" } }),           // 4
    db.invoice.count({ where: scope }),                                         // 5
    db.timesheet.findMany({                                                     // 6
      where: scope,
      include: { client: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    db.timeEntry.findMany({                                                     // 7 this week hours
      where: { ...(isAdmin ? {} : { managerId: userId }), date: { gte: thisMonday, lte: thisSunday } },
      select: { hours: true },
    }),
    db.timeEntry.findMany({                                                     // 8 last week hours
      where: { ...(isAdmin ? {} : { managerId: userId }), date: { gte: lastMonday, lte: lastSunday } },
      select: { hours: true },
    }),
    db.timeEntry.findMany({                                                     // 9 uninvoiced
      where: {
        ...(isAdmin ? {} : { managerId: userId }),
        isBillable: true, invoiced: false,
        timesheet: { status: "APPROVED" },
      },
      select: {
        hours: true,
        project: { select: { rateOverride: true, client: { select: { defaultRate: true } } } },
      },
    }),
    db.project.findMany({                                                       // 10 at-risk
      where: { ...scope, active: true, budgetHours: { not: null } },
      select: { id: true, budgetHours: true, timeEntries: { select: { hours: true } } },
    }),
    db.timesheet.count({ where: { ...scope, status: "PARTIALLY_APPROVED" } }), // 11
    // 12: Team calendar — all entries this week grouped by userId
    db.timeEntry.findMany({
      where: { date: { gte: thisMonday, lte: thisSunday } },
      select: { managerId: true, hours: true, date: true },
    }),
    // 13: All users (for team calendar)
    db.user.findMany({
      where: isAdmin ? {} : { userProjects: { some: { project: { managerId: userId } } } },
      select: { id: true, name: true, role: true },
      take: 20,
    }),
  ] as const)

  ;[r0,r1,r2,r3,r4,r5,r6,r7,r8,r9,r10,r11,r12,r13].forEach((r, i) => {
    if (r.status === "rejected") console.error(`[dashboard] query[${i}] failed:`, r.reason)
  })

  const clientCount      = settled(r0, 0)
  const projectCount     = settled(r1, 0)
  const draftCount       = settled(r2, 0)
  const submittedCount   = settled(r3, 0)
  const approvedCount    = settled(r4, 0)
  const invoiceCount     = settled(r5, 0)
  const recentTimesheets = settled<RecentTimesheet[]>(r6 as PromiseSettledResult<RecentTimesheet[]>, [])
  const partialCount     = settled(r11, 0)
  const pendingApprovals = submittedCount + partialCount

  const thisWeekHours = settled(r7, []).reduce((s: number, e: { hours: Prisma.Decimal | number }) => s + Number(e.hours), 0)
  const lastWeekHours = settled(r8, []).reduce((s: number, e: { hours: Prisma.Decimal | number }) => s + Number(e.hours), 0)
  const hoursChange   = lastWeekHours > 0 ? ((thisWeekHours - lastWeekHours) / lastWeekHours) * 100 : null

  type UninvoicedEntry = {
    hours: Prisma.Decimal | number
    project: { rateOverride: Prisma.Decimal | null; client: { defaultRate: Prisma.Decimal | null } } | null
  }
  const uninvoicedValue = (settled(r9, []) as UninvoicedEntry[]).reduce((acc, e) => {
    const rate = e.project?.rateOverride
      ? Number(e.project.rateOverride)
      : e.project?.client?.defaultRate ? Number(e.project.client.defaultRate) : 0
    return acc + Number(e.hours) * rate
  }, 0)

  type AtRiskProject = { id: string; budgetHours: Prisma.Decimal | null; timeEntries: Array<{ hours: Prisma.Decimal | number }> }
  const projectsAtRiskCount = (settled(r10, []) as unknown as AtRiskProject[]).filter((p) => {
    if (!p.budgetHours) return false
    const logged = p.timeEntries.reduce((s, e) => s + Number(e.hours), 0)
    return logged > Number(p.budgetHours) * 0.75
  }).length

  // Team calendar
  type TeamEntry = { managerId: string | null; hours: Prisma.Decimal | number; date: Date }
  const teamEntries = settled(r12, []) as unknown as TeamEntry[]
  const teamUsers   = settled(r13, []) as { id: string; name: string; role: string }[]

  // Build map: userId → dayIndex → hours
  const teamCalendar: Record<string, number[]> = {}
  teamUsers.forEach((u) => { teamCalendar[u.id] = [0, 0, 0, 0, 0, 0, 0] })
  teamEntries.forEach((e) => {
    if (!e.managerId || !teamCalendar[e.managerId]) return
    const d  = new Date(e.date)
    const dy = (d.getDay() || 7) - 1
    teamCalendar[e.managerId]![dy]! += Number(e.hours)
  })
  const unallocatedUsers = teamUsers.filter((u) =>
    (teamCalendar[u.id] ?? []).every((h) => h === 0)
  )

  const stats = [
    { label: "Clients",           value: clientCount,      href: "/clients" },
    { label: "Active Projects",   value: projectCount,     href: "/projects" },
    { label: "Timesheets (Draft)",value: draftCount,       href: "/timesheets?status=DRAFT" },
    { label: "Pending Approval",  value: pendingApprovals, href: "/approvals" },
    { label: "Approved",          value: approvedCount,    href: "/timesheets?status=APPROVED" },
    { label: "Invoices",          value: invoiceCount,     href: "/invoices" },
  ]

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Welcome back, {name}</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card p-4 hover:shadow-md transition-shadow">
            <p className="text-3xl font-bold text-gray-900">{s.value}</p>
            <p className="text-sm text-gray-500 mt-1">{s.label}</p>
          </Link>
        ))}
      </div>

      {/* Insight cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="text-2xl font-bold text-gray-900">{thisWeekHours.toFixed(1)}</p>
          <p className="text-sm text-gray-500 mt-1">Hours this week</p>
          {hoursChange !== null && (
            <p className={`text-xs mt-1 font-medium ${hoursChange >= 0 ? "text-green-600" : "text-red-500"}`}>
              {hoursChange >= 0 ? "+" : ""}{hoursChange.toFixed(0)}% vs last week
            </p>
          )}
        </div>
        <div className="card p-4">
          <p className="text-2xl font-bold text-gray-900">{lastWeekHours.toFixed(1)}</p>
          <p className="text-sm text-gray-500 mt-1">Hours last week</p>
        </div>
        <div className="card p-4">
          <p className="text-2xl font-bold text-gray-900">£{uninvoicedValue.toFixed(2)}</p>
          <p className="text-sm text-gray-500 mt-1">Uninvoiced value</p>
          <Link href="/invoices" className="text-xs text-blue-600 hover:underline mt-1 inline-block">Create invoice →</Link>
        </div>
        <Link
          href="/reports"
          className={`card p-4 hover:shadow-md transition-shadow ${projectsAtRiskCount > 0 ? "border-amber-300 border" : ""}`}
        >
          <p className={`text-2xl font-bold ${projectsAtRiskCount > 0 ? "text-amber-600" : "text-gray-900"}`}>{projectsAtRiskCount}</p>
          <p className="text-sm text-gray-500 mt-1">Projects at risk</p>
          {projectsAtRiskCount > 0 && <p className="text-xs text-amber-600 mt-1">≥75% budget used</p>}
        </Link>
      </div>

      {/* Team calendar */}
      {teamUsers.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Team — This Week</h2>
            {unallocatedUsers.length > 0 && (
              <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                ⚠ {unallocatedUsers.length} user{unallocatedUsers.length > 1 ? "s" : ""} with no hours logged
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left py-1 pr-4 font-medium text-gray-500 min-w-[120px]">Name</th>
                  {DAY_LABELS.map((d, i) => {
                    const isToday = addDays(thisMonday, i).toDateString() === new Date().toDateString()
                    return (
                      <th key={d} className={`text-center py-1 w-12 font-medium ${isToday ? "text-blue-600" : "text-gray-500"}`}>
                        {d}
                      </th>
                    )
                  })}
                  <th className="text-right py-1 pl-2 font-medium text-gray-500 w-14">Total</th>
                </tr>
              </thead>
              <tbody>
                {teamUsers.map((u) => {
                  const days  = teamCalendar[u.id] ?? [0,0,0,0,0,0,0]
                  const total = days.reduce((s, h) => s + h, 0)
                  return (
                    <tr key={u.id} className="border-t border-gray-100">
                      <td className="py-1.5 pr-4 font-medium text-gray-800 truncate max-w-[120px]">{u.name}</td>
                      {days.map((h, i) => {
                        const isToday = addDays(thisMonday, i).toDateString() === new Date().toDateString()
                        return (
                          <td key={i} className={`text-center py-1.5 ${isToday ? "bg-blue-50" : ""}`}>
                            {h > 0
                              ? <span className="text-blue-700 font-medium">{h.toFixed(1)}</span>
                              : <span className="text-gray-200">—</span>
                            }
                          </td>
                        )
                      })}
                      <td className={`text-right py-1.5 pl-2 font-semibold ${total === 0 ? "text-amber-500" : "text-gray-800"}`}>
                        {total.toFixed(1)}h
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Team allocation calendar — client component */}
      <TeamAllocationCalendar />

      {/* Recent timesheets */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">Recent Timesheets</h2>
          <Link href="/timesheets" className="text-sm text-blue-600 hover:underline">View all</Link>
        </div>
        {recentTimesheets.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            No timesheets yet.{" "}
            <Link href="/timesheets" className="text-blue-600 hover:underline">Create one</Link>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Client</th><th>Period</th><th>Status</th><th>Updated</th></tr>
            </thead>
            <tbody>
              {recentTimesheets.map((ts) => (
                <tr key={ts.id}>
                  <td className="font-medium text-gray-900">{ts.client.name}</td>
                  <td>{new Date(ts.periodStart).toLocaleDateString("en-GB")}</td>
                  <td><span className={`badge ${STATUS_CLS[ts.status] ?? "badge-draft"}`}>{ts.status}</span></td>
                  <td className="text-gray-400">{new Date(ts.updatedAt).toLocaleDateString("en-GB")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
