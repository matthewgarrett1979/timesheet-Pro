"use client"

import { useEffect, useState, useCallback, Fragment } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"

interface AuditEntry {
  id: string
  action: string
  resource: string
  resourceId: string | null
  ipAddress: string | null
  success: boolean
  createdAt: string
  user: { id: string; email: string; name: string } | null
  metadata: Record<string, unknown> | null
}

interface Meta {
  total: number
  page: number
  limit: number
  pages: number
}

const ACTION_OPTIONS = [
  "", "USER_LOGIN", "USER_LOGIN_FAILED", "USER_LOGOUT", "USER_LOCKED",
  "MFA_SETUP", "MFA_VERIFIED", "MFA_FAILED", "MFA_RECOVERY_USED",
  "TIMESHEET_CREATED", "TIMESHEET_SUBMITTED", "TIMESHEET_APPROVED", "TIMESHEET_REJECTED",
  "INVOICE_GENERATED", "CLIENT_CREATED", "APPROVAL_TOKEN_USED",
  "UNAUTHORISED_ACCESS", "ADMIN_ACTION",
]

export default function AuditPage() {
  const { data: session } = useSession()
  const router = useRouter()

  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 50, pages: 1 })
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [actionFilter, setActionFilter] = useState("")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    if (session && session.user.role !== "ADMIN") {
      router.replace("/settings")
    }
  }, [session])

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: "50" })
    if (actionFilter) params.set("action", actionFilter)
    if (fromDate) params.set("from", new Date(fromDate).toISOString())
    if (toDate) params.set("to", new Date(toDate + "T23:59:59").toISOString())

    const res = await fetch(`/api/audit-log?${params}`)
    if (res.ok) {
      const data = await res.json()
      setEntries(data.data)
      setMeta(data.meta)
    }
    setLoading(false)
  }, [page, actionFilter, fromDate, toDate])

  useEffect(() => { load() }, [load])

  if (session?.user?.role !== "ADMIN") return null

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
        <p className="text-sm text-gray-500 mt-1">
          {meta.total.toLocaleString()} entries (immutable, append-only)
        </p>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="label">Action</label>
            <select
              className="input text-xs"
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1) }}
            >
              {ACTION_OPTIONS.map((a) => (
                <option key={a} value={a}>{a || "All actions"}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">From</label>
            <input
              type="date"
              className="input text-xs"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setPage(1) }}
            />
          </div>
          <div>
            <label className="label">To</label>
            <input
              type="date"
              className="input text-xs"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setPage(1) }}
            />
          </div>
          <button
            onClick={() => { setActionFilter(""); setFromDate(""); setToDate(""); setPage(1) }}
            className="btn-secondary text-xs"
          >
            Clear filters
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No audit entries found.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Action</th>
                <th>Resource</th>
                <th>IP</th>
                <th>Result</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <Fragment key={e.id}>
                  <tr>
                    <td className="text-xs text-gray-400 font-mono whitespace-nowrap">
                      {new Date(e.createdAt).toLocaleString("en-GB")}
                    </td>
                    <td className="text-xs">
                      <p className="font-medium text-gray-800">{e.user?.name ?? "—"}</p>
                      <p className="text-gray-400">{e.user?.email ?? "system"}</p>
                    </td>
                    <td>
                      <span className="text-xs font-mono bg-gray-100 rounded px-1.5 py-0.5">
                        {e.action}
                      </span>
                    </td>
                    <td className="text-xs text-gray-500">
                      {e.resource}
                      {e.resourceId && (
                        <span className="text-gray-300 ml-1 font-mono">
                          {e.resourceId.slice(0, 8)}…
                        </span>
                      )}
                    </td>
                    <td className="text-xs font-mono text-gray-400">{e.ipAddress ?? "—"}</td>
                    <td>
                      <span className={`badge ${e.success ? "badge-approved" : "badge-rejected"}`}>
                        {e.success ? "OK" : "FAIL"}
                      </span>
                    </td>
                    <td>
                      {e.metadata && Object.keys(e.metadata).length > 0 && (
                        <button
                          onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          {expanded === e.id ? "Less" : "Details"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded === e.id && (
                    <tr className="bg-gray-50">
                      <td colSpan={7} className="px-4 py-2">
                        <pre className="text-xs text-gray-600 overflow-x-auto">
                          {JSON.stringify(e.metadata, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {meta.pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>
            Showing {(meta.page - 1) * meta.limit + 1}–{Math.min(meta.page * meta.limit, meta.total)} of {meta.total}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn-secondary disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(meta.pages, p + 1))}
              disabled={page === meta.pages}
              className="btn-secondary disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
