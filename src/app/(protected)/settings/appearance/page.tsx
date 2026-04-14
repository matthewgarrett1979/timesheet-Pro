"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import type { FontFamily, NavStyle } from "@/lib/app-settings"
import { FONT_STACKS } from "@/lib/app-settings"

const DEFAULT = {
  primaryColor: "#1e3a5f",
  accentColor: "#2563eb",
  backgroundColor: "#f9fafb",
  fontFamily: "inter" as FontFamily,
  navStyle: "sidebar" as NavStyle,
  compactMode: false,
}

const FONT_OPTIONS: { value: FontFamily; label: string }[] = [
  { value: "inter", label: "Inter (default)" },
  { value: "system", label: "System UI" },
  { value: "georgia", label: "Georgia" },
  { value: "mono", label: "Monospace" },
]

interface ThemeSettings {
  primaryColor: string
  accentColor: string
  backgroundColor: string
  fontFamily: FontFamily
  navStyle: NavStyle
  compactMode: boolean
}

function ColorField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-10 h-9 rounded border border-gray-300 cursor-pointer p-0.5 disabled:opacity-50"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => {
            const v = e.target.value
            if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(v)
          }}
          maxLength={7}
          disabled={disabled}
          className="input w-32 font-mono"
          placeholder="#000000"
        />
      </div>
    </div>
  )
}

function LivePreview({ s }: { s: ThemeSettings }) {
  const fontStack = FONT_STACKS[s.fontFamily] ?? FONT_STACKS.inter
  const navItems = ["Dashboard", "Timesheets", "Clients", "Invoices"]

  return (
    <div>
      <p className="label mb-2">Live preview</p>
      <div
        className="rounded-xl overflow-hidden shadow-lg border border-gray-200"
        style={{ fontFamily: fontStack }}
      >
        <div className="flex" style={{ minHeight: 220, backgroundColor: s.backgroundColor }}>
          {/* Mini sidebar */}
          <div
            className="w-28 px-2 py-3 flex flex-col gap-1 shrink-0"
            style={{ backgroundColor: s.primaryColor }}
          >
            <p className="text-white text-xs font-bold px-1 pb-2 border-b border-white/10 truncate mb-1">
              Tech Timesheet
            </p>
            {navItems.map((item, i) => (
              <div
                key={item}
                className="text-xs px-2 py-1 rounded truncate"
                style={{
                  backgroundColor: i === 0 ? s.accentColor : "transparent",
                  color: i === 0 ? "#fff" : "rgba(255,255,255,0.65)",
                }}
              >
                {item}
              </div>
            ))}
          </div>

          {/* Content area */}
          <div className="flex-1 p-3 min-w-0">
            <p className="text-xs font-semibold text-gray-800 mb-2">Dashboard</p>

            <div className="grid grid-cols-2 gap-2 mb-3">
              {["Clients", "Timesheets"].map((label) => (
                <div
                  key={label}
                  className="rounded-md bg-white border border-gray-100 p-2 shadow-sm"
                >
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className="text-sm font-bold text-gray-800">12</p>
                </div>
              ))}
            </div>

            <button
              className="text-xs text-white px-3 py-1.5 rounded w-full text-center"
              style={{ backgroundColor: s.accentColor }}
            >
              New timesheet
            </button>
          </div>
        </div>

        {/* Footer strip showing font */}
        <div
          className="px-3 py-2 border-t border-gray-100 text-xs text-gray-400"
          style={{ backgroundColor: s.backgroundColor, fontFamily: fontStack }}
        >
          Font: {s.fontFamily} &nbsp;·&nbsp; Nav: {s.navStyle}
          {s.compactMode ? " · compact" : ""}
        </div>
      </div>
    </div>
  )
}

export default function AppearancePage() {
  const { data: session } = useSession()
  const [settings, setSettings] = useState<ThemeSettings>(DEFAULT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  useEffect(() => {
    fetch("/api/settings/appearance")
      .then((r) => r.json())
      .then((data) => {
        setSettings({
          primaryColor: data.primaryColor ?? DEFAULT.primaryColor,
          accentColor: data.accentColor ?? DEFAULT.accentColor,
          backgroundColor: data.backgroundColor ?? DEFAULT.backgroundColor,
          fontFamily: (data.fontFamily as FontFamily) ?? DEFAULT.fontFamily,
          navStyle: (data.navStyle as NavStyle) ?? DEFAULT.navStyle,
          compactMode: data.compactMode ?? DEFAULT.compactMode,
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const isAdmin = session?.user?.role === "ADMIN"

  function update<K extends keyof ThemeSettings>(key: K, value: ThemeSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMsg(null)

    const res = await fetch("/api/settings/appearance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    })

    setSaving(false)

    if (res.ok) {
      setMsg({ ok: true, text: "Appearance saved. Reload the page to see your changes." })
    } else {
      const data = await res.json()
      setMsg({ ok: false, text: data.error ?? "Failed to save." })
    }
  }

  async function handleRestore() {
    setShowResetConfirm(false)
    setSaving(true)
    setMsg(null)

    const res = await fetch("/api/settings/appearance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(DEFAULT),
    })

    setSaving(false)
    if (res.ok) {
      setSettings(DEFAULT)
      setMsg({ ok: true, text: "Defaults restored. Reload the page to see your changes." })
    } else {
      const data = await res.json()
      setMsg({ ok: false, text: data.error ?? "Failed to restore defaults." })
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Appearance</h1>

      <div className="flex gap-6 items-start">
        {/* Settings panel */}
        <div className="flex-1 min-w-0 space-y-5">
          <form id="appearance-form" onSubmit={handleSave} className="space-y-5">
            {/* Colours */}
            <div className="card p-5">
              <h2 className="text-base font-semibold text-gray-800 mb-4">Colours</h2>
              <div className="grid grid-cols-2 gap-4">
                <ColorField
                  label="Primary (navigation background)"
                  value={settings.primaryColor}
                  onChange={(v) => update("primaryColor", v)}
                  disabled={!isAdmin}
                />
                <ColorField
                  label="Accent (active items & buttons)"
                  value={settings.accentColor}
                  onChange={(v) => update("accentColor", v)}
                  disabled={!isAdmin}
                />
                <ColorField
                  label="Page background"
                  value={settings.backgroundColor}
                  onChange={(v) => update("backgroundColor", v)}
                  disabled={!isAdmin}
                />
              </div>
            </div>

            {/* Typography */}
            <div className="card p-5">
              <h2 className="text-base font-semibold text-gray-800 mb-4">Typography</h2>
              <label className="label mb-2">Font family</label>
              <div className="grid grid-cols-2 gap-2">
                {FONT_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer text-sm transition-colors ${
                      !isAdmin ? "opacity-60 cursor-not-allowed" : ""
                    } ${
                      settings.fontFamily === opt.value
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="fontFamily"
                      value={opt.value}
                      checked={settings.fontFamily === opt.value}
                      onChange={() => isAdmin && update("fontFamily", opt.value)}
                      disabled={!isAdmin}
                      className="sr-only"
                    />
                    <span style={{ fontFamily: FONT_STACKS[opt.value] }}>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Layout */}
            <div className="card p-5">
              <h2 className="text-base font-semibold text-gray-800 mb-4">Layout</h2>
              <div className="space-y-5">
                <div>
                  <label className="label mb-2">Navigation style</label>
                  <div className="flex gap-3">
                    {(["sidebar", "topbar"] as NavStyle[]).map((style) => (
                      <label
                        key={style}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md border cursor-pointer text-sm transition-colors ${
                          !isAdmin ? "opacity-60 cursor-not-allowed" : ""
                        } ${
                          settings.navStyle === style
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <input
                          type="radio"
                          name="navStyle"
                          value={style}
                          checked={settings.navStyle === style}
                          onChange={() => isAdmin && update("navStyle", style)}
                          disabled={!isAdmin}
                          className="sr-only"
                        />
                        {style === "sidebar" ? "Sidebar" : "Top bar"}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Compact mode</p>
                    <p className="text-xs text-gray-400 mt-0.5">Reduce spacing throughout the interface</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => isAdmin && update("compactMode", !settings.compactMode)}
                    disabled={!isAdmin}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none disabled:opacity-60 ${
                      settings.compactMode ? "bg-blue-600" : "bg-gray-200"
                    }`}
                    role="switch"
                    aria-checked={settings.compactMode}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        settings.compactMode ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          </form>

          {msg && (
            <p className={`text-sm ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.text}</p>
          )}

          {isAdmin ? (
            <div className="flex items-center gap-3">
              <button
                type="submit"
                form="appearance-form"
                disabled={saving}
                className="btn-primary"
              >
                {saving ? "Saving…" : "Save appearance"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setShowResetConfirm(true)}
                className="btn-secondary text-sm"
              >
                Restore defaults
              </button>
            </div>
          ) : (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Only administrators can change appearance settings.
            </p>
          )}

          {/* Restore defaults confirmation dialog */}
          {showResetConfirm && (
            <div
              className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
              onClick={() => setShowResetConfirm(false)}
            >
              <div
                className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-base font-semibold text-gray-900 mb-2">Restore defaults?</h3>
                <p className="text-sm text-gray-600 mb-1">This will reset all appearance settings to:</p>
                <ul className="text-sm text-gray-500 list-disc list-inside mb-4 space-y-0.5">
                  <li>Primary colour: <span className="font-mono">#1e3a5f</span> (dark navy)</li>
                  <li>Accent colour: <span className="font-mono">#2563eb</span> (blue)</li>
                  <li>Background: <span className="font-mono">#f9fafb</span> (light grey)</li>
                  <li>Font: Inter</li>
                  <li>Nav: Sidebar</li>
                  <li>Compact mode: off</li>
                </ul>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setShowResetConfirm(false)}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button onClick={handleRestore} className="btn-primary">
                    Restore defaults
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Live preview */}
        <div className="w-72 shrink-0">
          <LivePreview s={settings} />
        </div>
      </div>
    </div>
  )
}
