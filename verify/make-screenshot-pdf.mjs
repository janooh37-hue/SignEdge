// Generates a realistic one-page "agreement" PDF for the store screenshot,
// written as base64 into verify/screenshot-fixture.json (served over http).
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFile } from 'node:fs/promises';

const doc = await PDFDocument.create();
const page = doc.addPage([612, 540]);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);
const font = await doc.embedFont(StandardFonts.Helvetica);
const dark = rgb(0.1, 0.1, 0.1);
const gray = rgb(0.4, 0.4, 0.4);

page.drawText('SERVICE AGREEMENT', { x: 60, y: 486, size: 22, font: bold, color: dark });
page.drawText('This Service Agreement is entered into as of the date signed below.', {
  x: 60, y: 462, size: 10, font, color: gray });

const body = [
  '1. The Provider agrees to deliver the services described in Schedule A in a',
  '   professional and timely manner.',
  '2. The Client agrees to pay the fees set out in Schedule B within 30 days of',
  '   receipt of each invoice.',
  '3. This Agreement remains in effect until terminated by either party with 30',
  '   days written notice.',
  '4. Both parties agree that the terms above constitute the entire agreement.',
];
let y = 424;
for (const line of body) { page.drawText(line, { x: 60, y, size: 11, font, color: dark }); y -= 22; }

// signature block
page.drawText('Signature:', { x: 60, y: 150, size: 11, font, color: dark });
page.drawLine({ start: { x: 140, y: 146 }, end: { x: 360, y: 146 }, thickness: 1, color: gray });
page.drawText('Date:', { x: 400, y: 150, size: 11, font, color: dark });
page.drawLine({ start: { x: 440, y: 146 }, end: { x: 560, y: 146 }, thickness: 1, color: gray });
page.drawText('Client', { x: 140, y: 130, size: 9, font, color: gray });

const b64 = await doc.saveAsBase64();
await writeFile(new URL('./screenshot-fixture.json', import.meta.url), JSON.stringify({ pdfB64: b64 }));
console.log('wrote screenshot-fixture.json:', b64.length, 'b64 chars');
