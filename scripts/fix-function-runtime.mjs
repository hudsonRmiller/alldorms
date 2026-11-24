// @astrojs/vercel 7.x only knows Node 18/20 and falls back to writing
// `runtime: "nodejs18.x"` for any other build Node — a runtime Vercel no
// longer offers. Run after `astro build`: point every function at the Node
// major that actually ran the build (26.x on Vercel, per package.json engines).
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(process.cwd(), '.vercel', 'output', 'functions');
const runtime = `nodejs${process.versions.node.split('.')[0]}.x`;

if (fs.existsSync(dir)) {
  for (const fn of fs.readdirSync(dir)) {
    const cfg = path.join(dir, fn, '.vc-config.json');
    if (!fs.existsSync(cfg)) continue;
    const json = JSON.parse(fs.readFileSync(cfg, 'utf8'));
    if (json.runtime !== runtime) {
      json.runtime = runtime;
      fs.writeFileSync(cfg, JSON.stringify(json, null, '\t'));
      console.log(`[fix-function-runtime] ${fn} → ${runtime}`);
    }
  }
}
