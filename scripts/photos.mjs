#!/usr/bin/env node
// Campus-photo pipeline for AllDorms.
//
//   node scripts/photos.mjs status                          which schools have which photo slots
//   node scripts/photos.mjs fetch <slug> [--query "..."]    download candidates + contact sheet
//                                        [--limit N]        pool size (default 6)
//   node scripts/photos.mjs fetch-missing                   fetch candidates for every school missing a slot
//   node scripts/photos.mjs assign <slug> hero=3 band1=1 band2=7
//                                                           normalize picks into public/schools/ + record credits
//   node scripts/photos.mjs judge [slug...]  [--port 4500]  open a click-to-pick gallery in the browser; picks
//                                                           install automatically on Submit (no slug = every
//                                                           fetched school still missing a slot). Lets a human
//                                                           judge without Claude spending image tokens.
//   node scripts/photos.mjs custom <name> "search query"    candidates for a non-school slot (e.g. reading band)
//   node scripts/photos.mjs assign-custom <name> <n>        → public/<name>.jpg
//   node scripts/photos.mjs clean [<slug>] [--previews]     delete photo-candidates/ (all, or one school's dir);
//                                                           --previews keeps the full-res originals `assign` reads
//
// Photos come from Wikimedia Commons (CC0 / public domain / CC BY / CC BY-SA only).
// School searches use the school's FULL name so candidates are that specific campus —
// add a `photoQuery` field to a school in schools.js to override the search.
// Every assignment is logged to src/data/photo-credits.json (artist, license, source).

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { SCHOOLS } from '../src/data/schools.js';

const ROOT = path.join(import.meta.dirname, '..');
const CANDIDATES = path.join(ROOT, 'photo-candidates');
const SCHOOL_DIR = path.join(ROOT, 'public', 'schools');
const CREDITS = path.join(ROOT, 'src', 'data', 'photo-credits.json');
const UA = 'AllDorms-photo-fetcher/1.0 (https://alldorms.net; hudsonrexmiller@gmail.com)';

// Judging reads NN.preview.jpg, not the full-res NN.jpg: a 1024px frame is plenty to
// see composition, light, tilt, and watermarks, and costs ~2.3x fewer image tokens.
// `assign` always normalizes from the full-res original, so output quality is unchanged.
const PREVIEW_WIDTH = 1024;

// Commons search needs the full institution name; schools.js uses display names.
// New schools: either add them here or set `photoQuery` on the school object.
const SEARCH_NAMES = {
  utah: 'University of Utah Salt Lake City',
  miamiohio: 'Miami University',
  cincinnati: 'University of Cincinnati',
  texastech: 'Texas Tech University',
  vcu: 'Virginia Commonwealth University',
  swarthmore: 'Swarthmore College',
  pomona: 'Pomona College Claremont',
  wellesley: 'Wellesley College Massachusetts',
  smith: 'Smith College Northampton',
  mountholyoke: 'Mount Holyoke College South Hadley',
  vassar: 'Vassar College Poughkeepsie',
  barnard: 'Barnard College New York',
  hamilton: 'Hamilton College Clinton New York',
  cmu: 'Carnegie Mellon University',
  caltech: 'California Institute of Technology',
  tulane: 'Tulane University',
  miami: 'University of Miami',
  ucdavis: 'University of California, Davis',
  umass: 'University of Massachusetts Amherst',
  williammary: 'College of William & Mary',
  wesleyan: 'Wesleyan University Connecticut',
  brown: 'Brown University',
  princeton: 'Princeton University',
  dartmouth: 'Dartmouth College',
  columbia: 'Columbia University',
  johnshopkins: 'Johns Hopkins University',
  washu: 'Washington University in St. Louis',
  rice: 'Rice University',
  emory: 'Emory University',
  uchicago: 'University of Chicago',
  holycross: 'College of the Holy Cross Worcester',
  amherst: 'Amherst College',
  byu: 'Brigham Young University Provo',
  baylor: 'Baylor University Waco',
  richmond: 'University of Richmond',
  brandeis: 'Brandeis University',
  casewestern: 'Case Western Reserve University',
  rochester: 'University of Rochester',
  colgate: 'Colgate University',
  tamu: 'Texas A&M University',
  ucf: 'University of Central Florida',
  asu: 'Arizona State University Tempe',
  osu: 'Ohio State University',
  uf: 'University of Florida',
  utexas: 'University of Texas at Austin',
  umich: 'University of Michigan',
  pennstate: 'Penn State University Park',
  minnesota: 'University of Minnesota Minneapolis',
  uw: 'University of Washington Seattle',
  udel: 'University of Delaware',
  ucla: 'University of California, Los Angeles',
  wisconsin: 'University of Wisconsin Madison',
  georgia: 'University of Georgia',
  alabama: 'University of Alabama Tuscaloosa',
  indiana: 'Indiana University Bloomington',
  villanova: 'Villanova University',
  southcarolina: 'University of South Carolina',
  clemson: 'Clemson University',
  pitt: 'University of Pittsburgh',
  jmu: 'James Madison University',
  harvard: 'Harvard University',
  yale: 'Yale University',
  stanford: 'Stanford University',
  mit: 'Massachusetts Institute of Technology',
  purdue: 'Purdue University',
  michiganstate: 'Michigan State University',
  illinois: 'University of Illinois Urbana-Champaign',
  virginiatech: 'Virginia Tech',
  tennessee: 'University of Tennessee',
  auburn: 'Auburn University',
  lsu: 'Louisiana State University',
  fsu: 'Florida State University',
  unc: 'University of North Carolina at Chapel Hill',
  colorado: 'University of Colorado Boulder',
  rutgers: 'Rutgers University',
  olemiss: 'University of Mississippi',
  maryland: 'University of Maryland, College Park',
  kentucky: 'University of Kentucky',
  oregon: 'University of Oregon',
  missouri: 'University of Missouri',
  oklahoma: 'University of Oklahoma',
  arkansas: 'University of Arkansas',
  iowa: 'University of Iowa',
  kansas: 'University of Kansas',
  nebraska: 'University of Nebraska–Lincoln',
  westvirginia: 'West Virginia University',
  uconn: 'University of Connecticut',
  arizona: 'University of Arizona',
  lafayette: 'Lafayette College',
  lehigh: 'Lehigh University',
  dickinson: 'Dickinson College',
  trinity: 'Trinity College (Connecticut)',
  tufts: 'Tufts University',
  williams: 'Williams College',
  middlebury: 'Middlebury College',
  bowdoin: 'Bowdoin College',
  uva: 'University of Virginia',
  gatech: 'Georgia Institute of Technology',
  ncstate: 'North Carolina State University',
  notredame: 'University of Notre Dame',
  duke: 'Duke University',
  vanderbilt: 'Vanderbilt University',
  northwestern: 'Northwestern University',
  usc: 'University of Southern California',
  bc: 'Boston College',
  bu: 'Boston University',
  nyu: 'New York University',
  georgetown: 'Georgetown University',
  syracuse: 'Syracuse University',
  northeastern: 'Northeastern University',
  berkeley: 'University of California, Berkeley',
  ucsb: 'University of California, Santa Barbara',
  cornell: 'Cornell University',
  upenn: 'University of Pennsylvania',
  wakeforest: 'Wake Forest University',
  iowastate: 'Iowa State University',
  uvm: 'University of Vermont',
  drexel: 'Drexel University',
  skidmore: 'Skidmore College',
  washingtoncollege: 'Washington College',
  sju: "Saint Joseph's University",
  cofc: 'College of Charleston',
  cheyney: 'Cheyney University of Pennsylvania',
  lincoln: 'Lincoln University (Pennsylvania)',
  bloomsburg: 'Bloomsburg University of Pennsylvania',
  westchester: 'West Chester University of Pennsylvania',
  millersville: 'Millersville University of Pennsylvania',
  lasalle: 'La Salle University',
  temple: 'Temple University',
  delawarestate: 'Delaware State University',
  ursinus: 'Ursinus College',
  stetson: 'Stetson University',
  ucsd: 'University of California, San Diego',
  usandiego: 'University of San Diego',
  santaclara: 'Santa Clara University',
};

const SLOTS = { hero: { suffix: '.jpg', width: 2000 }, band1: { suffix: '-1.jpg', width: 1800 }, band2: { suffix: '-2.jpg', width: 1800 } };
const OK_LICENSE = /^(cc0|cc[- ]by(-sa)?(\s|-)?\d?(\.\d)?|public domain|pd|no restrictions)/i;
const BAD_TITLE = /logo|seal|coat of arms|\bmap\b|flag|icon|banner|diagram|chart|poster|screenshot|scan|document|book cover|plaque|marker|postcard|\bHABS\b|\bHAER\b|police|cruiser|interior|corridor|floor plan|engraving|lithograph|painting|drawing|sketch|treaty|printed copy|manuscript|title page|alumni day|commencement|graduation|inauguration|convocation|protest|rally|speech|lecture|conference|ceremony|award|view of earth|\bISS\d/i;

const die = msg => { console.error(msg); process.exit(1); };
const arg = (flag, dflt) => { const i = process.argv.indexOf(flag); return i > -1 ? process.argv[i + 1] : dflt; };
const stripHtml = s => (s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

function searchQuery(school) {
  return school.photoQuery || `${SEARCH_NAMES[school.slug] || school.name} campus`;
}

async function api(base, params) {
  const url = new URL(base);
  url.search = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) die(`${url.host} ${res.status}: ${await res.text()}`);
  return res.json();
}

// The school's Wikidata id lets us search Commons structured data for files that
// DEPICT that specific institution — the strongest school-specificity signal we have.
async function wikidataQid(name) {
  const wp = await api('https://en.wikipedia.org/w/api.php', {
    action: 'query', titles: name, prop: 'pageprops', ppprop: 'wikibase_item', redirects: '1',
  });
  const qid = wp?.query?.pages?.[0]?.pageprops?.wikibase_item;
  if (qid) return qid;
  const wd = await api('https://www.wikidata.org/w/api.php', {
    action: 'wbsearchentities', search: name, language: 'en', type: 'item', limit: '1',
  });
  return wd?.search?.[0]?.id || null;
}

// Images used on the school's own English Wikipedia article — hand-curated,
// correctly identified, and usually the iconic shots. Our best candidate source.
async function enwikiArticleFiles(qid) {
  if (!qid) return [];
  const e = await api('https://www.wikidata.org/w/api.php', {
    action: 'wbgetentities', ids: qid, props: 'sitelinks', sitefilter: 'enwiki',
  });
  const title = e?.entities?.[qid]?.sitelinks?.enwiki?.title;
  if (!title) return [];
  const j = await api('https://en.wikipedia.org/w/api.php', {
    action: 'query', titles: title, prop: 'images', imlimit: 'max', redirects: '1',
  });
  return (j?.query?.pages?.[0]?.images || []).map(f => f.title);
}

async function commonsInfoByTitles(titles, base) {
  const out = [];
  for (let i = 0; i < titles.length; i += 50) {
    const j = await api('https://commons.wikimedia.org/w/api.php', {
      action: 'query', titles: titles.slice(i, i + 50).join('|'),
      prop: 'imageinfo|categories', iiprop: 'url|size|mime|extmetadata',
      clcategories: 'Category:Quality images|Category:Featured pictures on Wikimedia Commons', cllimit: 'max',
    });
    for (const p of j?.query?.pages || []) if (!p.missing && p.imageinfo) out.push(p);
  }
  return out.map((p, rank) => ({ p, rank: rank * 0.5, base }));
}

async function searchOnce(gsrsearch, base, gsrsort = 'relevance') {
  // NOTE: no iiurlwidth here — asking the API to pre-render thumbs for a 40-page
  // generator hits a per-request render cap and silently drops most results.
  // We build thumb URLs ourselves via thumb.php at download time instead.
  const j = await api('https://commons.wikimedia.org/w/api.php', {
    action: 'query', generator: 'search', gsrsearch, gsrnamespace: '6', gsrlimit: '40', gsrsort,
    prop: 'imageinfo|categories', iiprop: 'url|size|mime|extmetadata',
    clcategories: 'Category:Quality images|Category:Featured pictures on Wikimedia Commons', cllimit: 'max',
  });
  return (j?.query?.pages || []).sort((a, b) => a.index - b.index).map((p, rank) => ({ p, rank, base }));
}

async function commonsSearch({ text, qid }, limit) {
  const batches = [];
  batches.push(await commonsInfoByTitles(await enwikiArticleFiles(qid), 70));    // Wikipedia article images
  if (qid) {
    const depicts = `filetype:bitmap haswbstatement:P180=${qid}`;
    batches.push(await searchOnce(`${depicts} campus`, 60));                     // depicts, campus-relevant
    batches.push(await searchOnce(depicts, 55, 'incoming_links_desc'));          // depicts, most-used = iconic
    batches.push(await searchOnce(depicts, 45));                                 // depicts, breadth
  }
  batches.push(await searchOnce(`${text} filetype:bitmap`, 30));                 // text fallback

  const byTitle = new Map();
  for (const { p, rank, base } of batches.flat()) {
    const title = p.title.replace(/^File:/, '');
    if (byTitle.has(title)) { byTitle.get(title).score += 15; continue; } // found by several searches
    const ii = p.imageinfo?.[0];
    if (!ii) continue;
    const meta = ii.extmetadata || {};
    const license = stripHtml(meta.LicenseShortName?.value);
    if (!OK_LICENSE.test(license)) continue;
    if (BAD_TITLE.test(title)) continue;
    if (ii.mime !== 'image/jpeg') continue; // png/svg/tiff here are charts, logos, archival scans
    if (ii.width < 1400) continue;
    const ratio = ii.width / ii.height;
    if (ratio < 1.15 || ratio > 2.7) continue; // usable landscape only
    const assessed = (p.categories || []).length > 0; // in Quality/Featured images
    byTitle.set(title, {
      title,
      description: stripHtml(meta.ImageDescription?.value).slice(0, 300),
      artist: stripHtml(meta.Artist?.value) || 'Unknown',
      license,
      source: ii.descriptionurl,
      width: ii.width, height: ii.height, mime: ii.mime,
      url: ii.width > 2400
        ? `https://commons.wikimedia.org/w/thumb.php?f=${encodeURIComponent(title)}&w=2400`
        : ii.url,
      assessed,
      score: base - rank + (assessed ? 45 : 0) + Math.min(ii.width / 500, 10) + (ratio > 1.3 && ratio < 2.1 ? 5 : 0)
        - (/\b1[89]\d\d\b|construction|demolition|historic/i.test(title) ? 30 : 0), // archival shots
    });
  }
  return [...byTitle.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

async function download(cands, dir, label, query) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const kept = [];
  for (const c of cands) {
    const n = kept.length + 1;
    try {
      const res = await fetch(c.url, { headers: { 'User-Agent': UA } });
      if (!res.ok) continue;
      const file = path.join(dir, `${String(n).padStart(2, '0')}.jpg`);
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      const preview = makePreview(file);
      kept.push({ n, file: path.relative(ROOT, file), preview: path.relative(ROOT, preview), ...c, url: undefined });
      process.stdout.write(`  ${String(n).padStart(2, '0')}  ${c.license.padEnd(12)} ${c.width}×${c.height}${c.assessed ? '  ★' : ''}  ${c.title.slice(0, 70)}\n`);
    } catch { /* skip dead file */ }
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ label, query, fetched: kept }, null, 2));
  writeSheet(dir, label, query, kept);
  return kept;
}

function writeSheet(dir, label, query, kept) {
  const cards = kept.map(c => `
    <figure><img src="${path.basename(c.preview || c.file)}" loading="lazy">
      <figcaption><b>#${c.n}${c.assessed ? ' ★' : ''}</b> · ${c.width}×${c.height} · ${c.license}<br>
      ${c.title}<br><i>${c.artist}</i> — <a href="${c.source}">source</a></figcaption>
    </figure>`).join('');
  fs.writeFileSync(path.join(dir, 'sheet.html'), `<!doctype html><meta charset="utf-8">
<title>${label} candidates</title>
<style>body{font:14px/1.4 system-ui;margin:2rem;background:#16181d;color:#eee}
figure{margin:0 0 2rem;max-width:960px}img{width:100%;border-radius:8px}a{color:#9cf}
figcaption{padding:.5rem 0}</style>
<h1>${label} — “${query}”</h1><p>Assign with e.g. <code>node scripts/photos.mjs assign ${label} hero=1 band1=2 band2=3</code></p>${cards}`);
}

// Small sibling of the full-res candidate, for the visual judge to read cheaply.
function makePreview(srcFile) {
  const destFile = srcFile.replace(/\.jpg$/, '.preview.jpg');
  fs.copyFileSync(srcFile, destFile);
  const w = parseInt(execFileSync('sips', ['-g', 'pixelWidth', destFile]).toString().match(/pixelWidth: (\d+)/)?.[1] || '0', 10);
  const resize = w > PREVIEW_WIDTH ? ['--resampleWidth', String(PREVIEW_WIDTH)] : [];
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '70', ...resize, destFile], { stdio: 'ignore' });
  return destFile;
}

// Rebuild any missing NN.preview.jpg from the kept full-res NN.jpg — lets a dir that
// was `clean --previews`d be judged again without a network refetch. Returns count made.
function ensurePreviews(dir) {
  let made = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!/^\d+\.jpg$/.test(f)) continue;
    if (fs.existsSync(path.join(dir, f.replace(/\.jpg$/, '.preview.jpg')))) continue;
    makePreview(path.join(dir, f));
    made++;
  }
  return made;
}

// Previews are disposable once a school's slots are assigned; the full-res siblings
// are not — `assign` normalizes from those. Both live under photo-candidates/.
function walk(dir, keep) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, keep));
    else if (!keep || keep(e.name)) out.push(p);
  }
  return out;
}

const bytes = files => files.reduce((n, f) => n + fs.statSync(f).size, 0);
const mb = n => `${(n / 1e6).toFixed(1)} MB`;

function normalizeInto(srcFile, destFile, maxWidth) {
  fs.mkdirSync(path.dirname(destFile), { recursive: true });
  fs.copyFileSync(srcFile, destFile);
  const w = parseInt(execFileSync('sips', ['-g', 'pixelWidth', destFile]).toString().match(/pixelWidth: (\d+)/)?.[1] || '0', 10);
  const resize = w > maxWidth ? ['--resampleWidth', String(maxWidth)] : [];
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', ...resize, destFile], { stdio: 'ignore' });
}

function recordCredit(target, slot, cand, label) {
  const credits = fs.existsSync(CREDITS) ? JSON.parse(fs.readFileSync(CREDITS, 'utf8')) : {};
  credits[target] = { for: label, slot, title: cand.title, artist: cand.artist, license: cand.license, source: cand.source };
  fs.writeFileSync(CREDITS, JSON.stringify(credits, null, 2) + '\n');
}

const slotFiles = slug => Object.fromEntries(Object.entries(SLOTS).map(([k, v]) => [k, path.join(SCHOOL_DIR, slug + v.suffix)]));
const missingSlots = slug => Object.entries(slotFiles(slug)).filter(([, f]) => !fs.existsSync(f)).map(([k]) => k);
const getSchool = slug => SCHOOLS.find(s => s.slug === slug) || die(`No school with slug "${slug}" in schools.js`);
const getSchoolSafe = slug => SCHOOLS.find(s => s.slug === slug);

async function fetchSchool(school, limit) {
  const query = arg('--query', searchQuery(school));
  const qid = await wikidataQid(SEARCH_NAMES[school.slug] || school.name);
  console.log(`\n${school.slug}: Commons “${query}”${qid ? ` + depicts:${qid}` : ' (no Wikidata match — text only)'}`);
  const cands = await commonsSearch({ text: query, qid }, limit);
  if (!cands.length) {
    console.warn(`  !! no usable candidates — try: node scripts/photos.mjs fetch ${school.slug} --query "..."`);
    return;
  }
  const kept = await download(cands, path.join(CANDIDATES, school.slug), school.slug, query);
  console.log(`  → ${kept.length} candidates in photo-candidates/${school.slug}/ (open sheet.html to compare)`);
}

const loadManifest = dir => JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));

// Install a school's picks — { hero:N, band1:N, band2:N }, any subset. Throws (not die())
// so the judge server can report a bad pick without the whole process exiting.
function assignSlots(slug, picks) {
  const manifest = loadManifest(path.join(CANDIDATES, slug));
  const done = [];
  for (const [slot, raw] of Object.entries(picks)) {
    if (raw == null || raw === '') continue;
    const n = Number(raw);
    if (!SLOTS[slot]) throw new Error(`Unknown slot "${slot}" (hero, band1, band2)`);
    const cand = manifest.fetched.find(c => c.n === n);
    if (!cand) throw new Error(`No candidate #${n} for ${slug}`);
    const dest = path.join(SCHOOL_DIR, slug + SLOTS[slot].suffix);
    normalizeInto(path.join(ROOT, cand.file), dest, SLOTS[slot].width);
    recordCredit(path.relative(ROOT, dest), slot, cand, slug);
    done.push({ slot, n, title: cand.title, dest: path.relative(ROOT, dest) });
  }
  return done;
}

function assignCustomPick(name, raw, width = 1600) {
  const n = Number(raw);
  const manifest = loadManifest(path.join(CANDIDATES, '_' + name));
  const cand = manifest.fetched.find(c => c.n === n);
  if (!cand) throw new Error(`No candidate #${n} for ${name}`);
  const dest = path.join(ROOT, 'public', `${name}.jpg`);
  normalizeInto(path.join(ROOT, cand.file), dest, width);
  recordCredit(path.relative(ROOT, dest), 'custom', cand, name);
  return { n, title: cand.title, dest: path.relative(ROOT, dest) };
}

// ── Human judging server ────────────────────────────────────────────────────
// Serves a click-to-pick gallery of the preview jpgs; on Submit it installs the
// picks straight through assignSlots/assignCustomPick and exits. Lets Hudson do
// the visual judging in a browser so Claude never loads candidate images.

// Cache-buster stamped once per process. Preview paths (/img/<dir>/NN.preview.jpg)
// are stable, but a refetch replaces the bytes behind them — without this the
// browser would show a previous run's cached thumbnail while the saved pick number
// maps to the fresh candidate, silently installing the wrong image.
const IMGV = Date.now();

function judgeTargets(wanted) {
  const asTarget = dir => ({ dir, name: dir.replace(/^_/, ''), isCustom: dir.startsWith('_') });
  const hasManifest = dir => fs.existsSync(path.join(CANDIDATES, dir, 'manifest.json'));
  let dirs;
  if (wanted.length) {
    dirs = wanted.map(k => [k, '_' + k].find(hasManifest) || die(`No candidates for "${k}" — run fetch ${k} first`));
  } else {
    dirs = fs.existsSync(CANDIDATES)
      ? fs.readdirSync(CANDIDATES, { withFileTypes: true }).filter(e => e.isDirectory() && hasManifest(e.name)).map(e => e.name)
      : [];
    // Default queue: real schools that still need a slot (skip custom + already-complete).
    dirs = dirs.filter(d => !d.startsWith('_') && missingSlots(d).length);
    if (!dirs.length) die('Nothing to judge — every fetched school has all slots. Pass a slug to re-judge one.');
  }
  return dirs.map(asTarget).map(t => {
    const m = loadManifest(path.join(CANDIDATES, t.dir));
    return {
      dir: t.dir, name: t.name, isCustom: t.isCustom, query: m.query,
      label: t.isCustom ? t.name : (getSchoolSafe(t.name)?.name || t.name),
      missing: t.isCustom ? ['custom'] : missingSlots(t.name),
      candidates: m.fetched.map(c => ({
        n: c.n, img: `/img/${t.dir}/${path.basename(c.preview || c.file)}?v=${IMGV}`,
        title: c.title, artist: c.artist, license: c.license, source: c.source,
        dims: `${c.width}×${c.height}`, assessed: !!c.assessed,
      })),
    };
  });
}

function applyJudgePicks(targets, picks) {
  const out = [];
  for (const t of targets) {
    const p = picks[t.dir] || {};
    if (Object.values(p).every(v => v == null || v === '')) { out.push({ dir: t.dir, skipped: true, line: `${t.name}: no picks — skipped` }); continue; }
    try {
      if (t.isCustom) {
        const r = assignCustomPick(t.name, p.custom);
        out.push({ dir: t.dir, line: `${t.name}: custom ← #${r.n}  ${r.title.slice(0, 50)}` });
      } else {
        const done = assignSlots(t.name, { hero: p.hero, band1: p.band1, band2: p.band2 });
        out.push({ dir: t.dir, installed: done.map(d => d.slot), line: `${t.name}: ${done.map(d => `${d.slot}←#${d.n}`).join('  ')}` });
      }
    } catch (e) {
      out.push({ dir: t.dir, error: String(e.message || e), line: `${t.name}: ERROR ${e.message || e}` });
    }
  }
  return out;
}

function startJudge(wanted, port) {
  const targets = judgeTargets(wanted);
  for (const t of targets) {
    const n = ensurePreviews(path.join(CANDIDATES, t.dir));
    if (n) console.log(`  regenerated ${n} preview${n === 1 ? '' : 's'} for ${t.name}`);
  }
  const dirs = new Set(targets.map(t => t.dir));
  const html = judgeHtml(targets);
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && u.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(html);
    }
    if (req.method === 'GET' && u.pathname.startsWith('/img/')) {
      const [, , dir, file] = u.pathname.split('/');
      if (!dirs.has(dir) || !/^\d+(\.preview)?\.jpe?g$/i.test(file || '')) { res.writeHead(404); return res.end(); }
      const fp = path.join(CANDIDATES, dir, file);
      if (!fp.startsWith(CANDIDATES + path.sep) || !fs.existsSync(fp)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'max-age=3600' });
      return fs.createReadStream(fp).pipe(res);
    }
    if (req.method === 'POST' && u.pathname === '/save') {
      let body = '';
      req.on('data', d => { body += d; if (body.length > 1e6) req.destroy(); });
      req.on('end', () => {
        let picks;
        try { picks = JSON.parse(body).picks || {}; } catch { res.writeHead(400); return res.end('bad json'); }
        const results = applyJudgePicks(targets, picks);
        fs.writeFileSync(path.join(CANDIDATES, '_picks.json'), JSON.stringify({ picks, results }, null, 2));
        console.log('\nJUDGE_SUBMITTED');
        for (const r of results) console.log('  ' + r.line);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ results }), () => setTimeout(() => process.exit(0), 300));
      });
      return;
    }
    res.writeHead(404); res.end();
  });
  server.on('error', e => {
    if (e.code === 'EADDRINUSE') { console.error(`  port ${port} busy — trying ${port + 1}`); startJudge(wanted, port + 1); }
    else die(String(e));
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`\n  Judging ${targets.length} school${targets.length === 1 ? '' : 's'}: ${targets.map(t => t.name).join(', ')}`);
    console.log(`\n  →  open  http://localhost:${port}  — click Hero / Band 1 / Band 2, then Submit`);
    console.log('     picks install automatically on submit, then this server exits.\n');
  });
}

function judgeHtml(targets) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AllDorms photo judging</title><style>
*{box-sizing:border-box}
body{font:14px/1.45 system-ui,-apple-system,sans-serif;margin:0;background:#14161b;color:#e7e7ea;padding-bottom:78px}
header{position:sticky;top:0;z-index:5;background:#0f1115;border-bottom:1px solid #262a33;padding:13px 20px}
header h1{margin:0;font-size:15px}header p{margin:4px 0 0;color:#9aa0aa;font-size:12.5px}
main{padding:20px;max-width:1400px;margin:0 auto}
section{margin:0 0 34px}
.shead{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;border-bottom:1px solid #262a33;padding-bottom:8px;margin-bottom:14px}
.shead h2{margin:0;font-size:17px}.q{color:#8b919b;font-size:12px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px}
figure{margin:0;background:#1b1e25;border:2px solid #2a2e38;border-radius:10px;overflow:hidden;position:relative}
figure.sel{border-color:var(--c)}
figure img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;cursor:zoom-in}
.badges{position:absolute;top:8px;left:8px;display:flex;gap:6px}
.badges span{font-size:10px;font-weight:700;letter-spacing:.04em;color:#111;padding:2px 7px;border-radius:20px;text-transform:uppercase}
figcaption{padding:9px 10px 11px}
figcaption .m{color:#7f8590;font-size:11.5px}
figcaption .ttl{color:#aeb4be;font-size:12px;margin:3px 0 8px;max-height:2.7em;overflow:hidden}
.btns{display:flex;gap:6px}
.btns button{flex:1;font:600 12px system-ui;color:#cfd3da;background:#232732;border:1px solid #333844;border-radius:7px;padding:6px 4px;cursor:pointer}
.btns button:hover{border-color:var(--c);color:#fff}.btns button.on{background:var(--c);border-color:var(--c);color:#111}
#foot{position:fixed;bottom:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;gap:16px;background:#0f1115;border-top:1px solid #262a33;padding:11px 22px;z-index:10}
#foot span{color:#9aa0aa;font-size:13px}
#submit{font:600 14px system-ui;background:#3ba55d;color:#fff;border:0;border-radius:8px;padding:10px 22px;cursor:pointer}
#submit:disabled{opacity:.4;cursor:not-allowed}
.lb{position:fixed;inset:0;background:rgba(0,0,0,.88);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;z-index:50;padding:24px;cursor:zoom-out}
.lb img{max-width:92vw;max-height:78vh;border-radius:8px}
.lbcap{color:#cfd3da;font-size:13px;max-width:820px;text-align:center}
.done{cursor:default}
.donebox{background:#1b1e25;border:1px solid #2a2e38;border-radius:12px;padding:22px 26px;max-width:660px;font-size:13px;font-family:ui-monospace,monospace}
.donebox h2{margin:0 0 12px;color:#5fd07f;font-family:system-ui}
.donebox div{padding:2px 0}.donebox .skip{color:#c9a13b}.donebox .err{color:#e0685f}
.donebox .note{color:#8b919b;margin-top:14px;font-family:system-ui}
</style></head><body>
<header><h1>AllDorms photo judging</h1><p>Click <b>Hero</b> and two <b>Bands</b> for each school — click a thumbnail to enlarge — then Submit. Picks install automatically.</p></header>
<main id="app"></main>
<script>
const DATA = ${JSON.stringify(targets)};
const ROLES = {school:[['hero','Hero'],['band1','Band 1'],['band2','Band 2']], custom:[['custom','Use this']]};
const COLOR = {hero:'#e0a92b',band1:'#2bb3a3',band2:'#9b7ce0',custom:'#3ba55d'};
const state = {};
const app = document.getElementById('app');

function rolesFor(t){ return t.isCustom ? ROLES.custom : ROLES.school; }
function labelOf(roles,r){ const f = roles.find(x => x[0]===r); return f ? f[1] : r; }

function pick(dir, role, n){
  const s = state[dir] || (state[dir] = {});
  if (s[role]===n) delete s[role];
  else { for (const r of Object.keys(s)) if (s[r]===n) delete s[r]; s[role]=n; }
  render();
}

function card(t, c){
  const roles = rolesFor(t);
  const s = state[t.dir] || (state[t.dir] = {});
  const active = roles.filter(x => s[x[0]]===c.n).map(x => x[0]);
  const fig = document.createElement('figure');
  if (active.length){ fig.classList.add('sel'); fig.style.setProperty('--c', COLOR[active[0]]); }
  const img = document.createElement('img'); img.src = c.img; img.loading = 'lazy';
  img.onclick = () => lightbox(c); fig.appendChild(img);
  if (active.length){
    const b = document.createElement('div'); b.className='badges';
    for (const r of active){ const sp=document.createElement('span'); sp.textContent=labelOf(roles,r); sp.style.background=COLOR[r]; b.appendChild(sp); }
    fig.appendChild(b);
  }
  const cap = document.createElement('figcaption');
  const m = document.createElement('div'); m.className='m'; m.textContent = '#'+c.n+(c.assessed?' ★':'')+' · '+c.dims+' · '+c.license;
  const ttl = document.createElement('div'); ttl.className='ttl'; ttl.textContent = c.title;
  cap.appendChild(m); cap.appendChild(ttl);
  const btns = document.createElement('div'); btns.className='btns';
  for (const [r,lab] of roles){
    const btn = document.createElement('button'); btn.textContent = lab; btn.style.setProperty('--c', COLOR[r]);
    if (s[r]===c.n) btn.classList.add('on');
    btn.onclick = () => pick(t.dir, r, c.n);
    btns.appendChild(btn);
  }
  cap.appendChild(btns); fig.appendChild(cap);
  return fig;
}

function section(t){
  const sec = document.createElement('section');
  const h = document.createElement('div'); h.className='shead';
  const title = document.createElement('h2'); title.textContent = t.label;
  const q = document.createElement('span'); q.className='q';
  q.textContent = '“'+t.query+'”' + (t.missing && t.missing.length ? '   · still needs: '+t.missing.join(', ') : '');
  h.appendChild(title); h.appendChild(q); sec.appendChild(h);
  const grid = document.createElement('div'); grid.className='grid';
  for (const c of t.candidates) grid.appendChild(card(t, c));
  sec.appendChild(grid);
  return sec;
}

function lightbox(c){
  const ov = document.createElement('div'); ov.className='lb';
  const im = document.createElement('img'); im.src = c.img; ov.appendChild(im);
  const cap = document.createElement('div'); cap.className='lbcap';
  cap.textContent = '#'+c.n+' · '+c.title+' — '+c.artist+' ('+c.license+')';
  ov.appendChild(cap); ov.onclick = () => ov.remove(); document.body.appendChild(ov);
}

function footer(){
  let f = document.getElementById('foot');
  if (!f){ f = document.createElement('div'); f.id='foot'; document.body.appendChild(f); }
  const ready = DATA.filter(t => Object.values(state[t.dir]||{}).some(v => v!=null)).length;
  f.innerHTML='';
  const info = document.createElement('span'); info.textContent = ready+' / '+DATA.length+' schools have picks';
  const btn = document.createElement('button'); btn.id='submit'; btn.textContent='Submit & install'; btn.disabled = ready===0;
  btn.onclick = submit;
  f.appendChild(info); f.appendChild(btn);
}

function render(){ app.innerHTML=''; for (const t of DATA) app.appendChild(section(t)); footer(); }

async function submit(){
  const btn = document.getElementById('submit'); btn.disabled=true; btn.textContent='Installing…';
  let res;
  try { res = await fetch('/save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({picks:state})}); }
  catch(e){ btn.textContent='Error — retry'; btn.disabled=false; return; }
  const data = await res.json(); done(data.results||[]);
}

function done(results){
  const ov = document.createElement('div'); ov.className='lb done';
  const box = document.createElement('div'); box.className='donebox';
  const h = document.createElement('h2'); h.textContent='✓ Installed'; box.appendChild(h);
  for (const r of results){ const d=document.createElement('div'); d.textContent=r.line; if(r.skipped)d.className='skip'; if(r.error)d.className='err'; box.appendChild(d); }
  const note = document.createElement('p'); note.className='note';
  note.textContent = 'You can close this tab. Claude is verifying the build.'; box.appendChild(note);
  ov.appendChild(box); document.body.appendChild(ov);
}

render();
</script></body></html>`;
}

const cmd = process.argv[2];
const limit = parseInt(arg('--limit', '6'), 10);

if (cmd === 'status') {
  for (const s of SCHOOLS) {
    const missing = missingSlots(s.slug);
    console.log(`  ${s.slug.padEnd(12)} ${missing.length ? 'MISSING: ' + missing.join(', ') : 'complete'}`);
  }
} else if (cmd === 'fetch') {
  await fetchSchool(getSchool(process.argv[3] || die('usage: fetch <slug>')), limit);
} else if (cmd === 'fetch-missing') {
  const todo = SCHOOLS.filter(s => missingSlots(s.slug).length);
  if (!todo.length) console.log('All schools have all photo slots.');
  for (const s of todo) await fetchSchool(s, limit);
} else if (cmd === 'assign') {
  const slug = process.argv[3] || die('usage: assign <slug> hero=1 band1=2 band2=3');
  getSchool(slug);
  const picks = Object.fromEntries(process.argv.slice(4).filter(a => a.includes('=')).map(a => a.split('=')));
  if (!Object.keys(picks).length) die('No picks given (e.g. hero=1 band1=2 band2=3)');
  try {
    for (const r of assignSlots(slug, picks)) console.log(`  ${r.slot} ← #${r.n} ${r.title.slice(0, 60)} → ${r.dest}`);
  } catch (e) { die(String(e.message || e)); }
  console.log('Credits updated in src/data/photo-credits.json');
} else if (cmd === 'previews') {
  // Rebuild NN.preview.jpg from kept originals (e.g. after `clean --previews`). No slug = every dir.
  const wanted = process.argv.slice(3).filter(a => !a.startsWith('--'));
  const dirs = wanted.length
    ? wanted.map(k => [k, '_' + k].map(d => path.join(CANDIDATES, d)).find(fs.existsSync) || die(`No candidate dir for "${k}"`))
    : (fs.existsSync(CANDIDATES) ? fs.readdirSync(CANDIDATES, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => path.join(CANDIDATES, e.name)) : []);
  let total = 0;
  for (const dir of dirs) {
    const made = ensurePreviews(dir);
    if (made) console.log(`  ${path.basename(dir).padEnd(18)} regenerated ${made} preview${made === 1 ? '' : 's'}`);
    total += made;
  }
  console.log(total ? `Done — ${total} preview${total === 1 ? '' : 's'} regenerated.` : 'All candidate dirs already have previews.');
} else if (cmd === 'judge') {
  const rest = process.argv.slice(3);
  const pi = rest.indexOf('--port');
  const wanted = rest.filter((a, i) => !a.startsWith('--') && i !== (pi > -1 ? pi + 1 : -1));
  startJudge(wanted, parseInt(arg('--port', '4500'), 10));
} else if (cmd === 'custom') {
  const [name, query] = [process.argv[3], process.argv[4]];
  if (!name || !query) die('usage: custom <name> "search query"');
  const cands = await commonsSearch({ text: query }, limit);
  if (!cands.length) die('No usable candidates for that query.');
  const kept = await download(cands, path.join(CANDIDATES, '_' + name), name, query);
  console.log(`  → ${kept.length} candidates in photo-candidates/_${name}/`);
} else if (cmd === 'assign-custom') {
  const [name, n] = [process.argv[3], Number(process.argv[4])];
  if (!name || !n) die('usage: assign-custom <name> <candidate #> [--width 1600]');
  try {
    assignCustomPick(name, n, parseInt(arg('--width', '1600'), 10));
    console.log(`  ${name} ← #${n} → public/${name}.jpg (credits updated)`);
  } catch (e) { die(String(e.message || e)); }
} else if (cmd === 'clean') {
  const name = process.argv[3]?.startsWith('--') ? null : process.argv[3];
  let dir = CANDIDATES;
  if (name) {
    // `custom` writes to _<name>/, so accept the bare name there too.
    dir = [path.join(CANDIDATES, name), path.join(CANDIDATES, '_' + name)].find(fs.existsSync)
      || die(`No candidate dir for "${name}" — nothing at photo-candidates/${name}/`);
    if (path.relative(CANDIDATES, dir).startsWith('.')) die(`Refusing to clean outside photo-candidates/: ${dir}`);
  }
  if (!fs.existsSync(dir)) {
    console.log('Nothing to clean — photo-candidates/ does not exist.');
  } else if (process.argv.includes('--previews')) {
    const previews = walk(dir, f => f.endsWith('.preview.jpg'));
    const freed = bytes(previews);
    for (const f of previews) fs.unlinkSync(f);
    console.log(`  ${previews.length} preview${previews.length === 1 ? '' : 's'} removed from ${path.relative(ROOT, dir)}/ — ${mb(freed)} freed, full-res originals kept`);
  } else {
    const freed = bytes(walk(dir));
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`  removed ${path.relative(ROOT, dir)}/ — ${mb(freed)} freed`);
  }
} else {
  die('Commands: status · fetch <slug> · fetch-missing · judge [slug...] · previews [slug...] · assign <slug> hero=N band1=N band2=N · custom <name> "query" · assign-custom <name> <n> · clean [<slug>] [--previews]');
}
