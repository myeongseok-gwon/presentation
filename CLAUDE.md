# How to prepare presentations

Professor Winston (MIT) gave a meaningful lecture, "How to Speak." The script is
in @how-to-speak-lecture-reference/how-to-speak.en.txt, and because the script
misses details (pen-drawing, slides), I add my own notes in
@how-to-speak-lecture-reference/how-to-speak-context.txt. Read those for the
*why* behind the style rules below.

> One-liner for this directory: `text draft with references -> web based slides`

The governing aesthetic is Winston's **"Less is More"**: blank white background,
one font, no clutter, no decorative chrome. Every rule below serves that.

---

# Categories

Each top-level category holds individual presentations (one folder = one talk).

- **teaching** — *Informing.* Audience: undergraduate / graduate students.
- **paper-review** — *Introducing + critiquing someone else's paper.* Includes
  its figures/tables. Audience has background knowledge.
- **paper-presentation** — *Introducing my own paper.* Exposing purpose, not
  informing. Audience has background knowledge.

---

# Repository layout

```
Presentation/
  _template/                 <- THE shared "General Template" (one source of truth)
    theme.css                <- all geometry/fonts/box styles (edit :root to retune)
    build.mjs                <- draft.md  -> index.html + index.ref.html
    export.mjs               <- index*.html -> PDF + contact-sheet PNG
    prototype.html           <- every slide type, for eyeballing box geometry
    vendor/reveal/           <- pinned reveal.js (committed, works offline)
    fonts/                   <- Tinos .woff2 (committed Times-New-Roman fallback)
    package.json             <- deps (node_modules is gitignored)
  <category>/<deck>/
    draft.md                 <- you author this (the slide source)
    assets/                  <- images, videos, reference.md
    assets/.cache/           <- transcoded .mov -> .mp4 (generated)
    assets/refs.cache.json   <- resolved citations (generated, committed)
    widgets/<slug>.html      <- hand-coded interactive components (you/Claude write)
    index.html               <- generated: no-ref, PRESENT THIS
    index.ref.html           <- generated: with citations + references page
    <deck>.pdf / .contact.png         <- exported (no-ref, primary)
    <deck>.ref.pdf / .ref.contact.png <- exported (archival, with refs)
```

**Never hand-edit `index.html` / `index.ref.html`** — they are regenerated and
clobbered. All durable source lives in `draft.md`, `assets/`, and `widgets/`.
Header/list box style lives ONLY in `_template/theme.css` so every deck stays
identical regardless of category.

---

# Tech stack (decided)

- **Engine:** reveal.js 5 (vendored locally, no CDN). Self-contained per deck.
- **Canvas:** 1920×1080 (16:9), white background, `center:false` (boxes are
  positioned explicitly).
- **Font:** `"Times New Roman", "Tinos", serif`. Times New Roman is not
  web-embeddable, so **Tinos** (metric-identical, open) is bundled to guarantee
  screen == PDF on any machine. Single font only — no exceptions.
- **No build framework.** Plain Node scripts. Node ≥ 20.

---

# The workflow (the loop)

1. Author/receive `draft.md` (+ `assets/`, optional `assets/reference.md`).
2. **Build:** `node _template/build.mjs <category>/<deck>`
   → emits `index.html` (no-ref) and `index.ref.html` (with refs).
   - `.mov` videos are transcoded to web-playable `.mp4` (cached in `assets/.cache/`).
   - Tell the user how to view it (see Running below).
3. **Present** from `index.html` (no-ref, less distraction).
4. **On the user's confirmation only**, export:
   `node _template/export.mjs <category>/<deck>`
   → `<deck>.pdf` + `<deck>.contact.png` (no-ref, primary) and the `.ref` pair.
5. **Commit** (see Version management).

### Running
Interactive widgets need HTTP (not `file://`). Serve the deck folder, e.g.:
`npx serve <category>/<deck>` then open `index.html`. The bird's-eye view is the
exported `*.contact.png`.

---

# Draft grammar (the build contract)

`build.mjs` parses `draft.md`. **Each top-level `- ` line = exactly one slide.**
(The earlier wording "numbered list" was wrong — the syntax is dashes.) Nested
`-` inside a line stays *within* that slide.

**Slide 1 — title:**
`- Title: <title>, year: <YYYY>, [Presenter: <name>], [Collaborator: <name>], [No Laptops No Cellphones]`
- Presenter defaults to **Edgar (Myeongseok) Gwon**; year defaults to the current year.
- Collaborator rendered only if present. The `No Laptops No Cellphones` flag places
  `how-to-speak-lecture-reference/no-laptop-no-phone.png` bottom-center.
- This is the ONLY slide with presenter/year/collaborator, and it has **no page number**.

**Every other slide:**
- **Header:** a `:` splits `Header: content` (header = red box). Escape a literal
  colon by wrapping in backticks — `` `Monitor: Use Statusline`: @img `` → header is
  "Monitor: Use Statusline". **Header ≤ 33 chars**; if longer, the build halts and
  suggests a shortened header (it does not guess).
- **`@name.ext`** → `assets/name.ext`. Image, or `<video>` for `.mov/.mp4/.webm/.m4v`.
- **`@a, @b`** (multiple media) → side-by-side, equal height, centered.
- **`@img, prose`** (one image + text) → adaptive: portrait image → side-by-side
  split (text fills the horizontal space); landscape image → caption beneath.
- **`List - a - b - c`** → vertical centered stack of equal-width **green-stroke**
  boxes (text wraps). Works alone or as content after a header.
- **`Implement(slug): <spec>`** → a hand-coded interactive widget; the build injects
  `widgets/<slug>.html`. Without a slug, `Implement: <spec>` maps to
  `widgets/slide-<N>.html`. Implement slides are **headerless** (the widget is the
  slide). If the file is missing, a red placeholder names the expected path.
- **`Contributions: - a - b - (Takeaway) c`** (final slide) → a **left-aligned
  bullet list** (no boxes); all points shown together; the `(Takeaway)` item is
  another bullet, **bold**, and a fragment that **pops on the next click**.
- Anything else → centered body text.

---

# Style rules (non-negotiable — Winston)

- Blank **white** background. **No background images, ever.**
- **One font only** (Times New Roman / Tinos). No second typeface, no icon fonts.
- Eliminate the unnecessary — bullets only when they earn their place.
- **No presenter name, date, or institution logo anywhere except slide 1.**
- **Headers:** centered, red stroke, fixed position/size/font across ALL decks
  (it's the General Template). Side-gaps inside the box are fine.
- **List boxes:** centered, green stroke, identical shape, vertical stack.
- **Page numbers:** `2/N` at the **bottom-right** of every slide except the title
  (so numbering starts at `2/N`).
- **Animation:** only the final-slide takeaway pops. Everywhere else is static
  (fragments allowed only inside interactive widgets that need them).

Exact box pixels live in `_template/theme.css` `:root` (**locked 2026-06-03**).
To retune later, edit ONLY that `:root` block and re-view
`_template/prototype.html` — every deck updates at once.

---

# Two versions + references

Two builds from one source, differing only by a `with-refs` body class + an
appended references slide:
- `index.html` — **no references** (present this, less distraction).
- `index.ref.html` — citation bottom-left (APA author-date) + an auto
  **References** page as the last slide.

`assets/reference.md` format (bare is fine): `* filename[, filename2]: <DOI or URL>`.
Resolution at build time, cached to `assets/refs.cache.json` (committed, so
rebuilds are offline):
- **DOI** → tries **Crossref**, then **DataCite** (arXiv `10.48550/*`, Zenodo, etc.)
  → `Author et al. (Year)` in-text + full reference.
- **Non-DOI URL / failed lookup** → `Source: <host>` in-text, `Source: <url>` listed.
- A YouTube/GitHub link has no scholarly metadata; to get a real citation, write a
  full citation string in `reference.md` instead of a bare URL.

Export builds **both** variants; no-ref is primary.

---

# Interactive widgets

`Implement(...)` slides are bespoke. Write a self-contained
`<deck>/widgets/<slug>.html` (scoped HTML+JS+CSS — mouse control and text input
welcome). It survives rebuilds and is version-controlled; the build injects it.
Develop/test a widget in isolation, then rebuild.

---

# Export details

`export.mjs` does NOT use reveal's `?print-pdf` (it re-flows the custom absolute
layout and mis-paginates). Instead it serves the deck over a temporary local
HTTP server — Chrome blocks ES-module imports over `file://`, so reveal would
never load — drives the live deck in headless Chrome reconfigured to render each
slide 1:1 at 1920×1080, screenshots every slide, and assembles those frames into
the PDF and the contact sheet. **The PDF is exactly what you present.**
- First run downloads Chromium: `cd _template && npm install`.
- **Size knob:** `--scale=1` (default, native 1080p, ~5 MB/deck) or `--scale=2`
  (retina/zoomable, ~20 MB/deck). Frames are raster, so PDFs are larger than vector.
- **Video → snapshot:** the frame shows the video's first frame; widgets show
  their initial state; fragments are all forced visible so the PDF is complete.

---

# Version management

This is a **git** repo. Commit **everything** except `node_modules/` — source AND
generated deliverables (`index*.html`, PDFs, contact sheets, `refs.cache.json`).
This file's history is its backup; the pre-rewrite original is preserved in the
initial commit. Edit this CLAUDE.md as the workflow evolves, and commit changes.

---

# Icons/

A personal stash of app/symbol icons (ChatGPT, Claude, Gemini, Codex, Claude Code,
Antigravity, Cursor, VS Code, …). Not part of the pipeline.
