/**
 * Canvas loading screen renderer for Dogfight.
 * Displays a real-time progress bar, asset telemetry, and graceful error states.
 */

/**
 * Draws the loading screen with a real progress bar on the game canvas.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width Canvas width
 * @param {number} height Canvas height
 * @param {Object} state
 * @param {number} [state.progress=0] Current progress (0.0 to 1.0)
 * @param {string} [state.statusText='Loading assets...'] Active asset status line
 * @param {Error|string|null} [state.error=null] Error message if loading failed
 */
export function drawLoadingScreen(ctx, width, height, state = {}) {
  const { progress = 0, statusText = 'Initializing asset pipeline...', error = null } = state;

  ctx.save();

  // 1. Clear background to deep cosmic slate
  ctx.fillStyle = '#070a13';
  ctx.fillRect(0, 0, width, height);

  // 2. Subtle center vignette glow
  const cx = width / 2;
  const cy = height / 2;
  const glow = ctx.createRadialGradient(cx, cy, 20, cx, cy, Math.min(width, height) * 0.7);
  glow.addColorStop(0, 'rgba(30, 41, 59, 0.45)');
  glow.addColorStop(1, 'rgba(7, 10, 19, 0.95)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  // 3. Central HUD Card
  const cardW = Math.min(460, width - 40);
  const cardH = error ? 240 : 200;
  const cardX = cx - cardW / 2;
  const cardY = cy - cardH / 2;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = error ? 'rgba(239, 68, 68, 0.5)' : 'rgba(56, 189, 248, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.fillRect(cardX, cardY, cardW, cardH);
  ctx.strokeRect(cardX, cardY, cardW, cardH);

  // Title header
  ctx.font = '600 13px ui-monospace, Consolas, monospace';
  ctx.fillStyle = error ? '#f87171' : '#38bdf8';
  ctx.textAlign = 'center';
  ctx.fillText('DOGFIGHT // ASSET PIPELINE', cx, cardY + 32);

  ctx.font = '500 11px ui-monospace, Consolas, monospace';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(
    error ? 'ASSET LOADING FAILED' : 'ASYNCHRONOUS RESOURCE LOADER (PROMISE.ALL)',
    cx,
    cardY + 50
  );

  // Divider line
  ctx.strokeStyle = error ? 'rgba(239, 68, 68, 0.2)' : 'rgba(56, 189, 248, 0.2)';
  ctx.beginPath();
  ctx.moveTo(cardX + 24, cardY + 62);
  ctx.lineTo(cardX + cardW - 24, cardY + 62);
  ctx.stroke();

  // 4. Progress Bar
  const barW = cardW - 64;
  const barH = 16;
  const barX = cx - barW / 2;
  const barY = cardY + 90;

  // Bar track background
  ctx.fillStyle = 'rgba(2, 6, 23, 0.8)';
  ctx.strokeStyle = error ? '#ef4444' : '#334155';
  ctx.lineWidth = 1;
  ctx.fillRect(barX, barY, barW, barH);
  ctx.strokeRect(barX, barY, barW, barH);

  // Bar fill
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const fillW = Math.max(0, barW * clampedProgress);

  if (fillW > 0) {
    ctx.save();
    ctx.shadowColor = error ? '#ef4444' : '#38bdf8';
    ctx.shadowBlur = 8;
    const barGrad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
    if (error) {
      barGrad.addColorStop(0, '#f87171');
      barGrad.addColorStop(1, '#ef4444');
    } else {
      barGrad.addColorStop(0, '#38bdf8');
      barGrad.addColorStop(1, '#818cf8');
    }
    ctx.fillStyle = barGrad;
    ctx.fillRect(barX, barY, fillW, barH);
    ctx.restore();
  }

  // 5. Progress Percentage
  const pctText = `${Math.round(clampedProgress * 100)}%`;
  ctx.font = '700 13px ui-monospace, Consolas, monospace';
  ctx.fillStyle = error ? '#fca5a5' : '#f8fafc';
  ctx.textAlign = 'right';
  ctx.fillText(pctText, barX + barW, barY - 8);

  // 6. Status text
  ctx.font = '500 12px ui-monospace, Consolas, monospace';
  ctx.fillStyle = error ? '#ef4444' : '#cbd5e1';
  ctx.textAlign = 'left';
  const displayStatus = error ? error.message || String(error) : statusText;

  // Truncate if status string is too long for card
  const maxStatusLen = Math.floor((barW - 50) / 7.5);
  const truncatedStatus =
    displayStatus.length > maxStatusLen
      ? `${displayStatus.slice(0, maxStatusLen)}...`
      : displayStatus;

  ctx.fillText(truncatedStatus, barX, barY - 8);

  // 7. Bottom guidance note
  ctx.textAlign = 'center';
  ctx.font = '500 11px ui-monospace, Consolas, monospace';
  if (error) {
    ctx.fillStyle = '#f87171';
    ctx.fillText('Check console logs or verify network connection.', cx, cardY + 160);
    ctx.fillStyle = '#facc15';
    ctx.fillText('Press [Space] or click to retry loading', cx, cardY + 185);
  } else {
    ctx.fillStyle = '#64748b';
    ctx.fillText(
      clampedProgress >= 1 ? 'Ready! Starting simulation...' : 'Streaming assets over HTTP...',
      cx,
      cardY + 145
    );
  }

  ctx.restore();
}
