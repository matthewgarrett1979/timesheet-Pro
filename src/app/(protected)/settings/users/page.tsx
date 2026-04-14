"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"

interface User {
  id: string
  email: string
  name: string
  role: string
  mfaEnabled: boolean
  failedLogins: number
  lockedUntil: string | null
  createdAt: string
}

export default function UsersPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  // Redirect non-admins
  useEffect(() => {
    if (session && session.user.role !== "ADMIN") {
      router.replace("/settings")
    }
  }, [session])

  async function load() {
    const res = await fetch("/api/users")
    if (res.ok) setUsers(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function unlockUser(id: string) {
    await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unlock: true }),
    })
    load()
  }

  if (session?.user?.role !== "ADMIN") return null

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500 mt-1">{users.length} user{users.length !== 1 ? "s" : ""}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          Create user
        </button>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>MFA</th>
                <th>Status</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const locked = u.lockedUntil && new Date(u.lockedUntil) > new Date()
                return (
                  <tr key={u.id}>
                    <td className="font-medium text-gray-900">{u.name}</td>
                    <td className="text-gray-500 text-xs">{u.email}</td>
                    <td>
                      <span className={`badge ${u.role === "ADMIN" ? "badge-admin" : "badge-manager"}`}>
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${u.mfaEnabled ? "badge-approved" : "badge-draft"}`}>
                        {u.mfaEnabled ? "Enabled" : "Disabled"}
                      </span>
                    </td>
                    <td>
                      {locked ? (
                        <span className="badge badge-rejected">Locked</span>
                      ) : u.failedLogins > 0 ? (
                        <span className="badge badge-submitted">{u.failedLogins} failed</span>
                      ) : (
                        <span className="badge badge-approved">Active</span>
                      )}
                    </td>
                    <td className="text-gray-400">{new Date(u.createdAt).toLocaleDateString("en-GB")}</td>
                    <td>
                      {locked && (
                        <button
                          onClick={() => unlockUser(u.id)}
                          className="text-sm text-blue-600 hover:underline"
                        >
                          Unlock
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load() }}
        />
      )}
    </div>
  )
}

function CreateUserModal({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState("MANAGER")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 12) {
      setError("Password must be at least 12 characters.")
      return
    }
    setSaving(true)
    setError("")

    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role }),
    })

    setSaving(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? "Failed to create user.")
      return
    }
    onSaved()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">Create User</h2>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
          )}
          <div>
            <label className="label">Full name *</label>
            <input type="text" className="input" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Email address *</label>
            <input type="email" className="input" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label">Temporary password *</label>
            <input
              type="password"
              className="input"
              required
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">Minimum 12 characters. User should change this on first login.</p>
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="MANAGER">Manager</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Creating…" : "Create user"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
