import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
try { loadEnvFile(new URL('../.env', import.meta.url)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const { handlePhotoAPI } = await import('../server/photo-api.mjs');
const assets = { '/': ['index.html','text/html'], '/index.html': ['index.html','text/html'], '/main.js': ['main.js','text/javascript'], '/main.css': ['main.css','text/css'], '/supported-designs.json': ['supported-designs.json','application/json'] };
export async function startLocalServer() {
  const server = createServer(async (req,res) => {
    if (req.url?.startsWith('/api/')) { await handlePhotoAPI(req,res); return; }
    const pathname = req.url?.split('?')[0];
    const asset = assets[pathname] ?? (/^\/assets\/[a-zA-Z0-9_-]+\.(svg|png)$/.test(pathname ?? '') ? [pathname.slice(1), pathname.endsWith('.png') ? 'image/png' : 'image/svg+xml'] : null);
    if (!asset || !['GET','HEAD'].includes(req.method)) { res.writeHead(404); res.end('Not found'); return; }
    try {
      const bytes = await readFile(new URL(`../out/${asset[0]}`, import.meta.url));
      res.writeHead(200,{ 'Content-Type': `${asset[1]}; charset=utf-8`, 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff' }); res.end(req.method==='HEAD'?undefined:bytes);
    } catch { res.writeHead(503); res.end('Building the interface. Refresh shortly.'); }
  });
  await new Promise((resolve,reject) => { server.once('error',reject); server.listen(4173,'127.0.0.1',resolve); });
  console.log('Pattern Studio + Gemini: http://127.0.0.1:4173');
  return server;
}
