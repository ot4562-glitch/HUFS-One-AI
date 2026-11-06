import {describe, it, expect} from 'vitest';
import {COLOR_ROLES, HUFS_COLORS, contrastRatio, cssVariables, TOUCH_TARGET_PX} from './tokens.js';

describe('A11.2 tokens', () => {
  it('keeps the official HUFS colours exactly', () => {
    expect(HUFS_COLORS).toEqual({green: '#146E7A', gray: '#DADAD3', navy: '#002D56', gold: '#8D7150', silver: '#9D9FA2'});
  });

  it('computes WCAG contrast correctly at the extremes', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(() => contrastRatio('teal', '#FFFFFF')).toThrow(RangeError);
  });

  it.each([
    ['text on pageBg', COLOR_ROLES.text, COLOR_ROLES.pageBg],
    ['text on surface', COLOR_ROLES.text, COLOR_ROLES.surface],
    ['textMuted on surface', COLOR_ROLES.textMuted, COLOR_ROLES.surface],
    ['textMuted on pageBg', COLOR_ROLES.textMuted, COLOR_ROLES.pageBg],
    ['text on chipBg', COLOR_ROLES.text, COLOR_ROLES.chipBg],
    ['heading on surface', COLOR_ROLES.heading, COLOR_ROLES.surface],
    ['onPrimary on primary button', COLOR_ROLES.onPrimary, COLOR_ROLES.primary],
    ['primary on surface', COLOR_ROLES.primary, COLOR_ROLES.surface],
    ['link on surface', COLOR_ROLES.link, COLOR_ROLES.surface],
    ['link on pageBg', COLOR_ROLES.link, COLOR_ROLES.pageBg],
    ['success on surface', COLOR_ROLES.success, COLOR_ROLES.surface],
  ])('%s meets 4.5:1 body-text contrast', (_name, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('focus ring is visible (≥3:1 non-text contrast) on both backgrounds', () => {
    expect(contrastRatio(COLOR_ROLES.focusRing, COLOR_ROLES.pageBg)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(COLOR_ROLES.focusRing, COLOR_ROLES.surface)).toBeGreaterThanOrEqual(3);
  });

  it('gray border is decorative only: too light for text or as the sole state cue', () => {
    expect(contrastRatio(COLOR_ROLES.border, COLOR_ROLES.surface)).toBeLessThan(3);
  });

  it('exports CSS variables for the future Vite entry', () => {
    const css = cssVariables();
    expect(css).toContain('--color-primary: #002D56;');
    expect(css).toContain('--color-text-muted: #3E4C59;');
    expect(css).toContain(`--touch-target: ${TOUCH_TARGET_PX}px;`);
  });
});
