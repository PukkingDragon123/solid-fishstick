#!/usr/bin/env node
// CRABDEN - build a single self-contained HTML file.
//
//   node build.mjs
//
// Produces:
//   dist/crabden.html      standalone page; works from file:// with no server
//   dist/crabden.body.html the same page as a fragment (no <html>/<head>/<body>),
//                          for hosts that supply their own document shell
//
// Everything is inlined because the game has no asset files - the terrain,
// creatures, font and audio are all generated at runtime.

import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, 'dist');

const result = await build({
  entryPoints: [join(root, 'js/main.js')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  minify: false,
  legalComments: 'none',
  write: false,
  logLevel: 'info',
});

const js = result.outputFiles[0].text;
const css = await readFile(join(root, 'css/style.css'), 'utf8');

const TITLE = 'CRABDEN';
const DESC = 'Wake up as a thousand-year-old crab in a world with no ocean. '
  + 'Make water, restore the desert, and collect the strange things that survived.';

const FAVICON = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'>"
  + "<rect width='16' height='16' fill='%23e8c88d'/><rect x='4' y='6' width='8' height='5' fill='%23b8543a'/>"
  + "<rect x='5' y='3' width='2' height='2' fill='%231b1016'/><rect x='9' y='3' width='2' height='2' fill='%231b1016'/>"
  + "<rect x='6' y='4' width='4' height='2' fill='%2357c8d8'/></svg>";

const body = `<canvas id="game" width="960" height="540" aria-label="CRABDEN game screen"></canvas>
<div id="boot">
  <h1>CRABDEN</h1>
  <p>waking up&hellip;</p>
</div>
<noscript>
  <div class="crash"><h1>javascript is switched off</h1>
  <p>CRABDEN is a canvas game and needs JavaScript to run.</p></div>
</noscript>
<script>
${js}</script>`;

const head = `<title>${TITLE}</title>
<style>
${css}</style>`;

await mkdir(out, { recursive: true });

await writeFile(join(out, 'crabden.html'), `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="${DESC}">
<meta name="theme-color" content="#0a0705">
<link rel="icon" href="${FAVICON}">
${head}
</head>
<body>
${body}
</body>
</html>
`);

await writeFile(join(out, 'crabden.body.html'), `${head}
${body}
`);

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(0) + 'kb';
console.log(`bundled js ${kb(js)}, css ${kb(css)} -> dist/crabden.html`);
