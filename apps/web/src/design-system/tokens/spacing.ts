/**
 * Spacing scale used across admin/ERP toolbars, forms, and cards.
 * Values mirror common gaps already in admin.css / component CSS — not a new system.
 */

export const space = {
  /** 4px — tight icon gaps */
  xs: 4,
  /** 8px — default inner gap */
  sm: 8,
  /** 10px — toolbar / filter wrap gap */
  md: 10,
  /** 12px — field padding / card padding step */
  lg: 12,
  /** 14px — section padding */
  xl: 14,
  /** 22px — button horizontal padding */
  '2xl': 22,
} as const;

export type SpaceToken = keyof typeof space;

/** Layout chrome sizes from admin shell */
export const layout = {
  sidebarWidth: 'var(--sidebar-w, 268px)',
  sidebarCollapsedWidth: 'var(--sidebar-collapsed-w, 76px)',
  adminTopHeight: 'var(--admin-top-h, 64px)',
} as const;

/** Mobile breakpoints used in skill + CSS */
export const breakpoints = {
  phone: 480,
  tablet: 640,
  stack: 768,
  desktop: 960,
} as const;
