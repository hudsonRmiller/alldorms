import { SCHOOLS, RESEND_SEGMENT_ID } from '../../lib/site.js';

// Move-in list signup: adds the email to Resend as a contact in the
// "AllDorms signups" segment, tagged with the school slug, so the July
// broadcast can go out per school. On-demand; everything else prerenders.
export const prerender = false;

const SLUGS = new Set(SCHOOLS.map(s => s.slug));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function reply(request, status, body, slug) {
  // fetch() callers get JSON; a plain no-JS form post gets bounced back to the page.
  if ((request.headers.get('accept') || '').includes('application/json')) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }
  const back = slug ? `/${slug}/?signup=${body.ok ? 'ok' : 'error'}#signup` : '/';
  return new Response(null, { status: 303, headers: { location: back } });
}

export async function POST({ request }) {
  let data;
  try { data = await request.formData(); } catch { return reply(request, 400, { ok: false, error: 'bad_request' }); }

  const email = String(data.get('email') || '').trim().toLowerCase().slice(0, 320);
  const slug = String(data.get('school') || '');
  const school = SLUGS.has(slug) ? slug : '';

  // Honeypot: real visitors never see the "website" field. Pretend success.
  if (data.get('website')) return reply(request, 200, { ok: true }, school);
  if (!EMAIL.test(email)) return reply(request, 422, { ok: false, error: 'invalid_email' }, school);

  const res = await fetch('https://api.resend.com/contacts', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY || import.meta.env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email,
      unsubscribed: false,
      properties: { school },
      segments: [{ id: RESEND_SEGMENT_ID }],
    }),
  });

  if (res.ok) return reply(request, 200, { ok: true }, school);

  const err = await res.json().catch(() => ({}));
  // Signing up twice is fine from the visitor's side.
  if (res.status === 409 || /already exists/i.test(err.message || '')) {
    return reply(request, 200, { ok: true }, school);
  }
  console.error('[subscribe] resend error', res.status, err.name || '', err.message || '');
  return reply(request, 502, { ok: false, error: 'upstream' }, school);
}
