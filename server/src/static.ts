import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const MIME_TYPES: Record<string, string> = {
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
 * Protects against path traversal attacks, malformed URLs, and symlink escapes.
 */
export function serveStatic(req: IncomingMessage, res: ServerResponse, rootDir: string): boolean {
  const rawUrl = req.url ?? '/';

  if (
    rawUrl.includes('\0') ||
    rawUrl.includes('..') ||
    rawUrl.includes('%2e%2e') ||
    rawUrl.includes('%2E%2E') ||
    rawUrl.includes('%00')
  ) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Forbidden: Path traversal detected' }));
    return true;
  }

  const host = req.headers.host ? (Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host) : 'localhost';
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl, `http://${host}`);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Bad Request: Malformed URL' }));
    return true;
  }

  let pathname: string;
  try {
    pathname = decodeURIComponent(parsedUrl.pathname);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Bad Request: Invalid URI component' }));
    return true;
  }

  if (pathname === '/') {
    pathname = '/index.html';
  }

  const resolvedRoot = path.resolve(rootDir);
  const resolvedTarget = path.resolve(resolvedRoot, '.' + path.sep + pathname.replace(/^[/\\]+/, ''));

  const relative = path.relative(resolvedRoot, resolvedTarget);
  const isContained = !relative.startsWith('..') && !path.isAbsolute(relative);

  if (!isContained) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Forbidden: Path traversal detected' }));
    return true;
  }

  let stat: fs.Stats;
  let realFilePath: string;
  try {
    stat = fs.statSync(resolvedTarget);
    realFilePath = fs.realpathSync(resolvedTarget);
  } catch {
    return false; // File not found in static dir
  }

  let realRoot: string;
  try {
    realRoot = fs.realpathSync(resolvedRoot);
  } catch {
    realRoot = resolvedRoot;
  }

  const realRelative = path.relative(realRoot, realFilePath);
  const isRealContained = !realRelative.startsWith('..') && !path.isAbsolute(realRelative);

  if (!isRealContained) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Forbidden: Symlink traversal detected' }));
    return true;
  }

  if (stat.isDirectory()) {
    const indexPath = path.join(realFilePath, 'index.html');
    if (fs.existsSync(indexPath)) {
      const indexReal = fs.realpathSync(indexPath);
      const indexRel = path.relative(realRoot, indexReal);
      if (!indexRel.startsWith('..') && !path.isAbsolute(indexRel)) {
        return serveFile(res, indexReal, fs.statSync(indexReal));
      }
    }
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Directory listing forbidden' }));
    return true;
  }

  return serveFile(res, realFilePath, stat);
}

function serveFile(res: ServerResponse, filePath: string, stat: fs.Stats): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

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
  stream.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Failed to read file' }));
    }
  });
  stream.pipe(res);
  return true;
}
