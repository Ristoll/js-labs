# Lab 07 — Engine Performance Benchmark Report

## Test Environment
- **Runtime:** Node.js v24.11.0
- **Step dt:** 0.016666666666666666s (60 Hz target)
- **Benchmark duration:** 5s per entity count
- **Arena:** 1200x800 with wrap-around

## Results

| Entities | Ticks | Elapsed (s) | Ticks/s | Entities/s | RSS (MB) |
|----------|-------|-------------|---------|------------|----------|
| 100 | 334 073 | 5.000 | 66813.9 | 6 681 390,246 | 0.08 |
| 500 | 68 850 | 5.000 | 13769.7 | 6 884 843,439 | 0.13 |
| 1000 | 34 850 | 5.000 | 6969.9 | 6 969 945,495 | 0.13 |
| 2000 | 17 153 | 5.000 | 3430.5 | 6 861 043,157 | 0.20 |

## Analysis

- **Baseline (100 entities):** 66813.9 ticks/s, 6 681 390,246 entities/s
- **Peak (2000 entities):** 0.20 MB RSS
- **RSS growth:** 0.12 MB from baseline to peak

## Generated Artifacts
- Raw measurements: `simulation-results.csv`

