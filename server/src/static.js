import fs from 'node:fs';
import path from 'node:path';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ndjson': 'application/x-ndjson; charset=utf-8',
};

/**
 * Serves a static file from rootDir securely.
 * Protects against path traversal attacks.
 */
export function serveStatic(req, res, rootDir) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(url.pathname);

  if (pathname === '/') {
    pathname = '/index.html';
  }

  // Path traversal protection
  const safePath = path.normalize(path.join(rootDir, pathname));
  if (!safePath.startsWith(path.normalize(rootDir))) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Forbidden: Path traversal detected' }));
    return true;
  }

  let stat;
  try {
    stat = fs.statSync(safePath);
    if (stat.isDirectory()) {
      const indexPath = path.join(safePath, 'index.html');
      if (fs.existsSync(indexPath)) {
        return serveFile(res, indexPath, fs.statSync(indexPath));
      }
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Directory listing forbidden' }));
      return true;
    }
  } catch {
    return false; // File not found in static dir
  }

  return serveFile(res, safePath, stat);
}

function serveFile(res, filePath, stat) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  // Caching headers
  // Cache hashed assets aggressively; index.html no-cache
  const isHtml = ext === '.html';
  const cacheControl = isHtml
    ? 'no-cache, no-store, must-revalidate'
    : 'public, max-age=31536000, immutable';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'Cache-Control': cacheControl,
    'Last-Modified': stat.mtime.toUTCString(),
  });

  const stream = fs.createReadStream(filePath);
  stream.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Failed to read file' }));
    }
  });
  stream.pipe(res);
  return true;
}
