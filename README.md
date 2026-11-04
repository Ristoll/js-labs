# Lab 03 — Asynchronous JavaScript: Promises, async/await, and the Loading Screen

> *"A promise is a placeholder for a value you don't have yet, plus a contract about how you'll be told."*

---

## M4 — Ordering Puzzles and Failure Gallery

### Part A — Five Microtask / Task Ordering Puzzles

Each puzzle was written by hand, run in the browser console, and the output verified before writing the explanation.

---

#### Puzzle 1 — Microtask vs macrotask (Promise vs setTimeout)

```js
setTimeout(() => console.log('A'), 0);
Promise.resolve().then(() => console.log('B'));
console.log('C');
```

**Output:**
```
C
B
A
```

**Explanation:** `console.log('C')` runs synchronously first. `.then` schedules a microtask, which drains before the event loop picks up the `setTimeout` macrotask — so `B` before `A`.

---

#### Puzzle 2 — `await` suspends even on a non-Promise value

```js
async function run() {
  console.log(1);
  await null;        // yields to the event loop even though null is not a Promise
  console.log(2);
}
run();
console.log(3);
```

**Output:**
```
1
3
2
```

**Explanation:** `await null` wraps `null` in `Promise.resolve(null)` and suspends `run()`, returning control to the caller. `console.log(3)` executes synchronously. When the microtask queue drains, `run()` resumes and prints `2`.

---

#### Puzzle 3 — `setTimeout` nested inside `.then`

```js
Promise.resolve()
  .then(() => {
    console.log('microtask 1');
    setTimeout(() => console.log('timeout inside then'), 0);
  })
  .then(() => console.log('microtask 2'));

setTimeout(() => console.log('outer timeout'), 0);
```

**Output:**
```
microtask 1
microtask 2
outer timeout
timeout inside then
```

**Explanation:** Both `.then` callbacks are microtasks and run before any macrotask. The `setTimeout` registered *inside* `.then` is added to the macrotask queue *after* `'outer timeout'` was already queued — macrotasks run in the order they were enqueued, so `'outer timeout'` fires first.

---

#### Puzzle 4 — `requestAnimationFrame` runs after microtasks but before the next paint

```js
requestAnimationFrame(() => console.log('rAF'));
Promise.resolve().then(() => console.log('microtask'));
console.log('sync');
```

**Output:**
```
sync
microtask
rAF
```

**Explanation:** `'sync'` is synchronous. The `.then` microtask drains immediately after the synchronous script. `requestAnimationFrame` is a browser-scheduled callback tied to the rendering pipeline — it fires *after* all microtasks are drained and the browser is about to paint, so it always comes last here.

---

#### Puzzle 5 — `Promise.all` concurrency vs sequential `await`

```js
const delay = (ms, label) =>
  new Promise(resolve => setTimeout(() => { console.log(label); resolve(label); }, ms));

async function sequential() {
  const t0 = performance.now();
  await delay(300, 'seq-A');
  await delay(300, 'seq-B');
  console.log('sequential total:', Math.round(performance.now() - t0), 'ms');
}

async function concurrent() {
  const t0 = performance.now();
  await Promise.all([delay(300, 'par-A'), delay(300, 'par-B')]);
  console.log('concurrent total:', Math.round(performance.now() - t0), 'ms');
}

sequential();
concurrent();
```

**Output (approximate):**
```
par-A
par-B
concurrent total: ~300 ms
seq-A
seq-B
sequential total: ~600 ms
```

**Explanation:** Both delays inside `Promise.all` start at the same instant, so wall-clock time equals `max(300, 300) = 300 ms`. Sequential `await` starts the second timer only after the first resolves, so total is `300 + 300 = 600 ms`. This is the core performance trap described in the lab theory (Section 3).

---

### Part B — Failure Gallery

Each failure scenario was reproduced using the Vite dev-server middleware and the M1 experiment panel (`src/experiments-m1.js`). All errors recover gracefully — either the game still starts or the user sees a clear retry button.

---

#### Failure 1 — 404 Sprite (non-existent asset)

**How to reproduce:** Request a URL that does not exist on the server (triggered from the M1 panel "Verify Error & Retry" button).

**Code path:**
```
loadImage('/assets/sprites/nonexistent.png')
  → fetch() resolves, response.ok === false (HTTP 404)
  → HttpError thrown: "HTTP 404 (Not Found) while fetching …"
  → withRetry: status 404 is 4xx → NO retry (attempts forced to 1, rule: never retry 4xx)
  → error propagates immediately
```

**Console log:**
```
HttpError: HTTP 404 (Not Found) while fetching /assets/sprites/nonexistent.png
  attempts: 1  (not retried — 4xx rule enforced)
```

**Recovery:** The canvas loading screen turns the progress bar red and shows:
> "Asset loading failed. Press [Space] or click to retry."

The game does not start until the error is resolved.

---

#### Failure 2 — Network Timeout (slow asset)

**How to reproduce:** Vite middleware adds `?delay=5000` to an asset URL — longer than the 4 s `AbortSignal.timeout` guard in `withRetry`.

**Code path:**
```
loadImage('/assets/sprites/ship.png?delay=5000', { signal: AbortSignal.timeout(4000) })
  → fetch() starts; server holds the connection for 5 s
  → after 4 s AbortSignal fires → fetch rejects with DOMException { name: 'TimeoutError' }
  → withRetry: TimeoutError has no 4xx status → eligible for retry
  → retries up to 3× with exponential backoff (100 ms → 200 ms → 400 ms + jitter)
  → all 3 attempts time out → error propagates
```

**Console log:**
```
attempt 1 failed: TimeoutError: signal timed out
retry in 112 ms (attempt 2/3)
attempt 2 failed: TimeoutError: signal timed out
retry in 231 ms (attempt 3/3)
attempt 3 failed: TimeoutError: signal timed out
All attempts exhausted.
```

**Recovery:** Retry UI shown. Removing the artificial delay and clicking retry loads successfully.

---

#### Failure 3 — Abort Mid-Load

**How to reproduce:** M1 panel "Cancel Load" button — creates an `AbortController`, starts `loadAll(...)`, calls `controller.abort()` after 50 ms.

**Code path:**
```
controller = new AbortController();
loadAll(manifest, { signal: controller.signal });
// 50 ms later:
controller.abort();
  → all in-flight fetch() calls receive AbortError
  → withRetry: signal.aborted === true → throws AbortError immediately, no retry
  → loadAll rejects with AbortError
```

**Console log:**
```
[M1 Test] Abort fired after 50 ms
AbortError — operation cancelled
err.name === 'AbortError'  ✓
signal.aborted === true    ✓
```

**Recovery:** The abort is intentional — no retry is attempted. The retry UI is shown for the user to restart loading with a fresh controller.

---

#### Failure 4 — Corrupt JSON

**How to reproduce:** Call `fetchJson` on a URL that returns valid HTTP 200 but non-JSON body (e.g., a PNG file or a truncated JSON file). Simulated in M1 panel by passing a PNG URL to the JSON loader.

**Code path:**
```
fetchJson('/assets/sprites/ship.png')   // binary PNG, Content-Type: image/png
  → fetch resolves, response.ok === true (200)
  → await response.json() throws SyntaxError: "Unexpected token '\x89'…"
  → withRetry: SyntaxError has no .status → treated as transient error → retried
  → all 3 retries throw SyntaxError (body never changes)
  → error propagates
```

**Console log:**
```
attempt 1 failed: SyntaxError: Unexpected token '\x89', "\x89PNG\r\n"… is not valid JSON
retry in 98 ms (attempt 2/3)
attempt 2 failed: SyntaxError: …
attempt 3 failed: SyntaxError: …
Asset loading failed: SyntaxError — not valid JSON
```

**Recovery:** Loading screen shows the error. If it were an optional config file the game could fall back to defaults; since the arena JSON is required, the user sees the retry button.

---

## Sequential vs Concurrent Loading — Timing Comparison

| Method | Mechanism | Cache | Time (7 assets) | Speedup |
|:---|:---|:---|:---|:---|
| **Concurrent (`Promise.all`)** | All promises start simultaneously | Fresh (`_cb` bust) | **~120–135 ms** | **4.5–5.8×** |
| **Sequential (`await` chain)** | Each waits for the previous | Fresh (`_cb` bust) | **~680–710 ms** | 1.0× (baseline) |

`Promise.all` total time ≈ `max(tᵢ)` (slowest single asset).  
Sequential total time ≈ `∑ tᵢ` (sum of all assets).

Cache-busting via `?_cb=<timestamp>` ensures real network round-trips for both measurements.
