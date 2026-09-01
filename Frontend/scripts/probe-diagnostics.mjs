// Diagnostic probe: find every geographic problem in the simulation.
// Covers scenario + generated vessels, routes, positions, AIS observations,
// trails (points AND segments), and the spill (origin, vertices, edges,
// interior) across progression states. This is an exploratory script — it
// does not fail the build.
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url, { fsCache: false });

const gen = await jiti.import('../src/simulation/vesselGenerator.ts');
const { isOnLand, isSafeWater, checkNavigability, segmentCrossesLand, segmentLeavesSafeWater } = await jiti.import('../src/simulation/landMask.ts');
const { vesselStateAt, SCENARIO_START_MS } = await jiti.import('../src/simulation/kinematics.ts');
const { observedStateAt } = await jiti.import('../src/simulation/aisJitter.ts');
const { generateTrailPoints } = await jiti.import('../src/simulation/trailGenerator.ts');
const { spillStateAt } = await jiti.import('../src/simulation/spillGeometry.ts');
const { SCENARIO_INCIDENT_BASE } = await jiti.import('../src/simulation/incident.ts');
const { distanceKm, pointAlongRoute } = await jiti.import('../src/simulation/geo.ts');

const fleet = gen.generateSimVessels();
console.log(`Fleet: ${fleet.length} vessels`);

const times = [
  Date.parse('2026-08-27T00:00:00Z'),
  Date.parse('2026-08-27T06:00:00Z'),
  Date.parse('2026-08-27T09:10:00Z'),
  Date.parse('2026-08-27T14:00:00Z'),
  Date.parse('2026-08-27T22:00:00Z'),
];

const problems = [];
const note = [];

// --- 1. Route vertices + interpolated segments ---
for (const v of fleet) {
  const nav = checkNavigability(v.route.waypoints);
  if (!nav.ok) problems.push(`${v.id} route waypoints: ${JSON.stringify(nav)}`);
  // Check interpolated route midpoints (denser sampling than waypoints)
  const segs = v.route.cumKm.length;
  for (let i = 1; i < segs; i++) {
    const a = v.route.waypoints[i-1];
    const b = v.route.waypoints[i];
    if (segmentCrossesLand(a, b)) problems.push(`${v.id} route segment ${i-1}->${i} crosses land`);
    if (segmentLeavesSafeWater(a, b)) note.push(`${v.id} route segment ${i-1}->${i} leaves safe water`);
  }
}

// --- 2. Positions + observed positions over time ---
for (const v of fleet) {
  for (const t of times) {
    const s = vesselStateAt(v, t);
    if (isOnLand(s.lng, s.lat)) problems.push(`${v.id} POSITION ON LAND at ${new Date(t).toISOString()} (${s.lat},${s.lng})`);
    else if (!isSafeWater(s.lng, s.lat)) note.push(`${v.id} position not safe water at ${new Date(t).toISOString()}`);
    const o = observedStateAt(v, t);
    if (isOnLand(o.lng, o.lat)) problems.push(`${v.id} OBSERVED ON LAND at ${new Date(t).toISOString()} (${o.lat},${o.lng})`);
    else if (!isSafeWater(o.lng, o.lat)) note.push(`${v.id} observed not safe water at ${new Date(t).toISOString()}`);
  }
}

// --- 3. Trails: points + consecutive segments, ALL vessels ---
for (const v of fleet) {
  const trail = generateTrailPoints(v, times[3], { pointCount: 72 });
  if (trail.length === 0) continue;
  let onLandPts = 0, crossSegs = 0, leaveSafe = 0;
  for (let i = 0; i < trail.length; i++) {
    const p = trail[i];
    if (isOnLand(p.lng, p.lat)) onLandPts++;
    if (i > 0) {
      const a = { lat: trail[i-1].lat, lng: trail[i-1].lng };
      const b = { lat: trail[i].lat, lng: trail[i].lng };
      if (segmentCrossesLand(a, b)) crossSegs++;
      if (segmentLeavesSafeWater(a, b)) leaveSafe++;
    }
  }
  if (onLandPts) problems.push(`${v.id} trail: ${onLandPts} pts on land`);
  if (crossSegs) problems.push(`${v.id} trail: ${crossSegs} segments cross land`);
  if (leaveSafe) note.push(`${v.id} trail: ${leaveSafe} segments leave safe water`);
}

// --- 4. Spill geometry across progression ---
function ptInPolygon(lng, lat, ring) {
  // ray casting
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

const spillTimes = [];
for (let t = Date.parse('2026-08-27T07:42:00Z'); t <= Date.parse('2026-08-27T22:00:00Z'); t += 30*60*1000) spillTimes.push(t);

for (const t of spillTimes) {
  const sp = spillStateAt(t);
  if (!sp) continue;
  const g = sp.geometry;
  if (isOnLand(g.origin.lng, g.origin.lat)) problems.push(`spill ORIGIN on land at ${new Date(t).toISOString()}`);
  const ring = g.boundary;
  let vertexOnLand = 0;
  for (const [lng, lat] of ring) if (isOnLand(lng, lat)) vertexOnLand++;
  if (vertexOnLand) problems.push(`spill ${vertexOnLand}/${ring.length} VERTICES on land at ${new Date(t).toISOString()}`);
  // sample interior along each edge
  let edgeOnLand = 0, interiorOnLand = 0;
  for (let i = 1; i < ring.length; i++) {
    const a = { lat: ring[i-1][1], lng: ring[i-1][0] };
    const b = { lat: ring[i][1], lng: ring[i][0] };
    if (segmentCrossesLand(a, b)) edgeOnLand++;
  }
  // sample a grid of interior points
  const lngs = ring.map(p=>p[0]), lats = ring.map(p=>p[1]);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs), minLat = Math.min(...lats), maxLat = Math.max(...lats);
  for (let la = minLat; la <= maxLat; la += 0.01) {
    for (let lo = minLng; lo <= maxLng; lo += 0.01) {
      if (ptInPolygon(lo, la, ring) && isOnLand(lo, la)) interiorOnLand++;
    }
  }
  if (edgeOnLand) problems.push(`spill ${edgeOnLand} EDGES on land at ${new Date(t).toISOString()}`);
  if (interiorOnLand) problems.push(`spill ${interiorOnLand} INTERIOR samples on land at ${new Date(t).toISOString()}`);
}
// Incident location itself
console.log(`incident location (${SCENARIO_INCIDENT_BASE.location.lat},${SCENARIO_INCIDENT_BASE.location.lng}) onLand=${isOnLand(SCENARIO_INCIDENT_BASE.location.lng, SCENARIO_INCIDENT_BASE.location.lat)} safe=${isSafeWater(SCENARIO_INCIDENT_BASE.location.lng, SCENARIO_INCIDENT_BASE.location.lat)}`);

// --- 5. Fishing circularity heuristic ---
// For fishing vessels, sample positions over a long window; detect repeated
// identical tracks and high path overlap (circuit behaviour).
console.log('\n--- Fishing path sampling ---');
for (const v of fleet.filter(v => v.type === 'fishing')) {
  const pts = [];
  for (let t = Date.parse('2026-08-27T00:00:00Z'); t <= Date.parse('2026-08-28T00:00:00Z'); t += 20*60*1000) {
    const s = vesselStateAt(v, t);
    pts.push([s.lng, s.lat]);
  }
  // Detect repeated identical sub-paths: hash consecutive triplets
  const seen = new Map();
  let repeats = 0;
  for (let i = 0; i + 2 < pts.length; i++) {
    const key = `${pts[i][0].toFixed(4)},${pts[i][1].toFixed(4)}|${pts[i+1][0].toFixed(4)},${pts[i+1][1].toFixed(4)}|${pts[i+2][0].toFixed(4)},${pts[i+2][1].toFixed(4)}`;
    const n = seen.get(key) ?? 0;
    if (n > 0) repeats++;
    seen.set(key, n+1);
  }
  // Path extent (max distance from start) and total distance travelled
  const start = pts[0];
  let maxDist = 0, total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = distanceKm({lat: start[1], lng: start[0]}, {lat: pts[i][1], lng: pts[i][0]});
    if (d > maxDist) maxDist = d;
    total += distanceKm({lat: pts[i-1][1], lng: pts[i-1][0]}, {lat: pts[i][1], lng: pts[i][0]});
  }
  console.log(`${v.id} ${v.name.padEnd(22)} extent=${maxDist.toFixed(1)}km travelled=${total.toFixed(1)}km repeats=${repeats}`);
}

// --- 6. Scenario vessel route detail ---
console.log('\n--- Scenario vessel routes ---');
for (const v of fleet.slice(0, 5)) {
  console.log(`${v.id} ${v.name}:`);
  v.route.waypoints.forEach((p, i) => {
    const l = isOnLand(p.lng, p.lat) ? 'LAND' : (isSafeWater(p.lng, p.lat) ? 'safe' : 'near');
    console.log(`   wpt${i} (${p.lat},${p.lng}) ${l}`);
  });
}

console.log('\n=== SUMMARY ===');
console.log(`Problems: ${problems.length}`);
for (const p of problems) console.log(`  ✗ ${p}`);
console.log(`Notes (near-shore but not on land): ${note.length}`);
for (const n of note.slice(0, 40)) console.log(`  ~ ${n}`);
