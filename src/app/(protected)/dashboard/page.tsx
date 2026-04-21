import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Prisma, Role } from "@prisma/client"
import PersonalCalendar from "@/components/PersonalCalendar"
import TeamAllocationCalendar from "@/components/TeamAllocationCalendar"
import { AnimatedNumber } from "@/components/charts/AnimatedNumber"
import { LogTimeWidget } from "@/components/dashboard/LogTimeWidget"
import { WeekBars } from "@/components/charts/WeekBars"
import { Sparkline, UtilDial } from "@/components/charts/Sparkline"

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
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

function getTodayIndex(date: Date): number {
  return (date.getDay() || 7) - 1
}

const STATUS_CLS: Record<string, string> = {
  DRAFT: "badge-draft", SUBMITTED: "badge-submitted",
  APPROVED: "badge-approved", REJECTED: "badge-rejected", INVOICED: "badge-invoiced",
}

// --- Small shared bits -----------------------------------------------------

function Kicker({ children }: { children: React.ReactNode }) {
  return <div className="ds-kicker">{children}</div>
}

function CardHead({ code, title, right }: { code: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="card-head">
      <div>
        <div className="card-code">{code}</div>
        <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em" }}>{title}</h2>
      </div>
      {right}
    </div>
  )
}

// ===========================================================================

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect("/login")

  const userId  = session.user.id
  const role    = session.user.role as Role
  const isUser  = role === Role.USER
  const isAdmin = role === Role.ADMIN

  if (isUser) return <UserDashboard userId={userId} name={session.user.name ?? "there"} />
  return <ManagerDashboard userId={userId} name={session.user.name ?? "there"} isAdmin={isAdmin} />
}

// ===========================================================================
// USER dashboard
// ===========================================================================
async function UserDashboard({ userId, name }: { userId: string; name: string }) {
  const now = new Date()
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999)
  const thisMonday = weekStart(now)
  const thisSunday = addDays(thisMonday, 6); thisSunday.setHours(23, 59, 59, 999)

  const [todayEntries, weekEntries, myProjects, recentEntries] = await Promise.all([
    db.timeEntry.findMany({ where: { managerId: userId, date: { gte: today, lte: todayEnd } }, select: { hours: true } }),
    db.timeEntry.findMany({ where: { managerId: userId, date: { gte: thisMonday, lte: thisSunday } }, select: { hours: true, date: true } }),
    db.userProject.findMany({ where: { userId }, include: { project: { include: { client: { select: { id: true, name: true } } } } }, take: 8 }),
    db.timeEntry.findMany({ where: { managerId: userId }, orderBy: { date: "desc" }, take: 10,
      select: { id: true, date: true, hours: true, description: true, isBillable: true } }),
  ])

  const todayHours = todayEntries.reduce((s, e) => s + Number(e.hours), 0)
  const weekByDay: number[] = [0,0,0,0,0,0,0]
  weekEntries.forEach((e) => {
    const d = new Date(e.date); const dy = (d.getDay() || 7) - 1
    weekByDay[dy] = (weekByDay[dy] ?? 0) + Number(e.hours)
  })
  const weekTotal = weekByDay.reduce((s, h) => s + h, 0)
  const target = 37.5
  const todayIndex = getTodayIndex(now)

  async function handleLogTime(entry: {
    projectId: string
    hours: number
    note?: string
    date: string
  }) {
    "use server"

    await db.timeEntry.create({
      data: {
        managerId: userId,
        projectId: entry.projectId,
        hours: entry.hours,
        description: entry.note || "",
        date: new Date(entry.date),
      },
    })
  }

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          <Kicker>DASHBOARD · USER</Kicker>
          <h1 style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-0.03em", marginTop: 6 }}>
            Welcome back, {name.split(" ")[0]}.
          </h1>
          <p className="ds-dim" style={{ fontSize: 14, marginTop: 4 }}>
            {now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <Link href="/time-entries" className="btn btn-primary">Log time →</Link>
      </div>

      <LogTimeWidget
        projects={myProjects.map((p) => ({
          id: p.project.id,
          name: p.project.name,
          client: p.project.client.name,
        }))}
        onSubmit={handleLogTime}
      />

      {/* Today / Week / Projects */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Today */}
        <div className="card p-5">
          <Kicker>TODAY</Kicker>
          <div style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.03em", marginTop: 4 }}
               className="ds-num tabular-nums">
            <AnimatedNumber value={todayHours} decimals={1} /><span className="ds-dim" style={{ fontSize: 20, fontWeight: 500 }}>h</span>
          </div>
          <div className="relative h-1 rounded-full mt-3" style={{ background: "var(--hairline-soft)" }}>
            <div className="absolute inset-y-0 left-0 rounded-full"
                 style={{ width: `${Math.min(100, (todayHours / 8) * 100)}%`, background: "var(--color-accent)" }}/>
          </div>
          <div className="ds-dim" style={{ fontSize: 12, marginTop: 8 }}>
            {todayHours < 8 ? `${(8 - todayHours).toFixed(1)}h to 8h target` : "Target met"}
          </div>
        </div>

        {/* Week */}
        <div className="card p-5">
          <Kicker>THIS WEEK</Kicker>
          <div style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.03em", marginTop: 4 }}
               className="ds-num tabular-nums">
            <AnimatedNumber value={weekTotal} decimals={1} /><span className="ds-dim" style={{ fontSize: 20, fontWeight: 500 }}>h</span>
          </div>
          <div className="mt-3">
            <WeekBars days={weekByDay.slice(0, 5)} todayIndex={todayIndex} />
          </div>
        </div>

        {/* Projects */}
        <div className="card p-5">
          <Kicker>ASSIGNMENTS</Kicker>
          <div style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.03em", marginTop: 4 }}
               className="ds-num tabular-nums">
            <AnimatedNumber value={myProjects.length} />
          </div>
          <div className="ds-dim" style={{ fontSize: 13, marginTop: 4 }}>active projects</div>
          <Link href="/projects" className="link mt-3 inline-block" style={{ fontSize: 12 }}>
            View all →
          </Link>
        </div>
      </div>

      {/* Week breakdown */}
      <div className="card">
        <CardHead code="TS · CURRENT · DRAFT" title="This week" right={
          <div className="ds-dim tabular-nums font-mono" style={{ fontSize: 12 }}>
            {weekTotal.toFixed(1)} / {target}h
          </div>
        }/>
        <div className="p-5 grid grid-cols-7 gap-2">
          {DAY_LABELS.map((label, i) => {
            const dayDate = addDays(thisMonday, i)
            const isToday = dayDate.toDateString() === now.toDateString()
            const hours = weekByDay[i] ?? 0
            return (
              <div key={i}
                   className="p-3 rounded-md text-center"
                   style={{
                     background: isToday ? "color-mix(in srgb, var(--warm) 8%, var(--surface))" : "var(--paper-2)",
                     border: isToday ? "1px solid color-mix(in srgb, var(--warm) 40%, transparent)" : "1px solid transparent",
                   }}>
                <div className="ds-kicker">{label}</div>
                <div className="ds-dim" style={{ fontSize: 11, marginTop: 2 }}>{dayDate.getDate()}</div>
                <div className="ds-num tabular-nums" style={{
                  fontSize: 18,
                  fontWeight: 600,
                  marginTop: 6,
                  color: hours > 0 ? (isToday ? "var(--warm)" : "var(--ink)") : "var(--ink-dim)"
                }}>
                  {hours > 0 ? `${hours.toFixed(1)}` : "—"}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Projects + recent */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card overflow-hidden">
          <CardHead code="MY · PROJECTS" title="Active assignments" right={
            <Link href="/projects" className="link" style={{ fontSize: 12 }}>View all →</Link>
          }/>
          {myProjects.length === 0 ? (
            <p className="p-5 ds-dim" style={{ fontSize: 14 }}>No projects assigned.</p>
          ) : (
            <ul>
              {myProjects.map((up) => (
                <li key={up.id} className="px-5 py-3" style={{ borderTop: "1px solid var(--hairline-soft)" }}>
                  <Link href={`/projects/${up.project.id}`} className="block hover:bg-paper-2 -mx-5 px-5 py-1 transition-colors">
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{up.project.name}</div>
                    <div className="ds-dim font-mono" style={{ fontSize: 11, marginTop: 2, letterSpacing: "0.04em" }}>
                      {up.project.client.name}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card overflow-hidden">
          <CardHead code="ENTRIES · RECENT" title="Recent entries" right={
            <Link href="/time-entries" className="link" style={{ fontSize: 12 }}>View all →</Link>
          }/>
          {recentEntries.length === 0 ? (
            <p className="p-5 ds-dim" style={{ fontSize: 14 }}>No time entries yet.</p>
          ) : (
            <ul>
              {recentEntries.map((e) => (
                <li key={e.id} className="px-5 py-2.5 flex items-center gap-3"
                    style={{ borderTop: "1px solid var(--hairline-soft)" }}>
                  <span className="ds-dim font-mono tabular-nums shrink-0" style={{ fontSize: 11, width: 72 }}>
                    {new Date(e.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                  </span>
                  <span className="font-mono tabular-nums shrink-0" style={{ fontSize: 12, width: 44, color: "var(--color-accent)", fontWeight: 600 }}>
                    {Number(e.hours).toFixed(1)}h
                  </span>
                  <span className="truncate" style={{ fontSize: 13 }}>{e.description}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <PersonalCalendar />
    </div>
  )
}

// ===========================================================================
// MANAGER / ADMIN dashboard
// ===========================================================================
async function ManagerDashboard({ userId, name, isAdmin }: { userId: string; name: string; isAdmin: boolean }) {
  const scope = isAdmin ? {} : { managerId: userId }

  const now        = new Date()
  const thisMonday = weekStart(now)
  const lastMonday = addDays(thisMonday, -7)
  const thisSunday = addDays(thisMonday, 6); thisSunday.setHours(23, 59, 59, 999)
  const lastSunday = addDays(lastMonday, 6); lastSunday.setHours(23, 59, 59, 999)
  const eightWeeksAgo = addDays(thisMonday, -7 * 7)

  const [r0,r1,r2,r3,r4,r5,r6,r7,r8,r9,r10,r11,r12,r13,r14] = await Promise.allSettled([
    db.client.count({ where: scope }),
    db.project.count({ where: { ...scope, active: true } }),
    db.timesheet.count({ where: { ...scope, status: "DRAFT" } }),
    db.timesheet.count({ where: { ...scope, status: "SUBMITTED" } }),
    db.timesheet.count({ where: { ...scope, status: "APPROVED" } }),
    db.invoice.count({ where: scope }),
    db.timesheet.findMany({ where: scope, include: { client: { select: { name: true } } }, orderBy: { updatedAt: "desc" }, take: 8 }),
    db.timeEntry.findMany({ where: { ...(isAdmin ? {} : { managerId: userId }), date: { gte: thisMonday, lte: thisSunday } }, select: { hours: true } }),
    db.timeEntry.findMany({ where: { ...(isAdmin ? {} : { managerId: userId }), date: { gte: lastMonday, lte: lastSunday } }, select: { hours: true } }),
    db.timeEntry.findMany({
      where: { ...(isAdmin ? {} : { managerId: userId }), isBillable: true, invoiced: false, timesheet: { status: "APPROVED" } },
      select: { hours: true, project: { select: { rateOverride: true, client: { select: { defaultRate: true } } } } },
    }),
    db.project.findMany({ where: { ...scope, active: true, budgetHours: { not: null } }, select: { id: true, budgetHours: true, timeEntries: { select: { hours: true } } } }),
    db.timesheet.count({ where: { ...scope, status: "PARTIALLY_APPROVED" } }),
    db.timeEntry.findMany({ where: { date: { gte: thisMonday, lte: thisSunday } }, select: { managerId: true, hours: true, date: true } }),
    db.user.findMany({ where: isAdmin ? {} : { userProjects: { some: { project: { managerId: userId } } } }, select: { id: true, name: true, role: true }, take: 20 }),
    db.timeEntry.findMany({
      where: {
        ...(isAdmin ? {} : { managerId: userId }),
        date: { gte: eightWeeksAgo, lte: thisSunday },
      },
      select: { hours: true, date: true },
    }),
  ] as const)

  ;[r0,r1,r2,r3,r4,r5,r6,r7,r8,r9,r10,r11,r12,r13,r14].forEach((r, i) => {
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

  type UninvoicedEntry = { hours: Prisma.Decimal | number; project: { rateOverride: Prisma.Decimal | null; client: { defaultRate: Prisma.Decimal | null } } | null }
  const uninvoicedValue = (settled(r9, []) as UninvoicedEntry[]).reduce((acc, e) => {
    const rate = e.project?.rateOverride ? Number(e.project.rateOverride) : e.project?.client?.defaultRate ? Number(e.project.client.defaultRate) : 0
    return acc + Number(e.hours) * rate
  }, 0)

  type AtRiskProject = { id: string; budgetHours: Prisma.Decimal | null; timeEntries: Array<{ hours: Prisma.Decimal | number }> }
  const projectsAtRiskCount = (settled(r10, []) as unknown as AtRiskProject[]).filter((p) => {
    if (!p.budgetHours) return false
    const logged = p.timeEntries.reduce((s, e) => s + Number(e.hours), 0)
    return logged > Number(p.budgetHours) * 0.75
  }).length

  type TeamEntry = { managerId: string | null; hours: Prisma.Decimal | number; date: Date }
  const teamEntries = settled(r12, []) as unknown as TeamEntry[]
  const teamUsers   = settled(r13, []) as { id: string; name: string; role: string }[]

  const teamCalendar: Record<string, number[]> = {}
  teamUsers.forEach((u) => { teamCalendar[u.id] = [0,0,0,0,0,0,0] })
  teamEntries.forEach((e) => {
    if (!e.managerId || !teamCalendar[e.managerId]) return
    const d = new Date(e.date); const dy = (d.getDay() || 7) - 1
    teamCalendar[e.managerId]![dy]! += Number(e.hours)
  })
  const unallocatedUsers = teamUsers.filter((u) => (teamCalendar[u.id] ?? []).every((h) => h === 0))

  type WeeklyTrendEntry = { hours: Prisma.Decimal | number; date: Date }
  const weeklyTrendEntries = settled(r14, []) as WeeklyTrendEntry[]

  const sparkline = Array.from({ length: 8 }, (_, i) => {
    const start = addDays(thisMonday, -7 * (7 - i))
    const end = addDays(start, 6)
    end.setHours(23, 59, 59, 999)

    const total = weeklyTrendEntries
      .filter((e) => {
        const d = new Date(e.date)
        return d >= start && d <= end
      })
      .reduce((sum, e) => sum + Number(e.hours), 0)

    return Number(total.toFixed(1))
  })

  const stats = [
    { label: "Clients",            value: clientCount,      href: "/clients" },
    { label: "Active projects",    value: projectCount,     href: "/projects" },
    { label: "Timesheets · draft", value: draftCount,       href: "/timesheets?status=DRAFT" },
    { label: "Pending approval",   value: pendingApprovals, href: "/approvals" },
    { label: "Approved",           value: approvedCount,    href: "/timesheets?status=APPROVED" },
    { label: "Invoices",           value: invoiceCount,     href: "/invoices" },
  ]

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          <Kicker>DASHBOARD · {isAdmin ? "ADMIN" : "MANAGER"}</Kicker>
          <h1 style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-0.03em", marginTop: 6 }}>
            {isAdmin ? "Control room." : "Good to see you, "}{!isAdmin && name.split(" ")[0] + "."}
          </h1>
          <p className="ds-dim" style={{ fontSize: 14, marginTop: 4 }}>
            Week of {thisMonday.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/approvals" className="btn btn-secondary">Approvals</Link>
          <Link href="/reports" className="btn btn-primary">Reports →</Link>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card p-4 transition-shadow hover:shadow-sm block">
            <div className="ds-kicker" style={{ marginBottom: 6 }}>{s.label}</div>
            <div className="ds-num tabular-nums" style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em" }}>
              <AnimatedNumber value={s.value} />
            </div>
          </Link>
        ))}
      </div>

      {/* Insight cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card p-4">
          <Kicker>HOURS · WK</Kicker>
          <div className="ds-num tabular-nums" style={{ fontSize: 28, fontWeight: 600, marginTop: 6 }}>
            <AnimatedNumber value={thisWeekHours} decimals={1} /><span className="ds-dim" style={{ fontSize: 14, fontWeight: 500 }}>h</span>
          </div>
          <div className="mt-3">
            <Sparkline points={sparkline} width={140} height={32} />
          </div>
          {hoursChange !== null && (
            <div className="font-mono tabular-nums" style={{ fontSize: 11, marginTop: 4, color: hoursChange >= 0 ? "var(--ok)" : "var(--danger)", fontWeight: 500 }}>
              {hoursChange >= 0 ? "▲" : "▼"} {Math.abs(hoursChange).toFixed(0)}% vs last week
            </div>
          )}
        </div>
        <div className="card p-4">
          <Kicker>HOURS · LAST WK</Kicker>
          <div className="ds-num tabular-nums" style={{ fontSize: 28, fontWeight: 600, marginTop: 6 }}>
            <AnimatedNumber value={lastWeekHours} decimals={1} /><span className="ds-dim" style={{ fontSize: 14, fontWeight: 500 }}>h</span>
          </div>
        </div>
        <div className="card p-4">
          <Kicker>UNINVOICED · £</Kicker>
          <div className="ds-num tabular-nums" style={{ fontSize: 28, fontWeight: 600, marginTop: 6 }}>
            £<AnimatedNumber value={uninvoicedValue} decimals={0} />
          </div>
          <Link href="/invoices" className="link" style={{ fontSize: 11, marginTop: 4, display: "inline-block" }}>
            Create invoice →
          </Link>
        </div>
        <Link href="/reports" className="card p-4 block transition-shadow hover:shadow-sm"
              style={{ borderColor: projectsAtRiskCount > 0 ? "color-mix(in srgb, var(--warm) 40%, transparent)" : undefined }}>
          <Kicker>AT RISK</Kicker>
          <div className="ds-num tabular-nums" style={{
            fontSize: 28, fontWeight: 600, marginTop: 6,
            color: projectsAtRiskCount > 0 ? "var(--warm)" : "var(--ink)"
          }}>
            <AnimatedNumber value={projectsAtRiskCount} />
          </div>
          {projectsAtRiskCount > 0 && (
            <div className="font-mono" style={{ fontSize: 10, marginTop: 4, color: "var(--warm)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              ≥75% budget used
            </div>
          )}
        </Link>
      </div>

      {/* Team calendar */}
      {teamUsers.length > 0 && (
        <div className="card">
          <CardHead code="TEAM · THIS WEEK" title="Hours logged · by person" right={
            unallocatedUsers.length > 0 ? (
              <span className="badge badge-submitted">
                ⚠ {unallocatedUsers.length} idle
              </span>
            ) : null
          }/>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 160 }}>Name</th>
                  {DAY_LABELS.map((d, i) => {
                    const isToday = addDays(thisMonday, i).toDateString() === new Date().toDateString()
                    return <th key={d} style={{ textAlign: "center", color: isToday ? "var(--warm)" : undefined }}>{d}</th>
                  })}
                  <th style={{ textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {teamUsers.map((u) => {
                  const days = teamCalendar[u.id] ?? [0,0,0,0,0,0,0]
                  const total = days.reduce((s, h) => s + h, 0)
                  return (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 500 }}>{u.name}</td>
                      {days.map((h, i) => {
                        const isToday = addDays(thisMonday, i).toDateString() === new Date().toDateString()
                        return (
                          <td key={i} className="tabular-nums" style={{
                            textAlign: "center",
                            background: isToday ? "color-mix(in srgb, var(--warm) 6%, transparent)" : undefined,
                            color: h > 0 ? "var(--ink)" : "var(--ink-dim)",
                            fontWeight: h > 0 ? 500 : 400,
                          }}>
                            {h > 0 ? h.toFixed(1) : "—"}
                          </td>
                        )
                      })}
                      <td className="tabular-nums" style={{ textAlign: "right", fontWeight: 600, color: total === 0 ? "var(--warm)" : "var(--ink)" }}>
                        <div className="flex items-center justify-end gap-3">
                          <div style={{ width: 28, height: 28 }}>
                            <UtilDial pct={total / 37.5} size={28} />
                          </div>
                          <span><AnimatedNumber value={total} decimals={1} />h</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <TeamAllocationCalendar />

      {/* Recent timesheets */}
      <div className="card overflow-hidden">
        <CardHead code="TIMESHEETS · RECENT" title="Latest activity" right={
          <Link href="/timesheets" className="link" style={{ fontSize: 12 }}>View all →</Link>
        }/>
        {recentTimesheets.length === 0 ? (
          <div className="p-8 text-center ds-dim" style={{ fontSize: 14 }}>
            No timesheets yet. <Link href="/timesheets" className="link">Create one</Link>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Client</th><th>Period</th><th>Status</th><th style={{ textAlign: "right" }}>Updated</th></tr>
            </thead>
            <tbody>
              {recentTimesheets.map((ts) => (
                <tr key={ts.id}>
                  <td style={{ fontWeight: 500 }}>{ts.client.name}</td>
                  <td className="tabular-nums">{new Date(ts.periodStart).toLocaleDateString("en-GB")}</td>
                  <td><span className={`badge ${STATUS_CLS[ts.status] ?? "badge-draft"}`}>{ts.status}</span></td>
                  <td className="ds-dim tabular-nums" style={{ textAlign: "right" }}>
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
