// Explore the safe-water mask around the Gulf of Kutch and Saurashtra coast.
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url, { fsCache: false });
const { isOnLand, isSafeWater, segmentCrossesLand } = await jiti.import('../src/simulation/landMask.ts');

function row(label, lat, lngs) {
  let line = `${label} ${lat.toFixed(2)} `;
  for (const lng of lngs) {
    const c = isOnLand(lng, lat) ? '#' : (isSafeWater(lng, lat) ? '.' : ',');
    line += c;
  }
  return line;
}

// Gulf of Kutch region: lat 22.0-23.4, lng 68.4-70.4
console.log('Gulf of Kutch safe-water map (rows lat, cols lng 68.4→70.4 step 0.1; #=land .=safe ,=near)');
for (let lat = 23.3; lat >= 22.0; lat -= 0.1) {
  const lngs = [];
  for (let lng = 68.4; lng <= 70.4 + 1e-9; lng += 0.1) lngs.push(lng);
  console.log(row('lat', lat, lngs));
}

console.log('\nSaurashtra south-west coast / Gulf of Khambhat: lat 20.5-21.6, lng 70.5-71.6');
for (let lat = 21.6; lat >= 20.5; lat -= 0.1) {
  const lngs = [];
  for (let lng = 70.3; lng <= 71.6 + 1e-9; lng += 0.1) lngs.push(lng);
  console.log(row('lat', lat, lngs));
}

console.log('\nWest of Saurashtra (deep sea corridor): lat 20.5-22.5, lng 67.5-68.6');
for (let lat = 22.5; lat >= 20.5; lat -= 0.1) {
  const lngs = [];
  for (let lng = 67.5; lng <= 68.6 + 1e-9; lng += 0.1) lngs.push(lng);
  console.log(row('lat', lat, lngs));
}

// Candidate incident locations: check safe + drift clearance along SW bearing
const candidates = [
  ['A (22.514,69.554) current', 22.514, 69.554],
  ['B (22.45,69.45)', 22.45, 69.45],
  ['C (22.40,69.30)', 22.40, 69.30],
  ['D (22.50,69.70)', 22.50, 69.70],
  ['E (22.35,69.20)', 22.35, 69.20],
];
for (const [n, lat, lng] of candidates) {
  console.log(`${n}: land=${isOnLand(lng, lat)} safe=${isSafeWater(lng, lat)}`);
}
