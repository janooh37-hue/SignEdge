// Copies the exact prebuilt library files the extension loads at runtime
// from node_modules into /lib, so the shipped extension contains no node_modules
// and no remote code (MV3 requirement).
import { mkdir, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lib = join(root, 'lib');

const files = [
  ['node_modules/signature_pad/dist/signature_pad.umd.min.js', 'lib/signature_pad.umd.min.js'],
  ['node_modules/pdfjs-dist/build/pdf.min.mjs', 'lib/pdf.min.mjs'],
  ['node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'lib/pdf.worker.min.mjs'],
  ['node_modules/pdf-lib/dist/pdf-lib.min.js', 'lib/pdf-lib.min.js'],
];

await mkdir(lib, { recursive: true });
for (const [from, to] of files) {
  await copyFile(join(root, from), join(root, to));
  console.log('vendored', to);
}
console.log('done');
