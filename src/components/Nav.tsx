"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { signOut } from "next-auth/react"
import { useState } from "react"

interface NavUser {
  id: string
  name?: string | null
  email?: string | null
  role: string
}

const NAV_ITEMS = [
  { href: "/dashboard",  label: "Dashboard" },
  { href: "/timesheets", label: "Timesheets" },
  { href: "/clients",    label: "Clients" },
  { href: "/projects",   label: "Projects" },
  { href: "/expenses",   label: "Expenses" },
  { href: "/invoices",   label: "Invoices" },
  { href: "/approvals",  label: "Approvals" },
]

const SETTINGS_ITEMS = [
  { href: "/settings",        label: "Profile & Security", roles: ["ADMIN", "MANAGER"] },
  { href: "/settings/users",  label: "Users",              roles: ["ADMIN"] },
  { href: "/settings/audit",  label: "Audit Log",          roles: ["ADMIN"] },
]

export default function Nav({ user }: { user: NavUser }) {
  const pathname = usePathname()
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    await signOut({ redirect: false })
    router.push("/login")
  }

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === href
    return pathname.startsWith(href)
  }

  return (
    <aside className="flex flex-col w-60 min-h-screen bg-slate-900 text-slate-200 shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-700">
        <span className="text-lg font-bold text-white tracking-tight">Timesheet Pro</span>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              isActive(item.href)
                ? "bg-blue-600 text-white"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        ))}

        {/* Settings section */}
        <div className="pt-4">
          <p className="px-3 mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Settings
          </p>
          {SETTINGS_ITEMS.filter((i) => i.roles.includes(user.role)).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive(item.href)
                  ? "bg-blue-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      {/* User footer */}
      <div className="px-4 py-4 border-t border-slate-700">
        <div className="mb-2">
          <p className="text-sm font-medium text-white truncate">{user.name}</p>
          <p className="text-xs text-slate-400 truncate">{user.email}</p>
          <span className={`badge mt-1 ${user.role === "ADMIN" ? "badge-admin" : "badge-manager"}`}>
            {user.role}
          </span>
        </div>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="w-full text-left text-xs text-slate-400 hover:text-white transition-colors py-1"
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </aside>
  )
}
