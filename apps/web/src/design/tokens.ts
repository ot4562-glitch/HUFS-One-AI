/**
 * Architecture A11.2 design tokens. Official HUFS colours are kept apart from product-chosen tokens.
 * Lives in apps/web until packages/ui is part of the root typecheck/test/CI scope (#63); then move as-is.
 */
export const HUFS_COLORS = {
  green: '#146E7A',
  gray: '#DADAD3',
  navy: '#002D56',
  gold: '#8D7150',
  silver: '#9D9FA2',
} as const;

export const PRODUCT_COLORS = {
  bg: '#F5F7FA',
  surface: '#FFFFFF',
  ink: '#1F2933',
  muted: '#3E4C59',
  chip: '#EAF3FC',
  /** v5 (#9): product navy / academic blue, close to but not the official HUFS colours. */
  navy: '#082F52',
  blue: '#28699F',
  border: '#DDE3EA',
  decoration: '#5B7FA3',
} as const;

/** Semantic roles used by components. Primary action = academic blue, headings = product navy. */
export const COLOR_ROLES = {
  pageBg: PRODUCT_COLORS.bg,
  surface: PRODUCT_COLORS.surface,
  text: PRODUCT_COLORS.ink,
  textMuted: PRODUCT_COLORS.muted,
  heading: PRODUCT_COLORS.navy,
  primary: PRODUCT_COLORS.blue,
  onPrimary: PRODUCT_COLORS.surface,
  chipBg: PRODUCT_COLORS.chip,
  border: PRODUCT_COLORS.border,
  decoration: PRODUCT_COLORS.decoration,
  focusRing: PRODUCT_COLORS.navy,
} as const;

export const SPACING_PX = [4, 8, 12, 16, 24, 32] as const;
export const RADIUS_PX = {card: 16, control: 14} as const;
export const TOUCH_TARGET_PX = 48;

export const TYPE_SCALE = {
  body: {size: 16, line: 24},
  small: {size: 14, line: 20},
  title: {size: 24, line: 32},
  titleLarge: {size: 28, line: 36},
  heroDesktop: {size: 32, line: 40},
  heroMobile: {size: 26, line: 34},
} as const;

/** Viewports A11.1/A11.2 require us to test; layout gutters per A11.1. */
export const VIEWPORTS = {mobileSmall: 360, mobile: 390, tablet: 768, desktop: 1440} as const;
export const LAYOUT = {desktopMaxWidth: 1392, desktopGutter: 24, mobileGutter: 16} as const;

function channel(hex: string, offset: number): number {
  const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) throw new RangeError(`Not a #RRGGBB colour: ${hex}`);
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

/** WCAG 2.x contrast ratio (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** CSS custom properties for the future Vite entry (:root { ... }). */
export function cssVariables(): string {
  const lines = Object.entries(COLOR_ROLES).map(([k, v]) => `--color-${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}: ${v};`);
  SPACING_PX.forEach((v, i) => lines.push(`--space-${i + 1}: ${v}px;`));
  lines.push(`--radius-card: ${RADIUS_PX.card}px;`, `--radius-control: ${RADIUS_PX.control}px;`, `--touch-target: ${TOUCH_TARGET_PX}px;`);
  return lines.join('\n');
}
