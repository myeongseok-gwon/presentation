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

   PDF:  headless Chrome (Puppeteer) loads index*.html?print-pdf; reveal's
         print view paginates 1 slide/page at 1920x1080.
   Sheet: PDF -> pdftoppm PNGs -> a CSS-grid overview.html -> screenshot.
         (No ImageMagick dependency.)
   Videos render their first frame in the static PDF; widgets render their
   initial state. Run `node _template/build.mjs <deck>` first.
   ===================================================================== */

import { writeFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const TEMPLATE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(TEMPLATE_DIR);

function die(m) { console.error('\n✗ ' + m + '\n'); process.exit(1); }

let puppeteer;
try { puppeteer = (await import('puppeteer')).default; }
catch { die('Puppeteer not installed. Run:  (cd _template && npm install)\n' +
            '   (downloads a headless Chrome the first time).'); }

const arg = process.argv[2];
if (!arg) die('Usage: node _template/export.mjs <category>/<deck>');
const deckDir = path.resolve(REPO_ROOT, arg);
const name = path.basename(deckDir);
if (!existsSync(path.join(deckDir, 'index.html')))
  die(`No index.html in ${arg}. Run build.mjs first.`);

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

async function toPdf(htmlFile, pdfPath) {
  const page = await browser.newPage();
  await page.goto('file://' + path.join(deckDir, htmlFile) + '?print-pdf',
    { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('.reveal .slides section', { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));   // let print view paginate
  await page.pdf({ path: pdfPath, width: '1920px', height: '1080px',
    printBackground: true, preferCSSPageSize: true, pageRanges: '' });
  await page.close();
}

async function toContactSheet(pdfPath, pngPath) {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'slides-'));
  await pexec('pdftoppm', ['-png', '-r', '60', pdfPath, path.join(tmp, 'p')]);
  const pngs = (await readdir(tmp)).filter((f) => f.endsWith('.png'))
    .sort().map((f) => 'file://' + path.join(tmp, f));
  const cols = Math.min(5, Math.ceil(Math.sqrt(pngs.length)));
  const html = `<!doctype html><meta charset=utf-8>
    <style>body{margin:0;background:#fff;}
    .grid{display:grid;grid-template-columns:repeat(${cols},1fr);gap:10px;padding:16px;}
    .grid figure{margin:0;}
    .grid img{width:100%;display:block;border:1px solid #ddd;}
    .grid figcaption{font:12px sans-serif;color:#888;text-align:center;padding-top:2px;}</style>
    <div class="grid">${pngs.map((p, i) =>
      `<figure><img src="${p}"><figcaption>${i + 1}</figcaption></figure>`).join('')}</div>`;
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: pngPath, fullPage: true });
  await page.close();
  await rm(tmp, { recursive: true, force: true });
}

const variants = [
  { html: 'index.html', pdf: `${name}.pdf`, png: `${name}.contact.png`, label: 'no-ref (primary)' },
];
if (existsSync(path.join(deckDir, 'index.ref.html')))
  variants.push({ html: 'index.ref.html', pdf: `${name}.ref.pdf`, png: `${name}.ref.contact.png`, label: 'with refs' });

for (const v of variants) {
  const pdfPath = path.join(deckDir, v.pdf);
  const pngPath = path.join(deckDir, v.png);
  console.log(`→ ${v.label}: ${v.pdf}`);
  await toPdf(v.html, pdfPath);
  console.log(`→ ${v.label}: ${v.png}`);
  await toContactSheet(pdfPath, pngPath);
}

await browser.close();
console.log(`✓ exported ${arg}`);
