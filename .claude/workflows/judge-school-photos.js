export const meta = {
  name: 'judge-school-photos',
  description: 'Visually judge fetched campus-photo candidates and pick hero/band1/band2 per school',
  whenToUse: 'After `node scripts/photos.mjs fetch` has filled photo-candidates/<slug>/. Pass args {schools:[{slug,name,city}]}. Returns picks to feed `node scripts/photos.mjs assign`.',
  phases: [
    { title: 'Judge', detail: 'one visual judge per school — reads every candidate image' },
    { title: 'Refine', detail: 'refetch with a landmark query + rejudge where the pool was weak' },
  ],
}

const REPO = '/Users/hudson/alldorms'

const PICK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    hero: { type: ['integer', 'null'], description: 'candidate n for the hero slot' },
    band1: { type: ['integer', 'null'], description: 'candidate n for photo band 1' },
    band2: { type: ['integer', 'null'], description: 'candidate n for photo band 2' },
    focus: { type: ['string', 'null'], description: "CSS object-position for the hero, e.g. '50% 25%', or null" },
    notes: { type: 'string', description: 'one or two sentences: what was picked and why' },
    refetchQuery: { type: ['string', 'null'], description: 'better Commons search if slots are unfillable, else null' },
  },
  required: ['hero', 'band1', 'band2', 'focus', 'notes', 'refetchQuery'],
}

const judgePrompt = (s, refined) => `You are the photo editor for AllDorms (alldorms.net), a warm, design-forward college move-in guide for parents.

School: ${s.name} — ${s.city} (slug: ${s.slug})

The directory ${REPO}/photo-candidates/${s.slug}/ contains numbered candidate photos (01.jpg, 02.jpg, …) from Wikimedia Commons, plus manifest.json describing each candidate (Commons title, description, artist, license).

Do this:
1. Read manifest.json.
2. Read EVERY numbered image file listed in the manifest — judge with your eyes, not just the metadata.
3. Pick three DIFFERENT candidates:
   - hero — used twice: the school page's wide hero banner (dark scrim with white text over it) and the homepage card cropped to 5:4. Wants: the school's most iconic, recognizable exterior — beautiful light, straight horizon, reads unmistakably as ${s.name}.
   - band1 and band2 — full-width scenic bands (~2.5–3:1 crop through the frame's vertical center) inside the guide. Wants: wide campus vistas whose subject sits near the VERTICAL CENTER (anything near top/bottom edges gets cropped away). Different subjects from the hero and from each other.

Hard rules:
- The photo must genuinely show ${s.name}'s campus. Check each candidate's Commons title/description — reject anything that names a different institution or is ambiguous.
- Reject: people as the main subject, charts/graphics/artwork, interiors, watermarks or stamped timestamps, heavy tilt, night shots, gloomy/washed-out weather, active construction.
- Snow only if postcard-beautiful; prefer green or golden-hour campus.

focus: for the HERO only — if its key subject (tower, dome, facade) is not vertically centered, give a CSS object-position like "50% 25%" (y < 50% pulls the crop toward the top of the image). Otherwise null.

${refined
  ? 'This pool is already a refined second attempt — fill every slot with the best available even if imperfect, and leave refetchQuery null unless the pool is truly unusable.'
  : 'If you cannot fill all three slots from acceptable candidates, set the unfillable slots to null and set refetchQuery to a better Wikimedia Commons search for this campus — usually its most famous landmark (e.g. "Cathedral of Learning" for Pitt). Otherwise refetchQuery must be null.'}

Return ONLY via structured output: {hero, band1, band2, focus, notes, refetchQuery}. hero/band1/band2 are candidate numbers — the "n" fields in the manifest.`

const input = typeof args === 'string' ? JSON.parse(args) : args

const results = await pipeline(
  input.schools,
  s => agent(judgePrompt(s, false), { label: `judge:${s.slug}`, phase: 'Judge', schema: PICK_SCHEMA }),
  async (pick, s) => {
    if (!pick) return null
    const filled = pick.hero && pick.band1 && pick.band2
    if (filled || !pick.refetchQuery) return { slug: s.slug, ...pick }
    log(`${s.slug}: weak pool — refetching with “${pick.refetchQuery}”`)
    await agent(
      `Run exactly this command and report its full output:\ncd ${REPO} && node scripts/photos.mjs fetch ${s.slug} --limit 16 --query "${pick.refetchQuery.replace(/"/g, '')}"`,
      { label: `refetch:${s.slug}`, phase: 'Refine', effort: 'low' },
    )
    const second = await agent(judgePrompt(s, true), { label: `rejudge:${s.slug}`, phase: 'Refine', schema: PICK_SCHEMA })
    return second ? { slug: s.slug, ...second, refined: true } : { slug: s.slug, ...pick, stale: true }
  },
)

return results.filter(Boolean)
