import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
  },
  plugins: [
    {
      name: 'delay-and-status-middleware',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = new URL(req.url, 'http://localhost');

          // Check if artificial delay is requested
          const delayParam = url.searchParams.get('delay');
          const delayMs = delayParam ? parseInt(delayParam, 10) : 0;

          // Check for simulated status code route (e.g., /api/status/500, /api/status/404)
          const statusMatch = url.pathname.match(/^\/api\/status\/(\d+)/);
          if (statusMatch) {
            const statusCode = parseInt(statusMatch[1], 10);
            const sendResponse = () => {
              res.statusCode = statusCode;
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  status: statusCode,
                  message: `Simulated HTTP status ${statusCode}`,
                })
              );
            };
            if (delayMs > 0) {
              setTimeout(sendResponse, delayMs);
            } else {
              sendResponse();
            }
            return;
          }

          // Slow asset request (e.g. /assets/sprites/ship.png?delay=600)
          if (delayMs > 0) {
            setTimeout(() => {
              next();
            }, delayMs);
            return;
          }

          next();
        });
      },
    },
  ],
});
