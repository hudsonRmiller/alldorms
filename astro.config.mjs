import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/serverless';

export default defineConfig({
  site: 'https://alldorms.net',

  // /colgate/weather/ -> clean URLs
  build: { format: 'directory' },

  trailingSlash: 'always',

  // Every page still prerenders exactly as before; only /api/stats/ opts out
  // via `export const prerender = false`.
  output: 'hybrid',
  adapter: vercel(),
});
