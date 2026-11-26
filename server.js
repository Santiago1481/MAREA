// Servidor estático mínimo (sin dependencias) para la demo: npm start → http://localhost:5173
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT) || 5173;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

createServer(async (req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (url === '/') {
    res.writeHead(302, { Location: '/web/' });
    return res.end();
  }
  const file = normalize(join(root, url.endsWith('/') ? `${url}index.html` : url));
  if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) {
    res.writeHead(403);
    return res.end();
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('No encontrado');
  }
}).listen(port, () => console.log(`MAREA demo → http://localhost:${port}`));
