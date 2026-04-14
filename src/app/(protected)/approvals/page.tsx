"use client"

import { useEffect, useState } from "react"

interface Timesheet {
  id: string
  periodStart: string
  periodEnd: string
  status: string
  submittedAt: string | null
  approvedAt: string | null
  approvedBy: string | null
  client: { id: string; name: string; reference: string | null }
}

export default function ApprovalsPage() {
  const [timesheets, setTimesheets] = useState<Timesheet[]>([])
  const [loading, setLoading] = useState(true)
  const [tokens, setTokens] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [tab, setTab] = useState<"pending" | "approved">("pending")

  async function load() {
    const [submitted, approved] = await Promise.all([
      fetch("/api/timesheets?status=SUBMITTED").then((r) => r.json()),
      fetch("/api/timesheets?status=APPROVED").then((r) => r.json()),
    ])
    setTimesheets([...submitted, ...approved])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function generateToken(tsId: string) {
    setSubmitting(tsId)
    // Re-submit creates a new approval token (only works on DRAFT → SUBMITTED)
    // For already-submitted, we show a message about contacting admin
    setSubmitting(null)
  }

  function copyLink(tsId: string, token: string) {
    const url = `${window.location.origin}/api/approvals/${token}`
    navigator.clipboard.writeText(url)
    setCopied(tsId)
    setTimeout(() => setCopied(null), 2000)
  }

  const pending = timesheets.filter((ts) => ts.status === "SUBMITTED")
  const approved = timesheets.filter((ts) => ts.status === "APPROVED")
  const displayed = tab === "pending" ? pending : approved

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Approvals</h1>
        <p className="text-sm text-gray-500 mt-1">
          {pending.length} awaiting approval · {approved.length} approved
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 mb-4 border-b border-gray-200">
        {(["pending", "approved"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "pending" ? `Pending (${pending.length})` : `Approved (${approved.length})`}
          </button>
        ))}
      </div>

      {/* Info box for pending tab */}
      {tab === "pending" && pending.length > 0 && (
        <div className="mb-4 card p-4 bg-blue-50 border-blue-200">
          <p className="text-sm text-blue-800">
            These timesheets have been submitted and are awaiting client approval.
            When you submitted, an approval token was returned — embed it in an email link
            to <code className="bg-blue-100 px-1 rounded">/api/approvals/[token]</code>.
            The client POSTs to that endpoint to approve.
          </p>
        </div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : displayed.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            {tab === "pending"
              ? "No timesheets awaiting approval. Submit a timesheet from the Timesheets page."
              : "No approved timesheets yet."}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Reference</th>
                <th>Week starting</th>
                <th>Submitted</th>
                {tab === "approved" && (
                  <>
                    <th>Approved</th>
                    <th>Approved by</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {displayed.map((ts) => (
                <tr key={ts.id}>
                  <td className="font-medium text-gray-900">{ts.client.name}</td>
                  <td className="text-gray-500 font-mono text-xs">{ts.client.reference ?? "—"}</td>
                  <td>{new Date(ts.periodStart).toLocaleDateString("en-GB")}</td>
                  <td className="text-gray-400">
                    {ts.submittedAt ? new Date(ts.submittedAt).toLocaleDateString("en-GB") : "—"}
                  </td>
                  {tab === "approved" && (
                    <>
                      <td className="text-gray-400">
                        {ts.approvedAt ? new Date(ts.approvedAt).toLocaleDateString("en-GB") : "—"}
                      </td>
                      <td className="text-gray-500 text-xs">{ts.approvedBy ?? "—"}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
