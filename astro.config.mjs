import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://alldorms.vercel.app',
  build: { format: 'directory' }, // /colgate/weather/ -> clean URLs
  trailingSlash: 'always',
});
