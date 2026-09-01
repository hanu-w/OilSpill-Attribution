import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { fsCache: false });

const {
  scenarioController,
  SCENARIO_TIMELINE_START_MS,
} = await jiti.import('../src/simulation/scenarioController.ts');

const {
  INCIDENT_ID,
  DETECTION_MS,
  DRIFT_START_MS,
  ATTRIBUTION_MS,
} = await jiti.import('../src/simulation/incident.ts');

const { environmentAt, driftVectorAt } = await jiti.import('../src/simulation/environment.ts');
const { estimatedOrigin } = await jiti.import('../src/simulation/spillGeometry.ts');
const { candidatesAt, incidentStateAt } = await jiti.import('../src/simulation/scenarioRunner.ts');
const { MockDataProvider } = await jiti.import('../src/api/mockProvider.ts');

function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

console.log('=== VERIFYING TASK 4: ENVIRONMENTAL DRIFT & AIS CORRELATION ===\n');

// 1. Environmental Drift Field Analysis
console.log('1. Testing Environmental Drift Field Calculations...');
const env0720 = environmentAt(SCENARIO_TIMELINE_START_MS);
const env0800 = environmentAt(DRIFT_START_MS);

assert(env0720.wind.speed > 6 && env0720.wind.speed < 9, `Wind speed expected 6..9 kn, got ${env0720.wind.speed}`);
assert(env0720.current.speed > 0.6 && env0720.current.speed < 1.1, `Current speed expected 0.6..1.1 kn, got ${env0720.current.speed}`);

const drift0800 = driftVectorAt(DRIFT_START_MS);
console.log(`  - Wind at 08:00Z:    ${env0800.wind.speed.toFixed(1)} m/s @ ${env0800.wind.direction}°`);
console.log(`  - Current at 08:00Z: ${env0800.current.speed.toFixed(1)} m/s @ ${env0800.current.direction}°`);
console.log(`  - Net Surface Drift: ${drift0800.speedKmH.toFixed(2)} km/h @ ${drift0800.bearingDeg}°`);

assert(drift0800.speedKmH >= 3.5 && drift0800.speedKmH <= 4.5, `Net drift speed expected ~3.9 km/h, got ${drift0800.speedKmH}`);
assert(drift0800.bearingDeg >= 250 && drift0800.bearingDeg <= 275, `Net drift bearing expected WSW (250..275°), got ${drift0800.bearingDeg}°`);
console.log('✓ Environmental drift calculations verified.\n');

// 2. Progressive Investigation Disclosure
console.log('2. Testing Progressive Disclosure of Investigation Layers...');

// (a) Normal Phase (07:20:00Z)
const stateNormal = incidentStateAt(SCENARIO_TIMELINE_START_MS);
assert(stateNormal.phase === 'normal', `Phase at 07:20Z should be normal, got ${stateNormal.phase}`);
assert(stateNormal.incident === null, 'Incident should be null before detection');
assert(stateNormal.spill === null, 'Spill should be null before detection');
assert(candidatesAt(INCIDENT_ID, SCENARIO_TIMELINE_START_MS).length === 0, 'Candidates should be empty before detection');
console.log('  ✓ 07:20Z (Normal): Clean baseline, no spill, no candidate clutter');

// (b) Spill Detected Phase (07:42:00Z)
const stateDetected = incidentStateAt(DETECTION_MS);
assert(stateDetected.phase === 'spill-detected', `Phase at 07:42Z should be spill-detected, got ${stateDetected.phase}`);
assert(stateDetected.incident !== null, 'Incident must be active at detection');
assert(stateDetected.spill !== null, 'Spill must be active at detection');
assert(stateDetected.spill.areaKm2 >= 6.0 && stateDetected.spill.areaKm2 <= 6.5, `Initial area expected ~6.2 km², got ${stateDetected.spill.areaKm2}`);
assert(candidatesAt(INCIDENT_ID, DETECTION_MS).length === 0, 'Candidates must NOT be revealed at initial detection (07:42Z)');
console.log('  ✓ 07:42Z (Spill Detected): Observed slick (6.2 km²), SAR detection point, no premature source/candidate disclosure');

// (c) Correlating Phase (08:00:00Z)
const stateCorrelating = incidentStateAt(DRIFT_START_MS);
assert(stateCorrelating.phase === 'correlating', `Phase at 08:00Z should be correlating, got ${stateCorrelating.phase}`);
assert(stateCorrelating.spill.areaKm2 > 9.0, `Spill area should have grown, got ${stateCorrelating.spill.areaKm2}`);
const candidatesCorrelating = candidatesAt(INCIDENT_ID, DRIFT_START_MS);
assert(candidatesCorrelating.length === 4, `Expected 4 correlated candidates during correlation, got ${candidatesCorrelating.length}`);
console.log(`  ✓ 08:00Z (Correlating): Environmental drift active, backtrack active, ${candidatesCorrelating.length} relevant candidates identified`);

// (d) Attribution Ready Phase (08:41:00Z)
const stateAttribution = incidentStateAt(ATTRIBUTION_MS);
assert(stateAttribution.phase === 'attribution-ready', `Phase at 08:41Z should be attribution-ready, got ${stateAttribution.phase}`);
const candidatesAttribution = candidatesAt(INCIDENT_ID, ATTRIBUTION_MS);
assert(candidatesAttribution.length === 4, `Expected 4 candidates at attribution-ready, got ${candidatesAttribution.length}`);
console.log(`  ✓ 08:41Z (Attribution Ready): Correlation complete, ${candidatesAttribution.length} candidate vessels available for Task 5\n`);

// 3. AIS Spatiotemporal Correlation & Candidate Ranking
console.log('3. Testing AIS Spatiotemporal Candidate Correlation...');
const origin = estimatedOrigin();
console.log(`  - Estimated Release Origin: ${origin.lat.toFixed(4)}°N, ${origin.lng.toFixed(4)}°E`);

const provider = new MockDataProvider();
const candidates = await provider.getCandidates(INCIDENT_ID, { timestamp: new Date(ATTRIBUTION_MS).toISOString() });
assert(candidates.length === 4, `Expected 4 candidates from provider, got ${candidates.length}`);

const top = candidates[0];
assert(top.vesselId === 'vsl-001', `Top candidate must be vsl-001 (Ocean Guardian), got ${top.vesselId}`);
assert(top.matchScore > 0.95, `Top candidate match score expected >0.95, got ${top.matchScore}`);
assert(top.distanceFromOriginKm <= 3.0, `Top candidate distance from origin expected <=3 km, got ${top.distanceFromOriginKm}`);

console.log(`  - Top Candidate: ${top.vesselId} (Match: ${(top.matchScore * 100).toFixed(1)}%, Dist: ${top.distanceFromOriginKm.toFixed(1)} km, Temporal: ${(top.temporalCorrelation * 100).toFixed(1)}%)`);

const second = candidates[1];
assert(second.vesselId === 'vsl-032', `Second candidate must be vsl-032, got ${second.vesselId}`);
assert(top.matchScore - second.matchScore > 0.25, `Clear separation expected between top and second candidate, got margin ${(top.matchScore - second.matchScore).toFixed(3)}`);
console.log(`  - Second Candidate: ${second.vesselId} (Match: ${(second.matchScore * 100).toFixed(1)}%, Dist: ${second.distanceFromOriginKm.toFixed(1)} km)`);
console.log('✓ Candidate correlation verified.\n');

// 4. Scrubbing & Determinism
console.log('4. Testing Scrubbing & Deterministic Reversibility...');
scenarioController.pause();
scenarioController.setProgress(0.5); // Scrub to 08:15:00Z
const scrubTime = scenarioController.getSimTimeMs();
const envA = environmentAt(scrubTime);
const candA = candidatesAt(INCIDENT_ID, scrubTime);

scenarioController.reset();
scenarioController.setProgress(0.5); // Scrub to 08:15:00Z again
const envB = environmentAt(scenarioController.getSimTimeMs());
const candB = candidatesAt(INCIDENT_ID, scenarioController.getSimTimeMs());

assert(JSON.stringify(envA) === JSON.stringify(envB), 'Environment must be bit-identical on scrub');
assert(JSON.stringify(candA) === JSON.stringify(candB), 'Candidates must be bit-identical on scrub');
console.log('✓ Scrubbing reversibility and determinism verified.\n');

console.log('======================================================');
console.log('ALL TASK 4 DRIFT & CORRELATION VERIFICATION CHECKS PASSED');
console.log('======================================================');
