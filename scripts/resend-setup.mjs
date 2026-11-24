// One-time Resend setup for the move-in email list. Idempotent: reuses the
// segment if it already exists. Prints the segment id for src/lib/site.js.
//   node --env-file=.env.local scripts/resend-setup.mjs
const KEY = process.env.RESEND_API_KEY;
if (!KEY) { console.error('RESEND_API_KEY missing (run with --env-file=.env.local)'); process.exit(1); }
const SEGMENT = 'AllDorms signups';

async function api(method, path, body) {
  const res = await fetch('https://api.resend.com' + path, {
    method,
    headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, j };
}

const prop = await api('POST', '/contact-properties', { key: 'school', type: 'string', fallback_value: '' });
console.log('school property:', prop.ok ? 'created' : `${prop.status} ${prop.j.message || prop.j.name || ''}`);

const list = await api('GET', '/segments');
let seg = (list.j.data || []).find(s => s.name === SEGMENT);
if (!seg) {
  const made = await api('POST', '/segments', { name: SEGMENT });
  if (!made.ok) { console.error('segment create failed:', made.status, made.j); process.exit(1); }
  seg = made.j;
}
console.log('SEGMENT_ID', seg.id);
