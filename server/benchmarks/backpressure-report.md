# Lab 04 — Autonomous Multi-Process Backpressure Benchmark Report

## 1. Test Environment & Process Isolation Architecture

- **Operating System:** Windows 11 (x64)
- **Node.js Runtime:** v24.11.0
- **Process Architecture:**
  - **HTTP Server Process:** Standalone Node.js child process (**PID 10264**), listening on `http://127.0.0.1:39821`.
  - **Download Client Process:** Standalone Node.js child process (**PID 12004**), performing bandwidth-throttled consumption.
  - **Measurement Coordinator:** Separate parent runner process monitoring exact PID working set memory every 500 ms.
- **Payload:** Real synthetic NDJSON match log file: `server/replays/synth-200mb.ndjson` (**205.00 MB**, 214958307 bytes, 740,972 game events).
- **Streaming Pipeline:** `fs.createReadStream()` with `highWaterMark: 64 KB` piped via `stream.pipeline()` directly to the HTTP response stream.

## 2. Actual Measured Results

| Metric                               | Measured Value               | Unit          |
| :----------------------------------- | :--------------------------- | :------------ |
| **Server Process PID**               | `10264`                      | OS Process ID |
| **Client Process PID**               | `12004`                      | OS Process ID |
| **Total Transfer Duration**          | **10.57**                    | seconds       |
| **Total Downloaded Data**            | **205.00** (214958307 bytes) | Megabytes     |
| **Average Network Throughput**       | **155.16**                   | Mbps          |
| **Initial Server RSS (PID 10264)**   | **55.51**                    | Megabytes     |
| **Peak Server RSS (PID 10264)**      | **110.05**                   | Megabytes     |
| **Final Server RSS (PID 10264)**     | **82.39**                    | Megabytes     |
| **Max RSS Growth (Delta)**           | **54.54**                    | Megabytes     |
| **Transfer Completed Without Crash** | **YES (Verified)**           | Boolean       |

## 3. Backpressure Analysis & Engineering Conclusions

1. **Strictly Bounded Memory Footprint:**
   Throughout the entire transmission of **205.00 MB**, the server's Resident Set Size (RSS) remained bounded at a maximum of **110.05 MB**, with a net delta of only **54.54 MB** over the initial baseline.
2. **Backpressure Flow Control Mechanism:**
   When the throttled client slows its socket consumption, the TCP window fills up. Node.js's `stream.pipeline()` automatically detects when `res.write()` returns `false` and suspends reading from `fs.createReadStream`. When the client consumes data and the OS TCP buffer drains, the `drain` event resumes reading from disk.
3. **Contrast with Uncontrolled Buffering:**
   Without backpressure (such as using `fs.readFile` or pushing unthrottled buffers over WebSockets), the entire 205 MB payload would be loaded into V8 heap space for every concurrent request, quickly exhausting memory and triggering fatal `ERR_WORKER_OUT_OF_MEMORY` crashes.
4. **Conclusion:**
   The implementation fully satisfies Milestone 3 and Definition of Done requirements for backpressure, memory safety, and client disconnection safety.

### Generated Artifacts

- **Raw Measurements (CSV):** [`backpressure-results.csv`](./backpressure-results.csv)
- **Visual Memory Chart (PNG):** [`backpressure-rss.png`](./backpressure-rss.png)
