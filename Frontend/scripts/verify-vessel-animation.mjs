import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { fsCache: false });

const {
  scenarioController,
  SCENARIO_TIMELINE_START_MS,
} = await jiti.import('../src/simulation/scenarioController.ts');

const { MockDataProvider } = await jiti.import('../src/api/mockProvider.ts');

console.log('=== VERIFYING VESSEL ANIMATION & DETERMINISM FROM CLOCK ===\n');

const provider = new MockDataProvider();

// 1. Initial State & Fleet Size
console.log('1. Checking Initial Fleet at Scenario Start (07:20:00Z)...');
scenarioController.pause();
scenarioController.reset();

const vStart = await provider.getVessels();
if (vStart.length !== 50) {
  throw new Error(`Expected 50 vessels, got ${vStart.length}`);
}

const vStartSnap = JSON.stringify(vStart.map(v => ({ id: v.id, lat: v.position.lat, lng: v.position.lng, heading: v.heading, speed: v.speed })));
console.log(`✓ 50 vessels loaded at initial timestamp (${new Date(scenarioController.getSimTimeMs()).toISOString()})`);

// 2. Test Vessel Movement during Play
console.log('\n2. Testing Fleet Movement during Play...');
scenarioController.play();
await new Promise(r => setTimeout(r, 250)); // let time advance ~30 simulated seconds
const vPlaying = await provider.getVessels();

let movedCount = 0;
for (let i = 0; i < vStart.length; i++) {
  const v0 = vStart[i];
  const v1 = vPlaying.find(v => v.id === v0.id);
  if (!v1) throw new Error(`Missing vessel ${v0.id}`);
  const dLat = Math.abs(v1.position.lat - v0.position.lat);
  const dLng = Math.abs(v1.position.lng - v0.position.lng);
  if (dLat > 1e-6 || dLng > 1e-6) {
    movedCount++;
  }
}
console.log(`✓ Playing advanced positions: ${movedCount}/50 vessels changed coordinates naturally`);
if (movedCount < 25) {
  throw new Error(`Expected active vessels to move, only ${movedCount} moved`);
}

// 3. Test Freeze during Pause
console.log('\n3. Testing Fleet Freeze during Pause...');
scenarioController.pause();
const tFreeze = scenarioController.getSimTimeMs();
const vPaused1 = await provider.getVessels();
await new Promise(r => setTimeout(r, 200));
const vPaused2 = await provider.getVessels();
const tFreezeAfter = scenarioController.getSimTimeMs();

if (tFreeze !== tFreezeAfter) {
  throw new Error('Simulated time drifted while paused');
}
for (let i = 0; i < vPaused1.length; i++) {
  const v1 = vPaused1[i];
  const v2 = vPaused2[i];
  if (v1.position.lat !== v2.position.lat || v1.position.lng !== v2.position.lng || v1.heading !== v2.heading) {
    throw new Error(`Vessel ${v1.id} moved while paused!`);
  }
}
console.log(`✓ All 50 vessels remained completely frozen across paused interval at ${new Date(tFreeze).toISOString()}`);

// 4. Test Resume
console.log('\n4. Testing Fleet Resume...');
scenarioController.resume();
await new Promise(r => setTimeout(r, 200));
const vResumed = await provider.getVessels();
let resumedMoved = 0;
for (let i = 0; i < vPaused1.length; i++) {
  const v0 = vPaused1[i];
  const v1 = vResumed.find(v => v.id === v0.id);
  if (v1 && (v1.position.lat !== v0.position.lat || v1.position.lng !== v0.position.lng)) {
    resumedMoved++;
  }
}
console.log(`✓ Resumed smoothly: ${resumedMoved} vessels continuing motion from paused epoch`);

// 5. Test Reset to Exact Baseline
console.log('\n5. Testing Reset to Exact Scenario Start Baseline...');
scenarioController.reset();
const vReset = await provider.getVessels();
const vResetSnap = JSON.stringify(vReset.map(v => ({ id: v.id, lat: v.position.lat, lng: v.position.lng, heading: v.heading, speed: v.speed })));

if (vStartSnap !== vResetSnap) {
  throw new Error('Reset positions do not match initial scenario start positions!');
}
console.log('✓ Reset returned all 50 vessels to bit-identical initial scenario positions');

// 6. Test Timeline Scrubbing (Determinism at t=50%)
console.log('\n6. Testing Scrubbing Determinism at 50% Progress...');
scenarioController.setProgress(0.5);
const t50 = scenarioController.getSimTimeMs();
const vScrub1 = await provider.getVessels();

// Reset and scrub again to verify bit-identical repeatability
scenarioController.reset();
scenarioController.setProgress(0.5);
const vScrub2 = await provider.getVessels();

for (let i = 0; i < vScrub1.length; i++) {
  const a = vScrub1[i];
  const b = vScrub2[i];
  if (a.position.lat !== b.position.lat || a.position.lng !== b.position.lng || a.heading !== b.heading) {
    throw new Error(`Scrub determinism mismatch for vessel ${a.id} at t=${new Date(t50).toISOString()}`);
  }
}
console.log(`✓ Scrubbing to 50% (${new Date(t50).toISOString()}) is 100% deterministic`);

// 7. Verify Ocean Guardian (vsl-001) Kinematic Corridor
console.log('\n7. Verifying Top Candidate vsl-001 (Ocean Guardian) Movement...');
scenarioController.setSimTimeMs(SCENARIO_TIMELINE_START_MS); // 07:20Z
const vsl001_t0 = await provider.getVessel('vsl-001');

scenarioController.setSimTimeMs(Date.parse('2026-08-27T07:42:00Z')); // Detection 07:42Z
const vsl001_tDet = await provider.getVessel('vsl-001');

scenarioController.setSimTimeMs(Date.parse('2026-08-27T08:41:00Z')); // Attribution 08:41Z
const vsl001_tAttr = await provider.getVessel('vsl-001');

console.log(`  - 07:20Z position: ${vsl001_t0.position.lat.toFixed(4)}°N, ${vsl001_t0.position.lng.toFixed(4)}°E (Speed: ${vsl001_t0.speed} kn, Heading: ${vsl001_t0.heading}°)`);
console.log(`  - 07:42Z position: ${vsl001_tDet.position.lat.toFixed(4)}°N, ${vsl001_tDet.position.lng.toFixed(4)}°E (Speed: ${vsl001_tDet.speed} kn, Heading: ${vsl001_tDet.heading}°)`);
console.log(`  - 08:41Z position: ${vsl001_tAttr.position.lat.toFixed(4)}°N, ${vsl001_tAttr.position.lng.toFixed(4)}°E (Speed: ${vsl001_tAttr.speed} kn, Heading: ${vsl001_tAttr.heading}°)`);

if (vsl001_t0.position.lng <= vsl001_tDet.position.lng || vsl001_tDet.position.lng <= vsl001_tAttr.position.lng) {
  throw new Error('Ocean Guardian (vsl-001) should move outbound west (decreasing longitude) down Gulf of Kutch channel');
}
console.log('✓ Ocean Guardian moves outbound west along the deep channel consistent with scenario narrative');

console.log('\n======================================================');
console.log('ALL VESSEL ANIMATION & DETERMINISM CHECKS PASSED');
console.log('======================================================\n');
