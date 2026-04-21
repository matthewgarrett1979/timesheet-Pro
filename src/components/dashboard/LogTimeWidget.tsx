"use client"

import { useMemo, useState } from "react"

/**
 * LogTimeWidget — engagement-style time-logging card.
 * Project chips, quick time presets (0.25 / 0.5 / 1 / 2 / 4 / 8h), day selector,
 * description input, and a confirm button with success-flash animation.
 *
 * Calls `onSubmit(entry)` when the user confirms; parent handles persistence
 * (server action, API POST, etc).
 */

export type LogTimeProject = {
  id: string
  name: string
  client?: string
}

export type LogTimeEntry = {
  projectId: string
  hours: number
  date: string           // ISO yyyy-mm-dd
  description: string
}

const PRESETS = [0.25, 0.5, 1, 2, 4, 8]

function isoDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function labelFor(iso: string): string {
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
}

export function LogTimeWidget({
  projects,
  onSubmit,
  defaultProjectId,
}: {
  projects: LogTimeProject[]
  onSubmit: (entry: LogTimeEntry) => Promise<void> | void
  defaultProjectId?: string
}) {
  const [projectId, setProjectId] = useState<string>(defaultProjectId ?? projects[0]?.id ?? "")
  const [hours, setHours] = useState<number>(1)
  const [customHours, setCustomHours] = useState<string>("")
  const [date, setDate] = useState<string>(isoDaysAgo(0))
  const [desc, setDesc] = useState<string>("")
  const [submitting, setSubmitting] = useState(false)
  const [justAdded, setJustAdded] = useState(false)

  const dateChoices = useMemo(
    () => [
      { iso: isoDaysAgo(0), label: "Today" },
      { iso: isoDaysAgo(1), label: "Yesterday" },
      { iso: isoDaysAgo(2), label: labelFor(isoDaysAgo(2)) },
      { iso: isoDaysAgo(3), label: labelFor(isoDaysAgo(3)) },
    ],
    []
  )

  const effectiveHours = customHours ? Number(customHours) || 0 : hours
  const selectedProject = projects.find((p) => p.id === projectId)

  async function handleSubmit() {
    if (!selectedProject || !effectiveHours) return
    setSubmitting(true)
    try {
      await onSubmit({
        projectId: selectedProject.id,
        hours: effectiveHours,
        date,
        description: desc.trim(),
      })
      setJustAdded(true)
      setDesc("")
      setCustomHours("")
      setTimeout(() => setJustAdded(false), 1600)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="card p-5 lt-widget">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="ds-kicker">QUICK · LOG</div>
          <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 2 }}>
            Book time
          </h2>
        </div>
        <div className="ds-dim font-mono" style={{ fontSize: 11, letterSpacing: "0.08em" }}>
          {new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>

      {/* Preset hours + custom */}
      <div className="mb-4">
        <div className="label">Hours</div>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => {
            const active = !customHours && hours === p
            return (
              <button
                key={p}
                type="button"
                onClick={() => { setHours(p); setCustomHours("") }}
                className="lt-chip tabular-nums"
                data-active={active}
              >
                {p}h
              </button>
            )
          })}
          <input
            type="number"
            step="0.25"
            min="0"
            placeholder="—.—"
            value={customHours}
            onChange={(e) => setCustomHours(e.target.value)}
            className="lt-custom tabular-nums"
          />
        </div>
      </div>

      {/* Date */}
      <div className="mb-4">
        <div className="label">Date</div>
        <div className="flex flex-wrap gap-1.5">
          {dateChoices.map((d) => (
            <button
              key={d.iso}
              type="button"
              onClick={() => setDate(d.iso)}
              className="lt-chip"
              data-active={date === d.iso}
            >
              {d.label}
            </button>
          ))}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="lt-date"
          />
        </div>
      </div>

      {/* Project */}
      <div className="mb-4">
        <div className="label">Project</div>
        <div className="flex flex-wrap gap-1.5">
          {projects.slice(0, 8).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setProjectId(p.id)}
              className="lt-project"
              data-active={projectId === p.id}
            >
              <span className="lt-project-name">{p.name}</span>
              {p.client && <span className="lt-project-client">{p.client}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Description */}
      <input
        type="text"
        placeholder="What were you working on?"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        className="input mb-4"
      />

      {/* Footer */}
      <div className="flex items-center justify-between gap-4 pt-3" style={{ borderTop: "1px solid var(--hairline-soft)" }}>
        <div className="flex items-baseline gap-2" style={{ fontSize: 12 }}>
          <span className="ds-kicker">ADDING</span>
          <span className="ds-num tabular-nums" style={{ fontSize: 18, fontWeight: 600 }}>
            {effectiveHours ? effectiveHours.toFixed(2) : "—"}h
          </span>
          {selectedProject && (
            <>
              <span className="ds-dim">·</span>
              <span className="ds-soft" style={{ fontSize: 12 }}>{selectedProject.client ?? selectedProject.name}</span>
            </>
          )}
        </div>
        <button
          type="button"
          disabled={!effectiveHours || !selectedProject || submitting}
          onClick={handleSubmit}
          className={`btn btn-primary btn-sm ${justAdded ? "is-success" : ""}`}
          style={justAdded ? { backgroundColor: "var(--ok)" } : undefined}
        >
          {justAdded ? "✓ Added" : submitting ? "…" : "Add entry"}
        </button>
      </div>

      <style>{`
        .lt-chip {
          padding: 5px 11px; border-radius: 5px; border: 1px solid var(--hairline);
          background: var(--surface); color: var(--ink-soft);
          font-family: var(--font-body); font-size: 12px; font-weight: 500;
          cursor: pointer; transition: all 120ms;
        }
        .lt-chip:hover { border-color: var(--ink-dim); color: var(--ink); }
        .lt-chip[data-active="true"] { background: var(--color-accent); color: white; border-color: var(--color-accent); }
        .lt-custom {
          width: 64px; padding: 5px 8px; border-radius: 5px;
          border: 1px solid var(--hairline); background: var(--surface);
          font-family: var(--font-mono); font-size: 12px; font-weight: 500; color: var(--ink);
        }
        .lt-custom:focus { outline: none; border-color: var(--color-accent); }
        .lt-date {
          padding: 5px 8px; border-radius: 5px;
          border: 1px solid var(--hairline); background: var(--surface);
          font-family: var(--font-mono); font-size: 11px; color: var(--ink);
        }
        .lt-project {
          padding: 6px 12px; border-radius: 5px; border: 1px solid var(--hairline);
          background: var(--surface); text-align: left; cursor: pointer; transition: all 120ms;
          display: flex; flex-direction: column; min-width: 140px;
        }
        .lt-project:hover { border-color: var(--ink-dim); }
        .lt-project[data-active="true"] {
          border-color: var(--color-accent);
          background: color-mix(in srgb, var(--color-accent) 6%, var(--surface));
        }
        .lt-project-name { font-size: 12px; font-weight: 500; color: var(--ink); line-height: 1.2; }
        .lt-project-client { font-family: var(--font-mono); font-size: 10px; color: var(--ink-dim); margin-top: 2px; letter-spacing: 0.04em; }
        .lt-widget .is-success { animation: ltPulse 600ms ease; }
        @keyframes ltPulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.04); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
