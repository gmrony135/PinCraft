import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Run: node tests/adsterra-ads.mjs
// Guards the Monetag -> Adsterra migration: no Monetag reference may remain
// in the repo, and the Adsterra component must carry all four live units.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', '.git', '.next']);
const FORBIDDEN = [/monetag/i, /5gvci\.com/i, /nap5k\.com/i, /n6wxm\.com/i, /3nbf4\.com/i, /12290352/, /12290345/, /12287927/, /vignette-frequency/i];
const SELF = join('tests', 'adsterra-ads.mjs');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) walk(path, out);
    } else out.push(path);
  }
  return out;
}

const hits = [];
for (const file of walk(ROOT)) {
  const rel = file.slice(ROOT.length + 1);
  if (rel === SELF) continue;
  const text = readFileSync(file, 'utf8');
  for (const pattern of FORBIDDEN) {
    if (pattern.test(text)) hits.push(`${rel}: ${pattern}`);
  }
}
assert.equal(hits.length, 0, `Monetag references remain:\n${hits.join('\n')}`);

const ads = readFileSync(join(ROOT, 'components', 'ads', 'AdsterraAds.js'), 'utf8');
for (const needle of [
  'bauval.org/14/a54607ccdd372fccae96e4f16760f4a2', // Social Bar
  'bauval.org/21/e250928250d9b84951ea0e5ccdfb7142', // Native Banner
  'cc224f0b3f71a17fd951fa892e44e17a', // Banner 728x90
  '7d2124eecaa88b6d1e82f6cb703e012a', // Banner 300x250
  'container-e250928250d9b84951ea0e5ccdfb7142',
]) assert.ok(ads.includes(needle), `AdsterraAds.js is missing ${needle}`);
console.log('adsterra-ads: no Monetag references; all 4 Adsterra units present');
