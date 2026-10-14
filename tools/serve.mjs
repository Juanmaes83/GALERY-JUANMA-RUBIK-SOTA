#!/usr/bin/env node
/**
 * Servidor estático mínimo para ejecutar el museo en local.
 *
 *   node tools/serve.mjs [puerto]      (por defecto 4180)
 *
 * Sin dependencias. Sirve la raíz del repositorio, responde 404 a lo que no
 * existe (igual que un hosting estático) y admite HEAD, que la Sala Breeze usa
 * para comprobar si Breeze Studio PRO está presente.
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
  '.glb': 'model/gltf-binary'
};

export function startServer(port = 4180, { log = null } = {}) {
  const server = http.createServer(async (req, res) => {
    let status = 200;
    try {
      const decoded = decodeURIComponent((req.url || '/').split('?')[0]);
      let file = path.resolve(ROOT, `.${decoded}`);
      if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
        status = 403;
        res.writeHead(403).end('Forbidden');
        return;
      }
      const stat = await fs.stat(file).catch(() => null);
      if (stat?.isDirectory()) file = path.join(file, 'index.html');
      const body = await fs.readFile(file);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': 'no-store'
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      status = 404;
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    } finally {
      log?.({ method: req.method, url: req.url, status });
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] || process.env.PORT || 4180);
  await startServer(port);
  console.log(`Museo disponible en http://127.0.0.1:${port}/`);
}
