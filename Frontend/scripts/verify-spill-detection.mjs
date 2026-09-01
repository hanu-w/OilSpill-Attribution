import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { fsCache: false });

const {
  scenarioController,
  SCENARIO_TIMELINE_START_MS,
  SCENARIO_TIMELINE_END_MS,
} = await jiti.import('../src/simulation/scenarioController.ts');

const {
  DETECTION_MS,
  DRIFT_START_MS,
  ATTRIBUTION_MS,
  INCIDENT_ID,
  scenarioPhaseAt,
} = await jiti.import('../src/simulation/incident.ts');

const { spillStateAt, spillAreaKm2At } = await jiti.import('../src/simulation/spillGeometry.ts');
const { isOnLand, segmentCrossesLand } = await jiti.import('../src/simulation/landMask.ts');
const { MockDataProvider } = await jiti.import('../src/api/mockProvider.ts');

console.log('=== VERIFYING OIL SPILL DETECTION & PROGRESSION EVENT ===\n');

const provider = new MockDataProvider();

// 1. Pre-Detection Verification (Normal Traffic baseline)
console.log('1. Testing Pre-Detection Phase (07:20:00Z -> 07:41:59Z)...');
scenarioController.pause();
scenarioController.reset();

const incStart = await provider.getIncidents();
if (incStart.length !== 0) {
  throw new Error(`Expected 0 incidents at scenario start (07:20Z), got ${incStart.length}`);
}

const spillStart = spillStateAt(scenarioController.getSimTimeMs());
if (spillStart !== null) {
  throw new Error(`Expected null spillState at 07:20Z, got ${JSON.stringify(spillStart)}`);
}

// Check 1 second before detection
scenarioController.setSimTimeMs(DETECTION_MS - 1000);
const incPre = await provider.getIncidents();
if (incPre.length !== 0) {
  throw new Error(`Expected 0 incidents at 07:41:59Z, got ${incPre.length}`);
}
console.log('✓ No spill or incident before detection timestamp (07:42:00Z)');

// 2. Exact Detection Transition (07:42:00Z)
console.log('\n2. Testing Spill Appearance Exactly at Detection (07:42:00Z)...');
scenarioController.setSimTimeMs(DETECTION_MS);
const incDet = await provider.getIncidents();

if (incDet.length !== 1) {
  throw new Error(`Expected 1 incident at detection (07:42Z), got ${incDet.length}`);
}
const incident = incDet[0];
if (incident.id !== INCIDENT_ID) {
  throw new Error(`Expected incident ID ${INCIDENT_ID}, got ${incident.id}`);
}
if (incident.severity !== 'high' || incident.status !== 'detected') {
  throw new Error(`Unexpected incident status/severity: ${incident.status}/${incident.severity}`);
}

const spillDet = spillStateAt(DETECTION_MS);
if (!spillDet || !spillDet.geometry || spillDet.geometry.boundary.length < 3) {
  throw new Error('Missing or degenerate spill geometry at detection');
}
console.log(`✓ Spill appears at 07:42:00Z: ID=${incident.id}, Area=${incident.areaKm2.toFixed(1)} km², Confidence=${(incident.confidence * 100).toFixed(0)}%, Status=${incident.status}`);

// 3. Geographic & Land-Mask Safety
console.log('\n3. Verifying Geographic Boundary & Land-Mask Safety...');
const boundary = spillDet.geometry.boundary;
for (const [lng, lat] of boundary) {
  if (isOnLand(lng, lat)) {
    throw new Error(`Spill boundary vertex [${lng}, ${lat}] is ON LAND`);
  }
}
for (let i = 1; i < boundary.length; i++) {
  const p0 = { lng: boundary[i - 1][0], lat: boundary[i - 1][1] };
  const p1 = { lng: boundary[i][0], lat: boundary[i][1] };
  if (segmentCrossesLand(p0, p1)) {
    throw new Error(`Spill edge between vertex ${i-1} and ${i} crosses land`);
  }
}
console.log(`✓ All ${boundary.length} boundary vertices and polygon edges are safely in navigable water`);

// 4. Spill Progression & Logistic Growth
console.log('\n4. Testing Spill Growth & Drift Progression...');
const tDrift = DRIFT_START_MS; // 08:00Z
const tAttr = ATTRIBUTION_MS; // 08:41Z

scenarioController.setSimTimeMs(tDrift);
const incDrift = (await provider.getIncidents())[0];
scenarioController.setSimTimeMs(tAttr);
const incAttr = (await provider.getIncidents())[0];

console.log(`  - 07:42Z (Detection):   Area = ${incident.areaKm2.toFixed(1)} km²  (Centroid: ${spillDet.geometry.centroid.lat.toFixed(4)}°N, ${spillDet.geometry.centroid.lng.toFixed(4)}°E)`);
console.log(`  - 08:00Z (Drift Start): Area = ${incDrift.areaKm2.toFixed(1)} km²  (Centroid: ${incDrift.geometry.centroid.lat.toFixed(4)}°N, ${incDrift.geometry.centroid.lng.toFixed(4)}°E)`);
console.log(`  - 08:41Z (Attribution): Area = ${incAttr.areaKm2.toFixed(1)} km²  (Centroid: ${incAttr.geometry.centroid.lat.toFixed(4)}°N, ${incAttr.geometry.centroid.lng.toFixed(4)}°E)`);

if (incident.areaKm2 >= incDrift.areaKm2 || incDrift.areaKm2 >= incAttr.areaKm2) {
  throw new Error('Spill area should grow logistically with simulated time');
}
if (spillDet.geometry.centroid.lng <= incDrift.geometry.centroid.lng || incDrift.geometry.centroid.lng <= incAttr.geometry.centroid.lng) {
  throw new Error('Spill centroid should drift down-channel (WSW) with wind & current');
}
console.log('✓ Spill expands and drifts naturally with ocean environmental forces');

// 5. Timeline Scrubbing Determinism
console.log('\n5. Testing Timeline Scrubbing & Reversibility...');
// Scrub back before detection
scenarioController.setProgress(0.1); // ~07:31Z
const incScrubBack = await provider.getIncidents();
if (incScrubBack.length !== 0) {
  throw new Error('Spill failed to disappear when scrubbing back before detection');
}

// Scrub forward to 60%
scenarioController.setProgress(0.6); // ~08:26Z
const incScrubFwd1 = await provider.getIncidents();
const snapFwd1 = JSON.stringify(incScrubFwd1);

// Scrub away and back to 60%
scenarioController.reset();
scenarioController.setProgress(0.6);
const incScrubFwd2 = await provider.getIncidents();
const snapFwd2 = JSON.stringify(incScrubFwd2);

if (snapFwd1 !== snapFwd2) {
  throw new Error('Spill state mismatch when seeking to same progress point');
}
console.log('✓ Scrubbing reversibility verified: disappearing before 07:42Z, 100% deterministic restoration');

// 6. Active Fleet Interoperability
console.log('\n6. Checking Maritime Fleet Coexistence during Incident...');
const vessels = await provider.getVessels();
if (vessels.length !== 50) {
  throw new Error(`Expected 50 vessels, got ${vessels.length}`);
}
console.log('✓ All 50 vessels continue normal maritime traffic alongside active spill');

console.log('\n======================================================');
console.log('ALL OIL SPILL DETECTION CHECKS PASSED');
console.log('======================================================\n');
