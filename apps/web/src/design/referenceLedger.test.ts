import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {DESIGN_REFERENCES} from './referenceLedger.js';

const styles = readFileSync(new URL('../features/discovery/featureUniverse.css', import.meta.url), 'utf8');

describe('full 25-reference design application', () => {
  it('lists all 25 user-provided references exactly once', () => {
    const supplied = [
      'modulify.ai/templates', 'modulify.ai', 'landdding.com', 'motionin.design',
      'wonderlist.design', 'iconly.design', 'logotouse.com', 'fontinlogo.com',
      'wedoflow.com', 'land-book.com', 'refero.design', 'theinternetdesigns.com',
      '60fps.design', 'footer.design', 'cta.gallery', 'supahero.io', '3dicons.co',
      'grainient.supply', 'inspora.design', 'motionsites.ai', 'recent.design',
      'godly.website', 'scrolltide.co', 'scrollshaders.com', 'styles.refero.design',
    ];
    expect(DESIGN_REFERENCES.map(item => item.site)).toEqual(supplied);
    expect(new Set(supplied).size).toBe(25);
  });

  it('each entry points to an actual implemented CSS pattern, not a reference-only note', () => {
    for (const item of DESIGN_REFERENCES) {
      expect(item.appliedPattern.trim().length, item.site).toBeGreaterThan(12);
      expect(styles.includes(item.cssEvidence), item.site + ': ' + item.cssEvidence).toBe(true);
    }
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(styles).not.toContain('scroll-behavior: smooth !important');
  });
});
