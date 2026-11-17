import process from 'node:process';
import { createServer } from '../src/server.js';

const PORT = 39821;
const { server, config } = createServer({
  port: PORT,
  host: '127.0.0.1',
});

// Periodic IPC/stdout reporter: output memory stats of THIS specific server process
setInterval(() => {
  const mem = process.memoryUsage();
  process.stdout.write(`SERVER_METRIC rss=${mem.rss} heapUsed=${mem.heapUsed} heapTotal=${mem.heapTotal} external=${mem.external}\n`);
}, 500);

server.listen(PORT, '127.0.0.1', () => {
  console.log(`BENCHMARK_SERVER_READY PID:${process.pid} PORT:${PORT}`);
});
