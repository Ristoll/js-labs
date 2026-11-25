# Lab 07 — Server Load Test Report

## Method
- Headless WebSocket clients (`ws`) connect to `ws://localhost:3098/ws`, join room `loadtest`, and send scripted input each tick.
- Ramp: `8, 32, 64, 128` concurrent clients.
- Each level runs for `6s`, polling `/api/stats` for server tick duration.
- Tick budget: `33ms` (30 Hz server tick rate).

## Results

| Clients | Connected | p99 Last Tick (ms) | Max Last Tick (ms) | p99 Avg Tick (ms) | Over Budget |
|---------|-----------|--------------------|--------------------|-------------------|-------------|
| 8 | 8 | 0.05 | 0.05 | 0.03 | no |
| 32 | 32 | 0.06 | 0.06 | 0.05 | no |
| 64 | 64 | 0.03 | 0.03 | 0.03 | no |
| 128 | 128 | 0.01 | 0.01 | 0.01 | no |

## Capacity

**Measured capacity: `128` concurrent clients** before the server tick exceeded the `33ms` budget (not reached within the ramp).

## Generated Artifacts
- Raw measurements: `load-test-results.csv`
- Chart: `load-test-chart.png`

