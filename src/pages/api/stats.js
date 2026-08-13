import crypto from 'node:crypto';

// The only on-demand route on the site. Everything else stays prerendered.
export const prerender = false;

// GA reports in the property's timezone; Vercel functions run in UTC. Deriving
// day boundaries from the function clock would roll "today" over at 8pm ET, so
// every boundary below is computed in this zone instead.
const TZ = 'America/New_York';
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

const b64url = (s) => Buffer.from(s).toString('base64url');

let tokenCache = { value: null, exp: 0 };
let dataCache = { value: null, exp: 0 };

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache.value && tokenCache.exp > now + 60) return tokenCache.value;

  const sa = JSON.parse(
    Buffer.from(process.env.GA_SA_KEY_B64, 'base64').toString('utf8'),
  );
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: SCOPE,
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    }),
  );
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${signer.sign(sa.private_key, 'base64url')}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`token exchange failed: ${j.error_description ?? j.error}`);

  tokenCache = { value: j.access_token, exp: now + (j.expires_in ?? 3600) };
  return j.access_token;
}

async function ga(method, body) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${process.env.GA_PROPERTY_ID}:${method}`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${await accessToken()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j;
}

// --- civil-date helpers, all in TZ -------------------------------------------
// Dates are handled as YYYY-MM-DD strings parsed at UTC midnight, so day
// arithmetic never crosses a DST boundary.

const civil = (d) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

const DOW = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
const mondayIndex = (d) =>
  DOW[new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(d)];

function shiftDays(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Same day-of-month one month back, clamped (Mar 31 -> Feb 28).
function prevMonthSameDay(ymd) {
  const [y, m, day] = ymd.split('-').map(Number);
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  const lastDay = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  const dd = String(Math.min(day, lastDay)).padStart(2, '0');
  return `${py}-${String(pm).padStart(2, '0')}-${dd}`;
}

// Rows whose metrics are all zero are omitted from the response entirely, so
// every lookup has to tolerate a missing row.
function pick(report, name) {
  const row = (report.rows ?? []).find((r) => r.dimensionValues?.[0]?.value === name);
  return {
    users: Number(row?.metricValues?.[0]?.value ?? 0),
    pageviews: Number(row?.metricValues?.[1]?.value ?? 0),
  };
}

async function collect() {
  const now = new Date();
  const today = civil(now);
  const weekStart = shiftDays(today, -mondayIndex(now));
  const monthStart = `${today.slice(0, 7)}-01`;
  const yesterday = shiftDays(today, -1);

  // Comparisons run over the same elapsed span, not full prior periods —
  // otherwise a partial week always looks like a collapse against a full one.
  const daysIntoWeek = mondayIndex(now);
  const prevWeekStart = shiftDays(weekStart, -7);
  const prevWeekEnd = shiftDays(prevWeekStart, daysIntoWeek);
  const prevMonthStart = `${prevMonthSameDay(monthStart).slice(0, 7)}-01`;
  const prevMonthEnd = prevMonthSameDay(today);

  const metrics = [{ name: 'activeUsers' }, { name: 'screenPageViews' }];

  const [current, prior, realtime] = await Promise.all([
    ga('runReport', {
      dateRanges: [
        { name: 'week', startDate: weekStart, endDate: 'today' },
        { name: 'today', startDate: 'today', endDate: 'today' },
        { name: 'month', startDate: monthStart, endDate: 'today' },
        { name: 'yesterday', startDate: yesterday, endDate: yesterday },
      ],
      metrics,
    }),
    ga('runReport', {
      dateRanges: [
        { name: 'prevWeek', startDate: prevWeekStart, endDate: prevWeekEnd },
        { name: 'prevMonth', startDate: prevMonthStart, endDate: prevMonthEnd },
      ],
      metrics,
    }),
    ga('runRealtimeReport', { metrics: [{ name: 'activeUsers' }] }),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    timezone: TZ,
    week: {
      ...pick(current, 'week'),
      prev: pick(prior, 'prevWeek').users,
      start: weekStart,
    },
    today: {
      ...pick(current, 'today'),
      yesterday: pick(current, 'yesterday').users,
      date: today,
    },
    month: {
      ...pick(current, 'month'),
      prev: pick(prior, 'prevMonth').users,
      start: monthStart,
    },
    activeNow: Number(realtime.rows?.[0]?.metricValues?.[0]?.value ?? 0),
  };
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

function authorized(request) {
  const expected = process.env.STATS_TOKEN;
  if (!expected) return false;
  const got = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function GET({ request }) {
  if (!authorized(request)) return json({ error: 'unauthorized' }, 401);

  const now = Date.now();
  if (dataCache.value && dataCache.exp > now) return json(dataCache.value);

  try {
    const data = await collect();
    dataCache = { value: data, exp: now + 60_000 };
    return json(data);
  } catch (err) {
    return json({ error: String(err.message ?? err) }, 502);
  }
}
