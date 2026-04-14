"use client"

import { useEffect, useState } from "react"

interface BillingClient {
  id: string
  name: string
  companyName: string | null
  tradingName: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  county: string | null
  postcode: string | null
  country: string
  vatNumber: string | null
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  purchaseOrderNumber: string | null
  invoicePaymentTerms: number | null
  invoiceCurrency: string
}

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
  timesheetIds: string[]
  client: BillingClient
}

const statusClass: Record<string, string> = {
  DRAFT: "badge-draft",
  SENT:  "badge-sent",
  PAID:  "badge-paid",
}

// Format a billing address as lines, omitting blank entries
function formatAddress(c: BillingClient): string[] {
  return [
    c.addressLine1,
    c.addressLine2,
    [c.city, c.county].filter(Boolean).join(", "),
    c.postcode,
    c.country !== "United Kingdom" ? c.country : null,
  ].filter(Boolean) as string[]
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [clients, setClients] = useState<BillingClient[]>([])
  const [approvedTimesheets, setApprovedTimesheets] = useState<Timesheet[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null)

  async function load() {
    const [inv, cl, ts] = await Promise.all([
      fetch("/api/invoices").then((r) => r.json()),
      fetch("/api/clients").then((r) => r.json()),
      fetch("/api/timesheets?status=APPROVED").then((r) => r.json()),
    ])
    setInvoices(Array.isArray(inv) ? inv : [])
    setClients(Array.isArray(cl) ? cl : [])
    setApprovedTimesheets(Array.isArray(ts) ? ts : [])
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
                <th>PO / VAT</th>
                <th>Timesheets</th>
                <th>Status</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>
                    <p className="font-medium text-gray-900">
                      {inv.client.companyName ?? inv.client.name}
                    </p>
                    {inv.client.city && (
                      <p className="text-xs text-gray-400">{inv.client.city}</p>
                    )}
                  </td>
                  <td className="font-mono font-semibold">
                    {inv.currency} {parseFloat(inv.amount).toFixed(2)}
                  </td>
                  <td className="text-xs text-gray-500">
                    {inv.client.purchaseOrderNumber && (
                      <p>PO: <span className="font-mono">{inv.client.purchaseOrderNumber}</span></p>
                    )}
                    {inv.client.vatNumber && (
                      <p>VAT: <span className="font-mono">{inv.client.vatNumber}</span></p>
                    )}
                    {!inv.client.purchaseOrderNumber && !inv.client.vatNumber && "—"}
                  </td>
                  <td className="text-gray-500 text-xs">
                    {inv.timesheetIds.length} timesheet{inv.timesheetIds.length !== 1 ? "s" : ""}
                  </td>
                  <td>
                    <span className={`badge ${statusClass[inv.status] ?? "badge-draft"}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="text-gray-400">
                    {new Date(inv.createdAt).toLocaleDateString("en-GB")}
                  </td>
                  <td>
                    <button
                      onClick={() => setPreviewInvoice(inv)}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      View
                    </button>
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

      {previewInvoice && (
        <InvoicePreviewModal
          invoice={previewInvoice}
          onClose={() => setPreviewInvoice(null)}
        />
      )}
    </div>
  )
}

// ─── Generate Invoice Modal ───────────────────────────────────────────────────

function CreateInvoiceModal({
  clients,
  approvedTimesheets,
  onClose,
  onSaved,
}: {
  clients: BillingClient[]
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

  const selectedClient = clients.find((c) => c.id === clientId) ?? null
  const forClient = approvedTimesheets.filter((ts) => ts.client.id === clientId)

  function handleClientChange(id: string) {
    setClientId(id)
    setSelectedIds([])
    // Auto-populate currency from client's invoice currency preference
    const c = clients.find((cl) => cl.id === id)
    if (c) setCurrency(c.invoiceCurrency ?? "GBP")
  }

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
              onChange={(e) => handleClientChange(e.target.value)}
            >
              <option value="">Select…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.companyName ?? c.name}</option>
              ))}
            </select>
          </div>

          {/* Client billing summary — shown once a client is selected */}
          {selectedClient && (
            <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-500 space-y-0.5">
              {formatAddress(selectedClient).map((line, i) => <p key={i}>{line}</p>)}
              {selectedClient.vatNumber && <p>VAT: {selectedClient.vatNumber}</p>}
              {selectedClient.purchaseOrderNumber && (
                <p>PO: <span className="font-mono font-medium text-gray-700">{selectedClient.purchaseOrderNumber}</span></p>
              )}
              {selectedClient.invoicePaymentTerms && (
                <p>Payment terms: {selectedClient.invoicePaymentTerms} days</p>
              )}
            </div>
          )}

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
                <option value="GBP">GBP</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="CAD">CAD</option>
                <option value="AUD">AUD</option>
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

// ─── Invoice Preview Modal ────────────────────────────────────────────────────

function InvoicePreviewModal({
  invoice,
  onClose,
}: {
  invoice: Invoice
  onClose: () => void
}) {
  const c = invoice.client
  const legalName = c.companyName ?? c.name
  const addressLines = formatAddress(c)
  const invoiceDate = new Date(invoice.createdAt)
  const dueDate = c.invoicePaymentTerms
    ? new Date(invoiceDate.getTime() + c.invoicePaymentTerms * 86_400_000)
    : null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-semibold">Invoice Preview</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-5 text-sm">
          {/* Bill To */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Bill To</p>
            <p className="font-semibold text-gray-900">{legalName}</p>
            {c.tradingName && c.tradingName !== legalName && (
              <p className="text-gray-500">t/a {c.tradingName}</p>
            )}
            {addressLines.map((line, i) => (
              <p key={i} className="text-gray-600">{line}</p>
            ))}
            {c.vatNumber && (
              <p className="text-gray-500 mt-1">VAT Reg: {c.vatNumber}</p>
            )}
          </div>

          {/* Contact */}
          {(c.contactName || c.contactEmail) && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Contact</p>
              {c.contactName && <p className="text-gray-700">{c.contactName}</p>}
              {c.contactEmail && <p className="text-gray-500">{c.contactEmail}</p>}
              {c.contactPhone && <p className="text-gray-500">{c.contactPhone}</p>}
            </div>
          )}

          {/* Invoice Details */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Invoice Details</p>
            <dl className="space-y-1">
              <div className="flex justify-between">
                <dt className="text-gray-500">Invoice ID</dt>
                <dd className="font-mono text-xs text-gray-700">{invoice.id.slice(0, 12)}…</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Invoice date</dt>
                <dd>{invoiceDate.toLocaleDateString("en-GB")}</dd>
              </div>
              {dueDate && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Due date</dt>
                  <dd>{dueDate.toLocaleDateString("en-GB")} ({c.invoicePaymentTerms} days)</dd>
                </div>
              )}
              {c.purchaseOrderNumber && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Purchase order</dt>
                  <dd className="font-mono">{c.purchaseOrderNumber}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-gray-500">Timesheets included</dt>
                <dd>{invoice.timesheetIds.length}</dd>
              </div>
            </dl>
          </div>

          {/* Amount */}
          <div className="rounded-md bg-gray-50 border border-gray-200 px-4 py-3 flex items-center justify-between">
            <span className="text-gray-600 font-medium">Total</span>
            <span className="text-xl font-bold text-gray-900">
              {invoice.currency} {parseFloat(invoice.amount).toFixed(2)}
            </span>
          </div>

          {/* Status */}
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Status</span>
            <span className={`badge ${statusClass[invoice.status] ?? "badge-draft"}`}>
              {invoice.status}
            </span>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex-shrink-0 flex justify-end">
          <button onClick={onClose} className="btn-secondary">Close</button>
        </div>
      </div>
    </div>
  )
}
