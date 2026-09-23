# Lab 01 — The Event Loop Is the Game Loop

A high-performance, deterministic 2D space flight simulation built in vanilla JavaScript (ES modules) demonstrating the event loop, execution model, and fixed-timestep accumulator game loop.

## Project Structure

```
dogfight/
├── index.html        # Viewport canvas and module entry point
├── package.json      # "type": "module" with dev, build, lint, and format scripts
├── .nvmrc            # Node 24 runtime pin
├── .prettierrc       # Prettier code formatting configuration
├── eslint.config.js  # ESLint flat config
├── src/
│   ├── main.js       # Composition root: wires canvas, input, loop, and sim
│   ├── loop.js       # createLoop({ step, simulate, render }) — fixed-step accumulator loop
│   ├── input.js      # createInput(target) — closure over keyboard state (isDown, justPressed)
│   ├── sim/
│   │   ├── ship.js   # Pure ship state + integrate(ship, input, dt)
│   │   └── arena.js  # Toroidal bounds & coordinate wrap-around
│   └── render/
│       ├── canvas.js # DPR-aware, window-resizable canvas setup
│       └── draw.js   # drawShip(ctx, ship), drawHud(ctx, stats), background & starfield
└── README.md
```

---

## Milestones Summary

### M1 — The Loop, With Proof
- Implemented `createLoop({ step = 1/60, simulate, render })` in `src/loop.js` using `requestAnimationFrame` and Glenn Fiedler's accumulator pattern with `Math.min(delta, 0.25)` clamp.
- Live in-game telemetry HUD displays:
  - **`steps/s`**: Simulation ticks per second (~60 Hz on all hardware).
  - **`frames/s`**: Display render refresh rate (60 Hz, 120 Hz, etc.).
  - **`frame ms`**: Frame delta duration in milliseconds (~16.6 ms at 60 Hz).

### M2 — Input as a Closure, Ship as Data
- `src/input.js` encapsulates active keyboard keys in a private `Set` via closures (`isDown`, `justPressed`, `resetJustPressed`).
- `src/sim/ship.js` models the ship as a pure data object `{ x, y, vx, vy, angle, thrust, reverse }`.
- `integrate(ship, input, dt)` is a pure mathematical function applying forward thrust, reverse retro-braking, turning, framerate-independent exponential drag (`Math.exp(-drag * dt)`), and velocity clamping.
- `src/sim/arena.js` wraps coordinates around the viewport edges without DOM dependencies.

### M3 — Render with Interpolation, Correctly
- The renderer caches `previousShip` and `currentShip` states, computing visual state via `alpha = accumulator / step`.
- **Shortest-Arc Angle Lerp**: Fixed the classic angle wrap bug across the $[-\pi, \pi]$ boundary using `((diff + 3π) % 2π) - π` so the ship never takes a 360° spin when turning through the seam.
- **DPR-Aware Canvas**: `setupCanvas` scales by `window.devicePixelRatio` and handles window resizing dynamically for crisp Retina rendering.
- **Visuals**: High-contrast slate and electric cyan ship, animated main thrust plume, wing retro-jets, and a full-screen procedural starfield powered by a Mulberry32 PRNG.

### M4 — The Three Experiments

#### Experiment 1: 100ms Synchronous Freeze
- **Observation**: Injecting `while (performance.now() < t + 100) {}` every 60th frame drops render FPS from 60 to ~48 FPS, with frame time spiking to ~106 ms.
- **Event Loop Explanation**: JavaScript runs on a single thread with run-to-completion semantics. When a synchronous loop blocks the Call Stack, the event loop cannot dequeue tasks, microtasks, or execute the browser's render pipeline (rAF, style, layout, paint). JavaScript cannot work around this on the same thread; heavy work must be offloaded to a Web Worker.

#### Experiment 2: `setInterval(frame, 16)` vs `requestAnimationFrame`
- **Observation**: `setInterval(frame, 16)` exhibits 5–14 ms frame jitter due to task queue scheduling delays, causing visible stutter. In background tabs, browsers throttle `setInterval` to ~1 Hz (wasting power), whereas `requestAnimationFrame` suspends completely (0 FPS, 0% CPU).

#### Experiment 3: Fixed vs Variable Timestep Trajectory
- **Observation**: Simulating 5.0 seconds of continuous thrust:
  - *Variable Timestep (60 FPS vs 6× Throttled 10 FPS)*: Final position diverged by **25.14 px** due to integration errors over varying $\Delta t$.
  - *Fixed Timestep with Accumulator*: Produced identical **1329.8315 px** trajectory across both frame rates (**0.0000 px drift**).
- **Multiplayer Significance**: Fixed-timestep determinism is mandatory for lockstep networking, client prediction, and server reconciliation (Lab 5).

---

## Deliverables Checklist

- [x] Vite project with `"type": "module"`, `.nvmrc` (Node 24), ESLint, and Prettier.
- [x] `createLoop` with rAF + clamped accumulator; HUD exposes `steps/s`, `frames/s`, and `frame ms`.
- [x] `createInput` closure with `isDown` and `justPressed`.
- [x] Pure `integrate(ship, input, dt)` with forward/reverse thrust; pure arena wrap-around.
- [x] Interpolated rendering with shortest-arc angle lerp; DPR-aware resizable canvas.
- [x] Experiments 1–3 measured and documented with event-loop explanations.
- [x] Git tag `lab-01`.
