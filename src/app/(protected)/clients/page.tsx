"use client"

import { useEffect, useState } from "react"

interface Client {
  id: string
  name: string
  reference: string | null
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
  notes: string | null
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
  vatNumber: string
  contactName: string
  contactEmail: string
  contactPhone: string
  purchaseOrderNumber: string
  invoicePaymentTerms: string
  invoiceCurrency: string
  notes: string
}

function emptyForm(): FormState {
  return {
    name: "", reference: "", companyName: "", tradingName: "",
    addressLine1: "", addressLine2: "", city: "", county: "",
    postcode: "", country: "United Kingdom", vatNumber: "",
    contactName: "", contactEmail: "", contactPhone: "",
    purchaseOrderNumber: "", invoicePaymentTerms: "", invoiceCurrency: "GBP",
    notes: "",
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
    country: c.country,
    vatNumber: c.vatNumber ?? "",
    contactName: c.contactName ?? "",
    contactEmail: c.contactEmail ?? "",
    contactPhone: c.contactPhone ?? "",
    purchaseOrderNumber: c.purchaseOrderNumber ?? "",
    invoicePaymentTerms: c.invoicePaymentTerms != null ? String(c.invoicePaymentTerms) : "",
    invoiceCurrency: c.invoiceCurrency,
    notes: c.notes ?? "",
  }
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editClient, setEditClient] = useState<Client | null>(null)

  async function load() {
    const res = await fetch("/api/clients")
    if (res.ok) setClients(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-sm text-gray-500 mt-1">{clients.length} client{clients.length !== 1 ? "s" : ""}</p>
        </div>
        <button className="btn-primary" onClick={() => { setEditClient(null); setShowModal(true) }}>
          New client
        </button>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : clients.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            No clients yet. Add your first client to get started.
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
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td>
                    <p className="font-medium text-gray-900">{c.companyName ?? c.name}</p>
                    {c.companyName && c.companyName !== c.name && (
                      <p className="text-xs text-gray-400">{c.name}</p>
                    )}
                  </td>
                  <td className="text-gray-500 font-mono text-xs">{c.reference ?? "—"}</td>
                  <td className="text-gray-500 text-sm">{c.city ?? "—"}</td>
                  <td className="text-sm">
                    {c.contactName ? (
                      <>
                        <p className="text-gray-700">{c.contactName}</p>
                        {c.contactEmail && <p className="text-xs text-gray-400">{c.contactEmail}</p>}
                      </>
                    ) : "—"}
                  </td>
                  <td className="text-sm font-mono text-gray-500">{c.invoiceCurrency}</td>
                  <td className="text-gray-400">{new Date(c.createdAt).toLocaleDateString("en-GB")}</td>
                  <td>
                    <button
                      onClick={() => { setEditClient(c); setShowModal(true) }}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <ClientModal
          client={editClient}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }}
        />
      )}
    </div>
  )
}

function SectionHeading({ title }: { title: string }) {
  return (
    <div className="border-b border-gray-200 pb-1.5 mb-4 mt-6 first:mt-0">
      <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">{title}</h3>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

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

    // Convert empty strings to undefined / null for optional fields
    const payload: Record<string, unknown> = {
      name: form.name,
      reference: form.reference || undefined,
      companyName: form.companyName || undefined,
      tradingName: form.tradingName || undefined,
      addressLine1: form.addressLine1 || undefined,
      addressLine2: form.addressLine2 || null,
      city: form.city || undefined,
      county: form.county || null,
      postcode: form.postcode || undefined,
      country: form.country || "United Kingdom",
      vatNumber: form.vatNumber || null,
      contactName: form.contactName || undefined,
      contactEmail: form.contactEmail || undefined,
      contactPhone: form.contactPhone || null,
      purchaseOrderNumber: form.purchaseOrderNumber || null,
      invoicePaymentTerms: form.invoicePaymentTerms ? parseInt(form.invoicePaymentTerms, 10) : null,
      invoiceCurrency: form.invoiceCurrency || "GBP",
      notes: form.notes || null,
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
      const data = await res.json()
      setError(data.error ?? "Failed to save client.")
      return
    }
    onSaved()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-semibold">{client ? "Edit Client" : "New Client"}</h2>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 overflow-y-auto flex-1">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">{error}</p>
          )}

          {/* ── Company Details ───────────────────────────────────── */}
          <SectionHeading title="Company Details" />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Display name" required>
              <input
                type="text"
                className="input"
                required
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <Field label="Reference">
              <input
                type="text"
                className="input font-mono"
                placeholder="e.g. GD-2024-001"
                value={form.reference}
                onChange={(e) => set("reference", e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <Field label="Legal entity name">
              <input
                type="text"
                className="input"
                placeholder="As it appears on invoices"
                value={form.companyName}
                onChange={(e) => set("companyName", e.target.value)}
              />
            </Field>
            <Field label="Trading name">
              <input
                type="text"
                className="input"
                placeholder="If different from legal name"
                value={form.tradingName}
                onChange={(e) => set("tradingName", e.target.value)}
              />
            </Field>
          </div>

          <div className="mt-3">
            <Field label="Address line 1">
              <input
                type="text"
                className="input"
                value={form.addressLine1}
                onChange={(e) => set("addressLine1", e.target.value)}
              />
            </Field>
          </div>

          <div className="mt-3">
            <Field label="Address line 2">
              <input
                type="text"
                className="input"
                value={form.addressLine2}
                onChange={(e) => set("addressLine2", e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <Field label="City">
              <input
                type="text"
                className="input"
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
              />
            </Field>
            <Field label="County">
              <input
                type="text"
                className="input"
                value={form.county}
                onChange={(e) => set("county", e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <Field label="Postcode">
              <input
                type="text"
                className="input uppercase"
                value={form.postcode}
                onChange={(e) => set("postcode", e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="Country">
              <input
                type="text"
                className="input"
                value={form.country}
                onChange={(e) => set("country", e.target.value)}
              />
            </Field>
          </div>

          {/* ── Contact Details ───────────────────────────────────── */}
          <SectionHeading title="Contact Details" />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact name">
              <input
                type="text"
                className="input"
                value={form.contactName}
                onChange={(e) => set("contactName", e.target.value)}
              />
            </Field>
            <Field label="Contact phone">
              <input
                type="tel"
                className="input"
                value={form.contactPhone}
                onChange={(e) => set("contactPhone", e.target.value)}
              />
            </Field>
          </div>

          <div className="mt-3">
            <Field label="Contact email">
              <input
                type="email"
                className="input"
                value={form.contactEmail}
                onChange={(e) => set("contactEmail", e.target.value)}
              />
            </Field>
          </div>

          {/* ── Invoice Settings ──────────────────────────────────── */}
          <SectionHeading title="Invoice Settings" />

          <div className="grid grid-cols-2 gap-3">
            <Field label="VAT number">
              <input
                type="text"
                className="input font-mono"
                placeholder="e.g. GB123456789"
                value={form.vatNumber}
                onChange={(e) => set("vatNumber", e.target.value)}
              />
            </Field>
            <Field label="Purchase order number">
              <input
                type="text"
                className="input font-mono"
                placeholder="Required on some invoices"
                value={form.purchaseOrderNumber}
                onChange={(e) => set("purchaseOrderNumber", e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <Field label="Payment terms (days)">
              <input
                type="number"
                className="input"
                min="1"
                max="365"
                placeholder="e.g. 30"
                value={form.invoicePaymentTerms}
                onChange={(e) => set("invoicePaymentTerms", e.target.value)}
              />
            </Field>
            <Field label="Invoice currency">
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
            </Field>
          </div>

          {/* ── Internal Notes ────────────────────────────────────── */}
          <SectionHeading title="Internal Notes" />

          <textarea
            className="input"
            rows={3}
            placeholder="Internal notes — not shown on invoices"
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />

          <div className="flex justify-end gap-3 pt-4 mt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving…" : client ? "Save changes" : "Create client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
