# Лабораторна робота 5 — Мережева взаємодія в реальному часі

> _"The client is in the hands of the enemy."_

---

## 1. Загальний огляд Milestone 1 (M1) — Спільна симуляція та авторитетний сервер

1. **Спільний воркспейс `shared/`:**
   - Створено третій ізольований npm-пакет `shared/` (`workspaces: ["client", "server", "shared"]`).
   - Модулі симуляції (`shared/src/sim/`) ізоморфні та повністю очищені від DOM/Canvas/Node залежностей.
   - Реалізовано детермінований псевдовипадковий генератор `mulberry32` із зерном (`shared/src/prng.js`).
   - Описано схему протоколу (`shared/src/protocol/index.js`) та `JsonCodec` (`shared/src/codec/index.js`).

2. **Авторитетний серверний цикл `Match` (30 Hz):**
   - Реалізовано прецизійний таймер на базі абсолютного цільового часу (`nextTick += 1000/30; setTimeout(tick, nextTick - performance.now())`).
   - Сервер валідує вхідні пакети введення (`turn` обмежено `[-1, 1]`, булеві прапорці), розсилає `snapshot` із номером тику та підтвердженням `lastProcessedSeq`.
   - Ендпоінт `GET /api/stats` транслює статистику тривалості тику та джиттера.

3. **Інжектор штучної затримки та Netgraph:**
   - Інжектор затримки на сервері (`delayMs`, `jitterMs`, `dropRate`).
   - Оверлей Netgraph на клієнті для відстеження RTT, частоти тиків, віку снапшотів, бітрейту In/Out, черги `pendingInputs` та похибки `correction`.

---

## 2. Загальний огляд Milestone 2 (M2) — Client-Side Prediction & Server Reconciliation

У другому майлстоуні реалізовано алгоритм компенсації мережевої затримки (Gabriel Gambetta, частина 2):

1. **Клієнтське передбачення (Client-Side Prediction):**
   - Клієнт негайно застосовує локальні команди гравця до власного корабля через спільну функцію `integrate(ship, inputPacket, dt)`.
   - Корабель миттєво реагує на натискання клавіш керування навіть при затримці 100+ мс.
   - Усі відправлені команди буферизуються у черзі `pendingInputs: [{ seq, input, dt }]`.

2. **Узгодження з сервером (Server Reconciliation & Input Replay):**
   - При отриманні авторитетного `snapshot` від сервера клієнт зчитує `lastProcessedSeq[myPlayerId]`.
   - Усі підтверджені команди (`seq <= lastProcessedSeq`) видаляються з буфера `pendingInputs`.
   - Фізичний стан корабля встановлюється у стан із серверного знімка.
   - Усі непідтверджені команди, що залишилися в черзі (`seq > lastProcessedSeq`), послідовно **повторно застосовуються (replay)** за допомогою `integrate()`.
   - Завдяки детермінізму кінцевий розрахований стан збігається з передбаченим із субпіксельною точністю (похибка корекції `~0.0 px`).

3. **Згладжування візуальних корекцій (Correction Smoothing):**
   - При виникненні розбіжності між передбаченим і узгодженим положенням (наприклад, після зіткнення) обчислюється вектор похибки `errorDist = |predicted - reconciled|`.
   - Похибка передається у візуальне зміщення `ship.renderOffset`, яке експоненційно затухає за ~100 мс (`decay = Math.exp(-15 * dt)`).
   - Це повністю усуває візуальні ривки (rubber-banding) при корекції.

4. **Експеримент із порушенням детермінізму (Determinism Break):**
   - В оверлей Netgraph додано кнопку перемикання `Break Determinism (M2 Test)`.
   - При активації у клієнтське передбачення додається штучний випадковий шум (`Math.random()`).
   - Унаслідок порушення детермінізму значення `Correction Magnitude` у Netgraph миттєво зростає від `0.0 px` до `15–30+ px`, що наочно демонструє роботу механізму Reconciliation. При вимкненні похибка повертається до `0.0 px`.

---

## 3. Порівняння поведінки: Dumb Client (M1) vs Predicted Client (M2)

Тестування проведено при фіксованій затримці 100 мс (RTT ~200 мс):

| Показник Netgraph | Dumb Client (M1) | Predicted & Reconciled Client (M2) |
| :--- | :--- | :--- |
| **RTT** | ~200 мс | ~200 мс |
| **Відгук на введення** | Затримка ~100–120 мс | **Миттєвий (0 мс)** |
| **Pending Inputs** | 6–8 пакетів | 6–8 пакетів (активно реплеяться) |
| **Correction Magnitude (відкритий космос)** | 0.0 px (рух за снапшотом) | **0.00–0.01 px** (повний детермінізм) |
| **Correction Magnitude (Break Determinism)** | N/A | **18.4–32.7 px** (активне згладжування) |
| **Візуальна плавність** | 30 Hz сходинки | **60 Hz плавний рух без ривків** |

---

## 4. Результати тестування

1. **Модульні тести (`server/test/prediction.test.js`):**
   - `Client prediction with integrate() matches server physics step` — пройдено.
   - `Server reconciliation with input replay produces 0 correction when deterministic` — похибка `< 0.02 px`.
   - `Determinism break causes measurable reconciliation correction` — виявлення розбіжності `> 1.0 px`.
   - `Visual smoothing decay over 100ms dampens correction delta` — затухання дельти `< 2.5 px` за ~160 мс.
2. **Загальний стан:**
   - Бекенд-тести (`npm test`): **41 з 41 пройдено**.
   - Клієнтські тести (`npm run test:client`): **усі пройдено**.
   - Статичний аналіз (`npm run check`): **0 помилок** (ESLint + Prettier).
   - Збірка клієнта (`npm run build`): успішно (bundle `81 kB`).
