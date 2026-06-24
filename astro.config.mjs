import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://alldorms.net',

  // /colgate/weather/ -> clean URLs
  build: { format: 'directory' },

  trailingSlash: 'always',
});
