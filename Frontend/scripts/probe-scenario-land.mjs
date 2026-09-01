import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url, { fsCache: false });
const { isOnLand, isSafeWater } = await jiti.import('../src/simulation/landMask.ts');
const pts = [
  ['vsl-002 wpt1', 23.012, 69.057],
  ['vsl-003 wpt1', 20.884, 71.286],
  ['vsl-005 wpt0', 22.391, 69.912],
  ['vsl-001 wpt1', 22.483, 69.681],
  ['vsl-001 wpt5', 22.32, 68.82],
  ['vsl-004 wpt0', 22.552, 69.441],
];
for (const [n,lat,lng] of pts) {
  console.log(n.padEnd(16), `${lat.toFixed(3)},${lng.toFixed(3)}`.padEnd(16),
    isOnLand(lng,lat)?'LAND':'water', isSafeWater(lng,lat)?'safe':'near-shore');
}
// neighbors around vsl-003 wpt1
console.log('--- vsl-003 (20.884,71.286) neighborhood ---');
for (const [dlat,dlng] of [[0,0],[0.02,0],[0,0.02],[-0.02,0],[0,-0.02]]) {
  const la=20.884+dlat, lo=71.286+dlng;
  console.log(`${la.toFixed(3)},${lo.toFixed(3)}`.padEnd(14), isOnLand(lo,la)?'LAND':'water');
}
