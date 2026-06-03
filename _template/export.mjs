#!/usr/bin/env node
/* =====================================================================
   export.mjs — render a built deck to PDF + a single contact-sheet PNG.
   ---------------------------------------------------------------------
   Usage:  node _template/export.mjs <category>/<deck>

   Produces (deck basename = <name>):
     <name>.pdf            <- no-ref, the one you present
     <name>.contact.png    <- bird's-eye grid of every slide (no refs)
     <name>.ref.pdf        <- archival, with citations + references page
     <name>.ref.contact.png

   Strategy: we do NOT use reveal's ?print-pdf mode — it re-flows custom
   absolute layouts and mis-paginates. Instead we drive the LIVE deck in
   headless Chrome (which renders identically to what you present),
   screenshot every slide at 1920x1080, and assemble those frames into
   the PDF and the contact sheet. So the PDF is exactly what you see.
   Videos show their first frame; widgets show their initial state;
   fragments are all forced visible so the static PDF is complete.

   Run `node _template/build.mjs <deck>` first.
   ===================================================================== */

import { existsSync, createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(TEMPLATE_DIR);
function die(m) { console.error('\n✗ ' + m + '\n'); process.exit(1); }

// Chrome blocks ES-module imports over file:// (origin "null" CORS), so the
// deck — which loads reveal.esm.js as a module — must be served over HTTP.
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.gif': 'image/gif', '.mp4': 'video/mp4', '.mov': 'video/quicktime',
  '.webm': 'video/webm', '.woff2': 'font/woff2', '.json': 'application/json' };
function startServer(root) {
  return new Promise((resolve) => {
    const srv = http.createServer(async (req, res) => {
      try {
        const fp = path.join(root, decodeURIComponent(req.url.split('?')[0]));
        if (!fp.startsWith(root) || (await stat(fp)).isDirectory()) { res.writeHead(403); return res.end(); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
        createReadStream(fp).pipe(res);
      } catch { res.writeHead(404); res.end('not found'); }
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

let puppeteer;
try { puppeteer = (await import('puppeteer')).default; }
catch { die('Puppeteer not installed. Run:  (cd _template && npm install)\n' +
            '   (downloads a headless Chrome the first time).'); }

const rawArgs = process.argv.slice(2);
const scaleArg = rawArgs.find((a) => a.startsWith('--scale='));
// Default 1 = native 1080p, ~5MB/deck (repo-friendly). Use --scale=2 for a
// crisp retina/zoomable copy (~20MB) when sharing.
const SCALE = scaleArg ? Math.max(1, Math.min(3, Number(scaleArg.split('=')[1]) || 1)) : 1;
const arg = rawArgs.find((a) => !a.startsWith('--'));
if (!arg) die('Usage: node _template/export.mjs <category>/<deck> [--scale=1|2|3]');
const deckDir = path.resolve(REPO_ROOT, arg);
const name = path.basename(deckDir);
if (!existsSync(path.join(deckDir, 'index.html')))
  die(`No index.html in ${arg}. Run build.mjs first.`);

// Only hide chrome and reveal every fragment; we let reveal own the layout
// (reconfigured below) instead of fighting its transform with !important.
const EXPORT_CSS = `
  .reveal .controls, .reveal .progress, .reveal .slide-number { display: none !important; }
  .reveal .fragment { opacity: 1 !important; visibility: visible !important; }`;

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });

/* screenshot every slide of a built HTML (served over HTTP), in order */
async function shootSlides(url) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: SCALE });
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => window.__deck && window.__deck.isReady(), { timeout: 30000 });
  // Lock reveal to 1:1 with the viewport so each slide renders full-bleed at
  // native 1920x1080 (no fit-to-window scaling), then re-layout.
  await page.evaluate(() => {
    window.__deck.configure({ margin: 0, minScale: 1, maxScale: 1 });
    window.__deck.layout();
  });
  await page.addStyleTag({ content: EXPORT_CSS });
  const n = await page.evaluate(() => window.__deck.getTotalSlides());
  const shots = [];
  for (let i = 0; i < n; i++) {
    await page.evaluate((idx) => window.__deck.slide(idx), i);
    await new Promise((r) => setTimeout(r, 200));   // settle (transitions are off)
    shots.push(await page.screenshot({ type: 'png' }));
  }
  await page.close();
  return shots;
}

// Puppeteer 23 returns a Uint8Array from screenshot(); Uint8Array.toString('base64')
// yields garbage, so normalise through Buffer.from() before encoding.
const dataURIs = (shots) => shots.map((b) => 'data:image/png;base64,' + Buffer.from(b).toString('base64'));

/* frames -> one PDF, each slide a full-bleed 1920x1080 page */
async function toPdf(shots, pdfPath) {
  const imgs = dataURIs(shots);
  const html = `<!doctype html><meta charset=utf-8><style>
    @page { size: 1920px 1080px; margin: 0; }
    html, body { margin: 0; padding: 0; }
    .pg { width: 1920px; height: 1080px; page-break-after: always; }
    .pg:last-child { page-break-after: auto; }
    .pg img { width: 1920px; height: 1080px; display: block; }</style>
    ${imgs.map((d) => `<div class="pg"><img src="${d}"></div>`).join('')}`;
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.pdf({ path: pdfPath, width: '1920px', height: '1080px', printBackground: true });
  await page.close();
}

/* frames -> one contact-sheet PNG (CSS grid screenshot) */
async function toContactSheet(shots, pngPath) {
  const imgs = dataURIs(shots);
  const cols = Math.min(5, Math.ceil(Math.sqrt(imgs.length)));
  const html = `<!doctype html><meta charset=utf-8><style>
    body { margin: 0; background: #fff; }
    .grid { display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 10px; padding: 16px; align-items: start; }
    .grid figure { margin: 0; }
    .grid img { width: 100%; height: auto; display: block; border: 1px solid #ddd; }
    .grid figcaption { font: 12px sans-serif; color: #888; text-align: center; padding-top: 2px; }</style>
    <div class="grid">${imgs.map((d, i) =>
      `<figure><img src="${d}"><figcaption>${i + 1}</figcaption></figure>`).join('')}</div>`;
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: pngPath, fullPage: true });
  await page.close();
}

const variants = [
  { html: 'index.html', pdf: `${name}.pdf`, png: `${name}.contact.png`, label: 'no-ref (primary)' },
];
if (existsSync(path.join(deckDir, 'index.ref.html')))
  variants.push({ html: 'index.ref.html', pdf: `${name}.ref.pdf`, png: `${name}.ref.contact.png`, label: 'with refs' });

const { srv, port } = await startServer(REPO_ROOT);
const relUrl = arg.split(path.sep).join('/').replace(/^\/+|\/+$/g, '');
for (const v of variants) {
  console.log(`→ ${v.label}: shooting slides…`);
  const shots = await shootSlides(`http://127.0.0.1:${port}/${relUrl}/${v.html}`);
  await toPdf(shots, path.join(deckDir, v.pdf));
  await toContactSheet(shots, path.join(deckDir, v.png));
  console.log(`   ${v.pdf}  (${shots.length} pages)  +  ${v.png}`);
}

await browser.close();
srv.close();
console.log(`✓ exported ${arg}`);
