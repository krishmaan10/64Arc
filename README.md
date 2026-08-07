# 64ARC — website

The 64ARC marketing site, built from `64ARC_Website_Detailed_Mockup.docx`.

Plain static HTML, CSS and JavaScript. **No build step, no dependencies, no framework** —
what is in this folder is exactly what gets served, so it deploys to anything from GoDaddy
shared hosting to Cloudflare Pages by uploading the folder.

---

## Pages

| File | Page | Purpose |
|---|---|---|
| `index.html` | Home | The full narrative: fragmentation → architecture → platform family → contextual AI → method → outcomes → invitation |
| `what-we-build.html` | What We Build | Six capability areas presented as one architecture, not six services |
| `how-it-works.html` | How It Works | Understand → Architect → Build → Connect → Evolve, with process-map artefacts |
| `ai-intelligence.html` | AI + Intelligence | Why connected context makes AI useful; five worked examples |
| `work.html` | Work | Ecosystem models: Before → Architecture → Platforms → Intelligence → Outcome |
| `about.html` | About | The story, the name, five positions |
| `contact.html` | Contact | Enquiry form and what happens next |
| `privacy.html` | Privacy | Short privacy note |
| `404.html` | Not found | |

Supporting files: `assets/css/site.css`, `assets/js/site.js`, `assets/img/`,
`favicon.ico`, `site.webmanifest`, `robots.txt`, `sitemap.xml`.

---

## Preview locally

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. (Opening the files directly with `file://` mostly works,
but a local server matches production behaviour.)

---

## Deploy

### Option A — GoDaddy hosting (you already own the domain there)

1. In the GoDaddy account, open **cPanel → File Manager**.
2. Go into `public_html` and delete the default placeholder page.
3. Upload **everything in this folder except** `README.md`, `.claude/`, and
   `64ARC_Website_Detailed_Mockup.docx`.
4. Keep the folder structure — `assets/` must stay a subfolder next to `index.html`.

The site is then live at `64arc.com`. GoDaddy serves `index.html` at the root automatically.

> If you only bought the **domain** from GoDaddy and not hosting, use option B and point the
> domain at the host instead — it is faster, free, and gives you HTTPS automatically.

### Option B — Netlify / Vercel / Cloudflare Pages (recommended)

All three accept a drag-and-drop of this folder:

- **Netlify** — <https://app.netlify.com/drop>, drag the folder in.
- **Cloudflare Pages** — create a project → *Direct Upload*.
- **Vercel** — `npx vercel --prod` from this folder.

Then point the domain at the host: in GoDaddy, **My Products → Domains → DNS**, and follow
the host's DNS instructions (usually an `A` record for `@` and a `CNAME` for `www`).
Certificates are issued automatically.

These hosts also serve clean URLs (`/about` as well as `/about.html`), which the `.html`
links here are compatible with either way.

---

## Before you go live

A few things are deliberately placeholder:

1. **`work.html` case studies.** The four entries are *illustrative ecosystem models*, and the
   page says so in its intro. They are not real client engagements. Replace them with actual
   case studies — the `Before / Architecture / Platforms / Intelligence / Outcome` structure
   is already there — or leave them as models and keep the disclaimer.
2. **`hello@64arc.com`.** Set up the mailbox, or change the address. It appears in
   `assets/js/site.js` (`CONTACT_EMAIL`) and in the footer/contact markup.
3. **LinkedIn.** There is no LinkedIn link in the footer — `linkedin.com/company/64arc`
   returned a 404, so shipping it would have been a dead link. Add the real URL to the
   "Start" list in each page's footer once the company page exists.
4. **Contact form delivery.** See below.

---

## Wiring up the contact form

Out of the box the form composes an email in the visitor's mail client — it works immediately,
but it is not ideal. To receive submissions properly, create a free endpoint at
[Formspree](https://formspree.io), [Basin](https://usebasin.com) or
[Getform](https://getform.io), then open `assets/js/site.js` and set:

```js
var FORM_ENDPOINT = 'https://formspree.io/f/xxxxxxxx';
```

That is the only change needed — submission, success and error states are already handled.

On Netlify you can instead add `netlify` and `name="contact"` attributes to the `<form>` tag
in `contact.html` and use Netlify Forms.

---

## Editing content

Each page is a complete, readable HTML document. The header, mobile menu and footer markup is
repeated in every page — that is the trade for having no build step. **If you change a
navigation item or footer link, change it in all nine files** (a find-and-replace across
`*.html` does it).

If the site grows past this, [Astro](https://astro.build) or
[Eleventy](https://11ty.dev) would give you shared layouts while still producing static HTML.

---

## Design system

Everything lives in `assets/css/site.css`, tokens first.

| Token | Value | Use |
|---|---|---|
| `--carbon` | `#111318` | Primary typography, dark surfaces |
| `--ivory` | `#F4F1EA` | Primary light surface |
| `--signal` | `#5367FF` | Intelligence, interaction, emphasis |
| `--soft-grey` | `#E7E8EC` | Rules, borders, scaffolding |

- **Display / headings** — Space Grotesk (engineered, geometric)
- **Body** — Inter (calm, readable at 16–19px)
- **Technical labels** — IBM Plex Mono, uppercase, wide tracking — the 64-bit nod

Type is fluid (`clamp()`): hero 34→80px, section headings 32→52px, body 16→19px. Content is
capped at 1280px with generous gutters. Cards use hairline borders and a 10px radius rather
than shadows and large pills.

> **Note on `clamp()`:** CSS requires whitespace around `+` and `-` inside math expressions.
> `clamp(2rem, 1rem + 3vw, 4rem)` is valid; `clamp(2rem,1rem+3vw,4rem)` is silently dropped.

Fonts load from Google Fonts. To self-host them (faster, and no third-party request — see the
privacy note), download the families and replace the `<link>` in each page's `<head>`.

### Motion

`assets/js/site.js` drives one `IntersectionObserver` that adds `.in-view`; CSS does the rest —
lines draw (`.draw`, measured at runtime), signals travel (`.flow`), nodes connect (`.pop`),
components align (`.reveal`). Everything collapses under `prefers-reduced-motion: reduce`, and
a `<noscript>` block shows all content if JavaScript never runs.

---

## Accessibility & SEO

Skip link, semantic landmarks, labelled form fields, `aria-current` on the active nav item,
`aria-expanded` on the menu button, and text alternatives on every diagram. Each page has its
own title, description, canonical URL and Open Graph tags; `sitemap.xml` and `robots.txt`
reference `https://64arc.com` — update those if the final domain differs.
