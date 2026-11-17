// Local preview server: serves dist/ under BASE_PATH, exactly like GitHub Pages will. No dependencies.
//   node serve.js            → http://localhost:4173/gorski-law-preview/
import http from 'node:http';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_PATH } from './site.config.js';

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const PORT = Number(process.env.PORT || 4173);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json' };

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (BASE_PATH && p === '/') { res.writeHead(302, { Location: BASE_PATH + '/' }); return res.end(); }
  if (BASE_PATH && !p.startsWith(BASE_PATH + '/') && p !== BASE_PATH) return notFound(res);
  p = p.slice(BASE_PATH.length) || '/';
  let f = path.join(DIST, p);
  if (!f.startsWith(DIST)) return notFound(res);
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) {
    if (!p.endsWith('/')) { res.writeHead(301, { Location: BASE_PATH + p + '/' }); return res.end(); }
    f = path.join(f, 'index.html');
  }
  if (!fs.existsSync(f)) return notFound(res);
  const type = TYPES[path.extname(f)] || 'application/octet-stream';
  // gzip text like GitHub Pages does, so local Lighthouse runs measure what visitors get
  const gz = /gzip/.test(req.headers['accept-encoding'] || '') && /text|javascript|xml|svg|json/.test(type);
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache', ...(gz ? { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' } : {}) });
  (gz ? fs.createReadStream(f).pipe(zlib.createGzip()) : fs.createReadStream(f)).pipe(res);
}).listen(PORT, () => console.log(`Serving dist/ at http://localhost:${PORT}${BASE_PATH}/`));

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  const f = path.join(DIST, '404.html');
  res.end(fs.existsSync(f) ? fs.readFileSync(f) : 'Not found');
}
