import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url, { fsCache: false });
const { driftVectorAt, environmentAt } = await jiti.import('../src/simulation/environment.ts');
const { DETECTION_MS } = await jiti.import('../src/simulation/incident.ts');
const { destinationPoint } = await jiti.import('../src/simulation/geo.ts');
const { isOnLand, isSafeWater } = await jiti.import('../src/simulation/landMask.ts');

for (const t of [Date.parse('2026-08-27T07:42:00Z'), Date.parse('2026-08-27T06:52:00Z'), Date.parse('2026-08-27T09:10:00Z')]) {
  const env = environmentAt(t);
  const d = driftVectorAt(t);
  console.log(`${new Date(t).toISOString()} wind=${env.wind.speed}kn/${env.wind.direction}deg current=${env.current.speed}kn/${env.current.direction}deg -> drift ${d.speedKmH.toFixed(2)}km/h @ ${d.bearingDeg}deg`);
}
const inc = { lat: 22.514, lng: 69.554 };
const d = driftVectorAt(DETECTION_MS);
console.log('Slick path from incident (reference drift):');
for (let h = 0; h <= 14; h += 2) {
  const p = destinationPoint(inc, d.bearingDeg, d.speedKmH * h);
  const land = isOnLand(p.lng, p.lat) ? 'LAND!' : (isSafeWater(p.lng, p.lat) ? 'safe' : 'near');
  console.log(`  +${h}h (${p.lat.toFixed(3)},${p.lng.toFixed(3)}) ${land}`);
}
const src = destinationPoint(inc, (d.bearingDeg + 180) % 360, d.speedKmH * (50/60));
console.log(`release point: (${src.lat.toFixed(4)},${src.lng.toFixed(4)}) land=${isOnLand(src.lng, src.lat)} safe=${isSafeWater(src.lng, src.lat)}`);
