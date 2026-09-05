import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const expected = {
  source: '61fd5aef606f8deb27636869059cedd003b407abc056e3cfc07ded1d1af52132',
  input: '52cf55a3b4365b7edcb2c39e586e31d85e164832fce2e2199e76679b955b0675',
  completion: '1c21a5d3922a0088dc068f31877b0c3a1b53ccd7962722db5720117d06af5e7f',
};
let out = '/* Generated from immutable C5b11 frame bytes by scripts/generate.mjs. */\n';
for (const [name, hash] of Object.entries(expected)) {
  const bytes = readFileSync(`${root}inputs/${name}.frame`);
  if (digest(bytes) !== hash) throw new Error(`immutable input changed: ${name}`);
  out += `static const uint8_t ${name}_frame[${bytes.length}] = {\n`;
  for (let i = 0; i < bytes.length; i += 16)
    out += '    ' + [...bytes.subarray(i, i + 16)].map(x => `0x${x.toString(16).padStart(2, '0')}`).join(',') + ',\n';
  out += '};\n';
}
if (process.argv.includes('--check')) {
  if (readFileSync(`${root}source/frames.h`, 'utf8') !== out) throw new Error('generated frame drift');
} else writeFileSync(`${root}source/frames.h`, out);
