/**
 * Semantic color tokens for Marthi panel UI.
 * These point at CSS variables already defined in:
 * - `styles/global.css` (:root)
 * - `pages/admin/admin.css` (.admin / .admin.admin--dark)
 * - module CSS (caixa, erp, os, …) which may override --accent
 *
 * Do NOT invent a parallel palette. Prefer `var(--token)` in CSS;
 * use this map only when a TS value must reference the same contract.
 */

export const colorTokens = {
  /** Page background */
  surface: 'var(--surface)',
  /** Card / panel surface */
  card: 'var(--card)',
  /** Nested / secondary surface */
  card2: 'var(--card-2)',
  /** Primary text */
  ink: 'var(--ink)',
  /** Secondary / muted text */
  mute: 'var(--mute)',
  /** Borders and dividers */
  line: 'var(--line)',
  /** Primary accent (module may override; admin default teal) */
  accent: 'var(--accent)',
  /** Accent as R,G,B for rgba()/color-mix */
  accentRgb: 'var(--accent-rgb)',
  /** Danger (admin) */
  red: 'var(--red, #d70015)',
  /** Admin teal aliases */
  teal: 'var(--teal, #0f766e)',
  tealSoft: 'var(--teal-soft, rgba(45, 212, 191, 0.16))',
  /** Sidebar (admin shell) */
  sidebar: 'var(--sidebar, #12181f)',
} as const;

export type ColorTokenName = keyof typeof colorTokens;

/** Dark-theme class selectors used across the app (preserve both). */
export const themeDarkSelectors = ['.is-theme-dark', '.admin--dark', '.admin.admin--dark'] as const;

/**
 * Per-module accent overrides (documented for authors — live values stay in module CSS).
 * Quality bar for interactive density: Caixa (`pages/caixa/caixa.css`).
 */
export const moduleAccentDefaults = {
  admin: { accent: '#0f766e', accentRgb: '15, 118, 110' },
  caixa: { accent: '#1d4ed8', accentRgb: '29, 78, 216' },
  erp: { accent: '#0e7490', accentRgb: '14, 116, 144' },
  crm: { accent: '#0369a1', accentRgb: '3, 105, 161' },
  fiscal: { accent: '#7c3aed', accentRgb: '124, 58, 237' },
  ecommerce: { accent: '#db2777', accentRgb: '219, 39, 119' },
  mesa: { accent: '#b45309', accentRgb: '180, 83, 9' },
} as const;
