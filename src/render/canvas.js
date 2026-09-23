/**
 * DPR-aware Canvas setup and responsive viewport management.
 *
 * Ensures sharp rendering on Retina and high-DPI displays by scaling
 * internal canvas buffer to match physical pixels, while maintaining
 * CSS logical pixel coordinate space for game drawing.
 */

export function setupCanvas(canvasElement, onResize = null) {
  const ctx = canvasElement.getContext('2d');
  let logicalWidth = 0;
  let logicalHeight = 0;
  let dpr = 1;

  function resize() {
    dpr = window.devicePixelRatio || 1;

    logicalWidth = window.innerWidth || document.documentElement.clientWidth || 1200;
    logicalHeight = window.innerHeight || document.documentElement.clientHeight || 800;

    canvasElement.style.width = `${logicalWidth}px`;
    canvasElement.style.height = `${logicalHeight}px`;

    canvasElement.width = Math.round(logicalWidth * dpr);
    canvasElement.height = Math.round(logicalHeight * dpr);

    // Reset transform matrix and scale context by DPR
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    if (onResize) {
      onResize({
        width: logicalWidth,
        height: logicalHeight,
        dpr,
      });
    }
  }

  // Initial resize
  resize();

  window.addEventListener('resize', resize);

  return {
    canvas: canvasElement,
    ctx,
    resize,
    getDimensions() {
      return {
        width: logicalWidth,
        height: logicalHeight,
        dpr,
      };
    },
    cleanup() {
      window.removeEventListener('resize', resize);
    },
  };
}
