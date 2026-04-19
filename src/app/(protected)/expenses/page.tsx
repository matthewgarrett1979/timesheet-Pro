"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"

const CATEGORIES = [
  "Travel", "Accommodation", "Subsistence", "Equipment",
  "Software", "Training", "Communications", "Other",
]

const STATUS_OPTIONS = ["", "DRAFT", "SUBMITTED", "APPROVED", "REJECTED"]

const statusClass: Record<string, string> = {
  DRAFT:     "badge-draft",
  SUBMITTED: "badge-submitted",
  APPROVED:  "badge-approved",
  REJECTED:  "badge-rejected",
}

interface Client { id: string; name: string }

interface Expense {
  id: string
  description: string
  amount: string
  currency: string
  date: string
  category: string
  status: string
  billable: boolean
  invoiced: boolean
  rejectionNote: string | null
  client: { id: string; name: string } | null
  manager: { id: string; name: string }
}

export default function ExpensesPage() {
  const { data: session } = useSession()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState("")
  const [showModal, setShowModal] = useState(false)
  const [editExpense, setEditExpense] = useState<Expense | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState("")

  const isAdmin = session?.user?.role === "ADMIN"

  async function load() {
    const qs = statusFilter ? `?status=${statusFilter}` : ""
    const [ex, cl] = await Promise.all([
      fetch(`/api/expenses${qs}`).then((r) => r.json()),
      fetch("/api/clients").then((r) => r.json()),
    ])
    setExpenses(Array.isArray(ex) ? ex : [])
    setClients(Array.isArray(cl) ? cl : [])
    setLoading(false)
  }

  useEffect(() => { setLoading(true); load() }, [statusFilter])

  const total = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0)

  async function handleSubmit(expenseId: string) {
    setActionLoading(expenseId)
    setActionError("")
    const res = await fetch(`/api/expenses/${expenseId}/submit`, { method: "POST" })
    setActionLoading(null)
    if (!res.ok) {
      const data = await res.json()
      setActionError(data.error ?? "Failed to submit expense.")
    } else {
      await load()
    }
  }

  async function handleDelete(expenseId: string) {
    setActionLoading(expenseId)
    setActionError("")
    const res = await fetch(`/api/expenses/${expenseId}`, { method: "DELETE" })
    setActionLoading(null)
    setDeleteConfirmId(null)
    if (!res.ok) {
      const data = await res.json()
      setActionError(data.error ?? "Failed to delete expense.")
    } else {
      await load()
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
          <p className="text-sm text-gray-500 mt-1">
            {expenses.length} record{expenses.length !== 1 ? "s" : ""} · Total: £{total.toFixed(2)}
          </p>
        </div>
        <button className="btn-primary" onClick={() => { setEditExpense(null); setShowModal(true) }}>
          Add expense
        </button>
      </div>

      {actionError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {actionError}
          <button className="ml-2 text-red-400 hover:text-red-600" onClick={() => setActionError("")}>×</button>
        </div>
      )}

      {/* Status filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              statusFilter === s
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
            }`}
          >
            {s || "All"}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : expenses.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No expenses found.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th>Client</th>
                <th>Amount</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <>
                  <tr key={e.id}>
                    <td>{new Date(e.date).toLocaleDateString("en-GB")}</td>
                    <td className="font-medium text-gray-900 max-w-xs truncate">{e.description}</td>
                    <td className="text-gray-500">{e.category}</td>
                    <td className="text-gray-500">{e.client?.name ?? "—"}</td>
                    <td className="font-mono text-sm">
                      {e.currency} {parseFloat(e.amount).toFixed(2)}
                    </td>
                    <td>
                      <span className={`badge ${statusClass[e.status] ?? "badge-draft"}`}>
                        {e.status}
                      </span>
                    </td>
                    <td className="flex items-center gap-2">
                      {e.status === "DRAFT" && (
                        <>
                          <button
                            onClick={() => { setEditExpense(e); setShowModal(true) }}
                            className="text-sm text-blue-600 hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleSubmit(e.id)}
                            disabled={actionLoading === e.id}
                            className="text-sm text-amber-600 hover:underline disabled:opacity-50"
                          >
                            {actionLoading === e.id ? "…" : "Submit"}
                          </button>
                        </>
                      )}
                      {(e.status === "DRAFT" || isAdmin) && (
                        <button
                          onClick={() => setDeleteConfirmId(e.id)}
                          className="text-sm text-red-500 hover:underline"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                  {e.status === "REJECTED" && e.rejectionNote && (
                    <tr key={`${e.id}-note`}>
                      <td colSpan={7} className="bg-red-50 px-4 py-2">
                        <p className="text-xs text-red-700">
                          <span className="font-medium">Rejected: </span>{e.rejectionNote}
                        </p>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirmId && (
        <div className="modal-backdrop" onClick={() => setDeleteConfirmId(null)}>
          <div className="modal-box max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-red-700">Delete Expense</h2>
            </div>
            <div className="px-6 py-4 space-y-4">
              <p className="text-sm text-gray-700">
                {(() => {
                  const exp = expenses.find((e) => e.id === deleteConfirmId)
                  if (!exp) return "Are you sure?"
                  if (exp.status !== "DRAFT") return (
                    <>
                      <span className="font-medium text-red-700">Warning:</span> This expense is{" "}
                      <span className="font-medium">{exp.status}</span>. Deleting it cannot be undone.
                    </>
                  )
                  return "Are you sure you want to delete this expense? This cannot be undone."
                })()}
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button className="btn-secondary" onClick={() => setDeleteConfirmId(null)}>Cancel</button>
                <button
                  className="btn-danger"
                  disabled={actionLoading === deleteConfirmId}
                  onClick={() => handleDelete(deleteConfirmId)}
                >
                  {actionLoading === deleteConfirmId ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <ExpenseModal
          expense={editExpense}
          clients={clients}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }}
        />
      )}
    </div>
  )
}

function ExpenseModal({
  expense,
  clients,
  onClose,
  onSaved,
}: {
  expense: Expense | null
  clients: Client[]
  onClose: () => void
  onSaved: () => void
}) {
  const [description, setDescription] = useState(expense?.description ?? "")
  const [amount, setAmount] = useState(expense?.amount ? parseFloat(expense.amount).toFixed(2) : "")
  const [currency, setCurrency] = useState(expense?.currency ?? "GBP")
  const [date, setDate] = useState(expense?.date ? expense.date.split("T")[0] : "")
  const [category, setCategory] = useState(expense?.category ?? "")
  const [clientId, setClientId] = useState(expense?.client?.id ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError("")

    const url = expense ? `/api/expenses/${expense.id}` : "/api/expenses"
    const method = expense ? "PATCH" : "POST"

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description,
        amount: parseFloat(amount),
        currency,
        date: new Date(date).toISOString(),
        category,
        clientId: clientId || undefined,
      }),
    })

    setSaving(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? "Failed to save expense.")
      return
    }
    onSaved()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">{expense ? "Edit Expense" : "Add Expense"}</h2>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
          )}
          <div>
            <label className="label">Description *</label>
            <input type="text" className="input" required value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Date *</label>
              <input type="date" className="input" required value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Amount *</label>
              <input type="number" className="input" step="0.01" min="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Category *</label>
              <select className="input" required value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Select…</option>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Client (optional)</label>
              <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">None</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving…" : expense ? "Save changes" : "Add expense"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
