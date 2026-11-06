import http from 'node:http';
import { readFile } from 'node:fs/promises';
const port = Number(process.env.PORT || 4179);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be an integer between 1024 and 65535.');
const files = new Map([['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']], ['/styles.css', ['styles.css', 'text/css']], ['/app.mjs', ['app.mjs', 'text/javascript']], ['/core.mjs', ['core.mjs', 'text/javascript']], ['/icon.svg', ['icon.svg', 'image/svg+xml']]]);
const server = http.createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end('Method not allowed'); return; }
  const path = new URL(request.url, 'http://127.0.0.1').pathname;
  const file = files.get(path);
  if (!file) { response.writeHead(404, { 'Content-Type': 'text/plain' }); response.end('Not found'); return; }
  try {
    const body = await readFile(new URL(file[0], import.meta.url));
    response.writeHead(200, { 'Content-Type': file[1] + '; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch { response.writeHead(500, { 'Content-Type': 'text/plain' }); response.end('Unable to read local application file'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Comeback is available locally at http://127.0.0.1:${port}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
