"use client"

import { useEffect, useState } from "react"

interface Client { id: string; name: string }

interface Timesheet {
  id: string
  weekStart: string
  status: string
  client: { id: string; name: string }
}

interface Invoice {
  id: string
  amount: string
  currency: string
  status: string
  createdAt: string
  client: { id: string; name: string }
  timesheetIds: string[]
}

const statusClass: Record<string, string> = {
  DRAFT: "badge-draft",
  SENT: "badge-sent",
  PAID: "badge-paid",
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [approvedTimesheets, setApprovedTimesheets] = useState<Timesheet[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  async function load() {
    const [inv, cl, ts] = await Promise.all([
      fetch("/api/invoices").then((r) => r.json()),
      fetch("/api/clients").then((r) => r.json()),
      fetch("/api/timesheets?status=APPROVED").then((r) => r.json()),
    ])
    setInvoices(inv)
    setClients(cl)
    setApprovedTimesheets(ts)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const total = invoices.reduce((sum, inv) => sum + parseFloat(inv.amount), 0)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="text-sm text-gray-500 mt-1">
            {invoices.length} invoice{invoices.length !== 1 ? "s" : ""} · Total billed: £{total.toFixed(2)}
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => setShowCreate(true)}
          disabled={approvedTimesheets.length === 0}
          title={approvedTimesheets.length === 0 ? "No approved timesheets available" : undefined}
        >
          Generate invoice
        </button>
      </div>

      {approvedTimesheets.length > 0 && (
        <div className="mb-4 card p-3 bg-amber-50 border-amber-200">
          <p className="text-sm text-amber-800">
            {approvedTimesheets.length} approved timesheet{approvedTimesheets.length !== 1 ? "s" : ""} ready to invoice.
          </p>
        </div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : invoices.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            No invoices yet. Generate one from approved timesheets.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Amount</th>
                <th>Timesheets</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="font-medium text-gray-900">{inv.client.name}</td>
                  <td className="font-mono font-semibold">
                    {inv.currency} {parseFloat(inv.amount).toFixed(2)}
                  </td>
                  <td className="text-gray-500 text-xs">{inv.timesheetIds.length} timesheet{inv.timesheetIds.length !== 1 ? "s" : ""}</td>
                  <td>
                    <span className={`badge ${statusClass[inv.status] ?? "badge-draft"}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="text-gray-400">
                    {new Date(inv.createdAt).toLocaleDateString("en-GB")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <CreateInvoiceModal
          clients={clients}
          approvedTimesheets={approvedTimesheets}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load() }}
        />
      )}
    </div>
  )
}

function CreateInvoiceModal({
  clients,
  approvedTimesheets,
  onClose,
  onSaved,
}: {
  clients: Client[]
  approvedTimesheets: Timesheet[]
  onClose: () => void
  onSaved: () => void
}) {
  const [clientId, setClientId] = useState("")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState("GBP")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const forClient = approvedTimesheets.filter((ts) => ts.client.id === clientId)

  function toggleTs(id: string) {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (selectedIds.length === 0) { setError("Select at least one timesheet."); return }
    setSaving(true)
    setError("")

    const res = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        timesheetIds: selectedIds,
        amount: parseFloat(amount),
        currency,
      }),
    })

    setSaving(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? "Failed to generate invoice.")
      return
    }
    onSaved()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">Generate Invoice</h2>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
          )}
          <div>
            <label className="label">Client *</label>
            <select
              className="input"
              required
              value={clientId}
              onChange={(e) => { setClientId(e.target.value); setSelectedIds([]) }}
            >
              <option value="">Select…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {clientId && forClient.length > 0 && (
            <div>
              <label className="label">Approved timesheets *</label>
              <div className="space-y-1 max-h-40 overflow-y-auto border border-gray-200 rounded p-2">
                {forClient.map((ts) => (
                  <label key={ts.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(ts.id)}
                      onChange={() => toggleTs(ts.id)}
                    />
                    <span>Week of {new Date(ts.weekStart).toLocaleDateString("en-GB")}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {clientId && forClient.length === 0 && (
            <p className="text-sm text-gray-400">No approved timesheets for this client.</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Amount *</label>
              <input
                type="number"
                className="input"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Currency</label>
              <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option>GBP</option>
                <option>USD</option>
                <option>EUR</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Creating…" : "Generate invoice"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
