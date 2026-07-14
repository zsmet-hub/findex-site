import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = Number(portIndex >= 0 ? args[portIndex + 1] : 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Use a valid --port value.');

const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

createServer((request, response) => {
  const requested = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`).pathname;
  const projectPath = requested === '/findex-site' ? '/' : requested.replace(/^\/findex-site\/?/, '/');
  let candidate = normalize(join(root, decodeURIComponent(projectPath)));
  if (!candidate.startsWith(`${root}${sep}`) && candidate !== root) {
    response.writeHead(400).end('Bad request');
    return;
  }
  if (existsSync(candidate) && statSync(candidate).isDirectory()) candidate = join(candidate, 'index.html');
  if (!existsSync(candidate) || !statSync(candidate).isFile()) candidate = join(root, '404.html');
  response.writeHead(candidate.endsWith('404.html') ? 404 : 200, {
    'Content-Type': types[extname(candidate)] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  createReadStream(candidate).pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(`FinDex site: http://127.0.0.1:${port}/findex-site/`);
});
