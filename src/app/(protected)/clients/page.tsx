"use client"

import { useEffect, useState } from "react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Client {
  id: string
  name: string
  reference: string | null
  managerId: string
  // Company
  companyName: string | null
  tradingName: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  county: string | null
  postcode: string | null
  country: string
  // Contact
  vatNumber: string | null
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  // Invoice
  purchaseOrderNumber: string | null
  invoicePaymentTerms: number | null
  invoiceCurrency: string
  // Internal
  notes: string | null
  // Approval
  approvalType: string
  approvalGranularity: string
  // Archive
  isArchived: boolean
  createdAt: string
}

interface FormState {
  name: string
  reference: string
  companyName: string
  tradingName: string
  addressLine1: string
  addressLine2: string
  city: string
  county: string
  postcode: string
  country: string
  contactName: string
  contactEmail: string
  contactPhone: string
  vatNumber: string
  purchaseOrderNumber: string
  invoicePaymentTerms: string
  invoiceCurrency: string
  notes: string
  approvalType: string
  approvalGranularity: string
}

function emptyForm(): FormState {
  return {
    name: "",
    reference: "",
    companyName: "",
    tradingName: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    county: "",
    postcode: "",
    country: "United Kingdom",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    vatNumber: "",
    purchaseOrderNumber: "",
    invoicePaymentTerms: "",
    invoiceCurrency: "GBP",
    notes: "",
    approvalType: "EMAIL",
    approvalGranularity: "TIMESHEET",
  }
}

function clientToForm(c: Client): FormState {
  return {
    name: c.name,
    reference: c.reference ?? "",
    companyName: c.companyName ?? "",
    tradingName: c.tradingName ?? "",
    addressLine1: c.addressLine1 ?? "",
    addressLine2: c.addressLine2 ?? "",
    city: c.city ?? "",
    county: c.county ?? "",
    postcode: c.postcode ?? "",
    country: c.country ?? "United Kingdom",
    contactName: c.contactName ?? "",
    contactEmail: c.contactEmail ?? "",
    contactPhone: c.contactPhone ?? "",
    vatNumber: c.vatNumber ?? "",
    purchaseOrderNumber: c.purchaseOrderNumber ?? "",
    invoicePaymentTerms: c.invoicePaymentTerms != null ? String(c.invoicePaymentTerms) : "",
    invoiceCurrency: c.invoiceCurrency ?? "GBP",
    notes: c.notes ?? "",
    approvalType: c.approvalType ?? "EMAIL",
    approvalGranularity: c.approvalGranularity ?? "TIMESHEET",
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editClient, setEditClient] = useState<Client | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null)
  const [deleteError, setDeleteError] = useState("")
  const [deleteInProgress, setDeleteInProgress] = useState(false)

  async function load() {
    const res = await fetch("/api/clients")
    if (res.ok) setClients(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openNew() {
    setEditClient(null)
    setShowModal(true)
  }

  function openEdit(c: Client) {
    setEditClient(c)
    setShowModal(true)
  }

  function openDelete(c: Client) {
    setDeleteTarget(c)
    setDeleteError("")
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleteInProgress(true)
    const res = await fetch(`/api/clients/${deleteTarget.id}`, { method: "DELETE" })
    setDeleteInProgress(false)

    if (res.status === 204) {
      setDeleteTarget(null)
      load()
    } else {
      const data = await res.json().catch(() => ({}))
      setDeleteError(data.error ?? "Failed to delete client.")
    }
  }

  async function toggleArchive(c: Client, archive: boolean) {
    const res = await fetch(`/api/clients/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isArchived: archive }),
    })
    if (res.ok) load()
  }

  // Split into active / archived
  const activeClients = clients.filter((c) => !c.isArchived)
  const archivedClients = clients.filter((c) => c.isArchived)
  const visibleClients = showArchived ? clients : activeClients
  const displayCount = showArchived
    ? `${activeClients.length} active, ${archivedClients.length} archived`
    : `${activeClients.length} client${activeClients.length !== 1 ? "s" : ""}${archivedClients.length > 0 ? ` · ${archivedClients.length} archived` : ""}`

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-sm text-gray-500 mt-1">{displayCount}</p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded border-gray-300"
            />
            Show archived
          </label>
          <button className="btn-primary" onClick={openNew}>
            New client
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : visibleClients.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            {showArchived
              ? "No archived clients."
              : "No clients yet. Add your first client to get started."}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Reference</th>
                <th>City</th>
                <th>Contact</th>
                <th>Currency</th>
                <th>Approval</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleClients.map((c) => (
                <tr
                  key={c.id}
                  className={c.isArchived ? "opacity-50" : undefined}
                >
                  <td>
                    <div className="flex items-center gap-2">
                      <div>
                        <p className="font-medium text-gray-900">{c.companyName ?? c.name}</p>
                        {c.companyName && c.companyName !== c.name && (
                          <p className="text-xs text-gray-400">{c.name}</p>
                        )}
                      </div>
                      {c.isArchived && (
                        <span className="badge badge-draft text-xs">Archived</span>
                      )}
                    </div>
                  </td>
                  <td className="text-gray-500 font-mono text-xs">{c.reference ?? "—"}</td>
                  <td className="text-gray-500 text-sm">{c.city ?? "—"}</td>
                  <td className="text-sm">
                    {c.contactName ? (
                      <div>
                        <p className="text-gray-700">{c.contactName}</p>
                        {c.contactEmail && (
                          <p className="text-xs text-gray-400">{c.contactEmail}</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="text-sm font-mono text-gray-500">{c.invoiceCurrency}</td>
                  <td className="text-xs text-gray-500">{c.approvalType}</td>
                  <td className="text-gray-400">
                    {new Date(c.createdAt).toLocaleDateString("en-GB")}
                  </td>
                  <td>
                    <div className="flex items-center gap-3 text-sm">
                      <button
                        onClick={() => openEdit(c)}
                        className="text-blue-600 hover:underline"
                      >
                        Edit
                      </button>
                      {c.isArchived ? (
                        <button
                          onClick={() => toggleArchive(c, false)}
                          className="text-gray-500 hover:underline"
                        >
                          Unarchive
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => toggleArchive(c, true)}
                            className="text-gray-500 hover:underline"
                          >
                            Archive
                          </button>
                          <button
                            onClick={() => openDelete(c)}
                            className="text-red-500 hover:underline"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit / New client modal */}
      {showModal && (
        <ClientModal
          client={editClient}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }}
        />
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="modal-backdrop" onClick={() => { setDeleteTarget(null); setDeleteError("") }}>
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {deleteError ? (
              <>
                <h3 className="text-base font-semibold text-gray-900 mb-2">Cannot delete client</h3>
                <p className="text-sm text-gray-600 mb-4">{deleteError}</p>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => { setDeleteTarget(null); setDeleteError("") }}
                    className="btn-secondary"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      toggleArchive(deleteTarget, true)
                      setDeleteTarget(null)
                      setDeleteError("")
                    }}
                    className="btn-primary"
                  >
                    Archive instead
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-base font-semibold text-gray-900 mb-2">Delete client?</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Are you sure you want to delete{" "}
                  <span className="font-medium">
                    {deleteTarget.companyName ?? deleteTarget.name}
                  </span>
                  ? This cannot be undone.
                </p>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setDeleteTarget(null)}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDelete}
                    disabled={deleteInProgress}
                    className="btn-danger"
                  >
                    {deleteInProgress ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SectionHeading({ title }: { title: string }) {
  return (
    <div className="col-span-2 mt-5 pb-1.5 border-b border-gray-200 first:mt-0">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</p>
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function ClientModal({
  client,
  onClose,
  onSaved,
}: {
  client: Client | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<FormState>(client ? clientToForm(client) : emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  function set(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError("")

    const payload: Record<string, unknown> = {
      name: form.name || form.companyName,
      reference: form.reference || null,
      companyName: form.companyName || null,
      tradingName: form.tradingName || null,
      addressLine1: form.addressLine1 || null,
      addressLine2: form.addressLine2 || null,
      city: form.city || null,
      county: form.county || null,
      postcode: form.postcode || null,
      country: form.country || "United Kingdom",
      contactName: form.contactName || null,
      contactEmail: form.contactEmail || null,
      contactPhone: form.contactPhone || null,
      vatNumber: form.vatNumber || null,
      purchaseOrderNumber: form.purchaseOrderNumber || null,
      invoicePaymentTerms: form.invoicePaymentTerms
        ? parseInt(form.invoicePaymentTerms, 10) : null,
      invoiceCurrency: form.invoiceCurrency || "GBP",
      notes: form.notes || null,
      approvalType: form.approvalType,
      approvalGranularity: form.approvalGranularity,
    }

    const url = client ? `/api/clients/${client.id}` : "/api/clients"
    const method = client ? "PATCH" : "POST"

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    setSaving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? "Failed to save client.")
      return
    }
    onSaved()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col"
        style={{ maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">
            {client ? "Edit Client" : "New Client"}
          </h2>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 min-h-0">
          <form id="client-form" onSubmit={handleSubmit} className="px-6 py-5">
            {error && (
              <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-x-4 gap-y-3">

              {/* ── Company Details ──────────────────────────────── */}
              <SectionHeading title="Company Details" />

              <div className="col-span-2">
                <label className="label">
                  Legal entity name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="As it appears on invoices"
                  required
                  value={form.companyName}
                  onChange={(e) => set("companyName", e.target.value)}
                />
              </div>

              <div>
                <label className="label">Trading name</label>
                <input
                  type="text"
                  className="input"
                  placeholder="If different from legal name"
                  value={form.tradingName}
                  onChange={(e) => set("tradingName", e.target.value)}
                />
              </div>
              <div>
                <label className="label">Internal display name</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Short name used in lists"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                />
              </div>

              <div>
                <label className="label">Client reference</label>
                <input
                  type="text"
                  className="input font-mono"
                  placeholder="e.g. GD-2024-001"
                  value={form.reference}
                  onChange={(e) => set("reference", e.target.value)}
                />
              </div>
              <div />

              <div className="col-span-2">
                <label className="label">
                  Address line 1 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="input"
                  required
                  value={form.addressLine1}
                  onChange={(e) => set("addressLine1", e.target.value)}
                />
              </div>

              <div className="col-span-2">
                <label className="label">Address line 2</label>
                <input
                  type="text"
                  className="input"
                  value={form.addressLine2}
                  onChange={(e) => set("addressLine2", e.target.value)}
                />
              </div>

              <div>
                <label className="label">
                  City <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="input"
                  required
                  value={form.city}
                  onChange={(e) => set("city", e.target.value)}
                />
              </div>
              <div>
                <label className="label">County</label>
                <input
                  type="text"
                  className="input"
                  value={form.county}
                  onChange={(e) => set("county", e.target.value)}
                />
              </div>

              <div>
                <label className="label">
                  Postcode <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="input uppercase"
                  required
                  value={form.postcode}
                  onChange={(e) => set("postcode", e.target.value.toUpperCase())}
                />
              </div>
              <div>
                <label className="label">Country</label>
                <input
                  type="text"
                  className="input"
                  value={form.country}
                  onChange={(e) => set("country", e.target.value)}
                />
              </div>

              {/* ── Contact Details ──────────────────────────────── */}
              <SectionHeading title="Contact Details" />

              <div>
                <label className="label">
                  Contact name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="input"
                  required
                  value={form.contactName}
                  onChange={(e) => set("contactName", e.target.value)}
                />
              </div>
              <div>
                <label className="label">Contact phone</label>
                <input
                  type="tel"
                  className="input"
                  value={form.contactPhone}
                  onChange={(e) => set("contactPhone", e.target.value)}
                />
              </div>

              <div className="col-span-2">
                <label className="label">
                  Contact email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  className="input"
                  required
                  value={form.contactEmail}
                  onChange={(e) => set("contactEmail", e.target.value)}
                />
              </div>

              {/* ── Invoice Settings ─────────────────────────────── */}
              <SectionHeading title="Invoice Settings" />

              <div>
                <label className="label">VAT number</label>
                <input
                  type="text"
                  className="input font-mono"
                  placeholder="e.g. GB123456789"
                  value={form.vatNumber}
                  onChange={(e) => set("vatNumber", e.target.value)}
                />
              </div>
              <div>
                <label className="label">Purchase order number</label>
                <input
                  type="text"
                  className="input font-mono"
                  placeholder="Required on some invoices"
                  value={form.purchaseOrderNumber}
                  onChange={(e) => set("purchaseOrderNumber", e.target.value)}
                />
              </div>

              <div>
                <label className="label">Payment terms (days)</label>
                <input
                  type="number"
                  className="input"
                  min="1"
                  max="365"
                  placeholder="e.g. 30"
                  value={form.invoicePaymentTerms}
                  onChange={(e) => set("invoicePaymentTerms", e.target.value)}
                />
              </div>
              <div>
                <label className="label">Invoice currency</label>
                <select
                  className="input"
                  value={form.invoiceCurrency}
                  onChange={(e) => set("invoiceCurrency", e.target.value)}
                >
                  <option value="GBP">GBP — British Pound</option>
                  <option value="USD">USD — US Dollar</option>
                  <option value="EUR">EUR — Euro</option>
                  <option value="CAD">CAD — Canadian Dollar</option>
                  <option value="AUD">AUD — Australian Dollar</option>
                </select>
              </div>

              {/* ── Internal Notes ───────────────────────────────── */}
              <SectionHeading title="Internal Notes" />

              <div className="col-span-2">
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Internal notes — not shown on invoices"
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                />
              </div>

              {/* ── Approval Settings ────────────────────────────── */}
              <SectionHeading title="Approval Settings" />

              <div>
                <label className="label">Approval type</label>
                <select
                  className="input"
                  value={form.approvalType}
                  onChange={(e) => set("approvalType", e.target.value)}
                >
                  <option value="EMAIL">Email link</option>
                  <option value="PORTAL">Client portal</option>
                  <option value="NONE">Not required</option>
                </select>
              </div>
              <div>
                <label className="label">Approval granularity</label>
                <select
                  className="input"
                  value={form.approvalGranularity}
                  onChange={(e) => set("approvalGranularity", e.target.value)}
                >
                  <option value="TIMESHEET">Per timesheet (weekly)</option>
                  <option value="MONTHLY">Monthly</option>
                  <option value="QUARTERLY">Quarterly</option>
                </select>
              </div>

              {client?.managerId && (
                <div className="col-span-2">
                  <label className="label">Assigned manager ID</label>
                  <input
                    type="text"
                    className="input font-mono text-gray-400 bg-gray-50"
                    value={client.managerId}
                    readOnly
                  />
                </div>
              )}

            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex-shrink-0 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" form="client-form" disabled={saving} className="btn-primary">
            {saving ? "Saving…" : client ? "Save changes" : "Create client"}
          </button>
        </div>
      </div>
    </div>
  )
}
