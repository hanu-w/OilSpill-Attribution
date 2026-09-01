// Determinism test: same seed + same timestamp must reproduce identical
// fleet, positions, routes, behaviour, trails, incident, spill geometry,
// environment and candidate ranking — across two independent generations.
// Run with: node scripts/verify-determinism.mjs
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url, { fsCache: false });

let failures = 0;
const fail = (msg) => { failures++; console.log(`  ✗ ${msg}`); };
const ok = (msg) => console.log(`  ✓ ${msg}`);

const T = Date.parse('2026-08-27T11:34:00Z'); // fixed probe timestamp

// --- generation A ---
const genA = await jiti.import('../src/simulation/vesselGenerator.ts');
const kinA = await jiti.import('../src/simulation/kinematics.ts');
const jitA = await jiti.import('../src/simulation/aisJitter.ts');
const envA = await jiti.import('../src/simulation/environment.ts');
const spillA = await jiti.import('../src/simulation/spillGeometry.ts');
const incA = await jiti.import('../src/simulation/incident.ts');
const srA = await jiti.import('../src/simulation/scenarioRunner.ts');
const csA = await jiti.import('../src/simulation/candidateScoring.ts');
const trailA = await jiti.import('../src/simulation/trailGenerator.ts');
const fleetA = genA.generateSimVessels();

// --- generation B (fresh module graph => fresh singleton, must match) ---
const genB = await jiti.import('../src/simulation/vesselGenerator.ts?b=1');
const kinB = await jiti.import('../src/simulation/kinematics.ts?b=1');
const jitB = await jiti.import('../src/simulation/aisJitter.ts?b=1');
const envB = await jiti.import('../src/simulation/environment.ts?b=1');
const spillB = await jiti.import('../src/simulation/spillGeometry.ts?b=1');
const incB = await jiti.import('../src/simulation/incident.ts?b=1');
const srB = await jiti.import('../src/simulation/scenarioRunner.ts?b=1');
const csB = await jiti.import('../src/simulation/candidateScoring.ts?b=1');
const trailB = await jiti.import('../src/simulation/trailGenerator.ts?b=1');
const fleetB = genB.generateSimVessels();

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

if (eq(fleetA, fleetB)) ok('fleet definitions identical');
else fail('fleet definitions differ');

let posMismatch = 0;
for (const va of fleetA) {
  const vb = fleetB.find((w) => w.id === va.id);
  for (const t of [Date.parse('2026-08-27T06:30:00Z'), T, Date.parse('2026-08-27T20:00:00Z')]) {
    const sa = kinA.vesselStateAt(va, t);
    const sb = kinB.vesselStateAt(vb, t);
    const oa = jitA.observedStateAt(va, t);
    const ob = jitB.observedStateAt(vb, t);
    if (!eq(sa, sb)) posMismatch++;
    if (!eq(oa, ob)) posMismatch++;
    if (sa.lat !== sb.lat) { posMismatch++; }
  }
}
if (!posMismatch) ok('vesselStateAt + observedStateAt identical across generations');
else fail(`${posMismatch} kinematic/observed mismatches`);

let routeMismatch = 0;
for (const va of fleetA) {
  const vb = fleetB.find((w) => w.id === va.id);
  if (!eq(va.route.waypoints, vb.route.waypoints)) routeMismatch++;
  if (JSON.stringify(va.journey) !== JSON.stringify(vb.journey)) routeMismatch++;
}
if (!routeMismatch) ok('routes + journeys identical across generations');
else fail(`${routeMismatch} route/journey mismatches`);

if (eq(fleetA.map((v) => v.pattern), fleetB.map((v) => v.pattern))) ok('behaviour patterns identical');
else fail('behaviour patterns differ');

let trailMismatch = 0;
for (const va of fleetA) {
  const vb = fleetB.find((w) => w.id === va.id);
  if (!eq(trailA.generateTrailPoints(va, T), trailB.generateTrailPoints(vb, T))) trailMismatch++;
}
if (!trailMismatch) ok('trails identical across generations');
else fail(`${trailMismatch} trail mismatches`);

// Incident / spill / environment / candidates at a fixed time.
if (eq(envA.driftVectorAt(T), envB.driftVectorAt(T))) ok('environment identical');
else fail('environment differs');
if (eq(spillA.spillStateAt(T), spillB.spillStateAt(T))) ok('spill geometry identical');
else fail('spill geometry differs');
if (eq(incA.incidentStatusForPhase(incA.scenarioPhaseAt(T)), incB.incidentStatusForPhase(incB.scenarioPhaseAt(T)))) ok('incident status identical');
else fail('incident status differs');
const cA = csA.rankCandidates(incA.SCENARIO_INCIDENT_BASE, fleetA);
const cB = csB.rankCandidates(incB.SCENARIO_INCIDENT_BASE, fleetB);
if (eq(cA, cB)) ok('candidate ranking identical');
else fail('candidate ranking differs');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nDETERMINISM: ALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
