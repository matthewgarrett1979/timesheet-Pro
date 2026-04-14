import { db } from "./db"

export type FontFamily = "inter" | "system" | "georgia" | "mono"
export type NavStyle = "sidebar" | "topbar"

export interface AppTheme {
  primaryColor: string
  accentColor: string
  backgroundColor: string
  fontFamily: FontFamily
  navStyle: NavStyle
  compactMode: boolean
}

export const DEFAULT_THEME: AppTheme = {
  primaryColor: "#1e293b",
  accentColor: "#2563eb",
  backgroundColor: "#f9fafb",
  fontFamily: "inter",
  navStyle: "sidebar",
  compactMode: false,
}

export const FONT_STACKS: Record<FontFamily, string> = {
  inter: "'Inter', ui-sans-serif, system-ui, sans-serif",
  system: "ui-sans-serif, system-ui, -apple-system, sans-serif",
  georgia: "Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, 'Cascadia Code', 'Source Code Pro', monospace",
}

export async function getAppTheme(): Promise<AppTheme> {
  try {
    const s = await db.appSettings.findUnique({ where: { id: "global" } })
    if (!s) return DEFAULT_THEME
    return {
      primaryColor: s.primaryColor,
      accentColor: s.accentColor,
      backgroundColor: s.backgroundColor,
      fontFamily: (s.fontFamily as FontFamily) ?? "inter",
      navStyle: (s.navStyle as NavStyle) ?? "sidebar",
      compactMode: s.compactMode,
    }
  } catch {
    return DEFAULT_THEME
  }
}
