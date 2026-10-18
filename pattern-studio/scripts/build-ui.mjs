import { build, context } from 'esbuild';
import { mkdir, copyFile, cp } from 'node:fs/promises';

await import('./export-supported-designs.mjs');
await mkdir('out', { recursive: true });
await copyFile('web/index.html', 'out/index.html');
await cp('web/assets', 'out/assets', { recursive: true });
await copyFile('supported-designs.json', 'out/supported-designs.json');
const options = {
  entryPoints: ['web/main.ts'], bundle: true, outdir: 'out',
  platform: 'browser', target: ['es2022'], format: 'esm',
  minify: !process.argv.includes('--serve'), sourcemap: false,
};
if (process.argv.includes('--serve')) {
  const ctx = await context(options);
  await ctx.watch();
  await ctx.rebuild();
  const { startLocalServer } = await import('./local-server.mjs');
  const server = await startLocalServer();
  process.on('SIGINT', async () => { server.close(); await ctx.dispose(); process.exit(0); });
} else {
  await build(options);
  console.log('Built Sewberry in out/');
}
