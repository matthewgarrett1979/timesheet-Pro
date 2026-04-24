"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { signOut } from "next-auth/react"
import { useState, useEffect } from "react"

interface NavUser { id: string; name?: string | null; email?: string | null; role: string }

interface NavItem {
  href: string
  label: string
  roles?: string[]
  adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard",    label: "Dashboard" },
  { href: "/time-entries", label: "Time Entries" },
  { href: "/timesheets",   label: "Timesheets" },
  { href: "/clients",      label: "Clients",   roles: ["ADMIN", "MANAGER"] },
  { href: "/projects",     label: "Projects" },
  { href: "/expenses",     label: "Expenses" },
  { href: "/invoices",     label: "Invoices",  roles: ["ADMIN", "MANAGER"] },
  { href: "/approvals",    label: "Approvals", roles: ["ADMIN", "MANAGER"] },
  { href: "/reports",      label: "Reports",   adminOnly: true },
]

const SETTINGS_ITEMS: NavItem[] = [
  { href: "/settings",                label: "Profile & Security" },
  { href: "/settings/appearance",     label: "Appearance",      roles: ["ADMIN", "MANAGER"] },
  { href: "/settings/company",        label: "Company",         roles: ["ADMIN"] },
  { href: "/settings/categories",     label: "Time Categories", roles: ["ADMIN"] },
  { href: "/settings/notifications",  label: "Notifications",   roles: ["ADMIN"] },
  { href: "/settings/users",          label: "Users",           roles: ["ADMIN"] },
  { href: "/settings/organisation",   label: "Organisation",    roles: ["ADMIN"] },
  { href: "/settings/audit",          label: "Audit Log",       roles: ["ADMIN"] },
]

export default function Nav({ user, version }: { user: NavUser; version: string }) {
  const pathname = usePathname()
  const router   = useRouter()
  const [signingOut,   setSigningOut]   = useState(false)
  const [timerRunning, setTimerRunning] = useState(false)
  const [mobileOpen,   setMobileOpen]   = useState(false)

  useEffect(() => { setMobileOpen(false) }, [pathname])

  useEffect(() => {
    function checkTimer() {
      try {
        const raw = localStorage.getItem("timer_state")
        if (raw) {
          const state = JSON.parse(raw)
          setTimerRunning(!!(state && state.startTime))
        } else setTimerRunning(false)
      } catch { setTimerRunning(false) }
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
    if (item.roles) return item.roles.includes(user.role)
    return true
  })

  const visibleSettingsItems = SETTINGS_ITEMS.filter((item) => {
    if (item.roles) return item.roles.includes(user.role)
    return true
  })

  const navContent = (
    <>
      {/* Wordmark */}
      <div className="px-5 py-5 flex items-center justify-between"
           style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div>
          <div className="font-mono" style={{ fontSize: 9, letterSpacing: "0.18em", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", fontWeight: 500, marginBottom: 2 }}>
            Tech · Timesheet
          </div>
          <div className="font-display text-white" style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" }}>
            Ledger
          </div>
        </div>
        <button
          onClick={() => setMobileOpen(false)}
          className="md:hidden touch-target flex items-center justify-center"
          style={{ color: "rgba(255,255,255,0.7)" }}
          aria-label="Close menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visibleNavItems.map((item) => {
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center px-3 py-2 rounded-md transition-colors touch-target"
              style={{
                fontSize: 14,
                fontWeight: 500,
                letterSpacing: "-0.005em",
                color: active ? "white" : "rgba(255,255,255,0.7)",
                backgroundColor: active ? "var(--color-accent)" : "transparent",
                boxShadow: active ? "inset 0 1px 0 rgba(255,255,255,0.08)" : undefined,
              }}
            >
              <span className="flex-1">{item.label}</span>
              {item.href === "/time-entries" && timerRunning && (
                <span className="w-2 h-2 rounded-full animate-pulse ml-auto"
                      style={{ backgroundColor: "var(--warm, #C87533)" }}/>
              )}
            </Link>
          )
        })}

        {/* Settings section */}
        <div className="pt-6">
          <p className="px-3 mb-2 font-mono"
             style={{ fontSize: 10, letterSpacing: "0.14em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", fontWeight: 500 }}>
            Settings
          </p>
          {visibleSettingsItems.map((item) => {
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center px-3 py-2 rounded-md transition-colors touch-target"
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: active ? "white" : "rgba(255,255,255,0.7)",
                  backgroundColor: active ? "var(--color-accent)" : "transparent",
                }}
              >
                {item.label}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* User footer */}
      <div className="px-4 py-4" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="mb-3">
          <p className="text-white truncate" style={{ fontSize: 14, fontWeight: 500 }}>{user.name}</p>
          <p className="truncate font-mono" style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
            {user.email}
          </p>
          <span className={`badge mt-2 ${
            user.role === "ADMIN" ? "badge-admin" :
            user.role === "MANAGER" ? "badge-manager" :
            "badge-draft"
          }`}>
            {user.role}
          </span>
        </div>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="w-full text-left touch-target flex items-center transition-colors font-mono"
          style={{ fontSize: 11, letterSpacing: "0.08em", color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}
        >
          {signingOut ? "Signing out…" : "Sign out ↗"}
        </button>
        <p className="font-mono select-none"
           style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 6, letterSpacing: "0.08em" }}>
          v{version}
        </p>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile top bar */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3"
        style={{
          backgroundColor: "var(--color-nav-bg)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <span className="font-display text-white" style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.02em" }}>
          Ledger
        </span>
        <button
          onClick={() => setMobileOpen(true)}
          className="touch-target flex items-center justify-center"
          style={{ color: "rgba(255,255,255,0.7)" }}
          aria-label="Open menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setMobileOpen(false)}>
          <aside
            className="flex flex-col w-72 h-full shadow-2xl"
            style={{ backgroundColor: "var(--color-nav-bg)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {navContent}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex flex-col w-60 min-h-screen shrink-0"
        style={{ backgroundColor: "var(--color-nav-bg)" }}
      >
        {navContent}
      </aside>
    </>
  )
}
