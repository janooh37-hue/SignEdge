import { describe, expect, it } from 'vitest';
import { fractionsToViewportRect, pdfRectFromCorners, preRotateDegreesCW } from '../src/coords.js';

describe('fractionsToViewportRect', () => {
  it('scales fractions to viewport pixels', () => {
    const r = fractionsToViewportRect({ xFrac: 0.1, yFrac: 0.2, wFrac: 0.5, hFrac: 0.25 }, 800, 1000);
    expect(r).toEqual({ x: 80, y: 200, w: 400, h: 250 });
  });
});

describe('pdfRectFromCorners', () => {
  it('builds a rect from top-left and bottom-right points', () => {
    expect(pdfRectFromCorners([100, 700], [300, 500]))
      .toEqual({ x: 100, y: 500, width: 200, height: 200 });
  });
  it('is order-independent (uses min corner)', () => {
    expect(pdfRectFromCorners([300, 500], [100, 700]))
      .toEqual({ x: 100, y: 500, width: 200, height: 200 });
  });
});

describe('preRotateDegreesCW', () => {
  it('maps page rotation to the upright pre-rotation', () => {
    expect(preRotateDegreesCW(0)).toBe(0);
    expect(preRotateDegreesCW(90)).toBe(270);
    expect(preRotateDegreesCW(180)).toBe(180);
    expect(preRotateDegreesCW(270)).toBe(90);
    expect(preRotateDegreesCW(360)).toBe(0);
  });
});
