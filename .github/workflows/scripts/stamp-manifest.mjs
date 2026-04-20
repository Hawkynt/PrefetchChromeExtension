// Rewrites manifest.json "version" to the supplied X.Y.Z[.BUILD] string.
// Invoked by _build.yml before zipping the extension.
//
// Usage: node stamp-manifest.mjs <version>

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
// Script at <repo>/.github/workflows/scripts/; manifest at <repo>/manifest.json.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const MANIFEST  = path.join(REPO_ROOT, 'manifest.json');

const version = process.argv[2];
if (!version) {
    console.error('usage: stamp-manifest.mjs <version>');
    process.exit(2);
}

// Chrome accepts 1-4 dot-separated integers.
if (!/^\d+(\.\d+){0,3}$/.test(version)) {
    console.error(`refusing to write invalid Chrome manifest version: "${version}"`);
    process.exit(2);
}

const raw = fs.readFileSync(MANIFEST, 'utf8');
const obj = JSON.parse(raw);
const prev = obj.version;
obj.version = version;
fs.writeFileSync(MANIFEST, JSON.stringify(obj, null, 2) + '\n');
console.log(`manifest.json version ${prev} -> ${version}`);
