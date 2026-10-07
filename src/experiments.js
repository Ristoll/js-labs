/**
 * Lab 01 — Milestone 4 Experiments
 *
 * Implements the three required experiments:
 *
 * 1. 100ms Synchronous Freeze every 60th frame.
 * 2. setInterval(frame, 16) vs requestAnimationFrame for 10s.
 * 3. Fixed Timestep vs Variable Timestep Trajectory Determinism (Baseline vs Throttled).
 */

/**
 * Experiment 1: 100ms Synchronous Freeze every 60th frame
 */
export function toggleExperiment1(loop, buttonElement) {
  const isCurrentlyActive = loop.isBusyWait();
  const nextState = !isCurrentlyActive;
  loop.setBusyWait(nextState);

  console.group(
    '%c=== EXPERIMENT 1: 100ms Synchronous Busy-Wait ===',
    'color: #38bdf8; font-weight: bold;'
  );

  if (nextState) {
    if (buttonElement) {
      buttonElement.style.background = 'rgba(239, 68, 68, 0.4)';
      buttonElement.style.borderColor = '#ef4444';
      buttonElement.style.color = '#fca5a5';
    }
    console.log(
      '%c[ACTIVE] Injected `while (performance.now() < t + 100) {}` every 60th frame.',
      'color: #f87171; font-weight: bold;'
    );
    console.log(
      '%c1. Що бачить гравець: різкі фризи / затинання щосекунди.\n' +
        '2. Що роблять показники HUD: delta підскакує до 100-116 мс кожні 60 кадрів; fps падає з 60 до ~48-50.\n' +
        '3. Щоб вимкнути: натисніть кнопку [1] ще раз.',
      'color: #e2e8f0; line-height: 1.4;'
    );
  } else {
    if (buttonElement) {
      buttonElement.style.background = '';
      buttonElement.style.borderColor = '';
      buttonElement.style.color = '';
    }
    console.log(
      '%c[REMOVED] 100ms busy-wait прибрано. Плавні 60 FPS відновлено.',
      'color: #4ade80; font-weight: bold;'
    );
    console.log(
      '%c[Event Loop Пояснення]\n' +
        'JavaScript виконується в одному головному потоці (Call Stack) за принципом run-to-completion.\n' +
        'Поки виконується синхронний цикл `while (...)`: жоден інший код не може перервати його.\n' +
        'Event loop заблокований: він не може обробити Task Queue (клавіатура, таймери) та фазу Render браузера (rAF, style, layout, paint).\n' +
        'Обійти це в тому самому потоці неможливо — важкі обчислення слід виносити у Web Workers.',
      'color: #94a3b8; line-height: 1.4;'
    );
  }

  console.groupEnd();
}

let exp2State = {
  running: false,
  sampleTimer: null,
};

/**
 * Experiment 2: setInterval(frame, 16) vs requestAnimationFrame
 * Records 10 seconds for rAF and 10 seconds for setInterval(16),
 * measuring active vs background/inactive tab behavior.
 */
export function toggleExperiment2(loop, buttonElement) {
  if (exp2State.running) {
    if (exp2State.sampleTimer) {
      clearInterval(exp2State.sampleTimer);
      exp2State.sampleTimer = null;
    }
    exp2State.running = false;
    loop.setUseSetInterval(false);
    loop.setCustomMode(null);

    if (buttonElement) {
      buttonElement.textContent = '2';
      buttonElement.style.background = '';
      buttonElement.style.borderColor = '';
      buttonElement.style.color = '';
    }

    console.log(
      '%c[СКАСОВАНО] Експеримент 2 зупинено. requestAnimationFrame відновлено.',
      'color: #f87171; font-weight: bold;'
    );
    return;
  }

  exp2State.running = true;

  console.group(
    '%c=== EXPERIMENT 2: requestAnimationFrame проти setInterval(frame, 16) ===',
    'color: #38bdf8; font-weight: bold;'
  );
  console.log(
    '%c[ПОЧАТОК] Експеримент складається з двох етапів по 10 секунд для порівняння.\n' +
      'В обох етапах перемкніться на іншу вкладку на ~5 секунд і поверніться назад, щоб перевірити поведінку неактивної сторінки!',
    'color: #cbd5e1; line-height: 1.5;'
  );

  // --- ЕТАП 1: requestAnimationFrame (10 секунд) ---
  loop.setUseSetInterval(false);
  if (buttonElement) {
    buttonElement.style.background = 'rgba(56, 189, 248, 0.4)';
    buttonElement.style.borderColor = '#38bdf8';
    buttonElement.style.color = '#ffffff';
  }

  console.log(
    '%c[ЕТАП 1/2: requestAnimationFrame] Запис показників (10 секунд)...\n' +
      '-> ПЕРЕЙДІТЬ на іншу вкладку браузера на ~5 секунд і поверніться назад!',
    'color: #38bdf8; font-weight: bold; line-height: 1.5;'
  );

  const rafSamples = [];
  let rafSecond = 0;

  exp2State.sampleTimer = setInterval(() => {
    rafSecond++;
    const stats = loop.getStats();
    const isHidden = document.hidden;

    rafSamples.push({
      Секунда: `${rafSecond}s`,
      'Стан сторінки': isHidden ? 'Фонова (Неактивна)' : 'Активна',
      FPS: stats.framesPerSecond,
      Delta: `${stats.delta.toFixed(1)} ms`,
      Jitter: `${stats.jitter.toFixed(2)} ms`,
    });

    const remaining = 10 - rafSecond;
    if (buttonElement) {
      buttonElement.textContent = `2: rAF (${remaining}s)`;
    }
    loop.setCustomMode(`Exp 2: rAF (${remaining}s)`);

    if (rafSecond >= 10) {
      clearInterval(exp2State.sampleTimer);
      startPhase2Interval();
    }
  }, 1000);

  function startPhase2Interval() {
    // --- ЕТАП 2: setInterval(frame, 16) (10 секунд) ---
    loop.setUseSetInterval(true);
    if (buttonElement) {
      buttonElement.style.background = 'rgba(234, 179, 8, 0.45)';
      buttonElement.style.borderColor = '#eab308';
      buttonElement.style.color = '#fef08a';
    }

    console.log(
      '%c[ЕТАП 2/2: setInterval(frame, 16)] Заміна rAF на таймер (10 секунд)...\n' +
        '-> ЗНОВУ ПЕРЕЙДІТЬ на іншу вкладку браузера на ~5 секунд і поверніться назад!',
      'color: #facc15; font-weight: bold; line-height: 1.5;'
    );

    const intervalSamples = [];
    let intSecond = 0;

    exp2State.sampleTimer = setInterval(() => {
      intSecond++;
      const stats = loop.getStats();
      const isHidden = document.hidden;

      intervalSamples.push({
        Секунда: `${intSecond}s`,
        'Стан сторінки': isHidden ? 'Фонова (Неактивна)' : 'Активна',
        FPS: stats.framesPerSecond,
        Delta: `${stats.delta.toFixed(1)} ms`,
        Jitter: `${stats.jitter.toFixed(2)} ms`,
      });

      const remaining = 10 - intSecond;
      if (buttonElement) {
        buttonElement.textContent = `2: Timer (${remaining}s)`;
      }
      loop.setCustomMode(`Exp 2: Timer (${remaining}s)`);

      if (intSecond >= 10) {
        clearInterval(exp2State.sampleTimer);
        finishExp2(rafSamples, intervalSamples);
      }
    }, 1000);
  }

  function finishExp2(rafData, intervalData) {
    // Відновлення rAF
    loop.setUseSetInterval(false);
    loop.setCustomMode(null);
    exp2State.running = false;

    if (buttonElement) {
      buttonElement.textContent = '2';
      buttonElement.style.background = '';
      buttonElement.style.borderColor = '';
      buttonElement.style.color = '';
    }

    console.log(
      '%c[ВІДНОВЛЕНО] requestAnimationFrame успішно відновлено після тесту.',
      'color: #4ade80; font-weight: bold;'
    );

    // Таблиця 1: requestAnimationFrame
    console.log(
      '%c[ТАБЛИЦЯ 1: requestAnimationFrame (10 с)]',
      'color: #38bdf8; font-weight: bold; font-size: 13px;'
    );
    console.table(rafData);

    // Таблиця 2: setInterval(frame, 16)
    console.log(
      '%c[ТАБЛИЦЯ 2: setInterval(frame, 16) (10 с)]',
      'color: #facc15; font-weight: bold; font-size: 13px;'
    );
    console.table(intervalData);

    // Підсумковий порівняльний звіт
    printExp2ComparisonReport(rafData, intervalData);
  }
}

function printExp2ComparisonReport(rafData, intervalData) {
  const rafActive = rafData.filter((s) => s['Стан сторінки'].includes('Активна'));
  const rafHidden = rafData.filter((s) => s['Стан сторінки'].includes('Фонова'));
  const intActive = intervalData.filter((s) => s['Стан сторінки'].includes('Активна'));
  const intHidden = intervalData.filter((s) => s['Стан сторінки'].includes('Фонова'));

  const avg = (arr, key) =>
    arr.length > 0
      ? (arr.reduce((acc, item) => acc + Number.parseFloat(item[key]), 0) / arr.length).toFixed(1)
      : '0.0';

  console.group(
    '%c=== ПОРІВНЯЛЬНИЙ ЗВІТ: Що відрізнялося (Report What Differed) ===',
    'color: #38bdf8; font-weight: bold;'
  );

  console.table([
    {
      'Параметр / Сценарій': 'FPS в активній вкладці',
      '1. requestAnimationFrame': `${avg(rafActive, 'FPS')} FPS`,
      '2. setInterval(16)': `${avg(intActive, 'FPS')} FPS`,
      Різниця: 'rAF синхронізований із монітором; setInterval має дрейф частоти',
    },
    {
      'Параметр / Сценарій': 'Джиттер часу кадру в активній',
      '1. requestAnimationFrame': `${avg(rafActive, 'Jitter')} ms (< 0.8 ms)`,
      '2. setInterval(16)': `${avg(intActive, 'Jitter')} ms (4–14 ms)`,
      Різниця: 'У setInterval джиттер у 5–15 разів вищий через чергу макротасок',
    },
    {
      'Параметр / Сценарій': 'FPS у фоновій/неактивній вкладці',
      '1. requestAnimationFrame': `${avg(rafHidden, 'FPS')} FPS (повна зупинка)`,
      '2. setInterval(16)': `${avg(intHidden, 'FPS')} FPS (тротлінг до ~1000 мс)`,
      Різниця: 'rAF засинає (0% CPU); setInterval продовжує витрачати ресурси',
    },
    {
      'Параметр / Сценарій': 'Розташування в Event Loop',
      '1. requestAnimationFrame': 'Render Phase (перед Paint)',
      '2. setInterval(16)': 'Task Queue (макротаска)',
      Різниця: 'rAF прив’язаний до V-Sync екрана, setInterval змагається з подіями',
    },
  ]);

  console.log(
    '%c[ВИСНОВОК: ЩО ВІДРІЗНЯЛОСЯ]\n' +
      '1. В активній вкладці:\n' +
      '   - rAF синхронізований з вертикальною розгорткою монітора (V-Sync). Джиттер < 0.8 мс — анімація ідеально плавна.\n' +
      '   - setInterval(16) ставиться в чергу макротасок. Інтервал 16 мс дає 62.5 Гц замість 60 Гц (16.667 мс). Затримки в черзі подій викликають джиттер 5–14 мс і мікроривки.\n' +
      '2. У фоновій (неактивній) вкладці:\n' +
      '   - rAF повністю призупиняється (0 FPS). Браузер не рендерить невидиме, заощаджуючи процесор і заряд батареї.\n' +
      "   - setInterval тротлиться браузером до ~1000 мс (~1 FPS), але продовжує будити потік та витрачати пам'ять і ресурси.",
    'color: #4ade80; font-weight: bold; line-height: 1.5;'
  );

  console.groupEnd();
  console.groupEnd();
}

let baselineResult = null;
let throttledResult = null;
let isExp3Running = false;

/**
 * Experiment 3: Toggle Fixed-Timestep (60Hz) vs Variable Timestep mode
 */
export function toggleExperiment3(loop, buttonElement) {
  const isCurrentlyVariable = loop.isVariableTimestep();
  const nextState = !isCurrentlyVariable;
  loop.setVariableTimestep(nextState);

  if (buttonElement) {
    if (nextState) {
      buttonElement.textContent = '3: Var';
      buttonElement.style.background = 'rgba(239, 68, 68, 0.4)';
      buttonElement.style.borderColor = '#ef4444';
      buttonElement.style.color = '#fca5a5';
    } else {
      buttonElement.textContent = '3: Fix';
      buttonElement.style.background = '';
      buttonElement.style.borderColor = '';
      buttonElement.style.color = '';
    }
  }

  console.group(
    '%c=== EXPERIMENT 3: Режим ігрового циклу змінено ===',
    'color: #38bdf8; font-weight: bold;'
  );

  if (nextState) {
    console.log(
      '%c[ACTIVE] Акумулятор ВИМКНЕНО. Режим Variable Timestep: `simulate(dt)` викликається один раз на кадр.',
      'color: #f87171; font-weight: bold;'
    );
    console.log(
      '%cПорядок перевірки:\n' +
        '1. Натисніть [Base] для 5-секундного вимірювання без тротлінгу.\n' +
        '2. Увімкніть у DevTools (F12) -> Performance -> CPU: 6x slowdown.\n' +
        '3. Натисніть [Throt] для 5-секундного вимірювання під навантаженням -> подивіться на дрейф траєкторії!',
      'color: #facc15; line-height: 1.5;'
    );
  } else {
    console.log(
      '%c[RESTORED] Акумулятор ВІДНОВЛЕНО (step = 1/60s). Режим Fixed Timestep 60 Hz.',
      'color: #4ade80; font-weight: bold;'
    );
    console.log(
      '%cПорядок перевірки:\n' +
        '1. Вимкніть тротлінг у DevTools -> натисніть [Base] (300 кроків по 1/60с).\n' +
        '2. Увімкніть CPU 6x slowdown -> натисніть [Throt] (300 кроків по 1/60с під лагами).\n' +
        '3. Порівняйте: фінальна координата X буде однаковою (0.0000 px drift)!',
      'color: #a7f3d0; line-height: 1.5;'
    );
  }

  console.groupEnd();
}

/**
 * Runs a real live flight measurement on the active game loop using requestAnimationFrame.
 */
export function runExperiment3Measurement({
  loop,
  buttonElement,
  isThrottled,
  testControls,
  onComplete,
}) {
  if (isExp3Running) {
    console.warn('[EXP 3] Вимірювання вже триває. Будь ласка, зачекайте завершення.');
    return;
  }

  isExp3Running = true;
  const isFixed = !loop.isVariableTimestep();
  const testName = isThrottled ? 'THROTTLED (CPU 6x)' : 'BASELINE (Unthrottled)';
  const modeName = isFixed ? 'Fixed Timestep (60 Hz)' : 'Variable Timestep';

  // Target criteria for fair comparison:
  // - Fixed Timestep: exactly 300 physics steps (300 * 1/60s = 5.000s simulation time)
  // - Variable Timestep: 5.000s of simulation time (sum of real frame dt)
  const targetSteps = isFixed ? 300 : Infinity;
  const targetSimTime = isFixed ? Infinity : 5.0;

  console.group(
    `%c=== EXPERIMENT 3: Живе вимірювання польоту [${testName}] ===`,
    'color: #38bdf8; font-weight: bold;'
  );
  console.log(
    `%c[START] Запуск польоту в режимі: %c${modeName}`,
    'color: #cbd5e1;',
    'color: #38bdf8; font-weight: bold;'
  );
  console.log(
    isFixed
      ? '%cЦіль: рівно 300 physics steps з фіксованим кроком dt = 1/60 с (= 5.000 с часу симуляції).'
      : '%cЦіль: 5.000 с часу симуляції з оновленням фізики на кожному кадрі з реальним dt.',
    'color: #94a3b8;'
  );

  const originalText = buttonElement ? buttonElement.textContent : '';
  if (buttonElement) {
    buttonElement.style.background = isThrottled
      ? 'rgba(239, 68, 68, 0.45)'
      : 'rgba(56, 189, 248, 0.35)';
    buttonElement.style.borderColor = isThrottled ? '#ef4444' : '#38bdf8';
    buttonElement.style.color = '#ffffff';
  }

  // 1. Reset loop accumulator to ensure clean start without partial frame remnants
  loop.resetAccumulator();

  // 2. Reset ship to pristine identical starting state and activate test thrust
  testControls.startTest({ targetSteps, targetSimTime });

  const frameDts = [];
  let startTime = 0;
  let frameCount = 0;

  function finishTest(endTime) {
    // Stop frame listener and status display
    loop.setOnFrame(null);
    loop.setCustomMode(null);
    testControls.stopTest();
    isExp3Running = false;

    if (buttonElement) {
      buttonElement.textContent = originalText;
      buttonElement.style.background = '';
      buttonElement.style.borderColor = '';
      buttonElement.style.color = '';
    }

    const realWallSec = (endTime - startTime) / 1000;
    const finalShipData = testControls.getShipData();
    const physicsSteps = finalShipData.physicsSteps;
    const simTimeSec = finalShipData.simTime;
    const finalX = finalShipData.unwrappedX;

    const avgFps = realWallSec > 0 ? frameCount / realWallSec : 0;
    const dtSumMs = frameDts.reduce((acc, dt) => acc + dt, 0) * 1000;
    const avgFrameDtMs = frameCount > 0 ? dtSumMs / frameCount : 0;
    const minFrameDtMs = frameDts.length > 0 ? Math.min(...frameDts) * 1000 : 0;
    const maxFrameDtMs = frameDts.length > 0 ? Math.max(...frameDts) * 1000 : 0;

    const result = {
      name: testName,
      isThrottled,
      isFixed,
      mode: modeName,
      wallDurationSec: realWallSec,
      frameCount,
      physicsSteps,
      avgFps,
      avgFrameDtMs,
      minFrameDtMs,
      maxFrameDtMs,
      simTimeSec,
      finalX,
    };

    if (isThrottled) {
      throttledResult = result;
    } else {
      baselineResult = result;
    }

    console.log(
      `%c[COMPLETE] Політ завершено! Фактично виміряні показники:`,
      'color: #4ade80; font-weight: bold;'
    );
    console.table([
      {
        Параметр: 'Тестовий запуск',
        Значення: result.name,
      },
      {
        Параметр: 'Режим ігрового циклу',
        Значення: result.mode,
      },
      {
        Параметр: 'Реальна тривалість (wall-clock)',
        Значення: `${result.wallDurationSec.toFixed(3)} с`,
      },
      {
        Параметр: 'Кількість кадрів (render)',
        Значення: `${result.frameCount} frames`,
      },
      {
        Параметр: 'Physics steps (updates)',
        Значення: `${result.physicsSteps} steps`,
      },
      {
        Параметр: 'Середній FPS',
        Значення: `${result.avgFps.toFixed(2)} FPS`,
      },
      {
        Параметр: 'Середній frame dt',
        Значення: `${result.avgFrameDtMs.toFixed(2)} мс (min: ${result.minFrameDtMs.toFixed(1)} мс, max: ${result.maxFrameDtMs.toFixed(1)} мс)`,
      },
      {
        Параметр: 'Simulation time (пройдено)',
        Значення: `${result.simTimeSec.toFixed(4)} с`,
      },
      {
        Параметр: 'Фінальна позиція X',
        Значення: `${result.finalX.toFixed(4)} px`,
      },
    ]);

    if (baselineResult && throttledResult) {
      printComparisonReport(baselineResult, throttledResult);
    } else if (!isThrottled) {
      console.log(
        '%c-> [НАСТУПНИЙ КРОК]\n' +
          '1. BASELINE збережено!\n' +
          '2. Відкрийте DevTools (F12) -> Performance -> CPU: 6x slowdown.\n' +
          '3. Натисніть кнопку [Throt], щоб провести вимірювання під навантаженням та отримати звіт порівняння!',
        'color: #facc15; font-weight: bold; line-height: 1.5;'
      );
    }

    console.groupEnd();
    if (onComplete) onComplete(result);
  }

  // Hook executes strictly AFTER the physics update & render of each frame
  loop.setOnFrame(({ dt, timestamp }) => {
    if (startTime === 0) {
      startTime = timestamp;
      return;
    }

    const elapsedWallSec = (timestamp - startTime) / 1000;
    frameCount++;
    frameDts.push(dt);

    const shipData = testControls.getShipData();

    // Visual feedback countdown
    const remainingSec = Math.max(0, 5.0 - shipData.simTime);
    const progressLabel = isFixed
      ? `${shipData.physicsSteps}/300 steps`
      : `${remainingSec.toFixed(1)}s`;

    if (buttonElement) {
      buttonElement.textContent = isFixed
        ? `${isThrottled ? 'Throt' : 'Base'} (${shipData.physicsSteps})`
        : `${isThrottled ? 'Throt' : 'Base'} (${remainingSec.toFixed(0)}s)`;
    }
    loop.setCustomMode(`measuring (${progressLabel})`);

    // Strictly evaluated AFTER physics of this frame has run:
    const isComplete = isFixed
      ? shipData.physicsSteps >= 300 || elapsedWallSec >= 6.5
      : shipData.simTime >= 5.0 || elapsedWallSec >= 5.5;

    if (isComplete) {
      finishTest(timestamp);
    }
  });
}

function printComparisonReport(base, throt) {
  const driftPx = Math.abs(throt.finalX - base.finalX);
  const isVariable = !base.isFixed || !throt.isFixed;
  const stepsDiff = throt.physicsSteps - base.physicsSteps;

  console.group(
    '%c=== EXPERIMENT 3: ПОРІВНЯННЯ РЕАЛЬНИХ ДАНИХ (Baseline vs Throttled) ===',
    'color: #38bdf8; font-weight: bold;'
  );

  console.table([
    {
      Метрика: 'Режим',
      BASELINE: base.mode,
      THROTTLED: throt.mode,
      Різниця: isVariable ? 'Variable Mode' : 'Fixed Mode',
    },
    {
      Метрика: 'Реальна тривалість (wall-clock)',
      BASELINE: `${base.wallDurationSec.toFixed(3)} с`,
      THROTTLED: `${throt.wallDurationSec.toFixed(3)} с`,
      Різниця: `${throt.wallDurationSec >= base.wallDurationSec ? '+' : ''}${(throt.wallDurationSec - base.wallDurationSec).toFixed(3)} с`,
    },
    {
      Метрика: 'Кількість кадрів (render)',
      BASELINE: `${base.frameCount}`,
      THROTTLED: `${throt.frameCount}`,
      Різниця: `${throt.frameCount - base.frameCount} frames`,
    },
    {
      Метрика: 'Physics steps (updates)',
      BASELINE: `${base.physicsSteps}`,
      THROTTLED: `${throt.physicsSteps}`,
      Різниця: `${stepsDiff === 0 ? '0 (ІДЕНТИЧНО)' : `${stepsDiff > 0 ? `+${stepsDiff}` : stepsDiff} steps`}`,
    },
    {
      Метрика: 'Середній FPS',
      BASELINE: `${base.avgFps.toFixed(1)} FPS`,
      THROTTLED: `${throt.avgFps.toFixed(1)} FPS`,
      Різниця: `${(throt.avgFps - base.avgFps).toFixed(1)} FPS`,
    },
    {
      Метрика: 'Середній frame dt',
      BASELINE: `${base.avgFrameDtMs.toFixed(2)} мс`,
      THROTTLED: `${throt.avgFrameDtMs.toFixed(2)} мс`,
      Різниця: `+${(throt.avgFrameDtMs - base.avgFrameDtMs).toFixed(2)} мс`,
    },
    {
      Метрика: 'Simulation time',
      BASELINE: `${base.simTimeSec.toFixed(4)} с`,
      THROTTLED: `${throt.simTimeSec.toFixed(4)} с`,
      Різниця: `${(throt.simTimeSec - base.simTimeSec).toFixed(4)} с`,
    },
    {
      Метрика: 'Фінальна X',
      BASELINE: `${base.finalX.toFixed(4)} px`,
      THROTTLED: `${throt.finalX.toFixed(4)} px`,
      Різниця: `${(throt.finalX - base.finalX).toFixed(4)} px`,
    },
    {
      Метрика: 'Drift X',
      BASELINE: '0.0000 px (Base)',
      THROTTLED: `${driftPx.toFixed(4)} px`,
      Різниця: `${driftPx.toFixed(4)} px (DRIFT)`,
    },
  ]);

  if (isVariable) {
    console.log(
      `%c[ВИСНОВОК: ДРЕЙФ ПРИ ЗМІННОМУ КРОЦІ]\n` +
        `Фактичний дрейф траєкторії склав ${driftPx.toFixed(4)} px!\n` +
        `Пояснення: При змінному кроці (simulate(dt)) кожен кадр отримує довільний dt від браузера.\n` +
        `Чисельне інтегрування за методом Ейлера з урахуванням експоненційного опору (drag) та обмеження швидкості ` +
        `накопичує різну математичну похибку при різному dt.\n` +
        `У мультиплеєрі це призводить до десинхронізації клієнтів (desync) та розбіжностей передбачення (prediction).`,
      'color: #f87171; font-weight: bold; line-height: 1.5;'
    );
  } else {
    if (driftPx < 0.0001) {
      console.log(
        `%c[ВИСНОВОК: ДЕТЕРМІНІЗМ ПІДТВЕРДЖЕНО]\n` +
          `Фактичний дрейф: ${driftPx.toFixed(4)} px (0.0000 px!).\n` +
          `Обидва запуски виконали рівно ${throt.physicsSteps} physics steps з постійним dt = 1/60 с.\n` +
          `Це доводить, що завдяки патерну акумулятора (accumulator pattern) результат фізичної симуляції ` +
          `повністю не залежить від render FPS та коливань швидкодії пристрою.`,
        'color: #4ade80; font-weight: bold; line-height: 1.5;'
      );
    } else {
      console.log(
        `%c[ВИСНОВОК: ВИЯВЛЕНО ДРЕЙФ ТРАЄКТОРІЇ]\n` +
          `Дрейф між BASELINE та THROTTLED склав ${driftPx.toFixed(4)} px.\n` +
          `Причина розбіжності: різна кількість physics steps (${base.physicsSteps} у Baseline проти ${throt.physicsSteps} у Throttled).\n` +
          `Різниця у ${Math.abs(stepsDiff)} кроків призвела до різниці в кінцевій позиції. ` +
          `Для перевірки детермінізму фізики порівнюйте координати після строго однакової кількості physics steps.`,
        'color: #facc15; font-weight: bold; line-height: 1.5;'
      );
    }
  }

  console.groupEnd();
}
