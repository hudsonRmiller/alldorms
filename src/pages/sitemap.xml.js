import { SCHOOLS } from '../lib/site.js';

// Sitemap of every indexable URL: homepage + the 12 school guides.
export async function GET({ site }) {
  const base = site.href.replace(/\/$/, '');
  const paths = ['/', ...SCHOOLS.map(s => `/${s.slug}/`)];
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    paths.map(p => `  <url><loc>${base}${p}</loc></url>`).join('\n') +
    `\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
