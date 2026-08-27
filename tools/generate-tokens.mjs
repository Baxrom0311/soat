// tools/generate-tokens.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { emitCss } from './lib/emit-css.mjs';

const ROOT = new URL('../', import.meta.url);
const tokens = JSON.parse(readFileSync(new URL('tokens.json', ROOT), 'utf8'));

const EMITTERS = { css: { path: tokens.meta.outputs.css, render: emitCss } };

export { emitCss };

// Correction 1: guard the CLI body so importing this module (e.g. from a later
// task's test suite) never runs the emitter loop or calls process.exit.
const isCli = process.argv[1] && process.argv[1].endsWith('generate-tokens.mjs');

if (isCli) {
  const check = process.argv.includes('--check');

  let failed = false;
  for (const [target, { path, render }] of Object.entries(EMITTERS)) {
    const url = new URL(path, ROOT);
    const next = render(tokens);
    const prev = existsSync(url) ? readFileSync(url, 'utf8') : null;
    if (check) {
      if (prev !== next) {
        console.error(`STALE: ${path} does not match tokens.json — run: node tools/generate-tokens.mjs`);
        failed = true;
      }
    } else if (prev !== next) {
      writeFileSync(url, next);
      console.log(`wrote ${path}`);
    }
  }
  process.exit(failed ? 1 : 0);
}
