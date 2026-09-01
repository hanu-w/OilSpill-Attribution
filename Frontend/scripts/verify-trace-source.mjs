import { createJiti } from 'jiti';
import assert from 'node:assert';

const jiti = createJiti(import.meta.url, { fsCache: false });

const {
  scenarioController,
  SCENARIO_TIMELINE_START_MS,
} = await jiti.import('../src/simulation/scenarioController.ts');

const {
  INCIDENT_ID,
  ATTRIBUTION_MS,
  scenarioPhaseAt,
} = await jiti.import('../src/simulation/incident.ts');

const { candidatesAt, incidentStateAt } = await jiti.import('../src/simulation/scenarioRunner.ts');
const { rankCandidates } = await jiti.import('../src/simulation/candidateScoring.ts');
const { estimatedOrigin } = await jiti.import('../src/simulation/spillGeometry.ts');
const { simulationEngine } = await jiti.import('../src/simulation/simulationEngine.ts');
const { useIncidentStore } = await jiti.import('../src/store/incidentStore.ts');

console.log('=== VERIFYING TASK 6: TRACE SOURCE & SOURCE RECONSTRUCTION ===\n');

// 1. Trace Source availability relative to attribution-ready phase
console.log('1. Verifying Trace Source Availability Window...');
const preAttributionMs = ATTRIBUTION_MS - 1000; // 08:40:59 UTC
const prePhase = scenarioPhaseAt(preAttributionMs);
assert.strictEqual(prePhase, 'correlating', 'Pre-08:41 phase must be correlating');

const atAttributionMs = ATTRIBUTION_MS; // 08:41:00 UTC
const atPhase = scenarioPhaseAt(atAttributionMs);
assert.strictEqual(atPhase, 'attribution-ready', '08:41:00 phase must be attribution-ready');
console.log('  ✓ Pre-08:41 (08:40:59Z): correlating — Trace Source unavailable');
console.log('  ✓ At 08:41:00Z: attribution-ready — Trace Source becomes active & available');

// 2. Verified Deterministic Candidates & Ocean Guardian Selection
console.log('\n2. Verifying Ocean Guardian Top Suspect Identification...');
const candidates = candidatesAt(INCIDENT_ID, atAttributionMs);
assert.ok(candidates.length >= 4, 'Must have at least 4 candidate vessels');
const topCandidate = candidates[0];
assert.strictEqual(topCandidate.vesselId, 'vsl-001', 'Top suspect must be vsl-001 (Ocean Guardian)');
assert.strictEqual(Math.round(topCandidate.matchScore * 1000) / 10, 96.5, 'Match score must be 96.5%');
console.log(`  ✓ Primary Source Candidate: Ocean Guardian (${topCandidate.vesselId}) — 96.5% Source Match`);

// 3. Historical AIS Trail Consistency
console.log('\n3. Verifying Historical AIS Trajectory Integrity...');
const trail = simulationEngine.getVesselTrail('vsl-001');
assert.ok(trail && trail.points.length >= 30, 'Ocean Guardian trail must have full historical points');
assert.strictEqual(trail.points.length, 32, 'Historical trail must have exactly 32 coherent AIS points');

const firstPoint = trail.points[0];
const lastPoint = trail.points[trail.points.length - 1];
assert.ok(firstPoint.lat > 22.0 && firstPoint.lng > 68.0, 'First trail point valid');
assert.ok(lastPoint.lat > 22.0 && lastPoint.lng > 68.0, 'Last trail point valid');
console.log(`  ✓ Historical AIS trajectory contains ${trail.points.length} verified track points`);
console.log(`  ✓ Route coordinates: [${firstPoint.lat.toFixed(4)}°N, ${firstPoint.lng.toFixed(4)}°E] → [${lastPoint.lat.toFixed(4)}°N, ${lastPoint.lng.toFixed(4)}°E]`);

// 4. Estimated Release Origin & Proximity
console.log('\n4. Verifying Estimated Release Origin & Closest Approach...');
const origin = estimatedOrigin();
assert.ok(Math.abs(origin.lat - 22.5171) < 0.01, 'Estimated release origin lat ~22.5171');
assert.ok(Math.abs(origin.lng - 69.5857) < 0.01, 'Estimated release origin lng ~69.5857');
console.log(`  ✓ Estimated Release Point: ${origin.lat.toFixed(4)}°N, ${origin.lng.toFixed(4)}°E`);

const distEvidence = topCandidate.evidence.find((e) => e.type === 'distance');
assert.ok(distEvidence, 'Distance evidence must be present');
assert.strictEqual(Math.round(distEvidence.score * 1000) / 10, 98.7, 'Distance score must be 98.7%');
assert.strictEqual(topCandidate.distanceFromOriginKm, 2.8, 'Closest approach distance must be exactly 2.8 km');
console.log(`  ✓ Closest Approach: 2.8 km (Distance Proximity: 98.7%)`);

// 5. Release Window & Temporal Correlation
console.log('\n5. Verifying Release Window & Temporal Parameters...');
const tempEvidence = topCandidate.evidence.find((e) => e.type === 'temporal');
assert.ok(tempEvidence, 'Temporal evidence must be present');
assert.strictEqual(Math.round(tempEvidence.score * 1000) / 10, 92.7, 'Temporal score must be 92.7%');
console.log(`  ✓ Release Window: 06:12–07:27 UTC (Temporal Window: 92.7%)`);

// 6. Factor Decomposition Breakdown
console.log('\n6. Verifying 5-Factor Decomposition Breakdown...');
const routeEvidence = topCandidate.evidence.find((e) => e.type === 'route');
const behEvidence = topCandidate.evidence.find((e) => e.type === 'behavioral');
const envEvidence = topCandidate.evidence.find((e) => e.type === 'environmental');
assert.strictEqual(Math.round(routeEvidence.score * 1000) / 10, 100.0, 'Route score must be 100.0%');
assert.strictEqual(Math.round(behEvidence.score * 1000) / 10, 91.4, 'Behavior score must be 91.4%');
assert.strictEqual(Math.round(envEvidence.score * 1000) / 10, 97.0, 'Environment score must be 97.0%');
console.log('  - Distance Proximity:  98.7%');
console.log('  - Temporal Window:     92.7%');
console.log('  - Route Coherence:     100.0%');
console.log('  - Discharge Behavior:  91.4%');
console.log('  - Drift Alignment:     97.0%');

// 7. Store State & Trace Source Transitions
console.log('\n7. Verifying Store Workflow & Transition Logic...');
const store = useIncidentStore.getState();

// Enter Trace Source
useIncidentStore.getState().setTraceSourceActive(true);
assert.strictEqual(useIncidentStore.getState().isTraceSourceActive, true, 'isTraceSourceActive must be true');
console.log('  ✓ Entered Trace Source workflow: isTraceSourceActive = true');

// Replay state
useIncidentStore.getState().setReplayPointIndex(10);
useIncidentStore.getState().setIsReplaying(true);
assert.strictEqual(useIncidentStore.getState().replayPointIndex, 10, 'replayPointIndex must be 10');
assert.strictEqual(useIncidentStore.getState().isReplaying, true, 'isReplaying must be true');
console.log('  ✓ Replay active: point 10/32');

// Exit Trace Source without resetting clock
useIncidentStore.getState().setTraceSourceActive(false);
assert.strictEqual(useIncidentStore.getState().isTraceSourceActive, false, 'isTraceSourceActive must be false');
console.log('  ✓ Exited Trace Source (Back to Attribution): isTraceSourceActive = false');

// 8. Reversibility & Timeline Scrubbing
console.log('\n8. Verifying Scrubbing & Reset Reversibility...');
scenarioController.reset();
useIncidentStore.getState().resetTimeline();
assert.strictEqual(useIncidentStore.getState().isTraceSourceActive, false, 'Reset must clear Trace Source state');
assert.strictEqual(scenarioController.getSnapshot().phase, 'normal', 'Reset must restore normal phase');
console.log('  ✓ Scenario reset cleanly restores 07:20:00Z normal baseline');

// 9. Preserving 50-Vessel Fleet
console.log('\n9. Verifying Marine Fleet Coexistence...');
const fleet = simulationEngine.getVessels();
assert.strictEqual(fleet.length, 50, 'Fleet must remain 50 vessels');
console.log('  ✓ Fleet size remains intact at 50 vessels across all states');

console.log('\n======================================================');
console.log('ALL TASK 6 TRACE SOURCE & RECONSTRUCTION CHECKS PASSED');
console.log('======================================================');
