# AllDorms

A college move-in guide, built for the people doing the packing. Twelve universities,
each with a complete guide: what to pack, what's allowed, how housing works, where you'll
live, move-in logistics, town hotspots, where to stay, and school gear.

## Stack

- **[Astro](https://astro.build)** — static site generator. Ships near-zero JS, generates
  every page at build time. No client framework, no runtime.
- All content lives in **one data file**: `src/data/schools.js`. Add or edit a school there
  and every page for it regenerates automatically.

## How it's organized

```
src/
  data/schools.js        ← ALL content (the 12 schools, checklist, allowed/banned lists)
  lib/site.js            ← section model + helpers (which sections exist, links, checklist)
  layouts/
    Base.astro           ← site shell: fonts, header, footer
    SchoolLayout.astro   ← per-section page shell (banner + sidebar + prev/next)
  components/
    Crest.astro          ← varsity shield crest (campus-photo fallback)
    SchoolNav.astro      ← the numbered section sidebar (active state per section)
    Section.astro        ← renders all 10 section types
  pages/
    index.astro          ← landing page (hero + how-it-works + schools grid)
    [school]/index.astro ← each school's hub (hero + table of contents)
    [school]/[section].astro ← every section as its own page/URL
```

### Routing

Each section is its **own URL** — e.g. `/colgate/weather/`, `/colgate/checklist/`,
`/tamu/move-in/`. The sidebar nav and its active highlight change per section. Pages are
generated from the data via `getStaticPaths()`, so 12 schools × ~10 sections = ~120 section
pages, all built automatically.

## Run locally

```bash
npm install
npm run dev      # http://localhost:4321
```

## Build

```bash
npm run build    # outputs static site to dist/
npm run preview  # serve the built site locally
```

## Deploy to Vercel

Vercel auto-detects Astro. After pushing this project to the repo:

- **Build command:** `npm run build` (auto-detected)
- **Output directory:** `dist` (auto-detected)
- **Install command:** `npm install` (auto-detected)

Just push to the connected GitHub repo and Vercel builds and deploys it. No adapter or extra
config needed for a static Astro site.

> Migrating from the old single `index.html`: replace the repo contents with this project
> (keep `.git/`), commit, and push. Vercel will switch from serving the static file to
> building the Astro project.

## Editing content

Everything is in `src/data/schools.js`. Each school is one object. To add a section to a
school, add the relevant field (e.g. `communities`, `area`, `stay`, `merch`) — the section
page and its nav entry appear automatically. To hide a section, remove or empty that field.

## Notes

- **Campus photos:** the hero shows a varsity crest by default and tries to pull a campus
  photo from Wikipedia as progressive enhancement. The crest is always a clean fallback.
- **Affiliate links:** the packing checklist links to Amazon searches. `AFFILIATE_TAG` in
  `src/lib/site.js` is empty — add your Associates tag (and an FTC disclosure) before going
  live with one.
- AllDorms is an independent guide, not affiliated with any university.
