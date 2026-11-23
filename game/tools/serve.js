#!/usr/bin/env node
/**
 * serve.js — zero-dependency static file server for Sands of Aether.
 * Binds to 0.0.0.0 so live previews work. No Vercel, no build step, no CDN.
 *
 * Usage: node tools/serve.js [--port 8080] [--root .]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = { port: 8080, root: DEFAULT_ROOT };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--port' && argv[i + 1]) {
      args.port = Number(argv[i + 1]);
      i += 1;
    } else if (argv[i] === '--root' && argv[i + 1]) {
      args.root = path.resolve(argv[i + 1]);
      i += 1;
    }
  }
  return args;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const cleaned = decoded.replace(/\\/g, '/').replace(/^\/+/, '');
  const full = path.normalize(path.join(root, cleaned));
  if (!full.startsWith(root)) return null;
  return full;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-cache', ...headers });
  res.end(body);
}

export function createServer(root) {
  return http.createServer((req, res) => {
    try {
      let target = safeJoin(root, req.url || '/');
      if (!target) return send(res, 403, 'Forbidden');
      if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
        target = path.join(target, 'index.html');
      }
      if (!fs.existsSync(target)) {
        return send(res, 404, 'Not Found');
      }
      const ext = path.extname(target).toLowerCase();
      const mime = MIME[ext] || 'application/octet-stream';
      const data = fs.readFileSync(target);
      send(res, 200, data, { 'Content-Type': mime, 'Content-Length': data.length });
    } catch (err) {
      send(res, 500, `Server error: ${err.message}`);
    }
  });
}

const args = parseArgs(process.argv);
const server = createServer(args.root);
server.listen(args.port, '0.0.0.0', () => {
  console.log(`Sands of Aether served at http://0.0.0.0:${args.port} (root: ${args.root})`);
});
