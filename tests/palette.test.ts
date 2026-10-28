import { describe, expect, it } from 'vitest';
import { nearestPalette, PALETTE_HEX } from '../src/core/palette';

describe('palette', () => {
  it('contains exactly 64 unique colours', () => {
    expect(PALETTE_HEX).toHaveLength(64);
    expect(new Set(PALETTE_HEX).size).toBe(64);
  });

  it('matches palette colours through OKLab and keeps them exact', () => {
    for (const hex of PALETTE_HEX) {
      const v = parseInt(hex.slice(1), 16);
      const c = nearestPalette(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);
      const back = `#${Math.round(c.r * 255).toString(16).padStart(2, '0')}${Math.round(c.g * 255)
        .toString(16)
        .padStart(2, '0')}${Math.round(c.b * 255).toString(16).padStart(2, '0')}`;
      expect(back).toBe(hex);
    }
  });
});
