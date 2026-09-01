import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { fsCache: false });

const {
  scenarioController,
  SCENARIO_TIMELINE_START_MS,
  SCENARIO_TIMELINE_END_MS,
} = await jiti.import('../src/simulation/scenarioController.ts');

const {
  INCIDENT_ID,
  DETECTION_MS,
  DRIFT_START_MS,
  ATTRIBUTION_MS,
  SCENARIO_INCIDENT_BASE,
  scenarioPhaseAt,
} = await jiti.import('../src/simulation/incident.ts');

const { candidatesAt, incidentStateAt, scenarioStateAt } = await jiti.import('../src/simulation/scenarioRunner.ts');
const { rankCandidates } = await jiti.import('../src/simulation/candidateScoring.ts');
const { simulationEngine } = await jiti.import('../src/simulation/simulationEngine.ts');
const { MockDataProvider } = await jiti.import('../src/api/mockProvider.ts');

function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

console.log('=== VERIFYING TASK 5: EXPLAINABLE SOURCE ATTRIBUTION ===\n');

// 1. Single Authoritative Clock & Attribution Phase Gates
console.log('1. Testing Attribution Phase Progression from Scenario Clock...');
const preAttributionMs = ATTRIBUTION_MS - 1000; // 08:40:59Z
const atAttributionMs = ATTRIBUTION_MS;         // 08:41:00Z
const postAttributionMs = ATTRIBUTION_MS + 600000; // 08:51:00Z

const statePre = incidentStateAt(preAttributionMs);
assert(statePre.phase === 'correlating', `Phase at 08:40:59Z should be correlating, got ${statePre.phase}`);
const candidatesPre = candidatesAt(INCIDENT_ID, preAttributionMs);
assert(candidatesPre.length === 4, 'Candidates should be available during correlating');
assert(statePre.incident.status === 'investigating', `Incident status before 08:41Z should be investigating, got ${statePre.incident.status}`);
console.log('  ✓ 08:40:59Z (Pre-Attribution): Correlating phase, candidate pool active, no premature attribution conclusion');

const stateAt = incidentStateAt(atAttributionMs);
assert(stateAt.phase === 'attribution-ready', `Phase at 08:41:00Z should be attribution-ready, got ${stateAt.phase}`);
assert(stateAt.incident !== null, 'Incident must be active');
assert(stateAt.spill !== null, 'Spill must be active');
console.log('  ✓ 08:41:00Z (Attribution Ready): Attribution phase achieved precisely on schedule');

const statePost = incidentStateAt(postAttributionMs);
assert(statePost.phase === 'attribution-ready', `Phase at 08:51:00Z should remain attribution-ready, got ${statePost.phase}`);
console.log('  ✓ 08:51:00Z (Post-Attribution): Attribution phase persists cleanly\n');

// 2. Candidate Ranking & Top Candidate Identity
console.log('2. Verifying Deterministic Candidate Ranking & Top Suspect...');
const provider = new MockDataProvider();
const candidates = await provider.getCandidates(INCIDENT_ID, {
  timestamp: new Date(ATTRIBUTION_MS).toISOString(),
});

assert(candidates.length === 4, `Expected 4 candidates, got ${candidates.length}`);

// Direct comparison with simulationEngine ranking
const modelRanked = rankCandidates(SCENARIO_INCIDENT_BASE, simulationEngine.vessels);
assert(JSON.stringify(candidates) === JSON.stringify(modelRanked), 'Provider candidates must match pure scoring model');

// Candidate 1: Ocean Guardian (vsl-001)
const c1 = candidates[0];
const v1 = simulationEngine.getVessel(c1.vesselId);
assert(c1.vesselId === 'vsl-001', `Top candidate must be vsl-001, got ${c1.vesselId}`);
assert(v1.name === 'Ocean Guardian', `Top candidate name must be Ocean Guardian, got ${v1.name}`);
assert(v1.type === 'tanker', `Top candidate type must be tanker, got ${v1.type}`);
assert(c1.matchScore === 0.965, `Top candidate match score must be exactly 0.965 (96.5%), got ${c1.matchScore}`);
assert(c1.distanceFromOriginKm === 2.8, `Top candidate minDist must be 2.8 km, got ${c1.distanceFromOriginKm}`);

console.log(`  ✓ #1 Primary Candidate: ${v1.name} (${c1.vesselId}) — ${(c1.matchScore * 100).toFixed(1)}% Match`);

// Candidate 2: Cormorant Rider (vsl-032)
const c2 = candidates[1];
const v2 = simulationEngine.getVessel(c2.vesselId);
assert(c2.vesselId === 'vsl-032', `Second candidate must be vsl-032, got ${c2.vesselId}`);
assert(c2.matchScore === 0.662, `Second candidate score must be 0.662 (66.2%), got ${c2.matchScore}`);
console.log(`  ✓ #2 Candidate: ${v2.name} (${c2.vesselId}) — ${(c2.matchScore * 100).toFixed(1)}% Match (Margin: -${((c1.matchScore - c2.matchScore) * 100).toFixed(1)}%)`);

// Candidate 3: Kaveri Protector (vsl-017)
const c3 = candidates[2];
const v3 = simulationEngine.getVessel(c3.vesselId);
assert(c3.vesselId === 'vsl-017', `Third candidate must be vsl-017, got ${c3.vesselId}`);
assert(c3.matchScore === 0.624, `Third candidate score must be 0.624 (62.4%), got ${c3.matchScore}`);
console.log(`  ✓ #3 Candidate: ${v3.name} (${c3.vesselId}) — ${(c3.matchScore * 100).toFixed(1)}% Match`);

// Candidate 4: Lakshmi Star (vsl-016)
const c4 = candidates[3];
const v4 = simulationEngine.getVessel(c4.vesselId);
assert(c4.vesselId === 'vsl-016', `Fourth candidate must be vsl-016, got ${c4.vesselId}`);
assert(c4.matchScore === 0.619, `Fourth candidate score must be 0.619 (61.9%), got ${c4.matchScore}`);
console.log(`  ✓ #4 Candidate: ${v4.name} (${c4.vesselId}) — ${(c4.matchScore * 100).toFixed(1)}% Match\n`);

// 3. Explainable Score & Factor Decomposition
console.log('3. Verifying Factor Decomposition & Evidence Breakdown...');
assert(c1.evidence && c1.evidence.length === 5, `Expected 5 evidence factors, got ${c1.evidence.length}`);

const distEv = c1.evidence.find((e) => e.type === 'distance');
const tempEv = c1.evidence.find((e) => e.type === 'temporal');
const routeEv = c1.evidence.find((e) => e.type === 'route');
const behEv = c1.evidence.find((e) => e.type === 'behavioral');
const envEv = c1.evidence.find((e) => e.type === 'environmental');

assert(distEv && distEv.score === 0.987, `Distance factor score expected 0.987, got ${distEv?.score}`);
assert(tempEv && tempEv.score === 0.927, `Temporal factor score expected 0.927, got ${tempEv?.score}`);
assert(routeEv && routeEv.score === 1.0, `Route factor score expected 1.000, got ${routeEv?.score}`);
assert(behEv && behEv.score === 0.914, `Behavioral factor score expected 0.914, got ${behEv?.score}`);
assert(envEv && envEv.score === 0.97, `Environmental factor score expected 0.970, got ${envEv?.score}`);

console.log(`  - Distance Proximity:  ${(distEv.score * 100).toFixed(1)}% (${distEv.description})`);
console.log(`  - Temporal Window:     ${(tempEv.score * 100).toFixed(1)}% (${tempEv.description})`);
console.log(`  - Route Coherence:     ${(routeEv.score * 100).toFixed(1)}% (${routeEv.description})`);
console.log(`  - Discharge Behavior:  ${(behEv.score * 100).toFixed(1)}% (${behEv.description})`);
console.log(`  - Net Drift Coherence: ${(envEv.score * 100).toFixed(1)}% (${envEv.description})`);
console.log('✓ All 5 explainable factor scores match pure mathematical simulation model.\n');

// 4. Kinematics, Positioning & Historical AIS Trail Coherence
console.log('4. Verifying Top Candidate Kinematics and AIS Trail...');
scenarioController.pause();
scenarioController.setSimTimeMs(ATTRIBUTION_MS);

const state0841 = simulationEngine.getVessels(ATTRIBUTION_MS).find((v) => v.id === 'vsl-001');
assert(state0841 !== undefined, 'Ocean Guardian must exist at 08:41Z');
assert(state0841.speed === 9.4, `Speed expected 9.4 kn, got ${state0841.speed}`);
assert(state0841.heading >= 260 && state0841.heading <= 270, `Heading expected ~264°, got ${state0841.heading}`);

const trail0841 = simulationEngine.getVesselTrail('vsl-001');
assert(trail0841 && trail0841.points.length >= 20, `Expected >=20 trail points, got ${trail0841?.points.length}`);
const latestTrailPoint = trail0841.points[trail0841.points.length - 1];
const distFromCurrent = Math.hypot(latestTrailPoint.lat - state0841.position.lat, latestTrailPoint.lng - state0841.position.lng);
assert(distFromCurrent < 0.005, `Latest trail point must coincide with vessel current position, diff=${distFromCurrent}`);
console.log(`  ✓ Ocean Guardian position at 08:41Z: ${state0841.position.lat.toFixed(4)}°N, ${state0841.position.lng.toFixed(4)}°E (Speed: ${state0841.speed} kn)`);
console.log(`  ✓ Historical AIS trail contains ${trail0841.points.length} coherent track points across deep channel\n`);

// 5. Timeline Scrubbing Reversibility & Controls
console.log('5. Testing Scrubbing, Pause, Resume & Reset Reversibility...');

// Scrub back before attribution (08:20:00Z)
scenarioController.pause();
scenarioController.setSimTimeMs(Date.parse('2026-08-27T08:20:00Z'));
const scrubBackPhase = scenarioPhaseAt(scenarioController.getSimTimeMs());
assert(scrubBackPhase === 'correlating', `Phase at 08:20Z must be correlating, got ${scrubBackPhase}`);
console.log('  ✓ Scrub back to 08:20Z: Attribution conclusion cleanly disappears, correlation returns');

// Scrub forward to attribution (08:45:00Z)
scenarioController.setSimTimeMs(Date.parse('2026-08-27T08:45:00Z'));
const scrubFwdPhase = scenarioPhaseAt(scenarioController.getSimTimeMs());
assert(scrubFwdPhase === 'attribution-ready', `Phase at 08:45Z must be attribution-ready, got ${scrubFwdPhase}`);
const scrubFwdCandidates = candidatesAt(INCIDENT_ID, scenarioController.getSimTimeMs());
assert(scrubFwdCandidates[0].vesselId === 'vsl-001' && scrubFwdCandidates[0].matchScore === 0.965, 'Candidates deterministically match');
console.log('  ✓ Scrub forward to 08:45Z: Attribution conclusion returns deterministically (96.5%)');

// Reset
scenarioController.reset();
assert(scenarioController.getSimTimeMs() === SCENARIO_TIMELINE_START_MS, 'Reset must return to 07:20:00Z');
const resetPhase = scenarioPhaseAt(scenarioController.getSimTimeMs());
assert(resetPhase === 'normal', `Reset phase must be normal, got ${resetPhase}`);
assert(incidentStateAt(scenarioController.getSimTimeMs()).incident === null, 'Incident must be null at reset');
console.log('  ✓ Reset: Clean baseline restored (07:20:00Z, normal, no incident, no attribution)\n');

// 6. Fleet Integrity Check
console.log('6. Verifying Fleet Size & Marine Coexistence...');
const fleet = simulationEngine.getVessels();
assert(fleet.length === 50, `Fleet size must be exactly 50, got ${fleet.length}`);
console.log('  ✓ Fleet size remains 50 vessels across all operations.\n');

console.log('======================================================');
console.log('ALL TASK 5 EXPLAINABLE SOURCE ATTRIBUTION CHECKS PASSED');
console.log('======================================================');
