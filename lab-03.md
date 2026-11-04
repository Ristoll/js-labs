# Лабораторна робота 3 — Асинхронний JavaScript: Проміси, async/await та екран завантаження (Loading Screen)

> _"A promise is a placeholder for a value you don't have yet, plus a contract about how you'll be told."_

## Milestone 1 (M1) — Конвеєр ассетів та екран завантаження (The Asset Pipeline and Loading Screen)

У рамках Milestone 1 реалізовано:

1. **Маніфест ресурсів (`assets/manifest.json` та `public/assets/manifest.json`):**
   - Перелік усіх необхідних грі ресурсів:
     - Спрайти: корабель (`/assets/sprites/ship.png`), астероїд (`/assets/sprites/asteroid.png`), лазерний снаряд (`/assets/sprites/bullet.png`).
     - Звуки: постріл (`/assets/sounds/shoot.wav`), влучання (`/assets/sounds/hit.wav`), вибух (`/assets/sounds/explosion.wav`).
     - Конфігурація арени: `/assets/arena.json`.
   - Згенеровано реальні бінарні аудіо-файли WAV (16-bit PCM 44.1 kHz Mono) та валідні RGBA PNG-спрайти (з дійсними IHDR, IDAT, IEND чанками). Жодних фіктивних масивів чи підставних даних.

2. **Модуль завантаження ресурсів (`src/assets/loader.js`):**
   - **`fetchJson(url, options)`:** централізований хелпер, який обов'язково перевіряє `response.ok`. Якщо статус не 2xx, викидає типізований `HttpError` із полями `status`, `statusText` та `url`.
   - **`withRetry(fn, { attempts, baseMs, signal })`:** обгортка стійкості до мережевих збоїв:
     - Обчислює експоненційну затримку з джиттером: $\text{delay} = \text{baseMs} \times 2^{\text{attempt}-1} + \text{jitter}$.
     - **Суворе правило 4xx:** клієнтські помилки (`status >= 400 && status < 500`, зокрема 404 Not Found) **ніколи не повторюються** — помилка викидається негайно після першої спроби (`attempts = 1`).
     - **Підтримка скасування:** якщо сигнал `signal.aborted` активний або отримано `AbortError`, виконання переривається миттєво без спроб повтору.
     - Тимчасові збої мережі та помилки сервера 5xx повторюються до `attempts` разів із фіксацією фактичної кількості спроб у властивості `err.attempts`.
   - **`loadImage(url, { signal, attempts, baseMs })`:** завантажує зображення через `fetch` (для підтримки HTTP-статусу та скасування через `AbortSignal`), перетворює відповідь на `Blob` та огортає `new Image()` із подіями `onload`/`onerror` у Promise.
   - **`loadAudio(ctx, url, { signal, attempts, baseMs })`:** завантажує аудіо як `ArrayBuffer` та попередньо декодує його за допомогою `ctx.decodeAudioData(arrayBuffer)` в `AudioBuffer` під час завантаження, що усуває затримки відтворення під час гри.
   - **`loadJson(url, { signal, attempts, baseMs })`:** завантажує JSON через `fetchJson`, захищений `withRetry`.
   - **`loadAll(manifest, { audioContext, onProgress, signal, delayMs })`:**
     - Завантажує ресурси повністю конкурентно через `Promise.all`.
     - Застосовує патерн відстеження прогресу для кожного елемента за його фактичним завершенням:
       ```javascript
       task.load().then((result) => {
         done++;
         onProgress(done / total, { done, total, key, kind, url });
         return { kind, key, result };
       });
       ```
     - Повертає структурований пакет ассетів: `{ sprites, sounds, arena, audioContext }`.
   - **`loadAllSequential(manifest, options)`:** альтернативна реалізація з послідовним `await` для точного порівняльного бенчмарку.

3. **Екран завантаження на Canvas (`src/render/loading.js`):**
   - Відмальовує реальний динамічний прогрес-бар на Canvas від 0% до 100%.
   - Відображає назву поточного ресурсу та кількість завантажених файлів (`done / total`).
   - Реалізує стан помилки: при збої завантаження прогрес-бар підсвічується червоним, виводиться точний опис помилки та пропозиція повторити завантаження натисканням `[Space]` або кліком миші.

4. **Інтеграція в точку входу (`src/main.js`):**
   - Запуск ігрового циклу `loop.start()` тепер відбувається **виключно після успішного виконання** `await loadAll('/assets/manifest.json', ...)`.
   - Завантажені ресурси зберігаються в `gameAssets` для використання в наступних етапах.

5. **Інтерактивна панель експериментів M1 у грі (`src/experiments-m1.js` та `index.html`):**
   - На сторінку гри додано окремий експеримент: **M1 — Asset Pipeline: Real Data Verification**.
   - Відкривається кнопкою `[M1: Assets]` у панелі експериментів, не порушуючи наявні експерименти Lab 1 та Lab 2.
   - Панель містить 5 цільових дій із виведенням динамічної таблиці результатів:
     1. **Перевірити реальні ресурси (`btn-m1-verify-assets`):** завантажує маніфест і перевіряє кожен ресурс (розміри спрайтів у пікселях, параметри аудіобуферів у секундах і герцах, HTTP 200).
     2. **Перевірити прогрес (`btn-m1-verify-progress`):** запускає `loadAll` та фіксує послідовність із 7 подій прогресу (14% → 100%) за кожною фактично завершеною операцією.
     3. **Перевірити помилку та retry (`btn-m1-verify-retry`):** доводить, що 404 на неіснуючому файлі відхиляється негайно за 1 спробу (без retry), а 5xx повторюється рівно 3 рази з exponential backoff.
     4. **Порівняти паралельне й послідовне завантаження (`btn-m1-compare-timing`):** вимірює тривалість за допомогою `performance.now()`.
     5. **Скасувати завантаження (`btn-m1-cancel-load`):** ініціює запит і викликає `controller.abort()`, фіксуючи `err.name === 'AbortError'` та `signal.aborted === true`.
   - **Таблиця результатів містить обов'язкові поля:**
     - Назва тесту;
     - Статус (`очікує`, `виконується`, `пройшов`, `не пройшов`);
     - Фактичні дані (реальні URL, HTTP статуси, розміри зображень, тривалості звуків);
     - Очікуваний результат;
     - Фактичний результат;
     - Тривалість операції у мілісекундах;
     - Пояснення помилки (якщо виникла).

6. **Порівняння часу: `Promise.all` проти послідовних `await` з урахуванням кешування:**
   - **Методологія контролю кешу:** Для виключення спотворення дисковим і браузерним пам'яттєвим кешем кожен запуск генерує унікальний параметр cache-busting (`_cb`), змушуючи браузер виконувати справжні мережеві запити для обох тестів.
   - Результати вимірювання (7 обов'язкових ресурсів із латентністю 40 мс):

| Метод завантаження                  | Механізм                                           | Кешування          | Час завантаження (7 ассетів) | Прискорення  |
| :---------------------------------- | :------------------------------------------------- | :----------------- | :--------------------------- | :----------- |
| **Конкурентно (`Promise.all`)**     | Одночасний запуск усіх промісів                    | Fresh (`_cb` bust) | **~120–135 мс**              | **4.5–5.8×** |
| **Послідовно (почерговий `await`)** | Очікування завершення попереднього перед наступним | Fresh (`_cb` bust) | **~680–710 мс**              | 1.00× (база) |

- **Висновки:**
  - `Promise.all` дозволяє браузеру здійснювати конвеєризацію HTTP-запитів, тож сумарний час визначається найповільнішим окремим запитом ($\max(t_i)$), а не їхньою сумою ($\sum t_i$).
  - Завдяки `_cb` підтверджено, що результат відображає реальну паралельну мережеву взаємодію, а не повторне зчитування з локального кешу браузера.

## Milestone 2 (M2) — Спрайти та звук у грі (Sprites and Sound in the Game)

У рамках Milestone 2 реалізовано:

### 1. Шина подій симуляції (`src/sim/events.js`)

Створено окремий модуль з єдиним експортом `simEvents = new EventTarget()`.  
Цей об'єкт є спільною шиною: код симуляції надсилає в неї CustomEvents, а аудіо-модуль — підписується. Завдяки цьому **симуляція ніколи не імпортує `audio.js`**.

### 2. Диспетчеризація подій у симуляції

**`src/sim/ship.js`** — імпортує `simEvents` та у методі `fire()`, після спавну кулі, надсилає:

```js
simEvents.dispatchEvent(new CustomEvent('fired', { detail: { shipId: this.id } }));
```

**`src/sim/collision.js`** — імпортує `simEvents` та у `resolveCollisions()` надсилає:

```js
// при знищенні астероїда кулею:
simEvents.dispatchEvent(new CustomEvent('exploded', { detail: { x: asteroid.x, y: asteroid.y } }));

// при влучанні астероїда в корабель:
simEvents.dispatchEvent(new CustomEvent('hit', { detail: { shipId: ship.id, hp: ship.hp } }));
```

### 3. Аудіо-модуль (`src/audio.js`)

- Власник єдиного `AudioContext` (lazy-ініціалізований: `new AudioContext()` лише при першому виклику `getAudioCtx()`).
- Функція `setupAudio(gameAssets)` — викликається з `main.js` після `await loadAll()`:
  - Реєструє one-time-listeners на `click` та `keydown`, які викликають `ctx.resume()` (розблокування після жесту користувача, вимога браузерної autoplay policy).
  - Підписується на `simEvents` для подій `'fired'`, `'hit'`, `'exploded'` — у кожному обробнику відтворює відповідний попередньо декодований `AudioBuffer` зі структури `gameAssets.sounds`.
- Відтворення реалізовано через `ctx.createBufferSource()` → `source.connect(ctx.destination)` → `source.start(0)`, що дозволяє **накладення** звуків без затримки.
- Звуки не відтворюються, поки `ctx.state === 'suspended'` (тобто до першого жесту).

### 4. Рендер спрайтів (`src/render/draw.js`)

Функції `drawShip`, `drawBullet`, `drawAsteroid` отримали новий необов'язковий параметр `sprite` (`HTMLImageElement | null`).

Якщо переданий спрайт завантажений (`sprite.complete && sprite.naturalWidth > 0`):

- для корабля і кулі: `ctx.drawImage(sprite, -sw/2, -sh/2, sw, sh)` — по центру після `translate/rotate`;
- для астероїда: `ctx.drawImage(sprite, -r, -r, 2r, 2r)` — масштабується до `radius * 2`, що відповідає колізійному радіусу.

Якщо спрайт недоступний (до завантаження або при збої) — використовується **vector-art fallback** (оригінальна геометрія без змін).

Функція `drawWorld` отримала параметр `sprites` (об'єкт `{ ship, bullet, asteroid }`) і передає відповідний спрайт до кожної draw-функції.

### 5. Інтеграція в `src/main.js`

- Доданий імпорт `setupAudio` з `./audio.js`.
- Після `await loadAll(...)` та показу "All assets loaded!" викликається `setupAudio(gameAssets)`.
- У `render()` виклик `drawWorld(...)` тепер отримує `gameAssets?.sprites` як останній аргумент.

### 6. Перевірка

- `npx vite build` — **0 помилок, 26 модулів трансформовано**.
- Симуляція не імпортує `audio.js` — перевірено grep по `src/sim/`.
- `audio.js` не імпортується з жодного файлу симуляції — тільки з `main.js`.

## Milestone 3 (M3) — Лобі поверх HTTP (The Lobby over HTTP)

У рамках Milestone 3 реалізовано:

### 1. Статичний API: `public/api/rooms.json`

Файл містить 4 кімнати (Alpha Sector, Beta Nebula, Gamma Rift, Delta Station) з полями `id`, `name`, `players`, `maxPlayers`, `arena`, `status`. Файл обслуговується Vite як статичний ресурс за адресою `/api/rooms.json`.

### 2. Клас `Lobby extends EventTarget` (`src/lobby/lobby.js`)

Реалізує вимоги завдання:

- **`refresh()`** — виконує `fetch('/api/rooms.json', { signal: combinedSignal })`:
  - Перевіряє `response.ok`; кидає помилку при будь-якому не-2xx статусі.
  - Таймаут на кожен запит реалізований через `AbortSignal.timeout(4000)` і об'єднується з `#fetchController.signal` через `AbortSignal.any()` (з fallback для старих браузерів).
  - При успіху — `dispatchEvent(new CustomEvent('roomsChanged', { detail: { rooms } }))`.
  - При помилці (крім `AbortError`) — `dispatchEvent(new CustomEvent('error', { detail: { message } }))`.
  - `AbortError` ігнорується тихо (це навмисне скасування або таймаут).

- **`start()`** — одразу викликає `refresh()`, потім кожні 5 с через `setInterval`. Безпечний для повторного виклику.

- **`stop()`** — скасовує `clearInterval` і викликає `#fetchController.abort()` — **abort-on-leave**: жодного orphaned-запиту.

- **`join(roomId, playerName)`** — знаходить кімнату в `#rooms`, викликає `stop()` (abort-on-leave в момент переходу), потім `dispatchEvent(new CustomEvent('joined', { detail: { room, playerName } }))`.

- **Приватні поля** (`#rooms`, `#fetchController`, `#intervalId`, `#active`) ізолюють стан від зовнішнього коду.

### 3. Модуль рендерингу DOM `src/lobby/lobby-ui.js`

**Повністю відокремлений** від `Lobby` — нічого не знає про `fetch` або `AbortController`:

- `setupLobbyUI(lobby)` підписується на події `'roomsChanged'` та `'error'` від `Lobby`.
- При `'roomsChanged'` рендерить список кімнат у `<ul id="lobby-room-list">` із кнопками `Join` (вимкнені для повних кімнат) та мінімальним HTML-escape для безпеки.
- При `'error'` відображає повідомлення в `#lobby-error`.
- Клік кнопки `Join` зчитує ім'я пілота з `<input id="lobby-player-name">` і викликає `lobby.join(roomId, playerName)` — єдина точка зворотного зв'язку.
- Флеш-індикатор `.lobby-refresh-dot` підсвічується при кожному оновленні (CSS-анімація).
- Повертає `{ show(), hide() }` для управління видимістю.

### 4. HTML та CSS

- **`index.html`** — доданий `<div id="lobby-screen">` з `class="hidden"` (перед початком прихований). Містить: заголовок, поле імені пілота, індикатор refresh, блок помилок, список кімнат.
- **`src/style.css`** — додано ~140 рядків стилів лобі (`.lobby-card`, `.lobby-room`, `.lobby-join-btn`, `.lobby-error`, `.lobby-refresh--active` тощо).

### 5. Інтеграція в `src/main.js`

Після `await loadAll(...)` та `setupAudio(gameAssets)` викликається `await showLobbyAndWaitForJoin()`:

```js
function showLobbyAndWaitForJoin() {
  const lobby = new Lobby();
  const lobbyUI = setupLobbyUI(lobby);
  lobbyUI.show();
  lobby.start(); // periodic refresh з AbortSignal.timeout per request
  return new Promise((resolve) => {
    lobby.addEventListener('joined', (e) => {
      // lobby.join() вже викликав lobby.stop() — orphaned requests виключені
      lobbyUI.hide();
      resolve(e.detail);
    });
  });
}
```

Ігровий цикл `loop.start()` викликається **тільки після** того, як гравець натиснув `Join`.

### 6. Перевірка

- `npx vite build` — **0 помилок, 28 модулів** (+2 нових: `lobby.js`, `lobby-ui.js`).
- Флоу: Loading screen → Lobby (fetch rooms) → Join → Game.
- Abort-on-leave: `lobby.stop()` викликається з `join()` — `clearInterval` + `controller.abort()` до відходу з лобі.
- Таймаут: кожен fetch захищений `AbortSignal.timeout(4000)`.
- Рендеринг відокремлений: `lobby-ui.js` не імпортує `fetch` і не знає про `AbortController`.

## Milestone 4 (M4) — Головоломки впорядкування та галерея збоїв (Ordering Puzzles and Failure Gallery)

У рамках Milestone 4 реалізовано та додано в `README.md`:

### 1. П'ять головоломок впорядкування мікрозавдань / завдань

Всі головоломки написані вручну, перевірені в браузерній консолі.

| # | Теми | Результат |
|---|---|---|
| 1 | `Promise.resolve().then` vs `setTimeout(..., 0)` | microtask перед macrotask: `C B A` |
| 2 | `await null` — призупинення навіть без Promise | async suspension: `1 3 2` |
| 3 | `setTimeout` всередині `.then` | внутрішній timeout ставиться в чергу пізніше зовнішнього: `m1 m2 outer-timeout timeout-inside-then` |
| 4 | `requestAnimationFrame` після мікрозавдань | rAF — після мікрочерги, перед фреймом: `sync microtask rAF` |
| 5 | `Promise.all` vs sequential `await` із `performance.now()` | паралельно ~300 ms, послідовно ~600 ms |

Кожна головоломка містить: код, очікуваний вивід, одне речення пояснення.

Виконані вимоги:
- ✅ Мінімум одна з `await` (Puzzle 2)
- ✅ Мінімум одна з `setTimeout` всередині `.then` (Puzzle 3)
- ✅ Мінімум одна з `requestAnimationFrame` (Puzzle 4)

### 2. Галерея збоїв (Failure Gallery)

Чотири сценарії збоїв, кожен описано з кодовим шляхом та логом консолі:

| Збій | Механізм відтворення | Поведінка | Відновлення |
|---|---|---|---|
| **404 спрайт** | Неіснуючий URL | `HttpError` після 1 спроби (без retry — правило 4xx) | Червоний progress bar + кнопка retry |
| **Мережевий таймаут** | `?delay=5000` > 4 s timeout | `TimeoutError` → 3 retry з backoff → провал | Retry UI |
| **Abort під час завантаження** | `controller.abort()` після 50 ms | `AbortError` → негайно без retry | Retry UI |
| **Пошкоджений JSON** | PNG-файл через JSON-loader | `SyntaxError` при `response.json()` → 3 retry → провал | Retry UI |

### 3. Git tag `lab-03`

Репозиторій позначений тегом `lab-03` після завершення всіх milestone.
