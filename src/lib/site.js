import { SCHOOLS as RAW_SCHOOLS, CHECKLIST_COMMON, CLOTHING, FAN_NOTE, ALLOWED_BASE, BANNED_BASE } from '../data/schools.js';

// Display order: Colgate is shown last.
const SCHOOLS = [
  ...RAW_SCHOOLS.filter(s => s.slug !== 'colgate'),
  ...RAW_SCHOOLS.filter(s => s.slug === 'colgate'),
];

export { SCHOOLS, ALLOWED_BASE, BANNED_BASE };

/* ---------- geographic regions (homepage directory grouping) ----------
   East → west. State is parsed from `city` ("Hamilton, NY"). Distinct from
   the climate `region` field (cold/warm/mild) on each school. */
const GEO_REGIONS = [
  ['New England',  ['ME', 'NH', 'VT', 'MA', 'RI', 'CT']],
  ['Mid-Atlantic', ['NY', 'NJ', 'PA', 'DE', 'MD', 'DC']],
  ['The South',    ['VA', 'WV', 'NC', 'SC', 'GA', 'FL', 'KY', 'TN', 'AL', 'MS', 'AR', 'LA', 'TX', 'OK']],
  ['The Midwest',  ['OH', 'MI', 'IN', 'IL', 'WI', 'MN', 'IA', 'MO', 'ND', 'SD', 'NE', 'KS']],
  ['The West',     ['MT', 'WY', 'CO', 'NM', 'ID', 'UT', 'AZ', 'NV', 'WA', 'OR', 'CA', 'AK', 'HI']],
];
export function schoolState(s) {
  const m = s.city && s.city.match(/,\s*([A-Z]{2})\b/);
  return m ? m[1] : null;
}
export function geoRegion(s) {
  const st = schoolState(s);
  const hit = GEO_REGIONS.find(([, states]) => states.includes(st));
  return hit ? hit[0] : 'More schools';
}
export const GEO_REGION_ORDER = [...GEO_REGIONS.map(([name]) => name), 'More schools'];

// Amazon Associates tag — appended to every "Shop" link. Requires the Amazon
// affiliate disclosure to be live on the site (it's in the footer).
export const AFFILIATE_TAG = 'alldorms-20';

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

/* ---------- school search aliases ----------
   Every name a family might type into "Find your school" — abbreviations,
   full official names, mascots, and towns. The header search also matches
   name/short/city automatically, so these only need the *other* names. */
export const SCHOOL_ALIASES = {
  swarthmore: ['Swarthmore College', 'Swarthmore', 'Swat', 'Garnet', 'Phoenix', 'Quaker', 'Delaware County'],
  pomona: ['Pomona College', 'Pomona', 'Sagehens', 'Claremont Colleges', '5C', 'Claremont', 'Cecil'],
  wellesley: ['Wellesley College', 'Wellesley', 'Wellesley Blue', 'Seven Sisters', 'Lake Waban', 'Tower Court'],
  smith: ['Smith College', 'Smith', 'Pioneers', 'Seven Sisters', 'Northampton', 'Noho', 'Paradise City', 'Grecourt'],
  mountholyoke: ['Mount Holyoke College', 'Mount Holyoke', 'Mt. Holyoke', 'MHC', 'Lyons', 'Seven Sisters', 'South Hadley', 'Mary Lyon'],
  vassar: ['Vassar College', 'Vassar', 'Brewers', 'Seven Sisters', 'Poughkeepsie', 'Hudson Valley', 'Main Building'],
  barnard: ['Barnard College', 'Barnard', 'Bears', 'Seven Sisters', 'Morningside Heights', 'Columbia', 'The Quad', 'NYC'],
  hamilton: ['Hamilton College', 'Hamilton', 'Continentals', 'Clinton', 'College Hill', 'Utica', 'Kirkland'],
  cmu: ['Carnegie Mellon University', 'CMU', 'Carnegie Mellon Tartans', 'Tartans', 'CMU Pittsburgh'],
  caltech: ['California Institute of Technology', 'Caltech', 'Caltech Beavers', 'CIT', 'Caltech Pasadena'],
  tulane: ['Tulane University', 'Tulane', 'Tulane Green Wave', 'Green Wave', 'Tulane New Orleans'],
  miami: ['University of Miami', 'Miami Hurricanes', 'UM', 'The U', 'Miami Coral Gables', 'U of Miami'],
  ucdavis: ['University of California, Davis', 'UC Davis', 'UCD', 'UC Davis Aggies', 'Davis'],
  umass: ['University of Massachusetts Amherst', 'UMass', 'UMass Amherst', 'Massachusetts Minutemen', 'Zoomass', 'UMass Minutemen'],
  williammary: ['College of William & Mary', 'William and Mary', 'W&M', 'W&M Tribe', 'Williamsburg', 'The Tribe'],
  wesleyan: ['Wesleyan University', 'Wesleyan', 'Wes', 'Wesleyan Cardinals', 'Middletown CT'],
  brown: ['Brown University', 'Bears', 'Bruno', 'Providence', 'College Hill', 'Ivy League'],
  princeton: ['Princeton University', 'Princeton', 'Tigers', 'Nassau Hall', 'New Jersey', 'Ivy League'],
  dartmouth: ['Dartmouth College', 'Dartmouth', 'Big Green', 'Hanover', 'New Hampshire', 'Ivy League'],
  columbia: ['Columbia University', 'Columbia', 'Lions', 'Morningside Heights', 'Manhattan', 'New York City', 'Ivy League'],
  johnshopkins: ['Johns Hopkins University', 'Johns Hopkins', 'Hopkins', 'JHU', 'Blue Jays', 'Baltimore', 'Homewood'],
  washu: ['Washington University in St. Louis', 'Washington University', 'WashU', 'WUSTL', 'Bears', 'St. Louis', 'South 40'],
  rice: ['Rice University', 'Rice', 'Owls', 'Houston', 'residential colleges'],
  emory: ['Emory University', 'Emory', 'Eagles', 'Atlanta', 'Druid Hills', 'Decatur'],
  uchicago: ['University of Chicago', 'UChicago', 'U of C', 'Chicago Maroons', 'Maroons', 'Hyde Park', 'UofC'],
  holycross: ['College of the Holy Cross', 'Holy Cross', 'HC', 'Crusaders', 'Mount St. James', 'Worcester'],
  amherst: ['Amherst College', 'Amherst', 'Mammoths', 'Lord Jeffs', 'Pioneer Valley', 'Five Colleges'],
  byu: ['Brigham Young University', 'BYU', 'Cougars', 'Provo', 'Helaman Halls', 'The Y'],
  baylor: ['Baylor University', 'Baylor', 'Bears', 'Sic em', 'Waco', 'Baptist'],
  stetson: ['Stetson University', 'Hatters', 'DeLand'],
  ucsd: ['University of California San Diego', 'UC San Diego', 'UCSD', 'Tritons', 'La Jolla', 'San Diego'],
  uvm: ['University of Vermont', 'UVM', 'Vermont', 'Catamounts', 'Burlington'],
  drexel: ['Drexel University', 'Dragons', 'University City', 'Philadelphia'],
  skidmore: ['Skidmore College', 'Thoroughbreds', 'Saratoga Springs', 'Saratoga'],
  washingtoncollege: ['Washington College', 'WC', 'Shoremen', 'Shorewomen', 'Chestertown', 'Eastern Shore'],
  colgate: ['Colgate University', 'Raiders'],
  tamu: ['Texas A&M University', 'Texas A and M', 'TAMU', 'A&M', 'Aggies', 'College Station'],
  ucf: ['University of Central Florida', 'Central Florida', 'Knights', 'Orlando'],
  asu: ['Arizona State University', 'Arizona State', 'Sun Devils', 'Tempe'],
  osu: ['Ohio State University', 'The Ohio State University', 'Ohio State', 'OSU', 'Buckeyes', 'Columbus'],
  uf: ['University of Florida', 'Florida', 'Gators', 'Gainesville'],
  utexas: ['University of Texas', 'UT Austin', 'Texas', 'Longhorns', 'Austin', 'Hook em'],
  umich: ['University of Michigan', 'Michigan', 'UMich', 'U of M', 'Wolverines', 'Ann Arbor'],
  pennstate: ['Penn State University', 'Pennsylvania State University', 'PSU', 'Nittany Lions', 'State College', 'University Park', 'Happy Valley'],
  minnesota: ['University of Minnesota', 'UMN', 'U of M', 'Golden Gophers', 'Gophers', 'Twin Cities', 'Minneapolis'],
  uw: ['University of Washington', 'Washington', 'UDub', 'Huskies', 'Seattle'],
  udel: ['University of Delaware', 'Delaware', 'Blue Hens', 'Newark'],
  ucla: ['University of California Los Angeles', 'Bruins', 'Los Angeles', 'Westwood'],
  wisconsin: ['University of Wisconsin', 'UW Madison', 'Badgers', 'Madison'],
  georgia: ['University of Georgia', 'UGA', 'Bulldogs', 'Dawgs', 'Athens'],
  alabama: ['University of Alabama', 'Bama', 'Crimson Tide', 'Roll Tide', 'Tuscaloosa'],
  indiana: ['Indiana University', 'IU', 'IU Bloomington', 'Hoosiers', 'Bloomington'],
  villanova: ['Villanova University', 'Nova', 'Wildcats'],
  southcarolina: ['University of South Carolina', 'USC', 'Gamecocks', 'Columbia'],
  clemson: ['Clemson University', 'Clemson Tigers', 'Death Valley'],
  pitt: ['University of Pittsburgh', 'Pittsburgh', 'Panthers', 'Cathedral of Learning'],
  jmu: ['James Madison University', 'James Madison', 'Dukes', 'Harrisonburg'],
  harvard: ['Harvard University', 'Harvard College', 'Crimson', 'Cambridge'],
  yale: ['Yale University', 'Yale College', 'New Haven'],
  stanford: ['Stanford University', 'Cardinal', 'Palo Alto', 'The Farm'],
  mit: ['Massachusetts Institute of Technology', 'Cambridge'],
  purdue: ['Purdue University', 'Boilermakers', 'Boilers', 'West Lafayette'],
  michiganstate: ['Michigan State University', 'MSU', 'Spartans', 'Sparty', 'East Lansing'],
  illinois: ['University of Illinois', 'Illinois Urbana-Champaign', 'UIUC', 'U of I', 'Fighting Illini', 'Illini', 'Urbana', 'Champaign'],
  virginiatech: ['Virginia Tech', 'VT', 'Virginia Polytechnic Institute', 'VPI', 'Hokies', 'Blacksburg'],
  tennessee: ['University of Tennessee', 'UT Knoxville', 'UTK', 'Volunteers', 'Vols', 'Rocky Top', 'Knoxville'],
  auburn: ['Auburn University', 'Auburn Tigers', 'War Eagle', 'The Plains'],
  lsu: ['Louisiana State University', 'LSU Tigers', 'Geaux Tigers', 'Baton Rouge'],
  fsu: ['Florida State University', 'FSU', 'Seminoles', 'Noles', 'Tallahassee'],
  unc: ['University of North Carolina', 'North Carolina', 'UNC Chapel Hill', 'Chapel Hill', 'Tar Heels', 'Carolina'],
  colorado: ['University of Colorado Boulder', 'University of Colorado', 'Colorado', 'Boulder', 'Buffs', 'Buffaloes', 'Ralphie'],
  rutgers: ['Rutgers University', 'Rutgers New Brunswick', 'Scarlet Knights', 'New Brunswick'],
  olemiss: ['University of Mississippi', 'Ole Miss', 'Mississippi', 'Rebels', 'Oxford', 'Hotty Toddy'],
  maryland: ['University of Maryland', 'UMD', 'Terrapins', 'Terps', 'College Park'],
  kentucky: ['University of Kentucky', 'UK', 'Wildcats', 'Big Blue Nation', 'BBN', 'Lexington'],
  oregon: ['University of Oregon', 'UO', 'U of O', 'Ducks', 'Go Ducks', 'Eugene', 'TrackTown'],
  missouri: ['University of Missouri', 'Mizzou', 'MU', 'Missouri Tigers', 'Tigers', 'Columbia'],
  oklahoma: ['University of Oklahoma', 'OU', 'Sooners', 'Boomer Sooner', 'Norman'],
  arkansas: ['University of Arkansas', 'UARK', 'U of A', 'Razorbacks', 'Hogs', 'Woo Pig', 'Fayetteville'],
  iowa: ['University of Iowa', 'UI', 'U of I', 'Hawkeyes', 'Iowa City'],
  kansas: ['University of Kansas', 'KU', 'Jayhawks', 'Rock Chalk', 'Lawrence'],
  nebraska: ['University of Nebraska', 'University of Nebraska-Lincoln', 'UNL', 'Huskers', 'Cornhuskers', 'Go Big Red', 'Lincoln'],
  westvirginia: ['West Virginia University', 'West Virginia', 'WVU', 'Mountaineers', 'Morgantown'],
  uconn: ['University of Connecticut', 'UConn', 'Huskies', 'Storrs', 'Connecticut'],
  arizona: ['University of Arizona', 'UA', 'U of A', 'Wildcats', 'Zona', 'Bear Down', 'Tucson'],
  lafayette: ['Lafayette College', 'Leopards', 'Pards', 'Easton', 'College Hill'],
  lehigh: ['Lehigh University', 'Mountain Hawks', 'Engineers', 'Bethlehem', 'South Mountain'],
  dickinson: ['Dickinson College', 'Red Devils', 'Carlisle'],
  trinity: ['Trinity College', 'Trinity College Connecticut', 'Bantams', 'Hartford', 'Trin'],
  tufts: ['Tufts University', 'Jumbos', 'Medford', 'Somerville'],
  williams: ['Williams College', 'Ephs', 'Purple Cows', 'Williamstown', 'Billsville'],
  middlebury: ['Middlebury College', 'Midd', 'Panthers', 'Midd Kids', 'Vermont'],
  bowdoin: ['Bowdoin College', 'Polar Bears', 'Brunswick', 'Maine'],
  uva: ['University of Virginia', 'UVA', 'Virginia', 'Cavaliers', 'Wahoos', 'Hoos', 'Charlottesville'],
  gatech: ['Georgia Tech', 'Georgia Institute of Technology', 'GT', 'Yellow Jackets', 'Ramblin Wreck', 'Atlanta'],
  ncstate: ['NC State', 'North Carolina State', 'NCSU', 'Wolfpack', 'Raleigh'],
  notredame: ['Notre Dame', 'University of Notre Dame', 'Fighting Irish', 'ND', 'South Bend'],
  duke: ['Duke University', 'Duke', 'Blue Devils', 'Durham'],
  vanderbilt: ['Vanderbilt University', 'Vanderbilt', 'Vandy', 'Commodores', 'Nashville'],
  northwestern: ['Northwestern University', 'Northwestern', 'Wildcats', 'Evanston'],
  usc: ['University of Southern California', 'Southern Cal', 'USC Trojans', 'Trojans', 'Los Angeles'],
  bc: ['Boston College', 'BC', 'Eagles', 'Chestnut Hill'],
  bu: ['Boston University', 'BU', 'Terriers', 'Comm Ave', 'Boston'],
  nyu: ['New York University', 'NYU', 'Violets', 'Greenwich Village', 'Manhattan', 'New York City'],
  georgetown: ['Georgetown University', 'Georgetown', 'Hoyas', 'Washington DC', 'The Hilltop'],
  syracuse: ['Syracuse University', 'Syracuse', 'Cuse', 'Orange', 'SU'],
  northeastern: ['Northeastern University', 'Northeastern', 'Huskies', 'Boston'],
  berkeley: ['UC Berkeley', 'University of California Berkeley', 'Cal', 'Golden Bears', 'Berkeley'],
  ucsb: ['UC Santa Barbara', 'University of California Santa Barbara', 'UCSB', 'Gauchos', 'Santa Barbara', 'Isla Vista'],
  cornell: ['Cornell University', 'Cornell', 'Big Red', 'Ithaca'],
  upenn: ['University of Pennsylvania', 'Penn', 'UPenn', 'Quakers', 'Philadelphia'],
  wakeforest: ['Wake Forest University', 'Wake Forest', 'Wake', 'Demon Deacons', 'Winston-Salem'],
  iowastate: ['Iowa State University', 'Iowa State', 'ISU', 'Cyclones', 'Ames'],
  sju: ["Saint Joseph's University", "St. Joseph's", "St Joes", 'SJU', 'Hawks', 'Hawk Hill', 'Philadelphia'],
  cofc: ['College of Charleston', 'CofC', 'Cougars', 'Charleston'],
  cheyney: ['Cheyney University', 'Cheyney University of Pennsylvania', 'Wolves', 'HBCU'],
  lincoln: ['Lincoln University', 'Lincoln University of Pennsylvania', 'Lincoln PA', 'Lions', 'HBCU'],
  bloomsburg: ['Bloomsburg University', 'Commonwealth University Bloomsburg', 'Bloom', 'Huskies'],
  westchester: ['West Chester University', 'WCU', 'Golden Rams', 'West Chester'],
  millersville: ['Millersville University', 'Marauders', 'Millersville'],
  lasalle: ['La Salle University', 'LaSalle', 'Explorers', 'Philadelphia'],
  temple: ['Temple University', 'Owls', 'Philadelphia', 'North Philly', 'Cherry and White'],
  delawarestate: ['Delaware State University', 'DSU', 'Del State', 'Hornets', 'Dover', 'HBCU'],
  ursinus: ['Ursinus College', 'Bears', 'Grizzlies', 'Collegeville'],
};

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

/* ---------- per-school page theming ----------
   Builds a full CSS-variable palette from one school colour: that colour plays
   the "navy" role (header, headings, buttons), and the page background is the
   same colour scaled up in HSL until it's nearly white. */
function hexToRgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function rgbToHex(r, g, b) { const h = x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0'); return '#' + h(r) + h(g) + h(b); }
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
function hslToRgb(h, s, l) {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255];
}
/** Same hue/saturation as `hex`, re-lit to lightness `l` (0–1); `sMul` scales saturation. */
function setL(hex, l, sMul = 1) { const [h, s] = rgbToHsl(...hexToRgb(hex)); return rgbToHex(...hslToRgb(h, Math.min(1, s * sMul), l)); }

/** A CSS-variable style string that re-themes a page around one school colour. */
export function schoolTheme(accent) {
  const vars = {
    '--navy':      accent,
    '--navy-2':    mix(accent, '#000000', 0.10),
    '--navy-deep': mix(accent, '#0b0b14', 0.45),
    '--paper':     setL(accent, 0.966, 0.85),
    '--paper-2':   setL(accent, 0.935, 0.95),
    '--cream':     setL(accent, 0.915),
    '--line':      setL(accent, 0.88),
    '--line-2':    setL(accent, 0.82),
    '--rule-navy': setL(accent, 0.78),
  };
  return Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';');
}

/* ---------- contact + shop links ---------- */
export function contactHref(v) {
  if (v.indexOf('@') > -1) return 'mailto:' + v;
  if (/^https?:/.test(v)) return v;
  if (/[0-9]{3}.*[0-9]{4}/.test(v)) return 'tel:' + v.replace(/[^0-9]/g, '');
  return v;
}
/** Google Maps search deep-link — used as the fallback link for town/hotel
    cards that have no explicit URL, and for the per-school "map & directions"
    link. A search query never 404s, so this is safe to generate for anything. */
export function mapSearch(query) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query);
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
