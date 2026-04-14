"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"

interface NotificationSettings {
  weeklyRemindersEnabled: boolean
  minHoursPerWeek: number
  reminderDay: number
  reminderTime: string
}

const DAY_OPTIONS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" },
]

export default function NotificationsSettingsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [settings, setSettings] = useState<NotificationSettings>({
    weeklyRemindersEnabled: false,
    minHoursPerWeek: 35,
    reminderDay: 5,
    reminderTime: "17:00",
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "ADMIN") {
      router.replace("/dashboard")
    }
  }, [status, session, router])

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role === "ADMIN") {
      fetch("/api/settings/notifications")
        .then((r) => r.json())
        .then((data) => {
          if (data && typeof data === "object" && !data.error) {
            setSettings({
              weeklyRemindersEnabled:
                data.weeklyRemindersEnabled ?? data.notificationsEnabled ?? false,
              minHoursPerWeek:
                data.minHoursPerWeek ?? data.reminderThreshold ?? 35,
              reminderDay:
                data.reminderDay ?? data.reminderDayOfWeek ?? 5,
              reminderTime: data.reminderTime ?? "17:00",
            })
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false))
    }
  }, [status, session])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch("/api/settings/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })
      if (!res.ok) {
        const d = await res.json()
        setMessage({ ok: false, text: d.error ?? "Failed to save settings." })
      } else {
        setMessage({ ok: true, text: "Notification settings saved successfully." })
        setTimeout(() => setMessage(null), 4000)
      }
    } catch {
      setMessage({ ok: false, text: "Network error." })
    }
    setSaving(false)
  }

  if (status === "loading" || loading) {
    return <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
  }

  if (session?.user?.role !== "ADMIN") {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 rounded p-4">
          <p className="text-sm text-amber-800">Admin access required.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
        <p className="text-sm text-gray-500 mt-1">Configure automated reminders for your team.</p>
      </div>

      <div className="card p-6">
        <form onSubmit={handleSave} className="space-y-6">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Enable weekly reminders</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Send a reminder email to users who have not met their minimum hours.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={settings.weeklyRemindersEnabled}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, weeklyRemindersEnabled: e.target.checked }))
                }
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
            </label>
          </div>

          <div
            className={
              !settings.weeklyRemindersEnabled
                ? "opacity-50 pointer-events-none space-y-4"
                : "space-y-4"
            }
          >
            {/* Min hours */}
            <div>
              <label className="label" htmlFor="min-hours">
                Minimum hours per week
              </label>
              <input
                id="min-hours"
                type="number"
                className="input w-32"
                min={1}
                max={168}
                value={settings.minHoursPerWeek}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, minHoursPerWeek: Number(e.target.value) }))
                }
              />
              <p className="text-xs text-gray-400 mt-1">
                Users below this threshold will receive a reminder. (1–168)
              </p>
            </div>

            {/* Reminder day */}
            <div>
              <label className="label" htmlFor="reminder-day">
                Reminder day
              </label>
              <select
                id="reminder-day"
                className="input"
                value={settings.reminderDay}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, reminderDay: Number(e.target.value) }))
                }
              >
                {DAY_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">Day of the week on which the reminder is sent.</p>
            </div>

            {/* Reminder time */}
            <div>
              <label className="label" htmlFor="reminder-time">
                Reminder time (UTC)
              </label>
              <input
                id="reminder-time"
                type="time"
                className="input w-36"
                value={settings.reminderTime}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, reminderTime: e.target.value }))
                }
              />
              <p className="text-xs text-gray-400 mt-1">
                Time in 24-hour UTC format (e.g. 17:00). Default: Friday at 17:00 UTC.
              </p>
            </div>
          </div>

          {message && (
            <div
              className={`rounded px-3 py-2 text-sm ${
                message.ok
                  ? "bg-green-50 border border-green-200 text-green-700"
                  : "bg-red-50 border border-red-200 text-red-700"
              }`}
            >
              {message.text}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
        </form>
      </div>

      <div className="card p-4 bg-gray-50">
        <p className="text-xs text-gray-600">
          <strong>How it works:</strong> A cron job checks on the selected day and time.
          If a user&apos;s total logged hours for the current week is below the threshold,
          a reminder email is sent. Requires{" "}
          <code className="bg-gray-200 px-1 rounded">RESEND_API_KEY</code> and{" "}
          <code className="bg-gray-200 px-1 rounded">CRON_SECRET</code> environment variables.
        </p>
      </div>
    </div>
  )
}
