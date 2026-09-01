import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url, { fsCache: false });
const { isOnLand } = await jiti.import('../src/simulation/landMask.ts');
const pts = [
  ['Arabian Sea (open water)', 20.0, 69.0],
  ['Gulf of Kutch centre', 22.6, 69.5],
  ['Saurashtra interior (land)', 21.8, 71.2],
  ['Gujarat mainland (land)', 23.0, 72.6],
  ['Rann of Kutch (land)', 24.0, 70.5],
  ['Mumbai harbour water', 18.95, 72.83],
  ['off Diu (water)', 20.6, 70.9],
  ['Gulf of Khambhat mouth (water)', 20.5, 71.9],
  ['vsl-003 wpt1', 20.884, 71.286],
  ['vsl-002 wpt1', 23.012, 69.057],
];
for (const [n,lat,lng] of pts) console.log(n.padEnd(30), `${lat},${lng}`.padEnd(18), isOnLand(lng,lat)?'LAND':'water');
