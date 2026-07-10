#!/usr/bin/env node
// Campus-photo pipeline for AllDorms.
//
//   node scripts/photos.mjs status                          which schools have which photo slots
//   node scripts/photos.mjs fetch <slug> [--query "..."]    download candidates + contact sheet
//                                        [--limit N]        pool size (default 6)
//   node scripts/photos.mjs fetch-missing                   fetch candidates for every school missing a slot
//   node scripts/photos.mjs assign <slug> hero=3 band1=1 band2=7
//                                                           normalize picks into public/schools/ + record credits
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
  const manifest = JSON.parse(fs.readFileSync(path.join(CANDIDATES, slug, 'manifest.json'), 'utf8'));
  const picks = process.argv.slice(4).filter(a => a.includes('='));
  if (!picks.length) die('No picks given (e.g. hero=1 band1=2 band2=3)');
  for (const pick of picks) {
    const [slot, n] = pick.split('=');
    if (!SLOTS[slot]) die(`Unknown slot "${slot}" (hero, band1, band2)`);
    const cand = manifest.fetched.find(c => c.n === Number(n)) || die(`No candidate #${n} for ${slug}`);
    const dest = path.join(SCHOOL_DIR, slug + SLOTS[slot].suffix);
    normalizeInto(path.join(ROOT, cand.file), dest, SLOTS[slot].width);
    recordCredit(path.relative(ROOT, dest), slot, cand, slug);
    console.log(`  ${slot} ← #${n} ${cand.title.slice(0, 60)} → ${path.relative(ROOT, dest)}`);
  }
  console.log('Credits updated in src/data/photo-credits.json');
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
  const manifest = JSON.parse(fs.readFileSync(path.join(CANDIDATES, '_' + name, 'manifest.json'), 'utf8'));
  const cand = manifest.fetched.find(c => c.n === n) || die(`No candidate #${n}`);
  const dest = path.join(ROOT, 'public', `${name}.jpg`);
  normalizeInto(path.join(ROOT, cand.file), dest, parseInt(arg('--width', '1600'), 10));
  recordCredit(path.relative(ROOT, dest), 'custom', cand, name);
  console.log(`  ${name} ← #${n} → public/${name}.jpg (credits updated)`);
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
  die('Commands: status · fetch <slug> · fetch-missing · assign <slug> hero=N band1=N band2=N · custom <name> "query" · assign-custom <name> <n> · clean [<slug>] [--previews]');
}
