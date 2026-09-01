import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url, { fsCache: false });
const { isSafeWater, checkNavigability } = await jiti.import('../src/simulation/landMask.ts');
const { destinationPoint } = await jiti.import('../src/simulation/geo.ts');
for (const [n,lat,lng] of [
  ['por-a',21.52,69.38],['por-b',21.50,69.35],['por-c',21.55,69.42],['por-d',21.48,69.32],
]) {
  const center = {lat,lng};
  const wp = [45,135,225,315].map(b => destinationPoint(center,b,1.8));
  const closed = [...wp, wp[0]];
  const r = checkNavigability(closed);
  console.log(n, 'center safe:', isSafeWater(lng,lat), 'circuit:', JSON.stringify(r));
}
