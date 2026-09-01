// Verify the spill polygon (origin, vertices, edges, interior) stays offshore
// across the whole progression for candidate incident locations + current env.
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url, { fsCache: false });
const { spillStateAt } = await jiti.import('../src/simulation/spillGeometry.ts');
const { driftVectorAt } = await jiti.import('../src/simulation/environment.ts');
const { destinationPoint } = await jiti.import('../src/simulation/geo.ts');
const { isOnLand, isSafeWater, segmentCrossesLand } = await jiti.import('../src/simulation/landMask.ts');

function ptInPolygon(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

const d = driftVectorAt(Date.parse('2026-08-27T07:42:00Z'));
console.log(`detection drift: ${d.speedKmH.toFixed(2)}km/h @ ${d.bearingDeg}deg`);

let worst = { t: '', kind: '', n: 0 };
let totalViolations = 0;
for (let t = Date.parse('2026-08-27T07:42:00Z'); t <= Date.parse('2026-08-27T23:00:00Z'); t += 15 * 60000) {
  const sp = spillStateAt(t);
  if (!sp) continue;
  const g = sp.geometry;
  const ring = g.boundary;
  let vLand = 0, eLand = 0, iLand = 0, cSafe = isSafeWater(g.centroid.lng, g.centroid.lat);
  for (const [lng, lat] of ring) if (isOnLand(lng, lat)) vLand++;
  for (let i = 1; i < ring.length; i++) {
    const a = { lat: ring[i-1][1], lng: ring[i-1][0] };
    const b = { lat: ring[i][1], lng: ring[i][0] };
    if (segmentCrossesLand(a, b)) eLand++;
  }
  const lngs = ring.map(p=>p[0]), lats = ring.map(p=>p[1]);
  for (let la = Math.min(...lats); la <= Math.max(...lats); la += 0.008) {
    for (let lo = Math.min(...lngs); lo <= Math.max(...lngs); lo += 0.008) {
      if (ptInPolygon(lo, la, ring) && isOnLand(lo, la)) iLand++;
    }
  }
  const viol = vLand + eLand + iLand;
  if (viol > 0) {
    totalViolations += viol;
    if (viol > worst.n) worst = { t: new Date(t).toISOString().slice(5,16), kind: `v${vLand}/e${eLand}/i${iLand}`, n: viol };
    console.log(`  ${new Date(t).toISOString().slice(11,16)}Z centroid(${g.centroid.lat.toFixed(3)},${g.centroid.lng.toFixed(3)}) safe=${cSafe} VERT=${vLand} EDGE=${eLand} INT=${iLand}`);
  }
}
console.log(totalViolations ? `\nTOTAL violations: ${totalViolations} (worst ${worst.kind} @ ${worst.t})` : '\nSpill stays offshore across whole progression (07:42→23:00)');
