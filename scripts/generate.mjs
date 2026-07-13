#!/usr/bin/env node
/* AllDorms content pipeline — research + write school guides via the Anthropic API.
 *
 * Two-stage, quality-gated, budget-capped. Photos stay in the interactive flow
 * (Hudson judges in the browser) — this script only produces schools.js content.
 *
 * Commands:
 *   research <slug="Full Name"> [...]   Research each school with web search/fetch
 *                                       (serial, Opus 4.8 @ effort xhigh) and write an
 *                                       auditable brief to .gen/briefs/<slug>.md.
 *   write <slug> [...]                  Submit a Message Batch (50% off) that writes each
 *                                       school object from its brief against a strict JSON
 *                                       schema (Opus 4.8 @ effort high). --serial for
 *                                       immediate single-school runs. --dry-run to inspect.
 *   poll [--wait]                       Check the open batch; download finished entries to
 *                                       .gen/entries/<slug>.json and record spend.
 *   apply <slug> [...]                  Validate an entry (arity, enums, no-boilerplate vs
 *                                       existing schools), splice into src/data/schools.js
 *                                       (with backup), print SCHOOL_ALIASES / SEARCH_NAMES
 *                                       wiring. --wire to auto-insert those two lines.
 *   status                              Show briefs / entries / batches / total spend.
 *
 * Flags: --model claude-opus-4-8|claude-fable-5   (quality floor: nothing below Opus 4.8)
 *        --effort high|xhigh|max                  (floor: high; research defaults xhigh)
 *        --budget <usd>                           per-run spend cap (default $5)
 *        --exemplar <slug>                        template school for the writing prompt
 *        --dry-run | --serial | --wait | --wire | --force
 *
 * Auth: standard Anthropic credential resolution (ANTHROPIC_API_KEY). Bills the API
 * Console account (metered) — set a monthly spend limit in Console as the hard backstop;
 * --budget is the per-run soft cap enforced from the live usage ledger.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const GEN = path.join(ROOT, '.gen');
const BRIEFS = path.join(GEN, 'briefs');
const ENTRIES = path.join(GEN, 'entries');
const LEDGER = path.join(GEN, 'spend.json');
const BATCHES = path.join(GEN, 'batches.json');
const SCHOOLS_JS = path.join(ROOT, 'src', 'data', 'schools.js');
for (const d of [GEN, BRIEFS, ENTRIES]) fs.mkdirSync(d, { recursive: true });

/* ---------------- models, pricing, budget ---------------- */

// Quality floor per Hudson: only Opus 4.8 or Fable 5, effort high or above.
const ALLOWED_MODELS = ['claude-opus-4-8', 'claude-fable-5'];
const ALLOWED_EFFORT = ['high', 'xhigh', 'max'];
// $ per MTok: input, output, cache write (5m/1h avg not modeled — 1h = 2x in), cache read.
const PRICES = {
  'claude-opus-4-8': { in: 5, out: 25, cw: 10, cr: 0.5 },
  'claude-fable-5': { in: 10, out: 50, cw: 20, cr: 1 },
};
const WEB_SEARCH_PER_CALL = 0.01; // $10 / 1k searches

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
function writeJson(p, v) { fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n'); }

let runSpent = 0;
function recordUsage(stage, slug, model, usage, { batch = false } = {}) {
  const p = PRICES[model];
  const searches = usage?.server_tool_use?.web_search_requests ?? 0;
  const mult = batch ? 0.5 : 1;
  const cost =
    ((usage.input_tokens ?? 0) * p.in +
      (usage.output_tokens ?? 0) * p.out +
      (usage.cache_creation_input_tokens ?? 0) * p.cw +
      (usage.cache_read_input_tokens ?? 0) * p.cr) /
      1e6 * mult +
    searches * WEB_SEARCH_PER_CALL;
  const ledger = readJson(LEDGER, []);
  ledger.push({
    ts: new Date().toISOString(), stage, slug, model, batch,
    input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0,
    cache_read: usage.cache_read_input_tokens ?? 0, cache_write: usage.cache_creation_input_tokens ?? 0,
    web_searches: searches, cost: +cost.toFixed(4),
  });
  writeJson(LEDGER, ledger);
  runSpent += cost;
  return cost;
}
function totalSpend() { return readJson(LEDGER, []).reduce((a, r) => a + r.cost, 0); }
function assertBudget(budget, nextEstimate = 0) {
  if (runSpent + nextEstimate > budget) {
    console.error(`BUDGET STOP: $${runSpent.toFixed(2)} spent this run + ~$${nextEstimate.toFixed(2)} next would exceed --budget $${budget.toFixed(2)}. Re-run with a higher --budget to continue.`);
    process.exit(2);
  }
}

/* ---------------- shared data ---------------- */

const ALLOWED_ART = ['northeast', 'plains', 'coast', 'desert', 'midwest', 'mountain', 'pacific', 'midatlantic'];
const ALLOWED_REGION = ['cold', 'warm', 'mild'];
const ALLOWED_AC = ['none', 'ac', 'varies', 'mild'];

async function loadSchools() {
  const mod = await import(pathToFileURL(SCHOOLS_JS).href + `?t=${Date.now()}`);
  return mod.SCHOOLS;
}

/* ---------------- prompts ---------------- */

const CONTRACT = `You produce school guide entries for AllDorms (alldorms.net), a move-in guide for parents of incoming college students. Every entry must match the depth of every existing school — this contract has NO optional fields.

FIELD CONTRACT (arities are exact and enforced by a validator):
- photo: "" and dorm: "" (always empty strings — legacy fields).
- beds ("Twin XL" for nearly all US schools), bednote.
- fridge: {name, note} — the mini-fridge/microwave guidance for THIS school's actual policy (e.g. rent-a-MicroFridge program, size limits). Never claim a microwave is fine if the school bans them.
- allowedExtra / bannedExtra: arrays of school-SPECIFIC allowed/banned items. May be empty ONLY if the school's housing policy was actually checked and nothing notable diverges from the generic lists.
- slug (lowercase a–z0–9, no hyphens), short (display short name), name, city ("City, ST"), accent (the school's official brand hex, "#RRGGBB").
- region: ${ALLOWED_REGION.join('|')} · ac: ${ALLOWED_AC.join('|')} — from evidence, never defaults. "ac" only if first-year halls are cooled; "varies" if some halls lack it; reconcile contradictions.
- movein (e.g. "Late August"), art: {type: ${ALLOWED_ART.join('|')}, sky: [2 hex colors], sun: hex} matching the school's landscape, housing (official housing URL).
- lede: 2–3 sentences that could ONLY be about this school — its setting, character, and what the weather means for packing.
- climate: EXACTLY 5 rows of [period, temp range °F, one specific sentence with packing advice, hex color]. Periods: Move-in (month), Sept–Oct, Nov–Dec, Jan–Feb, Mar–May (adjust to the school's calendar). Colors from the site palette: hot #e0a458, warm #d6a84e, gold fall #cdaf68, green mild #8fae8c, steel cool #7e98a6, cold blue #5b7a99.
- tip: one sentence-to-two advice starting with a bolded kicker like "<b>The flip:</b>" or "<b>The move:</b>" — the single most useful packing insight for THIS school.
- communities: ≥1 group, each {name, blurb, halls: [{name, tag, desc}]}. The halls list must cover ALL first-year residence halls/communities from the school's own housing pages — a partial list is a defect (a past entry shipped missing the school's newest hall).
- housingSteps: 3–5 of {when, title, body} — the school's REAL housing timeline (application opens, roommate/room selection, assignment + mail ID, move-in), not a generic one.
- notes: EXACTLY 3 of [title, html]. The FIRST is the package-address note: title "addr|How to send a package to a <School> student", html using the pattern "<div class='block'><span class='var'>[Student Full Name]</span><br>...address lines...<br>City, ST ZIP</div>" followed by prose explaining the school's actual mail system (mail ID numbers, package pickup location, ID required). Notes 2–3: genuinely useful school-specific facts for parents (traditions, quirks, logistics).
- area: EXACTLY 4 of [tag, name, distance-or-empty, desc] — nearby districts, the iconic campus spot, supply runs, escapes.
- stay: EXACTLY 3 of [tag, hotel/area name, distance, desc, url-or-empty] — REAL hotels near campus, best options first.
- stayNote: one bolded-lead sentence-to-three on when hotels fill (move-in, football, graduation) and booking advice.
- merch: 2–3 of [store name, desc, url] — the official campus store first, real fan-gear options after.
- links: {official: [[label, url], ...], contact: [[label, url], ...]} — the school's real housing / residence halls / mail services pages, and a housing contact page.
- aliases: 3–6 search strings parents might type (full name, mascot, nickname, city, athletic conference) — used for the site's header search.
- searchName: the best Wikimedia Commons search term for campus photos (usually the formal institution name).`;

const STYLE = `STYLE RULES (firm):
- NO copy-paste boilerplate between schools. Across all existing schools there are ZERO verbatim-duplicated tips and no shared climate sentences beyond an incidental pair. Every lede, tip, climate row, blurb, and note must be written from what is true of THIS school. The validator rejects verbatim collisions.
- Small schools get the same depth as big ones. Sparse data availability does not shrink the contract.
- Voice: warm, concrete, parent-facing. Specific landmarks, real hall names, real numbers. No marketing fluff, no "nestled in the heart of".
- HTML: only <b>, <br>, <div class='block'>, <span class='var'> — as literal characters, never HTML-entity-escaped.
- Facts come from the research brief. If the brief marks something as a GAP, write around it honestly rather than inventing. Never fabricate a hall name, hotel, URL, or policy.`;

const RESEARCH_SYSTEM = `You are a meticulous research analyst for AllDorms (alldorms.net), preparing a fact brief that another writer will turn into a college move-in guide for parents. Use web_search and web_fetch. STRONGLY prefer the school's OWN pages (housing/residence life, mail services, admissions, brand guide) as sources; use third-party pages only for hotels/area color.

${CONTRACT}

Your job is to gather the FACTS the contract needs — not to write the guide. Non-negotiables:
1. DISAMBIGUATE FIRST: confirm which institution and which campus (law/medical campuses are often separate; many names collide across states). State what you confirmed.
2. ALL RESIDENCE HALLS: enumerate every first-year hall/community from the school's own residence-hall listing page — read the actual list page, do not recall. A missed hall (including the newest one) is the known failure mode.
3. POLICIES FROM THE SOURCE: fridge/microwave/appliance rules, allowed/banned items, AC status per hall where stated. Note contradictions explicitly.
4. MAIL: the exact student package address format (mail ID? hall address? central package center?), pickup location, what ID is needed.
5. TIMELINE: the real housing application/assignment/move-in sequence with months.
6. HOTELS: 3+ real hotels/areas near campus with rough distance and official URLs; when they sell out.
7. STORE: the official campus store (name + URL) and notable fan-gear options.
8. BRAND + PLACE: official brand hex color; the iconic campus spot; student districts; supply runs; escapes; climate reality for that city month-by-month.

OUTPUT: a markdown brief, max ~2500 words, starting with the line:
# <Official School Name> — research brief (<slug>)
then sections: Identity & disambiguation / Halls (ALL of them) / Policies / Mail / Timeline / Hotels / Store & merch / Area / Climate & brand / SOURCES (urls) / GAPS (anything you could not confirm — be honest).`;

function writeSystem(exemplar) {
  return [
    { type: 'text', text: CONTRACT + '\n\n' + STYLE },
    {
      type: 'text',
      text: `EXEMPLAR — a complete existing entry showing the exact shape, depth, tone, and HTML patterns expected (match its quality, never copy its sentences):\n${JSON.stringify(exemplar)}`,
      cache_control: { type: 'ephemeral', ttl: '1h' },
    },
  ];
}

function writeUser(slug, brief) {
  return `Write the complete AllDorms entry for the school below, as a single JSON object satisfying the contract. Facts must come from the research brief; write around honest GAPS rather than inventing. Reconcile any contradictions (e.g. never mention a microwave in "fridge" if microwaves are banned). Header fields (ac, region, art, accent, movein) must follow the brief's evidence, not defaults. The communities halls list must include ALL first-year halls named in the brief.

slug: ${slug}

RESEARCH BRIEF:
${brief}`;
}

/* ---------------- JSON schema (strict output shape) ---------------- */

const STR = { type: 'string' };
const arrOfStr = { type: 'array', items: STR };
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['photo', 'dorm', 'beds', 'bednote', 'fridge', 'allowedExtra', 'bannedExtra', 'slug', 'short', 'name', 'city', 'accent', 'region', 'ac', 'movein', 'art', 'housing', 'lede', 'climate', 'tip', 'communities', 'housingSteps', 'notes', 'area', 'stay', 'stayNote', 'merch', 'links', 'aliases', 'searchName'],
  properties: {
    photo: { type: 'string', const: '' },
    dorm: { type: 'string', const: '' },
    beds: STR, bednote: STR,
    fridge: { type: 'object', additionalProperties: false, required: ['name', 'note'], properties: { name: STR, note: STR } },
    allowedExtra: arrOfStr, bannedExtra: arrOfStr,
    slug: STR, short: STR, name: STR, city: STR, accent: STR,
    region: { type: 'string', enum: ALLOWED_REGION },
    ac: { type: 'string', enum: ALLOWED_AC },
    movein: STR,
    art: { type: 'object', additionalProperties: false, required: ['type', 'sky', 'sun'], properties: { type: { type: 'string', enum: ALLOWED_ART }, sky: arrOfStr, sun: STR } },
    housing: STR, lede: STR, tip: STR,
    climate: { type: 'array', items: arrOfStr },
    communities: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'blurb', 'halls'], properties: { name: STR, blurb: STR, halls: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'tag', 'desc'], properties: { name: STR, tag: STR, desc: STR } } } } } },
    housingSteps: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['when', 'title', 'body'], properties: { when: STR, title: STR, body: STR } } },
    notes: { type: 'array', items: arrOfStr },
    area: { type: 'array', items: arrOfStr },
    stay: { type: 'array', items: arrOfStr },
    stayNote: STR,
    merch: { type: 'array', items: arrOfStr },
    links: { type: 'object', additionalProperties: false, required: ['official', 'contact'], properties: { official: { type: 'array', items: arrOfStr }, contact: { type: 'array', items: arrOfStr } } },
    aliases: arrOfStr,
    searchName: STR,
  },
};

/* ---------------- validation (belt-and-suspenders over the schema) ---------------- */

function decodeEntities(s) {
  let prev = null, cur = s, i = 0;
  const map = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&apos;': "'", '&nbsp;': ' ' };
  while (cur !== prev && i < 6) {
    prev = cur; i++;
    cur = cur.replace(/&lt;|&gt;|&quot;|&#39;|&#x27;|&apos;|&nbsp;/g, m => map[m]).replace(/&amp;/g, '&');
  }
  return cur;
}
function walk(v) {
  if (typeof v === 'string') return decodeEntities(v);
  if (Array.isArray(v)) return v.map(walk);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = walk(v[k]); return o; }
  return v;
}

function validateEntry(e, schools, { force = false } = {}) {
  const problems = [], warnings = [];
  const rows = (name, arr, len, width) => {
    if (!Array.isArray(arr) || arr.length !== len) problems.push(`${name}: need exactly ${len} rows, got ${arr?.length}`);
    else arr.forEach((r, i) => { if (!Array.isArray(r) || r.length !== width) problems.push(`${name}[${i}]: need ${width} cells, got ${r?.length}`); });
  };
  if (!/^[a-z0-9]+$/.test(e.slug ?? '')) problems.push(`slug "${e.slug}" must be lowercase a-z0-9, no hyphens`);
  if (schools.some(s => s.slug === e.slug)) problems.push(`slug "${e.slug}" already exists in schools.js`);
  if (!/^#[0-9a-fA-F]{6}$/.test(e.accent ?? '')) problems.push(`accent "${e.accent}" is not #RRGGBB`);
  if (!/^https?:\/\//.test(e.housing ?? '')) problems.push(`housing "${e.housing}" is not a URL`);
  if (!/,\s*[A-Z]{2}$/.test(e.city ?? '')) warnings.push(`city "${e.city}" doesn't look like "City, ST"`);
  if (!Array.isArray(e.art?.sky) || e.art.sky.length !== 2) problems.push('art.sky must be exactly 2 colors');
  rows('climate', e.climate, 5, 4);
  rows('area', e.area, 4, 4);
  rows('stay', e.stay, 3, 5);
  if (!Array.isArray(e.notes) || e.notes.length !== 3) problems.push(`notes: need exactly 3, got ${e.notes?.length}`);
  else e.notes.forEach((n, i) => { if (!Array.isArray(n) || n.length !== 2) problems.push(`notes[${i}]: need [title, html]`); });
  if (!e.notes?.[0]?.[0]?.startsWith('addr|')) problems.push('notes[0] title must start with "addr|" (the package-address note)');
  if (!Array.isArray(e.merch) || e.merch.length < 2 || e.merch.length > 3) problems.push(`merch: need 2-3, got ${e.merch?.length}`);
  else e.merch.forEach((m, i) => { if (!Array.isArray(m) || m.length !== 3) problems.push(`merch[${i}]: need 3 cells`); });
  if (!Array.isArray(e.housingSteps) || e.housingSteps.length < 3 || e.housingSteps.length > 5) problems.push(`housingSteps: need 3-5, got ${e.housingSteps?.length}`);
  if (!Array.isArray(e.communities) || !e.communities.length || !e.communities.every(c => Array.isArray(c.halls) && c.halls.length)) problems.push('communities: need >=1 group, each with halls');
  for (const side of ['official', 'contact']) {
    const l = e.links?.[side];
    if (!Array.isArray(l) || !l.length || !l.every(x => Array.isArray(x) && x.length === 2)) problems.push(`links.${side}: need [[label, url], ...]`);
  }
  if (!Array.isArray(e.aliases) || e.aliases.length < 3) warnings.push('aliases: fewer than 3 search aliases');
  // No-boilerplate check vs every existing school.
  for (const s of schools) {
    if (e.tip && s.tip === e.tip) problems.push(`tip is verbatim-identical to ${s.slug}'s — rewrite it`);
    if (e.lede && s.lede === e.lede) problems.push(`lede is verbatim-identical to ${s.slug}'s — rewrite it`);
    for (const row of e.climate ?? []) {
      for (const srow of s.climate ?? []) {
        if (row?.[2] && row[2] === srow?.[2]) warnings.push(`climate sentence "${row[2].slice(0, 50)}..." duplicates ${s.slug} — rewrite unless truly incidental`);
      }
    }
  }
  if (force) { warnings.push(...problems.map(p => `(forced past) ${p}`)); return { problems: [], warnings }; }
  return { problems, warnings };
}

/* ---------------- splice + wiring ---------------- */

function spliceSchool(entry) {
  const bak = path.join(GEN, `schools.bak.${Date.now()}.js`);
  fs.copyFileSync(SCHOOLS_JS, bak);
  let src = fs.readFileSync(SCHOOLS_JS, 'utf8');
  const start = src.indexOf('export const SCHOOLS');
  if (start < 0) throw new Error('could not find "export const SCHOOLS" in schools.js');
  const close = src.indexOf('\n];', start);
  if (close < 0) throw new Error('could not find SCHOOLS closing "];"');
  let head = src.slice(0, close).trimEnd();
  if (!head.endsWith(',')) head += ',';
  const line = '  ' + JSON.stringify(entry) + ',';
  fs.writeFileSync(SCHOOLS_JS, head + '\n' + line + src.slice(close));
  return bak;
}

function wireLine(file, anchor, line) {
  const p = path.join(ROOT, file);
  let src = fs.readFileSync(p, 'utf8');
  const idx = src.indexOf(anchor);
  if (idx < 0) return false;
  const insertAt = src.indexOf('\n', idx) + 1;
  fs.writeFileSync(p, src.slice(0, insertAt) + line + '\n' + src.slice(insertAt));
  return true;
}

async function completenessCheck() {
  const schools = await loadSchools();
  const R = ['notes', 'links', 'housingSteps', 'communities', 'area', 'stay', 'stayNote', 'merch'];
  let ok = true;
  for (const s of schools) {
    const miss = R.filter(k => !s[k] || (Array.isArray(s[k]) && !s[k].length));
    if (miss.length) { ok = false; console.log(`  ${s.slug} MISSING: ${miss.join(',')}`); }
  }
  if (ok) console.log(`  all ${schools.length} schools complete`);
  return ok;
}

/* ---------------- arg parsing ---------------- */

const argv = process.argv.slice(2);
const cmd = argv[0];
const flags = {};
const positional = [];
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--dry-run') flags.dryRun = true;
  else if (a === '--serial') flags.serial = true;
  else if (a === '--wait') flags.wait = true;
  else if (a === '--wire') flags.wire = true;
  else if (a === '--force') flags.force = true;
  else if (a === '--model') flags.model = argv[++i];
  else if (a === '--effort') flags.effort = argv[++i];
  else if (a === '--budget') flags.budget = parseFloat(argv[++i]);
  else if (a === '--exemplar') flags.exemplar = argv[++i];
  else positional.push(a);
}
const MODEL = flags.model ?? 'claude-opus-4-8';
if (!ALLOWED_MODELS.includes(MODEL)) { console.error(`--model must be one of: ${ALLOWED_MODELS.join(', ')} (quality floor)`); process.exit(1); }
if (flags.effort && !ALLOWED_EFFORT.includes(flags.effort)) { console.error(`--effort must be one of: ${ALLOWED_EFFORT.join(', ')} (quality floor: high)`); process.exit(1); }
const BUDGET = Number.isFinite(flags.budget) ? flags.budget : 5;

function thinkingParam() {
  // Fable 5: thinking is always on — the param must be omitted. Opus 4.8: opt in explicitly.
  return MODEL === 'claude-fable-5' ? {} : { thinking: { type: 'adaptive' } };
}

async function getClient() {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  return new Anthropic();
}

/* ---------------- commands ---------------- */

async function cmdResearch() {
  // args: slug="Full Name" pairs
  const targets = positional.map(a => {
    const m = a.match(/^([a-z0-9]+)=(.+)$/);
    if (!m) { console.error(`bad arg "${a}" — use slug="Full School Name"`); process.exit(1); }
    return { slug: m[1], name: m[2] };
  });
  if (!targets.length) { console.error('usage: generate.mjs research <slug="Full Name"> [...]'); process.exit(1); }
  const schools = await loadSchools();
  for (const t of targets) {
    if (schools.some(s => s.slug === t.slug)) { console.error(`slug "${t.slug}" already exists — pick another`); process.exit(1); }
  }
  const effort = flags.effort ?? 'xhigh';
  if (flags.dryRun) {
    console.log(`[dry-run] would research ${targets.length} school(s) with ${MODEL} @ effort ${effort}:`);
    targets.forEach(t => console.log(`  ${t.slug} = ${t.name}`));
    return;
  }
  const client = await getClient();
  const tools = [
    { type: 'web_search_20260209', name: 'web_search', max_uses: 12 },
    { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 16 },
  ];
  for (const t of targets) {
    assertBudget(BUDGET, 0.35); // rough per-school research estimate
    console.log(`\n=== researching ${t.name} (${t.slug}) — ${MODEL} @ effort ${effort} ===`);
    let messages = [{ role: 'user', content: `School to research: ${t.name} (slug: ${t.slug}). Produce the brief.` }];
    let resp, continuations = 0;
    for (;;) {
      const stream = client.messages.stream({
        model: MODEL, max_tokens: 16000, ...thinkingParam(),
        output_config: { effort },
        system: [{ type: 'text', text: RESEARCH_SYSTEM, cache_control: { type: 'ephemeral', ttl: '1h' } }],
        tools, messages,
      });
      resp = await stream.finalMessage();
      recordUsage('research', t.slug, MODEL, resp.usage);
      if (resp.stop_reason === 'pause_turn' && continuations < 8) {
        messages = [...messages, { role: 'assistant', content: resp.content }];
        continuations++;
        console.log(`  (server tool loop paused — resuming, ${continuations})`);
        continue;
      }
      break;
    }
    if (resp.stop_reason === 'refusal') { console.error(`  REFUSED (${resp.stop_details?.category ?? 'n/a'}) — skipping ${t.slug}`); continue; }
    if (resp.stop_reason === 'max_tokens') console.error('  WARNING: hit max_tokens — brief may be truncated; review it.');
    const brief = resp.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    const out = path.join(BRIEFS, `${t.slug}.md`);
    fs.writeFileSync(out, brief.trim() + '\n');
    console.log(`  brief -> ${path.relative(ROOT, out)} (${brief.length} chars) · run spend $${runSpent.toFixed(2)}`);
  }
  console.log(`\nDone. Review the briefs (especially the GAPS sections) before running "write".`);
}

async function cmdWrite() {
  const slugs = positional;
  if (!slugs.length) { console.error('usage: generate.mjs write <slug> [...] [--serial|--dry-run]'); process.exit(1); }
  const schools = await loadSchools();
  const exemplarSlug = flags.exemplar ?? 'stetson';
  const exemplar = schools.find(s => s.slug === exemplarSlug);
  if (!exemplar) { console.error(`exemplar "${exemplarSlug}" not found in schools.js`); process.exit(1); }
  const effort = flags.effort ?? 'high';
  const briefs = {};
  for (const slug of slugs) {
    const p = path.join(BRIEFS, `${slug}.md`);
    if (!fs.existsSync(p)) { console.error(`no brief for "${slug}" — run research first (${path.relative(ROOT, p)})`); process.exit(1); }
    briefs[slug] = fs.readFileSync(p, 'utf8');
  }
  const mkParams = slug => ({
    model: MODEL, max_tokens: 16000, ...thinkingParam(),
    output_config: { effort, format: { type: 'json_schema', schema: SCHEMA } },
    system: writeSystem(exemplar),
    messages: [{ role: 'user', content: writeUser(slug, briefs[slug]) }],
  });
  if (flags.dryRun) {
    console.log(`[dry-run] would write ${slugs.length} entr${slugs.length === 1 ? 'y' : 'ies'} with ${MODEL} @ effort ${effort}, exemplar=${exemplarSlug}, mode=${flags.serial ? 'serial' : 'batch'}`);
    const sys = writeSystem(exemplar).map(b => b.text).join('\n');
    console.log(`  system prompt: ${sys.length} chars; brief sizes: ${slugs.map(s => `${s}=${briefs[s].length}`).join(', ')}`);
    return;
  }
  const client = await getClient();
  const est = slugs.length * (flags.serial ? 0.13 : 0.08);
  assertBudget(BUDGET, est);
  if (flags.serial) {
    for (const slug of slugs) {
      assertBudget(BUDGET, 0.13);
      console.log(`\n=== writing ${slug} (serial) — ${MODEL} @ effort ${effort} ===`);
      const stream = client.messages.stream(mkParams(slug));
      const resp = await stream.finalMessage();
      recordUsage('write', slug, MODEL, resp.usage);
      if (resp.stop_reason === 'refusal') { console.error(`  REFUSED — skipping ${slug}`); continue; }
      saveEntry(slug, resp);
    }
  } else {
    const batch = await client.messages.batches.create({
      requests: slugs.map(slug => ({ custom_id: slug, params: mkParams(slug) })),
    });
    const batches = readJson(BATCHES, []);
    batches.push({ id: batch.id, slugs, model: MODEL, submitted_at: new Date().toISOString(), status: 'submitted' });
    writeJson(BATCHES, batches);
    console.log(`Batch submitted: ${batch.id} (${slugs.length} schools, 50% off). Most batches finish within an hour.`);
    console.log(`Next: node scripts/generate.mjs poll --wait`);
  }
}

function saveEntry(slug, message) {
  const text = message.content.filter(b => b.type === 'text').map(b => b.text).join('');
  let entry;
  try { entry = JSON.parse(text); } catch (err) {
    const p = path.join(ENTRIES, `${slug}.raw.txt`);
    fs.writeFileSync(p, text);
    console.error(`  ${slug}: output was not valid JSON (${err.message}) — raw saved to ${path.relative(ROOT, p)}`);
    return;
  }
  const p = path.join(ENTRIES, `${slug}.json`);
  writeJson(p, entry);
  console.log(`  entry -> ${path.relative(ROOT, p)}`);
}

async function cmdPoll() {
  const batches = readJson(BATCHES, []);
  const open = batches.filter(b => b.status !== 'ended');
  if (!open.length) { console.log('no open batches'); return; }
  const client = await getClient();
  for (const rec of open) {
    let b = await client.messages.batches.retrieve(rec.id);
    while (b.processing_status !== 'ended' && flags.wait) {
      console.log(`  ${rec.id}: ${b.processing_status} (${b.request_counts.processing} processing) — waiting 60s`);
      await new Promise(r => setTimeout(r, 60_000));
      b = await client.messages.batches.retrieve(rec.id);
    }
    if (b.processing_status !== 'ended') { console.log(`  ${rec.id}: still ${b.processing_status} — re-run with --wait or later`); continue; }
    console.log(`  ${rec.id}: ended (${b.request_counts.succeeded} ok, ${b.request_counts.errored} errored)`);
    for await (const result of await client.messages.batches.results(rec.id)) {
      if (result.result.type === 'succeeded') {
        const msg = result.result.message;
        recordUsage('write', result.custom_id, rec.model, msg.usage, { batch: true });
        if (msg.stop_reason === 'refusal') { console.error(`  ${result.custom_id}: REFUSED`); continue; }
        saveEntry(result.custom_id, msg);
      } else {
        console.error(`  ${result.custom_id}: ${result.result.type}`);
      }
    }
    rec.status = 'ended';
    writeJson(BATCHES, batches);
  }
  console.log(`\nNext: review entries, then node scripts/generate.mjs apply <slug> [...]`);
}

async function cmdApply() {
  const slugs = positional;
  if (!slugs.length) { console.error('usage: generate.mjs apply <slug> [...] [--wire] [--force]'); process.exit(1); }
  for (const slug of slugs) {
    // Sequential by design — schools.js must never have parallel writers.
    const schools = await loadSchools();
    const p = path.join(ENTRIES, `${slug}.json`);
    if (!fs.existsSync(p)) { console.error(`no entry for "${slug}" (${path.relative(ROOT, p)})`); process.exit(1); }
    const raw = walk(readJson(p, null));
    const { aliases = [], searchName = raw?.name, ...entry } = raw;
    entry.photo = ''; entry.dorm = '';
    const { problems, warnings } = validateEntry(entry, schools, { force: flags.force });
    warnings.forEach(w => console.log(`  WARN ${slug}: ${w}`));
    if (problems.length) {
      problems.forEach(e => console.error(`  FAIL ${slug}: ${e}`));
      console.error(`  ${slug} NOT applied. Fix the entry JSON (or --force if you've verified it's right).`);
      process.exitCode = 1;
      continue;
    }
    const bak = spliceSchool(entry);
    console.log(`  ${slug} spliced into schools.js (backup: ${path.relative(ROOT, bak)})`);
    const aliasLine = `  ${entry.slug}: ${JSON.stringify(aliases)},`;
    const searchLine = `  ${entry.slug}: ${JSON.stringify(searchName)},`;
    if (flags.wire) {
      const w1 = wireLine('src/lib/site.js', 'export const SCHOOL_ALIASES = {', aliasLine);
      const w2 = wireLine('scripts/photos.mjs', 'const SEARCH_NAMES = {', searchLine);
      console.log(`  wired: SCHOOL_ALIASES ${w1 ? 'ok' : 'ANCHOR NOT FOUND — add manually'}, SEARCH_NAMES ${w2 ? 'ok' : 'ANCHOR NOT FOUND — add manually'}`);
    } else {
      console.log(`  wire these manually (or re-run apply with --wire):`);
      console.log(`    src/lib/site.js SCHOOL_ALIASES: ${aliasLine.trim()}`);
      console.log(`    scripts/photos.mjs SEARCH_NAMES: ${searchLine.trim()}`);
    }
  }
  console.log('\nCompleteness check:');
  const ok = await completenessCheck();
  console.log(ok ? 'Now: npm run build, spot-check the page, then run the photo pipeline (fetch + judge).' : 'FIX THE MISSING FIELDS BEFORE ANYTHING ELSE.');
}

async function cmdStatus() {
  const briefs = fs.readdirSync(BRIEFS).filter(f => f.endsWith('.md'));
  const entries = fs.readdirSync(ENTRIES).filter(f => f.endsWith('.json'));
  const batches = readJson(BATCHES, []);
  const schools = await loadSchools();
  const applied = new Set(schools.map(s => s.slug));
  console.log(`briefs (${briefs.length}):  ${briefs.map(f => f.replace('.md', '')).join(', ') || '—'}`);
  console.log(`entries (${entries.length}): ${entries.map(f => {
    const slug = f.replace('.json', '');
    return applied.has(slug) ? `${slug}(applied)` : slug;
  }).join(', ') || '—'}`);
  for (const b of batches) console.log(`batch ${b.id}: ${b.status} — ${b.slugs.join(', ')}`);
  console.log(`total API spend to date: $${totalSpend().toFixed(2)}`);
}

/* ---------------- main ---------------- */

const commands = { research: cmdResearch, write: cmdWrite, poll: cmdPoll, apply: cmdApply, status: cmdStatus };
if (!commands[cmd]) {
  console.log(`AllDorms content pipeline. Commands: ${Object.keys(commands).join(' | ')}\nSee the header of scripts/generate.mjs for full usage. Quality floor: ${ALLOWED_MODELS.join(' or ')} at effort high+.`);
  process.exit(cmd ? 1 : 0);
}
commands[cmd]().catch(err => { console.error(err?.message ?? err); process.exit(1); });
