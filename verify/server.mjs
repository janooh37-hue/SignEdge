// Tiny static file server rooted at the project, so the verify harness loads
// pdf.js's module worker over http (file:// blocks module workers in Chrome).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url)); // project root
const MIME = {
  '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript',
  '.css': 'text/css', '.png': 'image/png', '.pdf': 'application/pdf', '.json': 'application/json',
};

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/verify/verify.html';
    const fp = normalize(join(root, p));
    if (!fp.startsWith(root.endsWith(sep) ? root : root + sep) && fp !== normalize(root)) {
      res.writeHead(403); res.end('forbidden'); return;
    }
    const buf = await readFile(fp);
    res.writeHead(200, { 'Content-Type': MIME[extname(fp)] || 'application/octet-stream' });
    res.end(buf);
  } catch (e) {
    res.writeHead(404); res.end('404 ' + e.message);
  }
});

server.listen(8123, () => console.log('verify server: http://localhost:8123/verify/verify.html'));
