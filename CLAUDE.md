# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — dev server at http://localhost:4321
- `npm run build` — static build to `dist/` (~1s; catches syntax/reference errors only — there are no tests or linter, and an incomplete school still builds green, see "Adding a school")
- `npm run preview` — serve the built site
- Photo pipeline: `node scripts/photos.mjs status | fetch <slug> | fetch-missing | assign <slug> hero=N band1=N band2=N | custom <name> "query" | assign-custom <name> <n> | clean [<slug>] [--previews]` (see Campus photography)

## Deploying

Production is https://alldorms.net (Vercel project `alldorms`). Pushing `main` auto-deploys via the Vercel GitHub app; `vercel deploy --prod --yes` from the working tree also works. `git fetch`/rebase before pushing — the Vercel app occasionally pushes automated commits to `main`. Don't commit or deploy unless Hudson asks.

## Architecture

Astro 4 static site, zero client framework. Two files carry nearly everything:

- `src/data/schools.js` — ALL content: `SCHOOLS`, an array of large per-school objects (slug, accent color, climate table, halls, housing steps, area/stay/merch, links). The original 12 schools are multi-line literals; the 14 newer ones are single-line JSON-style objects. Adding a school here regenerates all its pages. Also exports the shared checklist/clothing/allowed/banned lists. Of the legacy `photo`/`dorm`/`art` fields only `art` is still used (drives the Postcard fallback tile when a school photo is missing).
- `src/lib/site.js` — the section model (`SECTIONS`, `schoolSections()`), display order (Colgate forced last), color helpers, `schoolTheme(accent)`, and `AFFILIATE_TAG` (`alldorms0e-20`, appended to every Shop link — the footer's Amazon disclosure is legally required, keep it).

Routing — **README.md's routing/structure section is outdated; trust this instead**: school guides are SINGLE pages. `/[school]/` renders all sections in one scroll (`src/pages/[school]/index.astro` + `components/Section.astro`, which renders every section type). A per-section-URL split was built and deliberately reverted for UX/SEO reasons — don't reintroduce it. Other routes: `/` homepage, `/credits/` (photo attribution rendered from `src/data/photo-credits.json`), and a hand-rolled `src/pages/sitemap.xml.js` (the @astrojs/sitemap integration is incompatible with Astro 4.16 — keep the custom one).

Theming: each school page is monochrome in that school's `accent` — `schoolTheme(accent)` builds a CSS-variable palette applied as inline vars on `<body>` via Base's `theme` prop (the accent plays the `--navy` role; paper/cream surfaces are the accent scaled toward white in HSL). The homepage passes no theme and keeps the global slate `#3a4a6b` + pale gold `#fdde6c` (deep gold `#9c7c1c` for accents on light backgrounds).

## Adding a school

Adding a school is a **content task first, photo task second**. A school is not "added" until its `schools.js` entry matches the depth of every existing one. (Cautionary tale: a July 2026 batch shipped 6 of 11 schools as stubs — lede/climate/tip only, no other sections — and the build gave no signal.)

- **Full object contract — none of these are optional.** Every established school has ALL of: `notes` (3 items), `links` (`{official, contact}`), `housingSteps` (3–5), `communities` (≥1), `area` (4), `stay` (3) **plus** `stayNote`, `merch` (2–3), `climate` (exactly 5 rows), `lede`, `tip`, and the header fields (`slug/short/name/city/accent/region/ac/beds/movein/art/bednote/fridge/housing`). `allowedExtra`/`bannedExtra` may be empty, but only after actually checking the school's housing policy — not as a default.
- **The build will NOT catch an incomplete school.** `schoolSections()` in `src/lib/site.js` skips any section whose data is missing (`has:` predicates), so a stub school builds green and just renders a thin page. Before declaring a batch done, run:
  ```
  node -e "import('./src/data/schools.js').then(m=>{const R=['notes','links','housingSteps','communities','area','stay','stayNote','merch'];let ok=true;m.SCHOOLS.forEach(s=>{const miss=R.filter(k=>!s[k]||(Array.isArray(s[k])&&!s[k].length));if(miss.length){ok=false;console.log(s.slug,'MISSING:',miss.join(','))}});if(ok)console.log('all',m.SCHOOLS.length,'schools complete')})"
  ```
- **No copy-paste boilerplate between schools.** Across all established schools there are ZERO verbatim-duplicated `tip`s, and no climate description is shared beyond an incidental pair. Write each school's `tip`, `climate` rows, and `lede` from what's actually true of *that* school (A/C or not, urban/rural, region, move-in month, its own landmarks). If you're pasting the same sentence into a second school, stop and rewrite both.
- **Small schools get the same depth as big ones.** The observed failure mode was full guides for the famous schools and stubs for the small PASSHE schools and HBCUs. Prominence and easy data availability don't shrink the contract — a small school takes the same research effort, and its families deserve the same guide.
- **Complete each school fully before starting the next.** Don't run a "photos for everyone now, content later" pass — the content pass is the one that gets dropped.
- **Every addition also touches:** `SCHOOL_ALIASES` in `src/lib/site.js` (for header search), `SEARCH_NAMES` in `scripts/photos.mjs` (or a `photoQuery` field), FOCUS entries in BOTH page files, and the full photo set via the pipeline below.

## Campus photography

Every school needs `public/schools/<slug>.jpg` (hero: school-page banner + homepage 5:4 card) plus `<slug>-1.jpg`/`<slug>-2.jpg` (full-width bands, center-cropped ~2.5–3:1). Pages fall back to Postcard art / Crest via build-time `fs.existsSync` when files are missing. Hard rule from Hudson: a school's photos must genuinely show THAT campus — never generic college imagery.

Use the user-level `/school-photos` skill for the full runbook. It drives `scripts/photos.mjs` (Wikimedia Commons fetch → license filter → visual judging → sips normalization → credits ledger) and the `.claude/workflows/judge-school-photos.js` per-school judging workflow. Per-school crop focal points live in `FOCUS` maps duplicated in BOTH `src/pages/index.astro` and `src/pages/[school]/index.astro`. Never hand-copy images into `public/` — assigning through the script is what records the attribution that `/credits` renders (the CC BY / CC BY-SA licenses require it).

## Gotchas

- `<script is:inline>{`…`}</script>` in a `.astro` file emits the template-literal wrapper as literal text and the JS silently never runs. Write raw JS with no `{}` wrapper, or define the JS as a frontmatter string and inject via `<script is:inline set:html={JS}>`. (The checklist progress bar once died this way.)
- The packing checklist persists per school in localStorage: checked state under `alldorms:checklist:<slug>`, user-added items under `alldorms:checklist-custom:<slug>` (Reset clears the former, never the latter). Custom rows are cloned from the `#customTpl` `<template>` in Section.astro so they carry Astro's scoped-style attribute — don't build them with bare `createElement`, and inject names via `textContent` only.
- `schools.js` is hand-edited and huge; a stray `,,` once left a hole in `SCHOOLS` that `.filter()` masked downstream. `node scripts/photos.mjs status` doubles as a quick data sanity check.

## Design rules (Hudson is design-minded — these are firm)

- Organic, not "AI-looking": no mono-caps letter-spaced eyebrows with dash prefixes, no two-tone headlines, no hairline-rule-on-everything grids, no flat pure-white canvas, no Inter-everywhere. Warm textured canvas, real photography, single-color serif headlines, sentence-case pill buttons.
- Fonts are deliberate (July 2026 pick, grounded in real publications): Frank Ruhl Libre (display — Haaretz), Charis SIL (serif body — the Charter/Medium reading face), Libre Franklin (sans/UI — NYT lineage), system mono stack (no webfont — genuine tabular data only). Hudson considers Fraunces/Newsreader/IBM Plex/Inter "classic AI fonts", and rejected the previous Piazzolla/Literata/Schibsted Grotesk/Spline Sans Mono set as still AI-looking — don't swap any of those back in. When proposing type, cite where real sites use it.
- Mobile-first: the audience is largely parents on phones. Never gate primary content or key affordances behind hover.
