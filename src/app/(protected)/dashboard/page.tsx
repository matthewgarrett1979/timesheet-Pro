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

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect("/login")

  const userId = session.user.id
  const isAdmin = session.user.role === "ADMIN"
  const scope = isAdmin ? {} : { managerId: userId }

  const [
    r0, r1, r2, r3, r4, r5, r6,
  ] = await Promise.allSettled([
    db.client.count({ where: scope }),
    db.project.count({ where: { ...scope, active: true } }),
    db.timesheet.count({ where: { ...scope, status: "DRAFT" } }),
    db.timesheet.count({ where: { ...scope, status: "SUBMITTED" } }),
    db.timesheet.count({ where: { ...scope, status: "APPROVED" } }),
    db.invoice.count({ where: scope }),
    db.timesheet.findMany({
      where: scope,
      include: { client: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
  ] as const)

  // Log failures — they surface in Vercel function logs without crashing the page
  ;[r0, r1, r2, r3, r4, r5, r6].forEach((r, i) => {
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

  const stats = [
    { label: "Clients",            value: clientCount,    href: "/clients" },
    { label: "Active Projects",    value: projectCount,   href: "/projects" },
    { label: "Timesheets (Draft)", value: draftCount,     href: "/timesheets?status=DRAFT" },
    { label: "Pending Approval",   value: submittedCount, href: "/approvals" },
    { label: "Approved",           value: approvedCount,  href: "/timesheets?status=APPROVED" },
    { label: "Invoices",           value: invoiceCount,   href: "/invoices" },
  ]

  const statusClass: Record<string, string> = {
    DRAFT:     "badge-draft",
    SUBMITTED: "badge-submitted",
    APPROVED:  "badge-approved",
    REJECTED:  "badge-rejected",
    INVOICED:  "badge-invoiced",
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Welcome back, {session.user.name}</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card p-4 hover:shadow-md transition-shadow">
            <p className="text-3xl font-bold text-gray-900">{s.value}</p>
            <p className="text-sm text-gray-500 mt-1">{s.label}</p>
          </Link>
        ))}
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
                <th>Week starting</th>
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
