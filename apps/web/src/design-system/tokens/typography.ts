/**
 * Font tokens from `styles/global.css` :root.
 * Prefer CSS `var(--font-sans)` / `var(--font-display)` in stylesheets.
 */

export const fontTokens = {
  sans: 'var(--font-sans)',
  display: 'var(--font-display)',
} as const;

/** Common type sizes already used in admin forms / tables */
export const fontSize = {
  caption: '0.68rem',
  hint: '0.76rem',
  small: '0.82rem',
  body: '0.84rem',
  control: '0.95rem',
} as const;
