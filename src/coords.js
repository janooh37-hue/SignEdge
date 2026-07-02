// Pure geometry helpers for stamping. The rotation-aware display->PDF point
// transform itself is done by pdf.js viewport.convertToPdfPoint in viewer.js;
// these helpers cover the pure arithmetic around it.

export function fractionsToViewportRect(p, vpWidth, vpHeight) {
  return {
    x: p.xFrac * vpWidth,
    y: p.yFrac * vpHeight,
    w: p.wFrac * vpWidth,
    h: p.hFrac * vpHeight,
  };
}

export function pdfRectFromCorners(topLeft, bottomRight) {
  const x = Math.min(topLeft[0], bottomRight[0]);
  const y = Math.min(topLeft[1], bottomRight[1]);
  const width = Math.abs(bottomRight[0] - topLeft[0]);
  const height = Math.abs(bottomRight[1] - topLeft[1]);
  return { x, y, width, height };
}

export function preRotateDegreesCW(pageRotation) {
  return (360 - (((pageRotation % 360) + 360) % 360)) % 360;
}
