/*
 * @license MPL-2.0
 * https://mozilla.org/MPL/2.0/
 */
import { build } from 'esbuild';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dist = resolve(root, 'dist');
const packageJson = JSON.parse(
  await readFile(resolve(root, 'package.json'), 'utf8'),
);
const raw = 'https://raw.githubusercontent.com/List-KR/adshield-defense/refs/heads/userscript/tinyShield.user.js';
const output = await build({
  entryPoints: [resolve(root, 'src/runtime.js')],
  legalComments: 'inline',
  minify: true,
  target: 'safari15',
  write: false,
});
const header = [
  '// ==UserScript==',
  '// @name         adShield Defense',
  '// @namespace    adshield-defense',
  `// @version      ${packageJson.version}`,
  '// @description  Ad-Shield의 광고 재삽입 및 차단 방지 검사를 중단합니다.',
  '// @description:en  Blocks known Ad-Shield reinsertion paths.',
  '// @license      MPL-2.0',
  '// @match        *://*/*',
  '// @run-at       document-start',
  '// @inject-into  page',
  '// @grant        none',
  `// @updateURL    ${raw}`,
  `// @downloadURL  ${raw}`,
  '// ==/UserScript==',
  '',
].join('\n');

await rm(dist, { recursive: true, force: true });
await mkdir(dist);
await writeFile(
  resolve(dist, 'tinyShield.user.js'),
  header + output.outputFiles[0].text,
);
