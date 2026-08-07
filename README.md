# 64arc.com

The 64ARC website. Plain static HTML, CSS and JavaScript — no build step, no dependencies,
no framework. What is in this repository is exactly what gets served.

**Live:** <https://64arc.com>

## Pages

| File | Page |
|---|---|
| `index.html` | Home |
| `what-we-build.html` | What We Build |
| `how-it-works.html` | How It Works |
| `ai-intelligence.html` | AI + Intelligence |
| `work.html` | Work |
| `about.html` | About |
| `contact.html` | Contact |
| `privacy.html` | Privacy |
| `404.html` | Not found |

Shared assets live in `assets/` — `css/site.css`, `js/site.js`, `img/`.

## Running it locally

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Deploying

Deployed to GitHub Pages from `main` (branch source, root path). Pushing to `main`
republishes automatically — Pages just serves the files. `.nojekyll` disables Jekyll
processing; `CNAME` holds the custom domain.

## Design system

Tokens are at the top of `assets/css/site.css`.

| Token | Value | Use |
|---|---|---|
| `--carbon` | `#111318` | Primary typography, dark surfaces |
| `--ivory` | `#F4F1EA` | Primary light surface |
| `--signal` | `#5367FF` | Intelligence, interaction, emphasis |
| `--soft-grey` | `#E7E8EC` | Rules, borders, scaffolding |

Space Grotesk for display, Inter for body, IBM Plex Mono for technical labels. Type is
fluid via `clamp()`; content is capped at 1280px.

Every ink token clears WCAG AA against the surfaces it is used on — the contrast ratios are
recorded in comments beside each value. Keep them that way.

> **`clamp()` gotcha:** CSS requires whitespace around `+` and `-` inside math expressions.
> `clamp(2rem, 1rem + 3vw, 4rem)` is valid; `clamp(2rem,1rem+3vw,4rem)` is silently dropped.

## Motion

`assets/js/site.js` runs one `IntersectionObserver` that adds `.in-view`; CSS does the rest —
lines draw (`.draw`, path length measured at runtime), signals travel (`.flow`), nodes connect
(`.pop`), components align (`.reveal`). Everything collapses under `prefers-reduced-motion`,
and a `<noscript>` block in each page keeps all content visible without JavaScript.

## Editing

Each page is a complete, readable HTML document. Header, mobile menu and footer markup is
repeated in every page — the trade for having no build step. **Change a nav item or footer
link in all nine files** (find-and-replace across `*.html`).

## Contact form

`assets/js/site.js` reads `FORM_ENDPOINT` at the top of the file. Set it to a form endpoint
(Formspree, Basin, Getform) to receive enquiries by POST; success and error states are already
handled. Left empty, the form falls back to composing an email in the visitor's mail client.
