---
description: Onboard a fresh session to add schools to AllDorms (reads instructions, checks state, follows the add-a-school runbook)
argument-hint: "[school name(s) to add, optional]"
---

You're working on **AllDorms** (alldorms.net) — an Astro static site of college move-in
guides for parents. This command re-orients a fresh session so you can add schools
without re-deriving everything. Do the orientation steps, then get to work.

Requested school(s) to add this session: **$ARGUMENTS**
(If empty, finish the orientation and ask Hudson which school(s) to add.)

## 1. Read the canonical instructions (do this first, every time)

- `CLAUDE.md` — architecture, the **"Adding a school"** contract, gotchas, design rules.
- `~/.claude/skills/school-photos/SKILL.md` — the full photo-pipeline runbook.
- Skim `scripts/photos.mjs` header comments for the current command list.

## 2. Check current state

```
node scripts/photos.mjs status          # data sanity + which schools miss photos
# completeness check (a school can build green while being a content stub):
node -e "import('./src/data/schools.js').then(m=>{const R=['notes','links','housingSteps','communities','area','stay','stayNote','merch'];let ok=true;m.SCHOOLS.forEach(s=>{const miss=R.filter(k=>!s[k]||(Array.isArray(s[k])&&!s[k].length));if(miss.length){ok=false;console.log(s.slug,'MISSING:',miss.join(','))}});if(ok)console.log('all',m.SCHOOLS.length,'schools complete')})"
git status --short && git log --oneline -3
```

## 3. Add-a-school runbook (content FIRST, photos SECOND)

**A school is not "added" until its `schools.js` object matches the depth of every
other school AND has real campus photos.** Both halves, every time.

### Content
1. Confirm the school identity and disambiguate (e.g. "Lincoln" = which one?; a law/
   medical campus is often separate from the undergrad campus). Pick a lowercase-a–z0–9
   slug with no hyphens; check it doesn't collide.
2. Build the full object — every field in the CLAUDE.md contract, none optional. Use an
   existing complete school as the shape template. **No copy-paste boilerplate**: write
   each `tip`, `climate` prose, `lede` from what's true of *that* school.
3. **Research residence halls THOROUGHLY from the school's own housing pages — list ALL
   of them, not a partial recall.** (A pass once shipped Stetson missing its newest hall,
   Lynn Hall.) Same for the real housing timeline, mailing address, hotels, campus store.
4. Verify header fields against reality, don't default them: `ac` (ac/varies/none/mild),
   `region` (cold/mild/warm), `art.type`, `fridge`/microwave policy, `allowedExtra`/
   `bannedExtra`. Reconcile contradictions (no "microwave" in fridge if microwaves are banned).
5. Splice into `src/data/schools.js`. It's one hand-edited file — **edit it sequentially,
   never with parallel writers**, and re-run the completeness check + `npm run build` after.
   (A stray `,,` once silently dropped a school.)
6. Wire the three touch points: `SCHOOL_ALIASES` (`src/lib/site.js`), `SEARCH_NAMES`
   (`scripts/photos.mjs`), and `FOCUS` in **both** `src/pages/index.astro` and
   `src/pages/[school]/index.astro`.

**Batches of ~3+ schools:** consider the API content pipeline (`scripts/generate.mjs` — see CLAUDE.md → "Batch content pipeline"). It runs research → brief → write → apply with the same contract and validators at Batch-API pricing, off Hudson's subscription caps. Hudson reviews the briefs; you review/apply the entries and wire touch points. Requires `ANTHROPIC_API_KEY` (metered — check `.gen/spend.json` and respect `--budget`). Photos below stay exactly as they are.

### Photos — Hudson judges in the browser (do NOT judge them yourself)
7. `node scripts/photos.mjs fetch <slug>` (or `fetch-missing`). Deepen thin/contaminated
   pools with `--limit N --query "<landmark>"`; watch for wrong-campus hits (other
   institutions sharing the name, satellite campuses, people/protests/events).
8. **`node scripts/photos.mjs judge <slug...>`** — run it in the background, point Hudson
   at the localhost URL, and let **him** click Hero / Band 1 / Band 2. This is the
   preferred path: zero image tokens for you, and he's the design eye. Don't read previews
   to judge yourself, and don't fan out judge subagents, unless Hudson asks.
9. After submit, set `FOCUS` focal points if a hero crops oddly, `npm run build`, and
   spot-check the page. `node scripts/photos.mjs clean <slug>` when done.

## 4. Deploy discipline

Don't commit or deploy unless Hudson asks. When he does: stage only the intended files
(not unrelated working-tree changes), `git fetch`/rebase first (the Vercel app sometimes
pushes to `main`), push, then **verify the change is live on alldorms.net** — don't assume.

## 5. Subagents

Hudson has used research subagents for the *content* build-out (one per school, each
writing its object to a scratch file while you splice) — that's fine when he asks or the
batch is large. Photo *judging* is his job via the localhost gallery, not a subagent task.

---
Now: finish orientation, report current site state (school count, anything incomplete or
missing photos), and either start on **$ARGUMENTS** or ask what to add.
