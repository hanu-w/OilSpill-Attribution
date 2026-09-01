// Tune vsl-001 route + startIndex: evaluate min dist / minAt / timeNear /
// component scores over the release window for candidate configs.
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url, { fsCache: false });
const { buildRoute, destinationPoint, distanceKm, pointAlongRoute } = await jiti.import('../src/simulation/geo.ts');
const { checkNavigability } = await jiti.import('../src/simulation/landMask.ts');
const { driftVectorAt } = await jiti.import('../src/simulation/environment.ts');
const { DETECTION_MS, SCENARIO_INCIDENT_BASE } = await jiti.import('../src/simulation/incident.ts');

const RELEASE_START = DETECTION_MS - 90*60000;
const RELEASE_END = DETECTION_MS - 15*60000;
const RELEASE_CENTER = DETECTION_MS - 50*60000;
const SCENARIO_START = Date.parse('2026-08-27T09:10:00Z');
const KNOT_TO_KM_S = 1.852/3600;

const drift = driftVectorAt(DETECTION_MS);
const source = destinationPoint(SCENARIO_INCIDENT_BASE.location, (drift.bearingDeg+180)%360, drift.speedKmH*(50/60));
console.log(`drift ${drift.speedKmH.toFixed(2)}km/h @ ${drift.bearingDeg}; release point (${source.lat.toFixed(4)},${source.lng.toFixed(4)})`);

const ROUTES = {
  A: [ // south-center channel, passes 2.6km from release at wpt2
    [22.560,69.900],[22.600,69.700],[22.540,69.580],[22.530,69.420],[22.510,69.220],[22.520,68.950],[22.400,68.850],[22.200,68.750],
  ],
  B: [ // passes 0.5km from release at wpt2 (22.52,69.58)
    [22.560,69.900],[22.600,69.720],[22.520,69.580],[22.515,69.400],[22.510,69.220],[22.520,68.950],[22.400,68.850],[22.200,68.750],
  ],
};
const SPEED = 9.4;
function posAt(route, startProgress, t) {
  const elapsedS = (t - SCENARIO_START)/1000;
  let progress = startProgress + SPEED*KNOT_TO_KM_S*elapsedS;
  let dir = 1; const total = route.totalKm; const period = 2*total;
  if (total>0) {
    const mod = ((progress%period)+period)%period;
    if (mod>total){ progress=2*total-mod; dir=-1; } else progress=mod;
  }
  const s = pointAlongRoute(route, progress);
  return { ...s, heading: dir===1?s.heading:(s.heading+180)%360 };
}

for (const [rname, pts] of Object.entries(ROUTES)) {
  const wp = pts.map(([lat,lng])=>({lat,lng}));
  const nav = checkNavigability(wp);
  if (!nav.ok) { console.log(`${rname}: NOT NAVIGABLE ${JSON.stringify(nav)}`); continue; }
  const route = buildRoute(wp);
  console.log(`\n${rname}: total ${route.totalKm.toFixed(1)}km cumKm ${route.cumKm.map(c=>c.toFixed(1)).join(',')} NAVIGABLE`);
  for (let si=0; si<wp.length; si++) {
    const startProgress = route.cumKm[si];
    let minD=Infinity, minAt=0, near=0, samples=0;
    for (let t=RELEASE_START; t<=RELEASE_END; t+=6*60000) {
      const s = posAt(route, startProgress, t);
      const d = distanceKm(source, s); samples++;
      if (d<=25) near++;
      if (d<minD){ minD=d; minAt=t; }
    }
    const dist = 1/(1+Math.pow(minD/25,2));
    const temp = Math.max(0, 1-Math.abs(minAt-RELEASE_CENTER)/(110*60000));
    const behav = Math.exp(-Math.pow(9.4-7.5,2)/40);
    const rte = Math.min(1, (near/samples)*1.8);
    const score = 0.28*dist+0.2*temp+0.2*behav+0.12*rte+0.2*1.0;
    console.log(`  si=${si} minD=${minD.toFixed(1)}km @${new Date(minAt).toISOString().slice(11,16)} near=${near}/${samples} -> dist=${dist.toFixed(3)} temp=${temp.toFixed(2)} route=${rte.toFixed(2)} TOTAL=${score.toFixed(3)}`);
  }
}
