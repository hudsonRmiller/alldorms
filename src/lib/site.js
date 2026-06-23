import { SCHOOLS, CHECKLIST_COMMON, CLOTHING, FAN_NOTE, ALLOWED_BASE, BANNED_BASE } from '../data/schools.js';

export { SCHOOLS, ALLOWED_BASE, BANNED_BASE };

// Leave empty until you have your Amazon Associates tag + FTC disclosure live.
export const AFFILIATE_TAG = '';

/* ---------- section model ----------
   Each section becomes its own route: /[school]/[section]/
   `has` decides whether a school gets that page + nav entry. */
export const SECTIONS = [
  {
    id: 'weather', nav: 'Weather & clothing',
    has: s => !!(s.climate && s.climate.length),
    heading: s => `What to wear in ${cityShort(s)}, month by month`,
    kicker: 'The one thing generic lists get wrong',
  },
  {
    id: 'allowed', nav: "What's allowed",
    has: () => true,
    heading: s => `What ${s.name} lets you bring`,
    kicker: 'Straight from the housing office',
  },
  {
    id: 'housing', nav: 'Housing & roommates',
    has: s => !!(s.housingSteps && s.housingSteps.length),
    heading: s => `Getting your room at ${s.name}`,
    kicker: 'Before you can move in',
  },
  {
    id: 'communities', nav: "Where you'll live",
    has: s => !!(s.communities && s.communities.length),
    heading: s => `Where you'll live at ${s.name}`,
    kicker: 'The actual buildings',
  },
  {
    id: 'checklist', nav: 'Packing checklist',
    has: () => true,
    heading: s => `The ${s.name} move-in checklist`,
    kicker: 'Tick as you pack',
  },
  {
    id: 'movein', nav: 'Move-in logistics',
    has: s => !!(s.notes && s.notes.length),
    heading: s => `${cityShort(s)} logistics, sorted`,
    kicker: 'The stuff nobody puts in one place',
  },
  {
    id: 'area', nav: 'Town & hotspots',
    has: s => !!(s.area && s.area.length),
    heading: s => `${cityShort(s)} & around`,
    kicker: 'Beyond the campus gates',
  },
  {
    id: 'stay', nav: 'Where to stay',
    has: s => !!(s.stay && s.stay.length),
    heading: s => `Where to stay near ${s.name}`,
    kicker: 'For move-in, family weekend & graduation',
  },
  {
    id: 'merch', nav: 'School gear',
    has: s => !!(s.merch && s.merch.length),
    heading: s => `${s.name} gear & gifts`,
    kicker: 'Gear up',
  },
  {
    id: 'links', nav: 'Links & contacts',
    has: s => !!(s.links && ((s.links.official && s.links.official.length) || (s.links.contact && s.links.contact.length))),
    heading: s => `${s.name} — links & contacts`,
    kicker: 'Links & more info',
  },
];

export function getSchool(slug) {
  return SCHOOLS.find(s => s.slug === slug);
}

/** Sections this school actually has, in order, with display numbers. */
export function schoolSections(school) {
  return SECTIONS.filter(sec => sec.has(school)).map((sec, i) => ({
    ...sec,
    num: String(i + 1).padStart(2, '0'),
    href: `/${school.slug}/${sec.id}/`,
  }));
}

export function cityShort(school) {
  return school.city.split(',')[0];
}

/* ---------- color helpers (for the per-school accent dot / crest) ---------- */
export function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16 & 255) * (1 - t)) + ((pb >> 16 & 255) * t));
  const g = Math.round(((pa >> 8 & 255) * (1 - t)) + ((pb >> 8 & 255) * t));
  const bl = Math.round(((pa & 255) * (1 - t)) + ((pb & 255) * t));
  return '#' + (1 << 24 | r << 16 | g << 8 | bl).toString(16).slice(1);
}
export const softTint = hex => mix(hex, '#ffffff', 0.9);
export const deepTint = hex => mix(hex, '#1a1a1a', 0.15);

/* ---------- contact + shop links ---------- */
export function contactHref(v) {
  if (v.indexOf('@') > -1) return 'mailto:' + v;
  if (/^https?:/.test(v)) return v;
  if (/[0-9]{3}.*[0-9]{4}/.test(v)) return 'tel:' + v.replace(/[^0-9]/g, '');
  return v;
}
export function shopUrl(q, asin) {
  let url;
  if (asin) {
    url = 'https://www.amazon.com/dp/' + encodeURIComponent(asin);
    return AFFILIATE_TAG ? url + '?tag=' + encodeURIComponent(AFFILIATE_TAG) : url;
  }
  url = 'https://www.amazon.com/s?k=' + encodeURIComponent(q);
  return AFFILIATE_TAG ? url + '&tag=' + encodeURIComponent(AFFILIATE_TAG) : url;
}

/* ---------- packing checklist, resolved per school ---------- */
export function resolveChecklist(school) {
  const cats = CHECKLIST_COMMON.map(c => (c[0] === '__CLOTHING__' ? CLOTHING[school.region] : c));
  return cats.map(([cat, items]) => ({
    cat,
    count: items.length,
    items: items.map(it => {
      let name = it.n, note = it.note;
      if (name === '__FAN__') { name = 'Small fan'; note = FAN_NOTE[school.ac]; }
      if (name === '__FRIDGE__') { name = school.fridge.name; note = school.fridge.note; }
      if (note === '__BEDNOTE__') { note = school.bednote; }
      return { name, note, href: shopUrl(it.q, it.asin) };
    }),
  }));
}

export const AC_LABEL = { ac: 'Provided', varies: 'Varies by hall', none: 'None — bring a fan', mild: 'Rarely needed' };

export function weatherSub(school) {
  if (school.region === 'warm') return 'The national lists assume everyone needs a winter coat. Here the real questions are heat, sun, and rain — plus clothes for buildings kept ice-cold against it.';
  if (school.region === 'mild') return 'This corner of the country breaks every generic packing list. It is not about surviving cold — it is about staying dry through a long gray winter and a famously short, beautiful summer.';
  return 'This region runs from a humid late summer to a hard winter in about ten weeks. The mistake out-of-region families make is packing the whole year in August.';
}
