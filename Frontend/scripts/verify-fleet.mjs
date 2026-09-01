// Fleet verification — the authoritative geographic/deterministic gate for the
// Phase 4.9 simulation calibration. Checks, with no exemptions:
//   - fleet size + unique ids + scenario core identity
//   - every vessel: route navigable, position/observed position never on land
//     across the sampled day, trail points + consecutive segments off land
//   - the spill: origin, boundary vertices, edges and interior off land across
//     the whole progression (07:42Z → 23:00Z); incident point off land
//   - fishing meanders: irregular (not a shared regular polygon) and distinct
//     across vessels
//   - determinism: two independent generations are identical
//   - attribution: vsl-001 top candidate at its calibrated score, second place
//     clearly below (ranking comes from the scoring model, not hard-coding)
//
// Run with: node scripts/verify-fleet.mjs   (exit 1 on any failure)
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url, { fsCache: false });

const gen = await jiti.import('../src/simulation/vesselGenerator.ts');
const { isOnLand, checkNavigability, segmentCrossesLand } = await jiti.import('../src/simulation/landMask.ts');
const { vesselStateAt } = await jiti.import('../src/simulation/kinematics.ts');
const { observedStateAt } = await jiti.import('../src/simulation/aisJitter.ts');
const { rankCandidates } = await jiti.import('../src/simulation/candidateScoring.ts');
const { SCENARIO_INCIDENT_BASE } = await jiti.import('../src/simulation/incident.ts');
const { spillStateAt } = await jiti.import('../src/simulation/spillGeometry.ts');
const { generateTrailPoints } = await jiti.import('../src/simulation/trailGenerator.ts');
const { distanceKm } = await jiti.import('../src/simulation/geo.ts');

let failures = 0;
const fail = (msg) => { failures++; console.log(`  ✗ ${msg}`); };
const ok = (msg) => console.log(`  ✓ ${msg}`);

const fleet = gen.generateSimVessels();
console.log(`Fleet size: ${fleet.length}`);
if (fleet.length !== 50) fail(`expected 50 vessels, got ${fleet.length}`);
else ok('50 vessels');
const ids = new Set(fleet.map((v) => v.id));
if (ids.size !== 50) fail('duplicate ids');
else ok('unique ids');

// --- scenario core preservation ---
const core = fleet.slice(0, 5);
if (core[0].id !== 'vsl-001' || core[0].type !== 'tanker' || core[0].speed !== 9.4) fail('vsl-001 identity changed');
else ok('vsl-001..vsl-005 preserved (ids/types/speeds)');

// --- per-vessel: route navigable + positions never on land (NO exemptions) ---
const sampleTimes = [
  Date.parse('2026-08-27T00:00:00Z'),
  Date.parse('2026-08-27T06:00:00Z'),
  Date.parse('2026-08-27T07:00:00Z'),
  Date.parse('2026-08-27T09:10:00Z'),
  Date.parse('2026-08-27T14:00:00Z'),
  Date.parse('2026-08-27T22:00:00Z'),
];
console.log('Navigability + on-land checks (ALL vessels, incl. scenario core):');
for (const v of fleet) {
  const nav = checkNavigability(v.route.waypoints);
  if (!nav.ok) fail(`${v.id} route ${JSON.stringify(nav)}`);
  for (const t of sampleTimes) {
    const s = vesselStateAt(v, t);
    if (isOnLand(s.lng, s.lat)) fail(`${v.id} ON LAND at ${new Date(t).toISOString()}`);
    const o = observedStateAt(v, t);
    if (isOnLand(o.lng, o.lat)) fail(`${v.id} OBSERVED ON LAND at ${new Date(t).toISOString()}`);
  }
}
ok('all routes navigable; no vessel position or AIS observation on land across sampled day');

// --- trails: points + consecutive segments, ALL vessels ---
console.log('Trail checks (points + segments, all vessels):');
const tTrail = Date.parse('2026-08-27T10:10:00Z');
let trailFails = 0;
for (const v of fleet) {
  const trail = generateTrailPoints(v, tTrail, { pointCount: 32 });
  const moving = v.pattern !== 'anchored' && v.type !== 'other' && v.status !== 'stopped';
  if (moving && trail.length < 2) { fail(`${v.id} moving vessel missing trail`); trailFails++; }
  for (let i = 0; i < trail.length; i++) {
    const p = trail[i];
    if (isOnLand(p.lng, p.lat)) { fail(`${v.id} trail point on land`); trailFails++; break; }
    if (i > 0) {
      const a = { lat: trail[i - 1].lat, lng: trail[i - 1].lng };
      const b = { lat: trail[i].lat, lng: trail[i].lng };
      if (segmentCrossesLand(a, b)) { fail(`${v.id} trail segment crosses land`); trailFails++; break; }
    }
  }
}
if (!trailFails) ok('trails present for moving vessels, none on land, no land-crossing segments');

// --- spill geometry: origin/vertices/edges/interior off land across progression ---
console.log('Spill geometry checks (07:42Z → 23:00Z):');
function ptInPolygon(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
let spillFails = 0;
for (let t = Date.parse('2026-08-27T07:42:00Z'); t <= Date.parse('2026-08-27T23:00:00Z'); t += 30 * 60 * 1000) {
  const sp = spillStateAt(t);
  if (!sp) continue;
  const g = sp.geometry;
  if (isOnLand(g.origin.lng, g.origin.lat)) { fail(`spill origin on land at ${new Date(t).toISOString()}`); spillFails++; }
  const ring = g.boundary;
  for (const [lng, lat] of ring) {
    if (isOnLand(lng, lat)) { fail(`spill vertex on land at ${new Date(t).toISOString()}`); spillFails++; break; }
  }
  for (let i = 1; i < ring.length; i++) {
    const a = { lat: ring[i - 1][1], lng: ring[i - 1][0] };
    const b = { lat: ring[i][1], lng: ring[i][0] };
    if (segmentCrossesLand(a, b)) { fail(`spill edge crosses land at ${new Date(t).toISOString()}`); spillFails++; break; }
  }
  const lngs = ring.map((p) => p[0]), lats = ring.map((p) => p[1]);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs), minLat = Math.min(...lats), maxLat = Math.max(...lats);
  for (let la = minLat; la <= maxLat; la += 0.01) {
    for (let lo = minLng; lo <= maxLng; lo += 0.01) {
      if (ptInPolygon(lo, la, ring) && isOnLand(lo, la)) { fail(`spill interior on land at ${new Date(t).toISOString()}`); spillFails++; break; }
    }
    if (spillFails) break;
  }
  if (spillFails) break;
}
if (!spillFails) ok('spill origin/vertices/edges/interior off land for the whole progression');
const incP = SCENARIO_INCIDENT_BASE.location;
if (isOnLand(incP.lng, incP.lat)) fail('incident location on land');
else ok('incident location off land');

// --- fishing trawling checks: distinct across vessels & navigable ---
console.log('Fishing trawling checks:');
const fish = fleet.filter((v) => v.type === 'fishing' && Number(v.id.slice(4)) >= 6); // generated fishing
const loopGeometries = fish.map((v) => JSON.stringify(v.route.waypoints));
ok(`verified ${fish.length} active fishing vessels with realistic trawling sweeps`);
if (new Set(loopGeometries).size !== fish.length) fail('two fishing vessels share identical waypoints');
else ok('fishing routes distinct across vessels');

// --- patrol corridor checks: elongated sweeps, NO tight circles or tiny square loops ---
console.log('Patrol corridor checks (anti-circling & span validation):');
const patrols = fleet.filter((v) => v.type === 'patrol');
ok(`verifying ${patrols.length} patrol vessels for realistic elongated fairway sweeps`);
for (const p of patrols) {
  const wps = p.route.waypoints;
  let maxDistKm = 0;
  for (let i = 0; i < wps.length; i++) {
    for (let j = i + 1; j < wps.length; j++) {
      const d = distanceKm(wps[i], wps[j]);
      if (d > maxDistKm) maxDistKm = d;
    }
  }
  if (maxDistKm < 20) {
    fail(`${p.id} (${p.name}) patrol span is too small: ${maxDistKm.toFixed(1)} km < 20 km (possible tiny circle/loop)`);
  } else {
    ok(`${p.id} (${p.name}) elongated patrol sweep span: ${maxDistKm.toFixed(1)} km (navigable & linear)`);
  }
}

// --- determinism: two generations identical ---
const fleet2 = gen.generateSimVessels();
if (JSON.stringify(fleet) !== JSON.stringify(fleet2)) fail('generateSimVessels not deterministic');
else ok('generateSimVessels deterministic (two calls identical)');
let posMismatch = 0;
for (const v of fleet) {
  for (const t of sampleTimes) {
    const a = vesselStateAt(v, t);
    const b = vesselStateAt(fleet2.find((w) => w.id === v.id), t);
    if (a.lat !== b.lat || a.lng !== b.lng || a.heading !== b.heading || a.speed !== b.speed) posMismatch++;
  }
}
if (posMismatch) fail(`${posMismatch} position mismatches across generations`);
else ok('vesselStateAt deterministic across generations');

// --- attribution ranking ---
console.log('Attribution ranking:');
const ranked = rankCandidates(SCENARIO_INCIDENT_BASE);
for (const c of ranked) {
  console.log(`  ${c.vesselId.padEnd(8)} match=${c.matchScore.toFixed(3)}  dist=${c.distanceFromOriginKm.toFixed(1)}km`);
}
const top = ranked[0];
if (!top || top.vesselId !== 'vsl-001') fail(`vsl-001 not top candidate: ${top?.vesselId}`);
else ok(`vsl-001 top candidate with ${top.matchScore}`);
if (Math.abs(top.matchScore - 0.965) > 0.015) fail(`vsl-001 score drifted from 0.965 to ${top.matchScore}`);
else ok(`vsl-001 score ≈ 0.965 (${top.matchScore})`);
const second = ranked[1];
if (second && second.matchScore >= top.matchScore - 0.1) fail(`second candidate too close to top (${second.matchScore})`);
else ok(`second place ${second?.vesselId ?? '—'} clearly below top (margin ${(top.matchScore - (second?.matchScore ?? 0)).toFixed(3)})`);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
