/**
 * Canvas rendering routines for Dogfight.
 *
 * Implements:
 * - Proper state interpolation (lerp) with shortest-arc angle unwrapping.
 * - Coordinate interpolation across arena wrap-around boundaries.
 * - High-contrast geometric ship rendering with animated thrust plume.
 * - Starfield & coordinate grid for clear perception of speed and inertia.
 * - In-game HUD overlay displaying simulation steps/s, render frames/s, and frame time.
 */

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Interpolates angles taking the shortest circular arc.
 * Prevents the classic bug where crossing -PI <-> PI causes a full 360-degree spin.
 */
export function lerpAngle(from, to, t) {
  const twoPi = Math.PI * 2;
  const diff = (to - from) % twoPi;
  const shortest = ((diff + Math.PI * 3) % twoPi) - Math.PI;
  return from + shortest * t;
}

/**
 * Interpolates coordinate with wrap-around boundary awareness.
 */
export function lerpCoordinate(from, to, t, boundary) {
  if (boundary <= 0) return lerp(from, to, t);

  const half = boundary / 2;
  let delta = to - from;

  if (delta > half) {
    delta -= boundary;
  } else if (delta < -half) {
    delta += boundary;
  }

  const result = from + delta * t;
  return ((result % boundary) + boundary) % boundary;
}

/**
 * High-quality 32-bit PRNG (Mulberry32) ensuring uniform 0..1 distribution
 * across the entire screen width and height.
 */
function createPrng(seed = 42) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = createPrng(1337);

const STAR_PALETTE = [
  '#ffffff', // Pure Diamond White
  '#93c5fd', // Soft Blue
  '#67e8f9', // Bright Cyan
  '#fde047', // Warm Amber Gold
  '#d8b4fe', // Lilac Nebula
  '#f472b6', // Cosmic Rose
];

/**
 * Procedural starfield with varied types:
 * - Tiny distant pinpricks
 * - Medium glowing spectral orbs
 * - Bright stars with 4-point optical diffraction spikes
 */
const STARS = Array.from({ length: 220 }, () => {
  const rx = rng(); // Guaranteed uniform [0, 1) across X
  const ry = rng(); // Guaranteed uniform [0, 1) across Y

  const typeRoll = rng();
  let type = 'small';
  let size = 0.8 + rng() * 1.0;

  if (typeRoll > 0.9) {
    type = 'cross'; // 10% bright stars with 4-point diffraction flare
    size = 2.4 + rng() * 1.2;
  } else if (typeRoll > 0.72) {
    type = 'medium'; // ~18% medium glowing stars
    size = 1.6 + rng() * 0.9;
  }

  const color = STAR_PALETTE[Math.floor(rng() * STAR_PALETTE.length)];
  const baseAlpha = 0.4 + rng() * 0.55;
  const twinkleSpeed = 1.2 + rng() * 3.0;
  const twinklePhase = rng() * Math.PI * 2;

  return {
    rx,
    ry,
    type,
    size,
    color,
    baseAlpha,
    twinkleSpeed,
    twinklePhase,
  };
});

/**
 * Draws deep space background with soft nebulae, subtle coordinate grid, and sparkling stars.
 */
export function drawBackground(ctx, width, height, timeMs = 0) {
  ctx.save();

  const timeSec = (timeMs || performance.now()) / 1000;

  // 1. Deep space base
  ctx.fillStyle = '#070a13';
  ctx.fillRect(0, 0, width, height);

  // 2. Cosmic nebulae / space dust clouds for depth and atmosphere
  const nebulae = [
    {
      x: width * 0.22,
      y: height * 0.28,
      r: Math.max(width, height) * 0.35,
      col: 'rgba(99, 102, 241, 0.055)',
    },
    {
      x: width * 0.78,
      y: height * 0.72,
      r: Math.max(width, height) * 0.38,
      col: 'rgba(14, 165, 233, 0.045)',
    },
    {
      x: width * 0.52,
      y: height * 0.85,
      r: Math.max(width, height) * 0.3,
      col: 'rgba(168, 85, 247, 0.04)',
    },
  ];

  for (const neb of nebulae) {
    const grad = ctx.createRadialGradient(neb.x, neb.y, 0, neb.x, neb.y, neb.r);
    grad.addColorStop(0, neb.col);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  // 3. Subtle coordinate grid
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.05)';
  ctx.lineWidth = 1;
  const gridSize = 80;

  ctx.beginPath();
  for (let x = 0; x <= width; x += gridSize) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = 0; y <= height; y += gridSize) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();

  // 4. Arena boundary border
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);

  // 5. Varied, sparkling stars
  for (const star of STARS) {
    const sx = star.rx * width;
    const sy = star.ry * height;

    // Organic twinkle oscillation
    const twinkle = 0.7 + 0.3 * Math.sin(timeSec * star.twinkleSpeed + star.twinklePhase);
    const alpha = Math.min(1, Math.max(0.1, star.baseAlpha * twinkle));

    ctx.save();
    ctx.globalAlpha = alpha;

    if (star.type === 'cross') {
      // Hero star: Core + soft halo + 4-point optical diffraction cross
      const spikeLen = star.size * 3.8;

      // Glow halo
      ctx.beginPath();
      ctx.arc(sx, sy, star.size * 1.8, 0, Math.PI * 2);
      ctx.fillStyle = star.color;
      ctx.globalAlpha = alpha * 0.25;
      ctx.fill();

      // Optical cross diffraction spikes
      ctx.globalAlpha = alpha * 0.85;
      ctx.strokeStyle = star.color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(sx - spikeLen, sy);
      ctx.lineTo(sx + spikeLen, sy);
      ctx.moveTo(sx, sy - spikeLen);
      ctx.lineTo(sx, sy + spikeLen);
      ctx.stroke();

      // Bright center core
      ctx.globalAlpha = 1.0;
      ctx.beginPath();
      ctx.arc(sx, sy, star.size * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    } else if (star.type === 'medium') {
      // Medium glowing star: Outer aura + bright core
      ctx.beginPath();
      ctx.arc(sx, sy, star.size * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = star.color;
      ctx.globalAlpha = alpha * 0.35;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(sx, sy, star.size * 0.75, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = alpha;
      ctx.fill();
    } else {
      // Small star: Smooth circular particle
      ctx.beginPath();
      ctx.arc(sx, sy, star.size, 0, Math.PI * 2);
      ctx.fillStyle = star.color;
      ctx.fill();
    }

    ctx.restore();
  }

  ctx.restore();
}

/**
 * Draws the player spaceship with high visibility, distinct colors, and animated thrust.
 */
export function drawShip(ctx, currentShip, previousShip = null, alpha = 1, arena = null) {
  let x = currentShip.x;
  let y = currentShip.y;
  let angle = currentShip.angle;
  const thrust = currentShip.thrust;
  const reverse = currentShip.reverse;

  if (previousShip && alpha < 1) {
    if (arena && arena.width > 0 && arena.height > 0) {
      x = lerpCoordinate(previousShip.x, currentShip.x, alpha, arena.width);
      y = lerpCoordinate(previousShip.y, currentShip.y, alpha, arena.height);
    } else {
      x = lerp(previousShip.x, currentShip.x, alpha);
      y = lerp(previousShip.y, currentShip.y, alpha);
    }
    angle = lerpAngle(previousShip.angle, currentShip.angle, alpha);
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // 1. Engine exhaust (animated thrust flame when active, subtle blue aura when idle)
  if (thrust) {
    const flicker = Math.random() * 10;
    const flameLength = 22 + flicker;

    // Outer plasma flame
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-12, -7);
    ctx.lineTo(-12 - flameLength, 0);
    ctx.lineTo(-12, 7);
    ctx.closePath();
    ctx.fillStyle = 'rgba(249, 115, 22, 0.9)';
    ctx.shadowColor = '#f97316';
    ctx.shadowBlur = 14;
    ctx.fill();

    // Inner white-hot flame core
    ctx.beginPath();
    ctx.moveTo(-12, -4);
    ctx.lineTo(-12 - flameLength * 0.6, 0);
    ctx.lineTo(-12, 4);
    ctx.closePath();
    ctx.fillStyle = '#fef08a';
    ctx.fill();
    ctx.restore();
  } else if (reverse) {
    // Reverse retro-thruster jets firing forward from wings
    const rFlicker = Math.random() * 6;
    const rLen = 13 + rFlicker;
    ctx.save();
    ctx.fillStyle = '#38bdf8';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 10;

    // Right forward retro-jet
    ctx.beginPath();
    ctx.moveTo(-4, 11);
    ctx.lineTo(-4 + rLen, 13);
    ctx.lineTo(-4, 15);
    ctx.closePath();
    ctx.fill();

    // Left forward retro-jet
    ctx.beginPath();
    ctx.moveTo(-4, -11);
    ctx.lineTo(-4 + rLen, -13);
    ctx.lineTo(-4, -15);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else {
    // Subtle idle nozzle glow so ship position is immediately obvious
    ctx.save();
    ctx.beginPath();
    ctx.arc(-12, 0, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.6)';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.restore();
  }

  // 2. Main Spaceship Fuselage (High contrast: crisp metallic slate + vivid cyan wings)
  // Left and right wing fins
  ctx.beginPath();
  ctx.moveTo(26, 0); // Sharp nose
  ctx.lineTo(-16, 17); // Right wing tip
  ctx.lineTo(-10, 0); // Engine bay indent
  ctx.lineTo(-16, -17); // Left wing tip
  ctx.closePath();

  // High-contrast hull fill
  ctx.fillStyle = '#1e293b'; // Distinct slate-800 body
  ctx.fill();

  // Glowing neon cyan boundary
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#38bdf8'; // Electric cyan outline
  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = 10;
  ctx.stroke();

  // Reset shadow for inner details
  ctx.shadowBlur = 0;

  // Wing accent stripes (bright sky-blue chevron)
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(-8, 10);
  ctx.lineTo(-6, 0);
  ctx.lineTo(-8, -10);
  ctx.closePath();
  ctx.fillStyle = '#0284c7';
  ctx.fill();

  // 3. Cockpit Canopy (Bright glowing glass)
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(2, 4);
  ctx.lineTo(-1, 0);
  ctx.lineTo(2, -4);
  ctx.closePath();
  ctx.fillStyle = '#e0f2fe'; // Bright luminous white-blue
  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = 6;
  ctx.fill();

  ctx.restore();
}

/**
 * Draws the Heads-Up Display (HUD) showing frame and simulation rates.
 * Compatible with all browser Canvas implementations.
 */
export function drawHud(ctx, stats) {
  const {
    stepsPerSecond = 0,
    framesPerSecond = 0,
    lastFrameDuration = 0,
    delta = lastFrameDuration,
    frame = 0,
    tick = 0,
    jitter = 0,
    mode = 'fixed (60 Hz)',
  } = stats || {};

  ctx.save();
  const hudX = 16;
  const hudY = 16;
  const boxWidth = 224;
  const boxHeight = 172;

  // Background panel
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
  ctx.lineWidth = 1;
  ctx.fillRect(hudX, hudY, boxWidth, boxHeight);
  ctx.strokeRect(hudX, hudY, boxWidth, boxHeight);

  // HUD Header
  ctx.font = '600 11px ui-monospace, Consolas, monospace';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('DOGFIGHT // TELEMETRY', hudX + 12, hudY + 20);

  // Subtle header divider
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
  ctx.beginPath();
  ctx.moveTo(hudX + 12, hudY + 26);
  ctx.lineTo(hudX + boxWidth - 12, hudY + 26);
  ctx.stroke();

  // Metrics list
  const startY = hudY + 44;
  const lineH = 17;
  const valX = hudX + 90;

  const rows = [
    { label: 'mode: ', val: mode, col: '#38bdf8' },
    { label: 'frame:', val: `${frame}`, col: '#cbd5e1' },
    { label: 'tick: ', val: `${tick}`, col: '#cbd5e1' },
    {
      label: 'steps/s:',
      val: `${stepsPerSecond}`,
      col: stepsPerSecond >= 58 && stepsPerSecond <= 62 ? '#4ade80' : '#facc15',
    },
    { label: 'fps:   ', val: `${framesPerSecond}`, col: '#38bdf8' },
    {
      label: 'delta: ',
      val: `${delta.toFixed(1)} ms`,
      col: delta > 25 ? '#f87171' : '#e2e8f0',
    },
    {
      label: 'jitter:',
      val: `${jitter.toFixed(2)} ms`,
      col: jitter > 4 ? '#facc15' : '#a7f3d0',
    },
  ];

  ctx.font = '500 12px ui-monospace, Consolas, monospace';
  rows.forEach((row, idx) => {
    const y = startY + idx * lineH;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(row.label, hudX + 12, y);

    ctx.fillStyle = row.col;
    ctx.font = '700 12px ui-monospace, Consolas, monospace';
    ctx.fillText(row.val, valX, y);
    ctx.font = '500 12px ui-monospace, Consolas, monospace';
  });

  ctx.restore();
}
