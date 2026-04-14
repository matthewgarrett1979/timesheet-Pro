"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { signOut } from "next-auth/react"
import { useState, useEffect } from "react"

interface NavUser { id: string; name?: string | null; email?: string | null; role: string }

const NAV_ITEMS = [
  { href: "/dashboard",    label: "Dashboard" },
  { href: "/time-entries", label: "Time Entries" },
  { href: "/timesheets",   label: "Timesheets" },
  { href: "/clients",      label: "Clients" },
  { href: "/projects",     label: "Projects" },
  { href: "/expenses",     label: "Expenses" },
  { href: "/invoices",     label: "Invoices" },
  { href: "/approvals",    label: "Approvals" },
  { href: "/reports",      label: "Reports", adminOnly: true },
]

const SETTINGS_ITEMS = [
  { href: "/settings",                    label: "Profile & Security",  roles: ["ADMIN", "MANAGER"] },
  { href: "/settings/appearance",         label: "Appearance",          roles: ["ADMIN", "MANAGER"] },
  { href: "/settings/categories",         label: "Time Categories",     roles: ["ADMIN"] },
  { href: "/settings/notifications",      label: "Notifications",       roles: ["ADMIN"] },
  { href: "/settings/users",              label: "Users",               roles: ["ADMIN"] },
  { href: "/settings/audit",              label: "Audit Log",           roles: ["ADMIN"] },
]

export default function Nav({ user, version }: { user: NavUser; version: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)
  const [timerRunning, setTimerRunning] = useState(false)

  useEffect(() => {
    function checkTimer() {
      try {
        const raw = localStorage.getItem("timer_state")
        if (raw) {
          const state = JSON.parse(raw)
          setTimerRunning(!!(state && state.startTime))
        } else {
          setTimerRunning(false)
        }
      } catch {
        setTimerRunning(false)
      }
    }

    checkTimer()
    const interval = setInterval(checkTimer, 5000)
    return () => clearInterval(interval)
  }, [])

  async function handleSignOut() {
    setSigningOut(true)
    await signOut({ redirect: false })
    router.push("/login")
  }

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === href
    return pathname.startsWith(href)
  }

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.adminOnly) return user.role === "ADMIN"
    return true
  })

  return (
    <aside
      className="flex flex-col w-60 min-h-screen text-slate-200 shrink-0"
      style={{ backgroundColor: "var(--color-nav-bg, #1e293b)" }}
    >
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10">
        <span className="text-lg font-bold text-white tracking-tight">Tech Timesheet</span>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visibleNavItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              isActive(item.href)
                ? "text-white"
                : "text-slate-300 hover:bg-white/10 hover:text-white"
            }`}
            style={isActive(item.href) ? { backgroundColor: "var(--color-accent, #2563eb)" } : undefined}
          >
            <span className="flex-1">{item.label}</span>
            {item.href === "/time-entries" && timerRunning && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse ml-auto" />
            )}
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
                  ? "text-white"
                  : "text-slate-300 hover:bg-white/10 hover:text-white"
              }`}
              style={isActive(item.href) ? { backgroundColor: "var(--color-accent, #2563eb)" } : undefined}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      {/* User footer */}
      <div className="px-4 py-4 border-t border-white/10">
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
        <p className="text-xs text-slate-600 mt-2 select-none">v{version}</p>
      </div>
    </aside>
  )
}
