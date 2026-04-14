"use client"

import { useEffect, useState, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"

interface ReportData {
  period: { start: string; end: string }
  summary: {
    totalHours: number
    billableHours: number
    nonBillableHours: number
    utilisationRate: number
    invoicedValue: number
    uninvoicedValue: number
    prevTotalHours: number
    prevBillableHours: number
    hoursChange: number
  }
  byClient: Array<{
    id: string
    name: string
    hours: number
    billableHours: number
    value: number
    invoicedValue: number
  }>
  byProject: Array<{
    id: string
    name: string
    hours: number
    cost: number
    invoicedValue: number
    margin: number
  }>
  byCategory: Array<{
    id: string
    name: string
    colour: string
    hours: number
  }>
  projectsAtRisk: Array<{
    id: string
    name: string
    billingType: string
    budgetHours: number
    usedHours: number
    pct: number
    status: string
  }>
}

type PeriodPreset = "this_week" | "this_month" | "this_quarter" | "this_year" | "custom"

function fmt2(n: number) {
  return n.toFixed(2)
}

function fmtGbp(n: number) {
  return `£${n.toFixed(2)}`
}

function fmtPct(n: number) {
  return `${n.toFixed(1)}%`
}

function getPeriodDates(preset: PeriodPreset): { from: string; to: string } {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  if (preset === "this_week") {
    const day = now.getDay() || 7
    const mon = new Date(now)
    mon.setDate(now.getDate() - day + 1)
    const sun = new Date(mon)
    sun.setDate(mon.getDate() + 6)
    return { from: fmt(mon), to: fmt(sun) }
  }
  if (preset === "this_month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1)
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return { from: fmt(from), to: fmt(to) }
  }
  if (preset === "this_quarter") {
    const q = Math.floor(now.getMonth() / 3)
    const from = new Date(now.getFullYear(), q * 3, 1)
    const to = new Date(now.getFullYear(), q * 3 + 3, 0)
    return { from: fmt(from), to: fmt(to) }
  }
  if (preset === "this_year") {
    return {
      from: `${now.getFullYear()}-01-01`,
      to: `${now.getFullYear()}-12-31`,
    }
  }
  return { from: "", to: "" }
}

function exportCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const lines = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))]
  const blob = new Blob([lines.join("\n")], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function ReportsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [preset, setPreset] = useState<PeriodPreset>("this_month")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [filterClientId, setFilterClientId] = useState("")
  const [filterProjectId, setFilterProjectId] = useState("")

  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([])
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([])

  // Redirect non-admins
  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "ADMIN") {
      router.replace("/dashboard")
    }
  }, [status, session, router])

  useEffect(() => {
    fetch("/api/clients").then((r) => r.json()).then((d) => {
      if (Array.isArray(d)) setClients(d)
    }).catch(() => {})
    fetch("/api/projects").then((r) => r.json()).then((d) => {
      if (Array.isArray(d)) setProjects(d)
    }).catch(() => {})
  }, [])

  const loadReport = useCallback(async () => {
    let from = ""
    let to = ""
    if (preset === "custom") {
      from = customFrom
      to = customTo
      if (!from || !to) return
    } else {
      const dates = getPeriodDates(preset)
      from = dates.from
      to = dates.to
    }

    const params = new URLSearchParams({ period: preset, from, to })
    if (filterClientId) params.set("clientId", filterClientId)
    if (filterProjectId) params.set("projectId", filterProjectId)

    setLoading(true)
    setError("")
    try {
      const res = await fetch(`/api/reports?${params}`)
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? "Failed to load report.")
        setData(null)
      } else {
        const d = await res.json()
        setData(d)
      }
    } catch {
      setError("Network error.")
    }
    setLoading(false)
  }, [preset, customFrom, customTo, filterClientId, filterProjectId])

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role === "ADMIN") {
      loadReport()
    }
  }, [loadReport, status, session])

  if (status === "loading") {
    return <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
  }
  if (session?.user?.role !== "ADMIN") {
    return null
  }

  const summary = data?.summary
  const maxCategoryHours = data?.byCategory.length
    ? Math.max(...data.byCategory.map((c) => c.hours))
    : 1

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">Business intelligence and analytics</p>
      </div>

      {/* Filters bar */}
      <div className="card p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="label">Period</label>
          <div className="flex gap-1 flex-wrap">
            {(["this_week", "this_month", "this_quarter", "this_year", "custom"] as PeriodPreset[]).map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                  preset === p
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                }`}
              >
                {p === "this_week" ? "This Week"
                  : p === "this_month" ? "This Month"
                  : p === "this_quarter" ? "This Quarter"
                  : p === "this_year" ? "This Year"
                  : "Custom"}
              </button>
            ))}
          </div>
        </div>

        {preset === "custom" && (
          <>
            <div>
              <label className="label">From</label>
              <input
                type="date"
                className="input"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="label">To</label>
              <input
                type="date"
                className="input"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
          </>
        )}

        <div>
          <label className="label">Client</label>
          <select
            className="input"
            value={filterClientId}
            onChange={(e) => setFilterClientId(e.target.value)}
          >
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Project</label>
          <select
            className="input"
            value={filterProjectId}
            onChange={(e) => setFilterProjectId(e.target.value)}
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <button className="btn btn-primary" onClick={loadReport} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {loading && !data && (
        <div className="p-8 text-center text-sm text-gray-400">Loading report…</div>
      )}

      {data && (
        <>
          {/* Period label */}
          <p className="text-xs text-gray-400">
            Period: {new Date(data.period.start).toLocaleDateString("en-GB")} –{" "}
            {new Date(data.period.end).toLocaleDateString("en-GB")}
          </p>

          {/* Summary cards */}
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
              {/* Total Hours */}
              <div className="card p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Hours</p>
                <p className="text-2xl font-bold text-gray-900">{fmt2(summary.totalHours)}</p>
                {summary.prevTotalHours > 0 && (
                  <p className={`text-xs mt-1 ${summary.hoursChange >= 0 ? "text-green-600" : "text-red-500"}`}>
                    {summary.hoursChange >= 0 ? "+" : ""}{fmtPct(summary.hoursChange)} vs prev
                  </p>
                )}
              </div>

              {/* Billable Hours */}
              <div className="card p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Billable Hours</p>
                <p className="text-2xl font-bold text-gray-900">{fmt2(summary.billableHours)}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {fmtPct(summary.utilisationRate)} utilisation
                </p>
              </div>

              {/* Uninvoiced Value */}
              <div className="card p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Uninvoiced Value</p>
                <p className="text-2xl font-bold text-gray-900">{fmtGbp(summary.uninvoicedValue)}</p>
              </div>

              {/* Invoiced Value */}
              <div className="card p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Invoiced Value</p>
                <p className="text-2xl font-bold text-gray-900">{fmtGbp(summary.invoicedValue)}</p>
              </div>

              {/* Billable Utilisation */}
              <div className="card p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Billable Utilisation</p>
                <p className="text-2xl font-bold text-gray-900">{fmtPct(summary.utilisationRate)}</p>
              </div>

              {/* Non-billable Hours */}
              <div className="card p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Non-billable Hours</p>
                <p className="text-2xl font-bold text-gray-900">{fmt2(summary.nonBillableHours)}</p>
              </div>
            </div>
          )}

          {/* Billable vs Non-billable */}
          {summary && (
            <div className="card p-6">
              <h2 className="text-base font-semibold text-gray-800 mb-4">Billable vs Non-billable</h2>
              <div className="flex gap-8 mb-4">
                <div className="text-center">
                  <p className="text-3xl font-bold text-blue-600">{fmt2(summary.billableHours)}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Billable hrs ({fmtPct(summary.utilisationRate)})
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-gray-400">{fmt2(summary.nonBillableHours)}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Non-billable hrs ({fmtPct(summary.totalHours > 0 ? (summary.nonBillableHours / summary.totalHours) * 100 : 0)})
                  </p>
                </div>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden">
                <div
                  className="h-4 bg-blue-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, summary.utilisationRate)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>0%</span>
                <span>Billable {fmtPct(summary.utilisationRate)}</span>
                <span>100%</span>
              </div>
            </div>
          )}

          {/* Revenue by Client */}
          {data.byClient.length > 0 && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                <h2 className="text-base font-semibold text-gray-800">Revenue by Client</h2>
                <button
                  className="btn btn-secondary text-xs"
                  onClick={() =>
                    exportCsv(
                      "revenue-by-client.csv",
                      ["Client", "Hours", "Billable Hours", "Est. Value (£)", "Invoiced (£)", "Uninvoiced (£)"],
                      data.byClient
                        .sort((a, b) => b.value - a.value)
                        .map((c) => [
                          c.name,
                          fmt2(c.hours),
                          fmt2(c.billableHours),
                          fmt2(c.value),
                          fmt2(c.invoicedValue),
                          fmt2(c.value - c.invoicedValue),
                        ])
                    )
                  }
                >
                  Export CSV
                </button>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th className="text-right">Hours</th>
                    <th className="text-right">Billable Hours</th>
                    <th className="text-right">Est. Value</th>
                    <th className="text-right">Invoiced</th>
                    <th className="text-right">Uninvoiced</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.byClient]
                    .sort((a, b) => b.value - a.value)
                    .map((c) => (
                      <tr key={c.id}>
                        <td className="font-medium text-gray-900">{c.name}</td>
                        <td className="text-right font-mono">{fmt2(c.hours)}</td>
                        <td className="text-right font-mono">{fmt2(c.billableHours)}</td>
                        <td className="text-right font-mono">{fmtGbp(c.value)}</td>
                        <td className="text-right font-mono">{fmtGbp(c.invoicedValue)}</td>
                        <td className="text-right font-mono">{fmtGbp(c.value - c.invoicedValue)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Project Profitability */}
          {data.byProject.length > 0 && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                <h2 className="text-base font-semibold text-gray-800">Project Profitability</h2>
                <button
                  className="btn btn-secondary text-xs"
                  onClick={() =>
                    exportCsv(
                      "project-profitability.csv",
                      ["Project", "Hours Logged", "Internal Cost (£)", "Invoiced Value (£)", "Margin (%)"],
                      data.byProject
                        .sort((a, b) => b.hours - a.hours)
                        .map((p) => [
                          p.name,
                          fmt2(p.hours),
                          fmt2(p.cost),
                          fmt2(p.invoicedValue),
                          fmt2(p.margin),
                        ])
                    )
                  }
                >
                  Export CSV
                </button>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th className="text-right">Hours Logged</th>
                    <th className="text-right">Internal Cost</th>
                    <th className="text-right">Invoiced Value</th>
                    <th className="text-right">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.byProject]
                    .sort((a, b) => b.hours - a.hours)
                    .map((p) => (
                      <tr key={p.id}>
                        <td className="font-medium text-gray-900">{p.name}</td>
                        <td className="text-right font-mono">{fmt2(p.hours)}</td>
                        <td className="text-right font-mono">{fmtGbp(p.cost)}</td>
                        <td className="text-right font-mono">{fmtGbp(p.invoicedValue)}</td>
                        <td className={`text-right font-mono font-semibold ${p.margin >= 0 ? "text-green-600" : "text-red-500"}`}>
                          {fmtPct(p.margin)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Hours by Category */}
          {data.byCategory.length > 0 && (
            <div className="card p-6">
              <h2 className="text-base font-semibold text-gray-800 mb-4">Hours by Category</h2>
              <div className="space-y-3">
                {[...data.byCategory]
                  .sort((a, b) => b.hours - a.hours)
                  .map((cat) => (
                    <div key={cat.id} className="flex items-center gap-3">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: cat.colour || "#6b7280" }}
                      />
                      <span className="text-sm text-gray-700 w-36 truncate">{cat.name}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                        <div
                          className="h-3 rounded-full transition-all"
                          style={{
                            width: `${maxCategoryHours > 0 ? (cat.hours / maxCategoryHours) * 100 : 0}%`,
                            backgroundColor: cat.colour || "#6b7280",
                          }}
                        />
                      </div>
                      <span className="text-sm text-gray-500 w-16 text-right font-mono">
                        {fmt2(cat.hours)} hrs
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Projects at Risk */}
          {data.projectsAtRisk.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200">
                <h2 className="text-base font-semibold text-gray-800">Projects at Risk</h2>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Billing Type</th>
                    <th className="text-right">Budget Hours</th>
                    <th className="text-right">Used Hours</th>
                    <th className="text-right">%</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.projectsAtRisk.map((p) => (
                    <tr key={p.id}>
                      <td className="font-medium text-gray-900">{p.name}</td>
                      <td className="text-gray-500 text-xs">{p.billingType}</td>
                      <td className="text-right font-mono">{fmt2(p.budgetHours)}</td>
                      <td className="text-right font-mono">{fmt2(p.usedHours)}</td>
                      <td className={`text-right font-mono font-semibold ${p.pct >= 100 ? "text-red-600" : "text-amber-600"}`}>
                        {fmtPct(p.pct)}
                      </td>
                      <td>
                        {p.status === "OVER_BUDGET" ? (
                          <span className="badge badge-rejected">Over Budget</span>
                        ) : (
                          <span className="badge" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>At Risk</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.projectsAtRisk.length === 0 &&
            data.byClient.length === 0 &&
            data.byProject.length === 0 &&
            data.byCategory.length === 0 && (
            <div className="card p-8 text-center text-sm text-gray-400">
              No data available for the selected period and filters.
            </div>
          )}
        </>
      )}
    </div>
  )
}
