import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { fsCache: false });

const {
  ScenarioController,
  scenarioController,
  SCENARIO_TIMELINE_START_MS,
  SCENARIO_TIMELINE_END_MS,
  SCENARIO_TIMELINE_DURATION_MS,
} = await jiti.import('../src/simulation/scenarioController.ts');

const {
  DETECTION_MS,
  DRIFT_START_MS,
  ATTRIBUTION_MS,
  scenarioPhaseAt,
} = await jiti.import('../src/simulation/incident.ts');

const { simulationEngine } = await jiti.import('../src/simulation/simulationEngine.ts');

console.log('=== VERIFYING DEMO SCENARIO CONTROLLER ===\n');

// 1. Check Initial State & Bounds
console.log('1. Checking Initial State & Bounds...');
const ctrl = new ScenarioController(false, 120);
const initialSnap = ctrl.getSnapshot();

if (initialSnap.simTimeMs !== SCENARIO_TIMELINE_START_MS) {
  throw new Error(`Expected initial simTimeMs ${SCENARIO_TIMELINE_START_MS}, got ${initialSnap.simTimeMs}`);
}
if (initialSnap.isPlaying !== false) {
  throw new Error(`Expected isPlaying to be false when autoStart=false`);
}
if (initialSnap.progress !== 0) {
  throw new Error(`Expected initial progress 0, got ${initialSnap.progress}`);
}
if (initialSnap.phase !== 'normal') {
  throw new Error(`Expected initial phase 'normal', got ${initialSnap.phase}`);
}
console.log('✓ Initial state verified (07:20:00Z, normal, progress 0.00)');

// 2. Test Play & Simulated Time Advance
console.log('\n2. Testing Play & Time Advancement...');
ctrl.play();
if (!ctrl.isPlaying) throw new Error('Expected isPlaying to be true after play()');

const tStart = ctrl.getSimTimeMs();
await new Promise((r) => setTimeout(r, 150));
const tAfter = ctrl.getSimTimeMs();

if (tAfter <= tStart) {
  throw new Error(`Expected simulated time to advance while playing (tStart: ${tStart}, tAfter: ${tAfter})`);
}
console.log(`✓ Play advanced simulated time from ${new Date(tStart).toISOString()} to ${new Date(tAfter).toISOString()}`);

// 3. Test Pause
console.log('\n3. Testing Pause (Freezing Time)...');
ctrl.pause();
if (ctrl.isPlaying) throw new Error('Expected isPlaying to be false after pause()');
const tPaused = ctrl.getSimTimeMs();
await new Promise((r) => setTimeout(r, 100));
const tPausedAfter = ctrl.getSimTimeMs();

if (tPaused !== tPausedAfter) {
  throw new Error(`Expected simulated time to stay frozen when paused (${tPaused} !== ${tPausedAfter})`);
}
console.log(`✓ Pause froze simulated time at ${new Date(tPaused).toISOString()}`);

// 4. Test Resume
console.log('\n4. Testing Resume from frozen timestamp...');
ctrl.resume();
if (!ctrl.isPlaying) throw new Error('Expected isPlaying to be true after resume()');
const tResumed = ctrl.getSimTimeMs();
if (Math.abs(tResumed - tPaused) > 50) {
  throw new Error(`Expected resume to continue from paused timestamp (paused: ${tPaused}, resumed: ${tResumed})`);
}
await new Promise((r) => setTimeout(r, 100));
const tResumedAfter = ctrl.getSimTimeMs();
if (tResumedAfter <= tResumed) {
  throw new Error('Expected time to advance after resume');
}
console.log(`✓ Resume continued smoothly from ${new Date(tResumed).toISOString()} to ${new Date(tResumedAfter).toISOString()}`);

// 5. Test Reset
console.log('\n5. Testing Reset to Exact Scenario Start...');
ctrl.reset();
const tReset = ctrl.getSimTimeMs();
if (tReset !== SCENARIO_TIMELINE_START_MS) {
  throw new Error(`Expected reset to return to ${SCENARIO_TIMELINE_START_MS}, got ${tReset}`);
}
if (ctrl.phase !== 'normal') {
  throw new Error(`Expected reset phase 'normal', got ${ctrl.phase}`);
}
console.log(`✓ Reset returned to exact scenario start: ${new Date(tReset).toISOString()} (${ctrl.phase})`);

// 6. Test Scenario Phases & Progression
console.log('\n6. Testing Phase Gates across Scenario Timing...');
const phaseChecks = [
  { timeMs: SCENARIO_TIMELINE_START_MS, expectedPhase: 'normal', name: 'Start (07:20:00Z)' },
  { timeMs: DETECTION_MS - 1000, expectedPhase: 'normal', name: 'Pre-detection (07:41:59Z)' },
  { timeMs: DETECTION_MS, expectedPhase: 'spill-detected', name: 'Detection (07:42:00Z)' },
  { timeMs: DRIFT_START_MS - 1000, expectedPhase: 'spill-detected', name: 'Pre-drift (07:59:59Z)' },
  { timeMs: DRIFT_START_MS, expectedPhase: 'correlating', name: 'Drift start / correlating (08:00:00Z)' },
  { timeMs: ATTRIBUTION_MS - 1000, expectedPhase: 'correlating', name: 'Pre-attribution (08:40:59Z)' },
  { timeMs: ATTRIBUTION_MS, expectedPhase: 'attribution-ready', name: 'Attribution ready (08:41:00Z)' },
  { timeMs: SCENARIO_TIMELINE_END_MS, expectedPhase: 'attribution-ready', name: 'End (09:10:00Z)' },
];

ctrl.pause();
for (const check of phaseChecks) {
  ctrl.setSimTimeMs(check.timeMs);
  const snap = ctrl.getSnapshot();
  if (snap.phase !== check.expectedPhase) {
    throw new Error(`Phase mismatch for ${check.name}: expected ${check.expectedPhase}, got ${snap.phase}`);
  }
  console.log(`  ✓ [${new Date(check.timeMs).toISOString()}] Phase: ${snap.phase.padEnd(18)} Progress: ${(snap.progress * 100).toFixed(1)}% (${check.name})`);
}

// 7. Test Progress Scrubbing & Clamping
console.log('\n7. Testing Progress Scrubbing [0..1]...');
ctrl.setProgress(0.5); // 50% = 55 minutes into scenario = 08:15:00Z
const snap50 = ctrl.getSnapshot();
if (Math.abs(snap50.progress - 0.5) > 0.001) {
  throw new Error(`Expected progress ~0.5, got ${snap50.progress}`);
}
if (snap50.phase !== 'correlating') {
  throw new Error(`Expected 50% mark (08:15Z) to be 'correlating', got ${snap50.phase}`);
}
console.log(`✓ 50% scrub -> ${new Date(snap50.simTimeMs).toISOString()} (Phase: ${snap50.phase})`);

// 8. Test Synchronization with SimulationEngine
console.log('\n8. Testing SimulationEngine integration with authoritative clock...');
scenarioController.pause();
scenarioController.setSimTimeMs(DETECTION_MS);
const engineTime = simulationEngine.getSimTimeMs();
if (engineTime !== DETECTION_MS) {
  throw new Error(`SimulationEngine clock out of sync: expected ${DETECTION_MS}, got ${engineTime}`);
}
console.log(`✓ SimulationEngine reports identical timestamp: ${new Date(engineTime).toISOString()}`);

// 9. Test Subscription notifications
console.log('\n9. Testing Subscriber Notification Callback...');
let receivedSnap = null;
const unsub = ctrl.subscribe((snap) => {
  receivedSnap = snap;
});
ctrl.setProgress(0.75);
if (!receivedSnap || Math.abs(receivedSnap.progress - 0.75) > 0.001) {
  throw new Error('Subscriber did not receive progress update');
}
unsub();
console.log('✓ Subscription successfully dispatches reactive updates');

ctrl.destroy();
console.log('\n========================================');
console.log('ALL DEMO SCENARIO CONTROLLER TESTS PASSED');
console.log('========================================\n');
