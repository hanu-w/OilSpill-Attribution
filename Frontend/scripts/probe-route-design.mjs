// Design navigable routes for scenario vessels vsl-001/002/003/005.
// Tests candidate waypoint lists against checkNavigability.
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url, { fsCache: false });
const { checkNavigability, isOnLand, isSafeWater } = await jiti.import('../src/simulation/landMask.ts');

const candidates = {
  'vsl-001-A (south channel, short)': [
    [22.52, 69.79], [22.49, 69.65], [22.45, 69.50], [22.41, 69.35], [22.38, 69.22], [22.35, 69.10],
  ],
  'vsl-001-B (south→north channel exit)': [
    [22.52, 69.79], [22.49, 69.65], [22.45, 69.50], [22.41, 69.35], [22.44, 69.18], [22.55, 69.10], [22.5, 68.95], [22.4, 68.85], [22.2, 68.75],
  ],
  'vsl-001-C (mid channel wide)': [
    [22.52, 69.79], [22.50, 69.60], [22.46, 69.40], [22.42, 69.22], [22.38, 69.05], [22.32, 68.92], [22.22, 68.80],
  ],
  'vsl-002-A (outer gulf mouth NE)': [
    [22.82, 68.86], [22.62, 69.02], [22.58, 69.22], [22.60, 69.45], [22.65, 69.80], [22.70, 70.00],
  ],
  'vsl-002-B (gulf mouth wide NE)': [
    [22.82, 68.86], [22.60, 69.10], [22.58, 69.35], [22.62, 69.60], [22.68, 69.85],
  ],
  'vsl-003-A (offshore Saurashtra NW)': [
    [20.72, 71.45], [20.85, 71.15], [20.95, 70.80], [21.05, 70.45], [21.20, 70.10], [21.40, 69.80], [21.63, 69.52],
  ],
  'vsl-003-B (further offshore)': [
    [20.72, 71.45], [20.85, 71.10], [20.98, 70.65], [21.10, 70.30], [21.28, 69.95], [21.50, 69.60],
  ],
  'vsl-005-A (patrol offshore gulf mouth)': [
    [22.45, 69.20], [22.42, 69.28], [22.38, 69.25], [22.40, 69.16], [22.45, 69.20],
  ],
  'vsl-005-B (patrol near incident, offshore)': [
    [22.47, 69.40], [22.43, 69.48], [22.38, 69.45], [22.40, 69.35], [22.47, 69.40],
  ],
  'vsl-005-C (patrol west of Sikka offshore)': [
    [22.52, 69.55], [22.47, 69.62], [22.42, 69.58], [22.44, 69.48], [22.52, 69.55],
  ],
};

for (const [name, pts] of Object.entries(candidates)) {
  const wp = pts.map(([lat, lng]) => ({ lat, lng }));
  const r = checkNavigability(wp);
  const details = r.ok ? '' : ` -> ${JSON.stringify(r)}`;
  console.log(`${name}: ${r.ok ? 'NAVIGABLE' : 'FAIL'}${details}`);
  if (!r.ok) {
    // Show each waypoint status
    wp.forEach((p, i) => console.log(`   wpt${i} (${p.lat},${p.lng}) land=${isOnLand(p.lng,p.lat)} safe=${isSafeWater(p.lng,p.lat)}`));
  }
}
