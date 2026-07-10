# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — dev server at http://localhost:4321
- `npm run build` — static build to `dist/` (~1s; this is also the only correctness check — there are no tests or linter)
- `npm run preview` — serve the built site
- Photo pipeline: `node scripts/photos.mjs status | fetch <slug> | fetch-missing | assign <slug> hero=N band1=N band2=N | custom <name> "query" | assign-custom <name> <n> | clean [<slug>] [--previews]` (see Campus photography)

## Deploying

Production is https://alldorms.net (Vercel project `alldorms`). Pushing `main` auto-deploys via the Vercel GitHub app; `vercel deploy --prod --yes` from the working tree also works. `git fetch`/rebase before pushing — the Vercel app occasionally pushes automated commits to `main`. Don't commit or deploy unless Hudson asks.

## Architecture

Astro 4 static site, zero client framework. Two files carry nearly everything:

- `src/data/schools.js` — ALL content: `SCHOOLS`, an array of large per-school objects (slug, accent color, climate table, halls, housing steps, area/stay/merch, links). The original 12 schools are multi-line literals; the 14 newer ones are single-line JSON-style objects. Adding a school here regenerates all its pages. Also exports the shared checklist/clothing/allowed/banned lists. Of the legacy `photo`/`dorm`/`art` fields only `art` is still used (drives the Postcard fallback tile when a school photo is missing).
- `src/lib/site.js` — the section model (`SECTIONS`, `schoolSections()`), display order (Colgate forced last), color helpers, `schoolTheme(accent)`, and `AFFILIATE_TAG` (`alldorms-20`, appended to every Shop link — the footer's Amazon disclosure is legally required, keep it).

Routing — **README.md's routing/structure section is outdated; trust this instead**: school guides are SINGLE pages. `/[school]/` renders all sections in one scroll (`src/pages/[school]/index.astro` + `components/Section.astro`, which renders every section type). A per-section-URL split was built and deliberately reverted for UX/SEO reasons — don't reintroduce it. Other routes: `/` homepage, `/credits/` (photo attribution rendered from `src/data/photo-credits.json`), and a hand-rolled `src/pages/sitemap.xml.js` (the @astrojs/sitemap integration is incompatible with Astro 4.16 — keep the custom one).

Theming: each school page is monochrome in that school's `accent` — `schoolTheme(accent)` builds a CSS-variable palette applied as inline vars on `<body>` via Base's `theme` prop (the accent plays the `--navy` role; paper/cream surfaces are the accent scaled toward white in HSL). The homepage passes no theme and keeps the global slate `#3a4a6b` + pale gold `#fdde6c` (deep gold `#9c7c1c` for accents on light backgrounds).

## Campus photography

Every school needs `public/schools/<slug>.jpg` (hero: school-page banner + homepage 5:4 card) plus `<slug>-1.jpg`/`<slug>-2.jpg` (full-width bands, center-cropped ~2.5–3:1). Pages fall back to Postcard art / Crest via build-time `fs.existsSync` when files are missing. Hard rule from Hudson: a school's photos must genuinely show THAT campus — never generic college imagery.

Use the user-level `/school-photos` skill for the full runbook. It drives `scripts/photos.mjs` (Wikimedia Commons fetch → license filter → visual judging → sips normalization → credits ledger) and the `.claude/workflows/judge-school-photos.js` per-school judging workflow. Per-school crop focal points live in `FOCUS` maps duplicated in BOTH `src/pages/index.astro` and `src/pages/[school]/index.astro`. Never hand-copy images into `public/` — assigning through the script is what records the attribution that `/credits` renders (the CC BY / CC BY-SA licenses require it).

## Gotchas

- `<script is:inline>{`…`}</script>` in a `.astro` file emits the template-literal wrapper as literal text and the JS silently never runs. Write raw JS with no `{}` wrapper, or define the JS as a frontmatter string and inject via `<script is:inline set:html={JS}>`. (The checklist progress bar once died this way.)
- The packing checklist persists per school in localStorage under `alldorms:checklist:<slug>`.
- `schools.js` is hand-edited and huge; a stray `,,` once left a hole in `SCHOOLS` that `.filter()` masked downstream. `node scripts/photos.mjs status` doubles as a quick data sanity check.

## Design rules (Hudson is design-minded — these are firm)

- Organic, not "AI-looking": no mono-caps letter-spaced eyebrows with dash prefixes, no two-tone headlines, no hairline-rule-on-everything grids, no flat pure-white canvas, no Inter-everywhere. Warm textured canvas, real photography, single-color serif headlines, sentence-case pill buttons.
- Fonts are deliberate: Piazzolla (display), Literata (serif), Schibsted Grotesk (sans), Spline Sans Mono (mono — genuine tabular data only). Hudson considers Fraunces/Newsreader/IBM Plex "classic AI fonts"; don't swap them in.
- Mobile-first: the audience is largely parents on phones. Never gate primary content or key affordances behind hover.
