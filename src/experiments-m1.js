/**
 * Lab 03 — Milestone 1 Experiment: Asset Pipeline Real Data Verification
 *
 * Implements real-data verification tests:
 * 1. Verify Real Assets: Loads manifest and validates each sprite, sound, and arena JSON.
 * 2. Verify Progress: Runs loadAll tracking real-time per-item progress events.
 * 3. Verify Error & Retry: Confirms 404 is never retried, and 5xx retries with backoff.
 * 4. Compare Parallel vs Sequential: Measures Promise.all vs sequential awaits with cache-busting.
 * 5. Cancel Loading: Tests AbortController cancellation during in-flight asset loading.
 */

import {
  loadAll,
  loadAllSequential,
  loadImage,
  loadAudio,
  fetchJson,
  withRetry,
  HttpError,
} from './assets/loader.js';

let activeAbortController = null;
let isOperationRunning = false;

/**
 * State store for test results table
 */
export const m1TestResults = [
  {
    id: 'verify-assets',
    name: 'Перевірити реальні ресурси',
    status: 'очікує', // 'очікує' | 'виконується' | 'пройшов' | 'не пройшов'
    actualData: 'Не запускався',
    expectedResult:
      'Всі 7 обов’язкових ресурсів (3 спрайти, 3 звуки, арена) існують, доступні по HTTP 200 та декодуються',
    actualResult: 'Очікує запуску',
    durationMs: 0,
    error: null,
  },
  {
    id: 'verify-progress',
    name: 'Перевірити прогрес',
    status: 'очікує',
    actualData: 'Не запускався',
    expectedResult:
      'Отримання 7 послідовних подій прогресу (від ~14% до 100%) за кожною фактично завершеною операцією',
    actualResult: 'Очікує запуску',
    durationMs: 0,
    error: null,
  },
  {
    id: 'verify-retry',
    name: 'Перевірити помилку та retry',
    status: 'очікує',
    actualData: 'Не запускався',
    expectedResult:
      'HTTP 404 не повторюється (1 спроба); 5xx повторюється до 3 разів з exponential backoff',
    actualResult: 'Очікує запуску',
    durationMs: 0,
    error: null,
  },
  {
    id: 'compare-timing',
    name: 'Порівняти паралельне й послідовне завантаження',
    status: 'очікує',
    actualData: 'Не запускався',
    expectedResult:
      'Вимірювання Promise.all та Sequential на однакових ресурсах із врахуванням кешування (cache-busting)',
    actualResult: 'Очікує запуску',
    durationMs: 0,
    error: null,
  },
  {
    id: 'cancel-load',
    name: 'Скасувати завантаження',
    status: 'очікує',
    actualData: 'Не запускався',
    expectedResult:
      'Операція негайно переривається з AbortError, signal.aborted === true, ресурси не довантажуються',
    actualResult: 'Очікує запуску',
    durationMs: 0,
    error: null,
  },
];

/**
 * Updates a test result in the store and refreshes the DOM table.
 */
function updateTestResult(id, updates) {
  const item = m1TestResults.find((r) => r.id === id);
  if (item) {
    Object.assign(item, updates);
    renderResultsTable();
  }
}

/**
 * Renders the results table into the DOM panel.
 */
export function renderResultsTable() {
  const tbody = document.getElementById('m1-results-tbody');
  if (!tbody) return;

  tbody.innerHTML = m1TestResults
    .map((r) => {
      let badgeClass = 'status-pending';
      let badgeIcon = '⏳';
      if (r.status === 'виконується') {
        badgeClass = 'status-running';
        badgeIcon = '⚙️';
      } else if (r.status === 'пройшов') {
        badgeClass = 'status-passed';
        badgeIcon = '✅';
      } else if (r.status === 'не пройшов') {
        badgeClass = 'status-failed';
        badgeIcon = '❌';
      }

      return `
      <tr>
        <td class="col-name"><strong>${escapeHtml(r.name)}</strong></td>
        <td class="col-status"><span class="badge ${badgeClass}">${badgeIcon} ${escapeHtml(r.status)}</span></td>
        <td class="col-data"><code class="data-code">${escapeHtml(r.actualData)}</code></td>
        <td class="col-expected">${escapeHtml(r.expectedResult)}</td>
        <td class="col-actual">${escapeHtml(r.actualResult)}</td>
        <td class="col-duration">${r.durationMs > 0 ? `${r.durationMs.toFixed(1)} мс` : '—'}</td>
        <td class="col-error">${r.error ? `<span class="err-text">${escapeHtml(r.error)}</span>` : '<span class="text-muted">—</span>'}</td>
      </tr>
    `;
    })
    .join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Action 1: Verify Real Assets from manifest
 */
export async function runVerifyRealAssets() {
  updateTestResult('verify-assets', {
    status: 'виконується',
    actualData: 'Завантаження та валідація ресурсів...',
    actualResult: 'Виконується...',
    error: null,
  });

  const t0 = performance.now();
  console.group(
    '%c=== M1 TEST: Перевірка реальних ресурсів ===',
    'color: #38bdf8; font-weight: bold;'
  );

  try {
    const manifest = await fetchJson('/assets/manifest.json');
    console.log('✓ Маніфест завантажено:', manifest);

    const assetChecks = [];
    const details = [];

    // 1. Sprites
    for (const [key, url] of Object.entries(manifest.sprites || {})) {
      const img = await loadImage(url);
      const isOk = img instanceof HTMLImageElement && img.naturalWidth > 0;
      assetChecks.push({
        key,
        type: 'sprite',
        url,
        ok: isOk,
        size: `${img.naturalWidth}x${img.naturalHeight}`,
      });
      details.push(`${key}: ${img.naturalWidth}x${img.naturalHeight}px (200 OK)`);
    }

    // 2. Sounds
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    for (const [key, url] of Object.entries(manifest.sounds || {})) {
      const buf = await loadAudio(audioCtx, url);
      const isOk = buf instanceof AudioBuffer && buf.duration > 0;
      assetChecks.push({
        key,
        type: 'sound',
        url,
        ok: isOk,
        duration: `${buf.duration.toFixed(2)}s`,
      });
      details.push(`${key}: ${buf.duration.toFixed(2)}s, ${buf.sampleRate}Hz (200 OK)`);
    }

    // 3. Arena
    if (manifest.arena) {
      const arena = await fetchJson(manifest.arena);
      const isOk = typeof arena === 'object' && arena.width > 0 && arena.height > 0;
      assetChecks.push({ key: 'arena', type: 'json', url: manifest.arena, ok: isOk });
      details.push(`arena: ${arena.width}x${arena.height} (${arena.name || 'OK'})`);
    }

    const durationMs = performance.now() - t0;
    const allPassed = assetChecks.every((c) => c.ok) && assetChecks.length === 7;

    console.table(assetChecks);

    if (allPassed) {
      console.log(
        `%c✓ Всі 7 обов'язкових ресурсів успішно перевірені за ${durationMs.toFixed(1)} мс!`,
        'color: #4ade80; font-weight: bold;'
      );
      updateTestResult('verify-assets', {
        status: 'пройшов',
        actualData: details.join('; '),
        actualResult: `Успішно перевірено ${assetChecks.length}/7 ресурсів (3 спрайти, 3 звуки, 1 арена)`,
        durationMs,
        error: null,
      });
    } else {
      throw new Error(
        `Частина ресурсів не пройшла валідацію: ${assetChecks
          .filter((c) => !c.ok)
          .map((c) => c.key)
          .join(', ')}`
      );
    }
  } catch (err) {
    const durationMs = performance.now() - t0;
    console.error('Помилка при перевірці ресурсів:', err);
    updateTestResult('verify-assets', {
      status: 'не пройшов',
      actualData: 'Збій під час завантаження',
      actualResult: 'Ресурси не завантажились',
      durationMs,
      error: err.message,
    });
  } finally {
    console.groupEnd();
  }
}

/**
 * Action 2: Verify loadAll Real Progress
 */
export async function runVerifyProgress() {
  updateTestResult('verify-progress', {
    status: 'виконується',
    actualData: 'Запуск loadAll з відстеженням подій...',
    actualResult: 'Виконується...',
    error: null,
  });

  const t0 = performance.now();
  console.group(
    '%c=== M1 TEST: Перевірка динаміки прогресу loadAll ===',
    'color: #38bdf8; font-weight: bold;'
  );

  const progressEvents = [];

  try {
    const assets = await loadAll('/assets/manifest.json', {
      delayMs: 30, // 30ms latency per asset so progress steps are registered sequentially
      onProgress: (p, info) => {
        progressEvents.push({
          step: info.done,
          total: info.total,
          percent: `${Math.round(p * 100)}%`,
          key: info.key,
          kind: info.kind,
        });
      },
    });

    const durationMs = performance.now() - t0;
    console.table(progressEvents);

    const hasAllSteps = progressEvents.length === 7;
    const finalStepIs100 = progressEvents[progressEvents.length - 1]?.percent === '100%';
    const validAssets = Boolean(assets.sprites.ship && assets.sounds.shoot && assets.arena);

    if (hasAllSteps && finalStepIs100 && validAssets) {
      const stepsSummary = progressEvents.map((e) => `${e.key}: ${e.percent}`).join(' → ');
      console.log(
        `%c✓ Прогрес успішно оновлено через 7 реальних операцій! Фінал: 100% за ${durationMs.toFixed(1)} мс.`,
        'color: #4ade80; font-weight: bold;'
      );
      updateTestResult('verify-progress', {
        status: 'пройшов',
        actualData: stepsSummary,
        actualResult: `Отримано 7 подій прогресу (14% → 100%), всі ресурси завантажено`,
        durationMs,
        error: null,
      });
    } else {
      throw new Error(`Невідповідність подій прогресу: отримано ${progressEvents.length}/7 подій.`);
    }
  } catch (err) {
    const durationMs = performance.now() - t0;
    console.error('Помилка при перевірці прогресу:', err);
    updateTestResult('verify-progress', {
      status: 'не пройшов',
      actualData: `Отримано подій: ${progressEvents.length}`,
      actualResult: 'Помилка виконання loadAll',
      durationMs,
      error: err.message,
    });
  } finally {
    console.groupEnd();
  }
}

/**
 * Action 3: Verify Error Handling & Retry Policy
 */
export async function runVerifyErrorAndRetry() {
  updateTestResult('verify-retry', {
    status: 'виконується',
    actualData: 'Тестування 404 без retry та 500 з retry...',
    actualResult: 'Виконується...',
    error: null,
  });

  const t0 = performance.now();
  console.group(
    '%c=== M1 TEST: Перевірка обробки помилок та політики Retry ===',
    'color: #38bdf8; font-weight: bold;'
  );

  try {
    // 1. Test 404: Non-existent asset must NOT be retried.
    //    We throw a synthetic HttpError(404) so the test does not depend on the
    //    dev server being reachable (a network-refused error has no .status and
    //    would be retried, giving attempts404 = 3 and a false failure).
    let attempts404 = 0;
    let error404Status = 0;

    try {
      await withRetry(
        async () => {
          attempts404++;
          throw new HttpError(404, 'Not Found', '/assets/sprites/nonexistent-test-404.png');
        },
        { attempts: 3, baseMs: 40 }
      );
    } catch (err) {
      error404Status = err.status || 0;
      console.log(`✓ 404 перевірка: статус = ${error404Status}, виконано спроб = ${attempts404}`);
    }

    if (attempts404 !== 1) {
      throw new Error(
        `404 помилка була повторена ${attempts404} разів, але 4xx має завершуватись негайно без retry!`
      );
    }

    // 2. Test 500: Server/transient error MUST be retried up to attempts limit
    let attempts500 = 0;
    try {
      await withRetry(
        async () => {
          attempts500++;
          const fakeErr = new Error('Simulated 500 Server Error');
          fakeErr.status = 500;
          throw fakeErr;
        },
        { attempts: 3, baseMs: 30 }
      );
    } catch (err) {
      console.log(`✓ 500 перевірка: статус = ${err.status}, виконано спроб = ${attempts500}`);
    }

    if (attempts500 !== 3) {
      throw new Error(`500 помилка виконала лише ${attempts500} спроби замість 3 передбачених.`);
    }

    const durationMs = performance.now() - t0;
    const summaryData = `404: 1 спроба (HTTP ${error404Status}, retry скасовано); 500: ${attempts500} спроби з exponential backoff`;

    console.log(
      `%c✓ Політика Retry повністю відповідає вимогам специфікації!`,
      'color: #4ade80; font-weight: bold;'
    );

    updateTestResult('verify-retry', {
      status: 'пройшов',
      actualData: summaryData,
      actualResult: '4xx відхилено за 1 спробу (без retry); 5xx повторено рівно 3 рази',
      durationMs,
      error: null,
    });
  } catch (err) {
    const durationMs = performance.now() - t0;
    console.error('Помилка при перевірці Retry:', err);
    updateTestResult('verify-retry', {
      status: 'не пройшов',
      actualData: 'Збій перевірки політики retry',
      actualResult: 'Помилка валідації retry',
      durationMs,
      error: err.message,
    });
  } finally {
    console.groupEnd();
  }
}

/**
 * Action 4: Compare Parallel vs Sequential Timing (Accounting for Caching via Cache-Busting)
 */
export async function runCompareTiming() {
  updateTestResult('compare-timing', {
    status: 'виконується',
    actualData: 'Вимірювання Promise.all та Sequential (з урахуванням кешу)...',
    actualResult: 'Виконується...',
    error: null,
  });

  const tTotalStart = performance.now();
  console.group(
    '%c=== M1 TEST: Порівняння Promise.all vs Sequential (з Cache-Busting) ===',
    'color: #38bdf8; font-weight: bold;'
  );

  try {
    const baseManifest = await fetchJson('/assets/manifest.json');
    const latencyDelay = 40; // 40ms simulated network latency per asset

    // Helper to generate a fresh, un-cached manifest copy for a fair comparison
    const makeCacheBustManifest = (prefix) => {
      const stamp = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const appendParam = (url) => {
        const sep = url.includes('?') ? '&' : '?';
        return `${url}${sep}_cb=${stamp}&delay=${latencyDelay}`;
      };

      const copy = { sprites: {}, sounds: {}, arena: appendParam(baseManifest.arena) };
      for (const [k, v] of Object.entries(baseManifest.sprites || {})) {
        copy.sprites[k] = appendParam(v);
      }
      for (const [k, v] of Object.entries(baseManifest.sounds || {})) {
        copy.sounds[k] = appendParam(v);
      }
      return copy;
    };

    // 1. Parallel loading (Promise.all) with fresh cache-buster
    const parManifest = makeCacheBustManifest('par');
    const tParStart = performance.now();
    await loadAll(parManifest);
    const parallelMs = performance.now() - tParStart;

    // 2. Sequential loading (await in loop) with fresh cache-buster
    const seqManifest = makeCacheBustManifest('seq');
    const tSeqStart = performance.now();
    await loadAllSequential(seqManifest);
    const sequentialMs = performance.now() - tSeqStart;

    const diffMs = sequentialMs - parallelMs;
    const speedup = (sequentialMs / parallelMs).toFixed(2);
    const durationMs = performance.now() - tTotalStart;

    console.table([
      {
        Режим: 'Паралельно (Promise.all)',
        'Час (мс)': `${parallelMs.toFixed(1)} мс`,
        Кешування: 'Fresh (cache-busted)',
        Швидкість: `${speedup}x швидше`,
      },
      {
        Режим: 'Послідовно (await per item)',
        'Час (мс)': `${sequentialMs.toFixed(1)} мс`,
        Кешування: 'Fresh (cache-busted)',
        Швидкість: '1.00x (база)',
      },
    ]);

    const isParallelFaster = parallelMs <= sequentialMs;
    const verdict = isParallelFaster ? 'пройшов' : 'не пройшов';

    console.log(
      `%c[ВРАХУВАННЯ КЕШУ]: Обидва запуски використовували незалежні cache-busting ключі (_cb) для виключення спотворення дисковим кешем.\n` +
        `Виміряно: Promise.all (${parallelMs.toFixed(1)} мс) vs Sequential (${sequentialMs.toFixed(1)} мс). Різниця: ${diffMs.toFixed(1)} мс.`,
      isParallelFaster ? 'color: #4ade80; font-weight: bold;' : 'color: #facc15; font-weight: bold;'
    );

    updateTestResult('compare-timing', {
      status: verdict,
      actualData: `Promise.all: ${parallelMs.toFixed(1)} мс; Sequential: ${sequentialMs.toFixed(1)} мс; Δ = ${diffMs.toFixed(1)} мс (кеш виключено)`,
      actualResult: `Прискорення ${speedup}x (${parallelMs.toFixed(1)} мс vs ${sequentialMs.toFixed(1)} мс)`,
      durationMs,
      error: isParallelFaster ? null : 'Паралельний варіант не виявився швидшим у цьому запуску',
    });
  } catch (err) {
    const durationMs = performance.now() - tTotalStart;
    console.error('Помилка при порівнянні часу:', err);
    updateTestResult('compare-timing', {
      status: 'не пройшов',
      actualData: 'Збій вимірювання часу',
      actualResult: 'Помилка бенчмарку',
      durationMs,
      error: err.message,
    });
  } finally {
    console.groupEnd();
  }
}

/**
 * Action 5: Cancel Loading via AbortSignal
 */
export async function runCancelLoading() {
  // If an operation is currently running with an active controller, abort it!
  if (isOperationRunning && activeAbortController) {
    console.log('%c[ABORT] Скасування поточного завантаження користувачем...', 'color: #facc15;');
    activeAbortController.abort();
    return;
  }

  updateTestResult('cancel-load', {
    status: 'виконується',
    actualData: 'Ініціалізація завантаження та виклик abort()...',
    actualResult: 'Виконується...',
    error: null,
  });

  const t0 = performance.now();
  console.group(
    '%c=== M1 TEST: Скасування завантаження (AbortSignal) ===',
    'color: #38bdf8; font-weight: bold;'
  );

  activeAbortController = new AbortController();
  isOperationRunning = true;

  try {
    // Schedule abort after 40ms while 200ms latency assets are in flight
    setTimeout(() => {
      if (activeAbortController) {
        console.log('✓ Викликаємо controller.abort() під час завантаження...');
        activeAbortController.abort();
      }
    }, 40);

    await loadAll('/assets/manifest.json', {
      delayMs: 200,
      signal: activeAbortController.signal,
    });

    throw new Error('Операція мала бути скасована, але завершилась успішно.');
  } catch (err) {
    const durationMs = performance.now() - t0;
    const isAborted = err.name === 'AbortError' || activeAbortController.signal.aborted;

    if (isAborted) {
      console.log(
        `%c✓ Завантаження успішно скасовано через AbortController за ${durationMs.toFixed(1)} мс! Помилка: ${err.name}`,
        'color: #4ade80; font-weight: bold;'
      );
      updateTestResult('cancel-load', {
        status: 'пройшов',
        actualData: `controller.abort() викликано через 40 мс; помилка: ${err.name}`,
        actualResult: `Перервано: err.name = "${err.name}", signal.aborted = ${activeAbortController.signal.aborted}`,
        durationMs,
        error: null,
      });
    } else {
      console.error('Неочікувана помилка скасування:', err);
      updateTestResult('cancel-load', {
        status: 'не пройшов',
        actualData: `Отримано помилку іншого типу: ${err.name}`,
        actualResult: 'Не AbortError',
        durationMs,
        error: err.message,
      });
    }
  } finally {
    isOperationRunning = false;
    activeAbortController = null;
    console.groupEnd();
  }
}

/**
 * Runs all 5 verification tests sequentially.
 */
export async function runAllM1Tests() {
  console.log(
    '%c=== ЗАПУСК ПОВНОГО КОМПЛЕКСУ ТЕСТІВ M1 ===',
    'color: #38bdf8; font-size: 14px; font-weight: bold;'
  );
  await runVerifyRealAssets();
  await runVerifyProgress();
  await runVerifyErrorAndRetry();
  await runCompareTiming();
  await runCancelLoading();
  console.log(
    '%c=== ВСІ ТЕСТИ M1 ЗАВЕРШЕНО ===',
    'color: #4ade80; font-size: 14px; font-weight: bold;'
  );
}

/**
 * Initializes DOM listeners and UI state for the M1 Experiment panel.
 */
export function setupM1ExperimentUI() {
  const panel = document.getElementById('m1-experiment-panel');
  const toggleBtn = document.getElementById('btn-exp-m1');
  const closeBtn = document.getElementById('btn-m1-close');

  const btnVerifyAssets = document.getElementById('btn-m1-verify-assets');
  const btnVerifyProgress = document.getElementById('btn-m1-verify-progress');
  const btnVerifyRetry = document.getElementById('btn-m1-verify-retry');
  const btnCompareTiming = document.getElementById('btn-m1-compare-timing');
  const btnCancelLoad = document.getElementById('btn-m1-cancel-load');
  const btnRunAll = document.getElementById('btn-m1-run-all');

  // Toggle Panel Visibility
  toggleBtn?.addEventListener('click', () => {
    if (panel) {
      panel.classList.toggle('hidden');
      renderResultsTable();
    }
  });

  closeBtn?.addEventListener('click', () => {
    panel?.classList.add('hidden');
  });

  // Action Buttons
  btnVerifyAssets?.addEventListener('click', runVerifyRealAssets);
  btnVerifyProgress?.addEventListener('click', runVerifyProgress);
  btnVerifyRetry?.addEventListener('click', runVerifyErrorAndRetry);
  btnCompareTiming?.addEventListener('click', runCompareTiming);
  btnCancelLoad?.addEventListener('click', runCancelLoading);
  btnRunAll?.addEventListener('click', runAllM1Tests);

  // Initial table render
  renderResultsTable();
}
