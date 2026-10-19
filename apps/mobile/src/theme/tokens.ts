/** Tokens alinhados ao ERP web (claro / escuro). */

export const light = {
  surface: '#eef1f4',
  card: '#ffffff',
  card2: '#f1f5f9',
  ink: '#12151a',
  mute: '#6b7280',
  line: '#d8dde3',
  accent: '#0e7490',
  accentRgb: '14, 116, 144',
  side: '#101820',
  danger: '#d70015',
  success: '#0f766e',
  warning: '#ca8a04',
} as const;

export const dark = {
  surface: '#0f141a',
  card: '#171e27',
  card2: '#1c2430',
  ink: '#e8eef4',
  mute: '#94a3b8',
  line: 'rgba(148, 163, 184, 0.22)',
  accent: '#2dd4bf',
  accentRgb: '45, 212, 191',
  side: '#0b1016',
  danger: '#f87171',
  success: '#2dd4bf',
  warning: '#fbbf24',
} as const;

export type ThemeColors = {
  surface: string;
  card: string;
  card2: string;
  ink: string;
  mute: string;
  line: string;
  accent: string;
  accentRgb: string;
  side: string;
  danger: string;
  success: string;
  warning: string;
};

export function pickTheme(scheme: 'light' | 'dark' | null | undefined): ThemeColors {
  return scheme === 'dark' ? dark : light;
}
