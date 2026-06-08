#!/usr/bin/env node
/* =====================================================================
   build.mjs — draft.md  ->  index.html (no-ref) + index.ref.html (ref)
   ---------------------------------------------------------------------
   Usage:  node _template/build.mjs <category>/<deck>
   e.g.    node _template/build.mjs teaching/ai-coding-agents-101-for-everyone

   Grammar (see CLAUDE.md "Draft grammar" for the canonical spec):
     - Each top-level "- " line in draft.md = ONE slide.
     - First slide line = title:  Title: <t>, year: <Y>, [Collaborator: <c>], [No Laptops No Cellphones]
     - "Header: content"  -> red header box + content. Escape literal
        colons by wrapping in backticks:  `Monitor: Use Statusline`: @img
     - Header must be <= 33 chars (else build halts with a suggestion).
     - @name.ext         -> assets/name.ext (image, or video for mov/mp4/webm)
     - @a, @b            -> images side-by-side (equal height)
     - @img, prose       -> portrait img => split; landscape img => caption
     - List - a - b - c  -> vertical centered green-stroke boxes
     - Implement(slug): … -> inject widgets/<slug>.html  (slug optional ->
                              widgets/slide-<n>.html)
     - Contributions: - a - b - (Takeaway) c  -> points shown together,
                              (Takeaway) item is a fragment that pops last.
   Two variants differ only by body class `with-refs` + an appended
   references slide. Citations come from assets/reference.md (DOIs resolved
   via Crossref, cached to assets/refs.cache.json; non-DOI -> Source: url).
   ===================================================================== */

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const TEMPLATE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(TEMPLATE_DIR);
const MEDIA_EXT = { video: ['.mov', '.mp4', '.webm', '.m4v'] };

function die(msg) { console.error('\n✗ ' + msg + '\n'); process.exit(1); }
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ---------- image dimension sniffing (png/jpeg/gif) + ffprobe video ---------- */
async function dimensions(file) {
  const ext = path.extname(file).toLowerCase();
  if (MEDIA_EXT.video.includes(ext)) {
    try {
      const { stdout } = await pexec('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', file]);
      const [w, h] = stdout.trim().split('x').map(Number);
      return { w, h };
    } catch { return { w: 16, h: 9 }; }
  }
  const buf = await readFile(file);
  if (ext === '.png') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (ext === '.gif') return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  if (ext === '.jpg' || ext === '.jpeg') {
    let o = 2;
    while (o < buf.length) {
      if (buf[o] !== 0xff) { o++; continue; }
      const m = buf[o + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m))
        return { h: buf.readUInt16BE(o + 5), w: buf.readUInt16BE(o + 7) };
      o += 2 + buf.readUInt16BE(o + 2);
    }
  }
  return { w: 16, h: 9 }; // unknown -> treat as landscape
}

/* ---------- .mov -> web-playable .mp4 (cached) ---------- */
async function webVideo(assetsDir, name) {
  const ext = path.extname(name).toLowerCase();
  if (ext !== '.mov') return name;                 // mp4/webm assumed web-ready
  const cacheDir = path.join(assetsDir, '.cache');
  const outName = path.basename(name, ext) + '.mp4';
  const outPath = path.join(cacheDir, outName);
  if (!existsSync(outPath)) {
    await mkdir(cacheDir, { recursive: true });
    console.log(`  transcoding ${name} -> .cache/${outName}`);
    await pexec('ffmpeg', ['-y', '-i', path.join(assetsDir, name),
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
      '-movflags', '+faststart', outPath]);
  }
  return `.cache/${outName}`;
}

/* ---------- split "header: content" honoring backtick escapes ---------- */
function splitHeader(line) {
  let inTick = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '`') inTick = !inTick;
    else if (c === ':' && !inTick) {
      const head = line.slice(0, i).trim();
      const rest = line.slice(i + 1).trim();
      // URL-ish false positive guard (e.g. https://) — no header.
      if (/^\w+$/.test(head) && /^\/\//.test(rest)) return { header: null, content: line.trim() };
      return { header: head.replace(/`/g, ''), content: rest };
    }
  }
  return { header: null, content: line.trim() };
}

/* ---------- reference.md -> { filename -> rawRef } ---------- */
async function loadRefs(assetsDir) {
  const f = path.join(assetsDir, 'reference.md');
  if (!existsSync(f)) return {};
  const map = {};
  for (const raw of (await readFile(f, 'utf8')).split('\n')) {
    const line = raw.replace(/^\s*[*-]\s*/, '').trim();
    const i = line.indexOf(': ');
    if (i < 0) continue;
    const files = line.slice(0, i).split(',').map((s) => s.trim());
    const ref = line.slice(i + 2).trim();
    for (const fn of files) map[fn] = ref;
  }
  return map;
}

/* ---------- DOI metadata: Crossref, then DataCite (arXiv lives here) ---------- */
async function fetchDOI(doi) {
  const UA = { 'User-Agent': 'slide-build/0.1 (mailto:gwonedgar@gmail.com)' };
  // Crossref
  try {
    const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`,
      { signal: AbortSignal.timeout(8000), headers: UA });
    if (r.ok) {
      const m = (await r.json()).message;
      return { fams: (m.author || []).map((a) => a.family).filter(Boolean),
        yr: m.issued?.['date-parts']?.[0]?.[0],
        title: m.title?.[0] || '', venue: m['container-title']?.[0] || m.publisher || '' };
    }
  } catch { /* try DataCite */ }
  // DataCite (arXiv 10.48550/*, Zenodo, Figshare, …)
  try {
    const r = await fetch(`https://api.datacite.org/dois/${encodeURIComponent(doi)}`,
      { signal: AbortSignal.timeout(8000), headers: UA });
    if (r.ok) {
      const a = (await r.json()).data?.attributes || {};
      const fams = (a.creators || []).map((c) => c.familyName || (c.name || '').split(',')[0].trim()).filter(Boolean);
      const pub = typeof a.publisher === 'string' ? a.publisher : (a.publisher?.name || '');
      return { fams, yr: a.publicationYear, title: a.titles?.[0]?.title || '', venue: pub };
    }
  } catch { /* fall through */ }
  return null;
}

/* ---------- resolve a raw ref (DOI -> APA; else Source: url), cached ---------- */
async function resolveRef(raw, cache) {
  if (cache[raw]) return cache[raw];
  const doiMatch = raw.match(/10\.\d{4,9}\/[^\s)]+/);
  let out;
  if (doiMatch) {
    const doi = doiMatch[0].replace(/[).,]+$/, '');
    const m = await fetchDOI(doi);
    if (m) {
      const yr = m.yr ?? 'n.d.';
      const who = m.fams.length === 0 ? (m.venue || 'Source')
        : m.fams.length === 1 ? m.fams[0]
        : m.fams.length === 2 ? `${m.fams[0]} & ${m.fams[1]}` : `${m.fams[0]} et al.`;
      const authFull = m.fams.length ? m.fams.join(', ') : (m.venue || '');
      out = { intext: `${who} (${yr})`,
              full: `${authFull} (${yr}). ${m.title}. ${m.venue}. https://doi.org/${doi}`.replace(/\s+/g, ' ').trim() };
    }
  }
  if (!out) {                                  // non-DOI URL or failed lookup
    let host = raw; try { host = new URL(raw).host.replace(/^www\./, ''); } catch {}
    out = { intext: `Source: ${host}`, full: `Source: ${raw}` };
  }
  cache[raw] = out;
  return out;
}

/* ---------- YouTube: detect a URL token, extract id + start time ---------- */
const YT_RE = /(?:youtube\.com\/(?:watch|embed|shorts|live)|youtu\.be\/)/i;
function ytSeconds(t) {                       // "90" | "90s" | "1m30s" | "1h2m3s" -> seconds
  if (!t) return 0;
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  let s = 0, m; const re = /(\d+)\s*(h|m|s)/gi;
  while ((m = re.exec(t))) s += (+m[1]) * ({ h: 3600, m: 60, s: 1 }[m[2].toLowerCase()]);
  return s;
}
function parseYouTube(url) {
  if (!YT_RE.test(url)) return null;
  let U; try { U = new URL(/^https?:\/\//i.test(url) ? url : 'https://' + url); } catch { return null; }
  let id = '';
  if (/(^|\.)youtu\.be$/i.test(U.hostname)) id = U.pathname.split('/')[1] || '';
  else if (/(^|\.)youtube\.com$/i.test(U.hostname)) {
    id = U.pathname === '/watch' ? (U.searchParams.get('v') || '') : (U.pathname.split('/')[2] || '');
  }
  if (!id) return null;
  const t = U.searchParams.get('start') || U.searchParams.get('t') || (U.hash.match(/t=([\dhms]+)/i)?.[1]) || '';
  return { id, start: ytSeconds(t), url };
}
function ytEmbed(yt) {
  const src = `https://www.youtube.com/embed/${yt.id}?rel=0${yt.start ? `&start=${yt.start}` : ''}`;
  return `<iframe class="yt-frame" src="${src}" title="YouTube video" loading="lazy" frameborder="0"` +
    ` allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"` +
    ` allowfullscreen></iframe>`;
}

/* ---------- render the content region for one slide ---------- */
async function renderContent(content, ctx) {
  // --- Implement(slug): widget ---
  const impl = content.match(/^Implement(?:\(([^)]+)\))?\s*:\s*(.*)$/s);
  if (impl) {
    const slug = (impl[1] || `slide-${ctx.index}`).trim();
    const wf = path.join(ctx.deckDir, 'widgets', `${slug}.html`);
    ctx.usedWidgets.push(slug);
    if (existsSync(wf)) return `<div class="widget">${await readFile(wf, 'utf8')}</div>`;
    return `<div class="widget"><div class="body" style="color:#c0392b">` +
      `[widget '${esc(slug)}' not yet written — create widgets/${esc(slug)}.html]<br>` +
      `<span style="font-size:.6em;color:#999">${esc(impl[2])}</span></div></div>`;
  }

  // --- List - a - b - c ---
  const listM = content.match(/^List\s*-\s*(.+)$/s);
  if (listM) {
    const items = listM[1].split(/\s+-\s+/).map((s) => s.trim()).filter(Boolean);
    return `<div class="list">${items.map((i) => `<div class="list-item">${esc(i)}</div>`).join('')}</div>`;
  }

  // --- tokens: media (@x), YouTube URLs, and prose, comma-separated ---
  const tokens = content.split(',').map((t) => t.trim()).filter(Boolean);
  const media = [], prose = [], yts = [];
  for (const t of tokens) {
    const m = t.match(/^@(\S+)$/);
    if (m) { media.push(m[1]); continue; }
    const yt = parseYouTube(t);
    if (yt) { yts.push(yt); refMap[yt.url] ||= yt.url; ctx.usedAssets.push(yt.url); continue; }
    prose.push(t);
  }

  // --- YouTube embed(s): the largest 16:9 box that fits the content region ---
  if (yts.length && !media.length) {
    const frames = yts.map(ytEmbed).join('');
    if (yts.length > 1) return `<div class="yt-row">${frames}</div>`;
    if (prose.length) return `<figure class="yt-fig">${frames}<figcaption>${esc(prose.join(', '))}</figcaption></figure>`;
    return `<div class="yt">${frames}</div>`;
  }

  const mediaTag = async (name) => {
    const ext = path.extname(name).toLowerCase();
    if (MEDIA_EXT.video.includes(ext)) {
      const src = await webVideo(ctx.assetsDir, name);
      ctx.usedAssets.push(name);
      return `<video controls preload="metadata" src="assets/${src}"></video>`;
    }
    ctx.usedAssets.push(name);
    return `<img src="assets/${esc(name)}" alt="">`;
  };

  if (media.length && !prose.length) {
    if (media.length === 1) return `<div class="img-single">${await mediaTag(media[0])}</div>`;
    const imgs = (await Promise.all(media.map(mediaTag))).join('');
    return `<div class="img-row">${imgs}</div>`;
  }
  if (media.length === 1 && prose.length) {
    const { w, h } = await dimensions(path.join(ctx.assetsDir, media[0]));
    const tag = await mediaTag(media[0]);
    if (h > w) return `<div class="img-split">${tag}<div class="prose">${esc(prose.join(', '))}</div></div>`;
    return `<figure>${tag}<figcaption>${esc(prose.join(', '))}</figcaption></figure>`;
  }
  if (!media.length && prose.length) return `<div class="body">${esc(prose.join(', '))}</div>`;

  // media + prose (multi-media + caption) -> row above, caption below
  const imgs = (await Promise.all(media.map(mediaTag))).join('');
  return `<figure><div class="img-row">${imgs}</div><figcaption>${esc(prose.join(', '))}</figcaption></figure>`;
}

/* ---------- contributions / takeaway final slide ---------- */
function renderContrib(content) {
  const items = content.replace(/^-\s+/, '').split(/\s+-\s+/).map((s) => s.trim()).filter(Boolean);
  const html = items.map((it) => {
    const tk = it.match(/^\(Takeaway\)\s*(.*)$/i);
    if (tk) return `<li class="takeaway fragment">${esc(tk[1])}</li>`;
    return `<li class="point">${esc(it)}</li>`;
  }).join('');
  return `<ul class="contrib">${html}</ul>`;
}

/* ---------- title slide ---------- */
function renderTitle(content) {
  const fields = content.split(',').map((s) => s.trim());
  let title = '', year = String(new Date().getFullYear()),
      presenter = 'Edgar (Myeongseok) Gwon', collab = '', nolaptop = false;
  fields.forEach((f, i) => {
    const tl = f.toLowerCase();
    if (i === 0) { title = f.replace(/^title\s*:\s*/i, ''); return; }
    if (/^year\s*:/i.test(f)) year = f.split(':')[1].trim();
    else if (/^presenter\s*:/i.test(f)) presenter = f.split(':')[1].trim();
    else if (/^collaborator\s*:/i.test(f)) collab = f.split(':')[1].trim();
    else if (tl.includes('no laptop') || tl.includes('no cellphone') || tl.includes('no phone')) nolaptop = true;
  });
  const rel = '../../how-to-speak-lecture-reference/no-laptop-no-phone.png';
  return `<section class="title-slide" data-no-page><div class="canvas">
      <div class="title">${esc(title)}</div>
      <div class="meta">${esc(presenter)}<br>${esc(year)}` +
      (collab ? `<br><span class="collab">with ${esc(collab)}</span>` : '') + `</div>` +
      (nolaptop ? `<div class="nolaptop"><img src="${rel}" alt="no laptops no phones"></div>` : '') +
    `</div></section>`;
}

/* =========================== main =========================== */
const arg = process.argv[2];
if (!arg) die('Usage: node _template/build.mjs <category>/<deck>');
const deckDir = path.resolve(REPO_ROOT, arg);
const assetsDir = path.join(deckDir, 'assets');
const draftPath = path.join(deckDir, 'draft.md');
if (!existsSync(draftPath)) die(`No draft.md at ${draftPath}`);

const relTemplate = path.relative(deckDir, TEMPLATE_DIR).split(path.sep).join('/');
const lines = (await readFile(draftPath, 'utf8')).split('\n')
  .map((l) => l.replace(/\r$/, ''))
  .filter((l) => /^\s*-\s+/.test(l))
  .map((l) => l.replace(/^\s*-\s+/, '').trim());

const refMap = await loadRefs(assetsDir);
const cachePath = path.join(assetsDir, 'refs.cache.json');
const cache = existsSync(cachePath) ? JSON.parse(await readFile(cachePath, 'utf8')) : {};

const ctx = { deckDir, assetsDir, index: 0, usedWidgets: [], usedAssets: [] };
const slides = [];          // { html, citeFiles:[] }
for (let i = 0; i < lines.length; i++) {
  ctx.index = i + 1;
  const line = lines[i];
  if (i === 0) { slides.push({ html: renderTitle(line), title: true }); continue; }

  // Implement directive: the whole line IS the widget spec (headerless slide).
  // Must run before splitHeader, whose colon-split would eat "Implement:".
  if (/^Implement\s*[(:]/i.test(line)) {
    const b0 = ctx.usedAssets.length;
    const inner0 = await renderContent(line, ctx);
    slides.push({ html: `<section class="slide no-header"><div class="canvas"><div class="content">${inner0}</div>__CITE__<div class="pagenum">__N__/__TOT__</div></div></section>`,
                  citeFiles: ctx.usedAssets.slice(b0) });
    continue;
  }

  const { header, content } = splitHeader(line);
  if (header && header.length > 33)
    die(`Slide ${i + 1} header is ${header.length} chars (max 33):\n   "${header}"\n` +
        `   Suggestion: "${header.slice(0, 30).trim()}…" — please shorten in draft.md.`);

  const before = ctx.usedAssets.length;
  let inner;
  if (/^contributions$/i.test(header || '') || /\(Takeaway\)/i.test(content))
    inner = renderContrib(content);
  else
    inner = await renderContent(content, ctx);
  const citeFiles = ctx.usedAssets.slice(before);

  const headHtml = header ? `<div class="header">${esc(header)}</div>` : '';
  const cls = header ? 'slide' : 'slide no-header';
  slides.push({ html: `<section class="${cls}"><div class="canvas">${headHtml}<div class="content">${inner}</div>__CITE__<div class="pagenum">__N__/__TOT__</div></div></section>`,
                citeFiles });
}

await writeFile(cachePath, JSON.stringify(cache, null, 2)); // (cache may grow in ref build below)

/* assemble one variant */
async function assemble({ withRefs }) {
  const refList = [];               // {full} unique, for references page
  const seenFull = new Set();
  let n = 1;
  const total = slides.length + (withRefs && Object.keys(refMap).length ? 1 : 0);
  const body = [];
  for (const s of slides) {
    if (s.title) { body.push(s.html); continue; }
    n++;
    let citeHtml = '';
    if (withRefs && s.citeFiles?.length) {
      const intexts = [];
      for (const fn of s.citeFiles) {
        if (!refMap[fn]) continue;
        const r = await resolveRef(refMap[fn], cache);
        intexts.push(r.intext);
        if (!seenFull.has(r.full)) { seenFull.add(r.full); refList.push(r.full); }
      }
      if (intexts.length) citeHtml = `<div class="cite">${esc([...new Set(intexts)].join('; '))}</div>`;
    }
    body.push(s.html.replace('__CITE__', citeHtml)
      .replace('__N__', n).replace('__TOT__', total));
  }
  if (withRefs && refList.length) {
    refList.sort();
    body.push(`<section class="slide references"><div class="canvas"><div class="header">References</div>` +
      `<div class="reflist">${refList.map((r) => `<div class="ref">${esc(r)}</div>`).join('')}</div>` +
      `<div class="pagenum">${total}/${total}</div></div></section>`);
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(path.basename(deckDir))}</title>
<link rel="stylesheet" href="${relTemplate}/vendor/reveal/reset.css">
<link rel="stylesheet" href="${relTemplate}/vendor/reveal/reveal.css">
<link rel="stylesheet" href="${relTemplate}/theme.css">
</head><body${withRefs ? ' class="with-refs"' : ''}>
<div class="reveal"><div class="slides">
${body.join('\n')}
</div></div>
<script type="module">
import Reveal from '${relTemplate}/vendor/reveal/reveal.esm.js';
const deck = new Reveal({ width:1920, height:1080, margin:0.04, center:false, hash:true,
  slideNumber:false, transition:'none' });
window.__deck = deck;            // exposed so export.mjs can reconfigure/navigate
deck.initialize();
</script></body></html>`;
}

await writeFile(path.join(deckDir, 'index.html'), await assemble({ withRefs: false }));
await writeFile(path.join(deckDir, 'index.ref.html'), await assemble({ withRefs: true }));
await writeFile(cachePath, JSON.stringify(cache, null, 2));

console.log(`✓ built ${arg}`);
console.log(`   index.html      (no-ref, present this)`);
console.log(`   index.ref.html  (with citations + references page)`);
if (ctx.usedWidgets.length) console.log(`   widgets: ${ctx.usedWidgets.join(', ')}`);
