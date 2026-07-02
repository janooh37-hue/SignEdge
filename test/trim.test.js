import { describe, expect, it } from 'vitest';
import { trimBounds } from '../src/trim.js';

// build a WxH RGBA buffer, mark listed [x,y] pixels opaque
function make(width, height, pixels) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y] of pixels) {
    const i = (y * width + x) * 4;
    data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
  }
  return { data, width, height };
}

describe('trimBounds', () => {
  it('returns zero box for fully transparent input', () => {
    expect(trimBounds(make(4, 4, []))).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });

  it('finds a single opaque pixel', () => {
    expect(trimBounds(make(4, 4, [[2, 1]]))).toEqual({ x: 2, y: 1, w: 1, h: 1 });
  });

  it('finds the bounding box of scattered pixels', () => {
    const box = trimBounds(make(10, 10, [[1, 2], [7, 2], [3, 8]]));
    expect(box).toEqual({ x: 1, y: 2, w: 7, h: 7 }); // x:1..7 -> w7, y:2..8 -> h7
  });
});
