import type { Config } from "tailwindcss"

/**
 * Tailwind is kept lean — most design tokens live in globals.css as CSS
 * variables (so they can be overridden per-request from AppSettings). We
 * extend here so Tailwind utility classes can reach the same palette.
 */
export default {
  content: [
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // CSS-variable-backed — live theme still works
        accent: "var(--color-accent)",
        navbg:  "var(--color-nav-bg)",
        paper:  "var(--color-page-bg)",
        // Static design tokens
        ink:        "#1A1F2E",
        "ink-soft": "#4A5568",
        "ink-dim":  "#8492A6",
        warm:       "#C87533",
        ok:         "#4A7C59",
        danger:     "#B04E3B",
        "paper-2":  "#EFEAE0",
        hairline:        "#D4CFC3",
        "hairline-soft": "#E4DFD2",
      },
      fontFamily: {
        body:    ["var(--font-body)"],
        display: ['"Space Grotesk"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono:    ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      letterSpacing: {
        kicker: "0.12em",
        tight2: "-0.02em",
      },
      borderRadius: {
        DEFAULT: "6px",
        card: "8px",
      },
    },
  },
  plugins: [],
} satisfies Config
