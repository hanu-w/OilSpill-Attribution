// Baseline: current candidate ranking + specific route point checks.
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url, { fsCache: false });
const gen = await jiti.import('../src/simulation/vesselGenerator.ts');
const { rankCandidates } = await jiti.import('../src/simulation/candidateScoring.ts');
const { SCENARIO_INCIDENT_BASE } = await jiti.import('../src/simulation/incident.ts');
const { vesselStateAt } = await jiti.import('../src/simulation/kinematics.ts');
const { isOnLand, isSafeWater } = await jiti.import('../src/simulation/landMask.ts');
const { driftVectorAt } = await jiti.import('../src/simulation/environment.ts');
const { destinationPoint, distanceKm } = await jiti.import('../src/simulation/geo.ts');

const fleet = gen.generateSimVessels();
console.log('Ranking (current):');
for (const c of rankCandidates(SCENARIO_INCIDENT_BASE)) {
  console.log(`  ${c.vesselId} ${c.matchScore} dist=${c.distanceFromOriginKm}`);
}

// vsl-001 during release window
const RELEASE_START = Date.parse('2026-08-27T06:12:00Z');
const RELEASE_END = Date.parse('2026-08-27T07:27:00Z');
const v = fleet.find(w => w.id === 'vsl-001');
const drift = driftVectorAt(Date.parse('2026-08-27T07:42:00Z'));
const source = destinationPoint({lat: SCENARIO_INCIDENT_BASE.location.lat, lng: SCENARIO_INCIDENT_BASE.location.lng}, (drift.bearingDeg+180)%360, drift.speedKmH * (50/60));
console.log(`drift bearing=${drift.bearingDeg} speed=${drift.speedKmH} source=(${source.lat},${source.lng})`);
let minD = Infinity, minAt = 0;
for (let t = RELEASE_START; t <= RELEASE_END; t += 6*60000) {
  const s = vesselStateAt(v, t);
  const d = distanceKm(source, {lat:s.lat, lng:s.lng});
  if (d < minD) { minD = d; minAt = t; }
  console.log(`  ${new Date(t).toISOString().slice(11,16)} vsl-001 (${s.lat.toFixed(3)},${s.lng.toFixed(3)}) dist=${d.toFixed(1)}km land=${isOnLand(s.lng,s.lat)}`);
}
console.log(`min dist ${minD.toFixed(1)}km at ${new Date(minAt).toISOString().slice(11,16)}`);

// Check key route candidates for safe water
console.log('\nRoute point checks:');
const pts = [
  ['Sikka approach (22.56,69.9)', 22.56, 69.9],
  ['(22.6,69.7)', 22.6, 69.7],
  ['(22.55,69.6)', 22.55, 69.6],
  ['(22.5,69.5)', 22.5, 69.5],
  ['(22.45,69.4)', 22.45, 69.4],
  ['(22.4,69.3)', 22.4, 69.3],
  ['(22.35,69.2)', 22.35, 69.2],
  ['(22.3,69.1)', 22.3, 69.1],
  ['(22.25,69.0)', 22.25, 69.0],
  ['(22.2,68.85)', 22.2, 68.85],
  ['(22.5,68.95)', 22.5, 68.95],
  ['(22.55,69.15)', 22.55, 69.15],
  ['(22.6,69.45)', 22.6, 69.45],
  ['(22.65,69.8)', 22.65, 69.8],
];
for (const [n, lat, lng] of pts) console.log(`  ${n.padEnd(22)} land=${isOnLand(lng,lat)} safe=${isSafeWater(lng,lat)}`);

// patrol / fishing ground candidates
console.log('\nPatrol/fishing candidates:');
const p2 = [
  ['patrol kandla ctr (22.75,70.0)', 22.75, 70.0],
  ['patrol mundra ctr (22.7,69.65)', 22.7, 69.65],
  ['anchorage kandla (22.78,70.02)', 22.78, 70.02],
  ['fishing gulfMouth (22.45,69.35)', 22.45, 69.35],
  ['fishing offMandvi (22.6,69.3)', 22.6, 69.3],
  ['fishing offOkha (22.45,68.95)', 22.45, 68.95],
  ['vsl-005 patrol ctr (22.39,69.93)', 22.39, 69.93],
];
for (const [n, lat, lng] of p2) console.log(`  ${n.padEnd(28)} land=${isOnLand(lng,lat)} safe=${isSafeWater(lng,lat)}`);
