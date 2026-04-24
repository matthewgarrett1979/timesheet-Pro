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
  mustChangePassword: boolean
  failedLogins: number
  lockedUntil: string | null
  createdAt: string
}

interface Project {
  id: string
  name: string
  client: { name: string }
}

interface UserProject {
  id: string
  userId: string
  projectId: string
  assignedAt: string
  user: { id: string; name: string; email: string; role: string }
}

export default function UsersPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [tempPassword, setTempPassword] = useState<{ name: string; email: string; password: string } | null>(null)
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [userProjects, setUserProjects] = useState<Record<string, UserProject[]>>({})
  const [allProjects, setAllProjects] = useState<Project[]>([])

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  const [deleteCounts, setDeleteCounts] = useState<Record<string, number> | null>(null)
  const [deleteAction, setDeleteAction] = useState<"reassign" | "delete_records" | "">("")
  const [deleteReassignTo, setDeleteReassignTo] = useState("")
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("")
  const [deleteInProgress, setDeleteInProgress] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  useEffect(() => {
    if (session && session.user.role !== "ADMIN") {
      router.replace("/settings")
    }
  }, [session])

  async function load() {
    const [usersRes, projectsRes] = await Promise.all([
      fetch("/api/users"),
      fetch("/api/projects"),
    ])
    if (usersRes.ok) setUsers(await usersRes.json())
    if (projectsRes.ok) setAllProjects(await projectsRes.json())
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

  function openDelete(u: User) {
    setDeleteTarget(u)
    setDeleteCounts(null)
    setDeleteAction("")
    setDeleteReassignTo("")
    setDeleteConfirmEmail("")
    setDeleteError("")
  }

  function closeDelete() {
    setDeleteTarget(null)
    setDeleteCounts(null)
    setDeleteAction("")
    setDeleteReassignTo("")
    setDeleteConfirmEmail("")
    setDeleteError("")
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleteInProgress(true)
    setDeleteError("")

    const body: Record<string, unknown> = { confirmEmail: deleteConfirmEmail }
    if (deleteAction) body.action = deleteAction
    if (deleteAction === "reassign") body.reassignToUserId = deleteReassignTo

    const res = await fetch(`/api/users/${deleteTarget.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    setDeleteInProgress(false)

    if (res.status === 204) {
      closeDelete()
      load()
    } else if (res.status === 409) {
      const data = await res.json().catch(() => ({}))
      if (data.counts) setDeleteCounts(data.counts)
      else setDeleteError(data.error ?? "Cannot delete user.")
    } else {
      const data = await res.json().catch(() => ({}))
      setDeleteError(data.error ?? "Failed to delete user.")
    }
  }

  async function loadUserProjects(userId: string) {
    // Find all projects assigned to this user by checking per-project assignments
    const assignments: UserProject[] = []
    for (const project of allProjects) {
      const res = await fetch(`/api/projects/${project.id}/users`)
      if (res.ok) {
        const data: UserProject[] = await res.json()
        const match = data.find((a) => a.userId === userId)
        if (match) assignments.push(match)
      }
    }
    setUserProjects((prev) => ({ ...prev, [userId]: assignments }))
  }

  async function toggleExpand(userId: string) {
    if (expandedUser === userId) {
      setExpandedUser(null)
      return
    }
    setExpandedUser(userId)
    if (!userProjects[userId]) {
      await loadUserProjects(userId)
    }
  }

  async function assignProject(userId: string, projectId: string) {
    await fetch(`/api/projects/${projectId}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    })
    await loadUserProjects(userId)
  }

  async function removeProject(userId: string, projectId: string) {
    await fetch(`/api/projects/${projectId}/users`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    })
    await loadUserProjects(userId)
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
                const isExpanded = expandedUser === u.id
                const projects = userProjects[u.id] ?? []
                return (
                  <>
                    <tr key={u.id}>
                      <td className="font-medium text-gray-900">
                        {u.name}
                        {u.mustChangePassword && (
                          <span className="ml-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                            must change password
                          </span>
                        )}
                      </td>
                      <td className="text-gray-500 text-xs">{u.email}</td>
                      <td>
                        <span className={`badge ${
                          u.role === "ADMIN" ? "badge-admin" :
                          u.role === "MANAGER" ? "badge-manager" :
                          "badge-draft"
                        }`}>
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
                      <td className="space-x-3">
                        {locked && (
                          <button
                            onClick={() => unlockUser(u.id)}
                            className="text-sm text-blue-600 hover:underline"
                          >
                            Unlock
                          </button>
                        )}
                        {u.role === "USER" && (
                          <button
                            onClick={() => toggleExpand(u.id)}
                            className="text-sm text-blue-600 hover:underline"
                          >
                            {isExpanded ? "Hide" : "Projects"}
                          </button>
                        )}
                        {u.id !== session?.user?.id && (
                          <button
                            onClick={() => openDelete(u)}
                            className="text-sm text-red-500 hover:underline"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${u.id}-projects`}>
                        <td colSpan={7} className="bg-gray-50 px-6 py-3">
                          <div className="text-sm font-medium text-gray-700 mb-2">Assigned projects</div>
                          {projects.length === 0 ? (
                            <p className="text-xs text-gray-400 mb-2">No projects assigned yet.</p>
                          ) : (
                            <div className="flex flex-wrap gap-2 mb-3">
                              {projects.map((a) => {
                                const proj = allProjects.find((p) => p.id === a.projectId)
                                return proj ? (
                                  <span key={a.projectId} className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded-full px-3 py-1 text-xs text-gray-700">
                                    {proj.client.name} / {proj.name}
                                    <button
                                      onClick={() => removeProject(u.id, a.projectId)}
                                      className="text-gray-400 hover:text-red-500 ml-1 font-bold"
                                      title="Remove"
                                    >
                                      ×
                                    </button>
                                  </span>
                                ) : null
                              })}
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <select
                              className="input text-xs w-72"
                              defaultValue=""
                              onChange={async (e) => {
                                if (e.target.value) {
                                  await assignProject(u.id, e.target.value)
                                  e.target.value = ""
                                }
                              }}
                            >
                              <option value="">Add project…</option>
                              {allProjects
                                .filter((p) => !projects.some((a) => a.projectId === p.id))
                                .map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.client.name} / {p.name}
                                  </option>
                                ))}
                            </select>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onSaved={(data) => {
            setShowCreate(false)
            setTempPassword({ name: data.name, email: data.email, password: data.tempPassword })
            load()
          }}
        />
      )}

      {tempPassword && (
        <TempPasswordModal
          name={tempPassword.name}
          email={tempPassword.email}
          password={tempPassword.password}
          onClose={() => setTempPassword(null)}
        />
      )}

      {deleteTarget && (
        <div className="modal-backdrop" onClick={closeDelete}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900 mb-1">Delete user?</h3>
            <p className="text-sm text-gray-500 mb-4">{deleteTarget.name} · {deleteTarget.email}</p>

            {deleteError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">{deleteError}</p>
            )}

            {deleteCounts && Object.values(deleteCounts).some((v) => v > 0) && (
              <div className="mb-4">
                <p className="text-sm text-gray-700 mb-2">This user has associated records:</p>
                <ul className="text-sm bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 space-y-1 mb-3">
                  {Object.entries(deleteCounts).filter(([, v]) => v > 0).map(([k, v]) => (
                    <li key={k} className="flex justify-between">
                      <span className="capitalize">{k.replace(/([A-Z])/g, " $1")}</span>
                      <span className="font-medium">{v}</span>
                    </li>
                  ))}
                </ul>
                <div className="space-y-2">
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      className="mt-0.5"
                      checked={deleteAction === "reassign"}
                      onChange={() => setDeleteAction("reassign")}
                    />
                    <span><strong>Reassign</strong> records to another user</span>
                  </label>
                  {deleteAction === "reassign" && (
                    <select
                      className="input ml-5 text-sm"
                      value={deleteReassignTo}
                      onChange={(e) => setDeleteReassignTo(e.target.value)}
                    >
                      <option value="">Select user…</option>
                      {users.filter((u) => u.id !== deleteTarget.id).map((u) => (
                        <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                      ))}
                    </select>
                  )}
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      className="mt-0.5"
                      checked={deleteAction === "delete_records"}
                      onChange={() => setDeleteAction("delete_records")}
                    />
                    <span><strong>Delete all</strong> associated records permanently</span>
                  </label>
                </div>
              </div>
            )}

            <div className="mb-4">
              <label className="label">Type the user&apos;s email to confirm</label>
              <input
                type="text"
                className="input"
                placeholder={deleteTarget.email}
                value={deleteConfirmEmail}
                onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                autoFocus
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button onClick={closeDelete} className="btn-secondary">Cancel</button>
              <button
                onClick={confirmDelete}
                disabled={
                  deleteInProgress ||
                  deleteConfirmEmail !== deleteTarget.email ||
                  (!!deleteCounts && Object.values(deleteCounts).some((v) => v > 0) && !deleteAction) ||
                  (deleteAction === "reassign" && !deleteReassignTo)
                }
                className="btn-danger"
              >
                {deleteInProgress ? "Deleting…" : "Delete user"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CreateUserModal({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: (data: { name: string; email: string; tempPassword: string }) => void
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState("USER")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError("")

    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, role }),
    })

    setSaving(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? "Failed to create user.")
      return
    }
    const data = await res.json()
    onSaved({ name: data.name, email: data.email, tempPassword: data.tempPassword })
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
            <label className="label">Role</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="USER">User</option>
              <option value="MANAGER">Manager</option>
              <option value="ADMIN">Admin</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">
              A temporary password will be auto-generated and shown once after creation.
            </p>
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

function TempPasswordModal({
  name,
  email,
  password,
  onClose,
}: {
  name: string
  email: string
  password: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  function copyToClipboard() {
    navigator.clipboard.writeText(password)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-green-700">User Created</h2>
        </div>
        <div className="px-6 py-4 space-y-4">
          <p className="text-sm text-gray-700">
            <span className="font-medium">{name}</span> ({email}) has been created. Share the temporary password below — it will not be shown again.
          </p>
          <div>
            <label className="label">Temporary password</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-gray-50 border border-gray-200 rounded px-3 py-2 text-sm font-mono break-all select-all">
                {password}
              </code>
              <button onClick={copyToClipboard} className="btn-secondary shrink-0 text-xs">
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            The user will be required to change their password on first login.
          </p>
          <div className="flex justify-end pt-2">
            <button onClick={onClose} className="btn-primary">Done</button>
          </div>
        </div>
      </div>
    </div>
  )
}
