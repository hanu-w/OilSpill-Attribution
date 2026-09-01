import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url, { fsCache: false });
const fs = await import('node:fs');
const turf = await jiti.import('../node_modules/@turf/turf/dist/esm/index.js');
const rings = JSON.parse(fs.readFileSync('/tmp/land_rings.json','utf8'));
const polygons = rings.map(ring => ({ type:'Polygon', coordinates:[ring] }));
function isLand(lng,lat){ return polygons.some(p=>turf.booleanPointInPolygon([lng,lat],p)); }
const rows=[];
for(let lat=24.0; lat>=20.5; lat-=0.1){
  let line=lat.toFixed(1)+' ';
  for(let lng=67.5; lng<=72.0; lng+=0.1) line+=isLand(lng,lat)?'#':'.';
  rows.push(line);
}
console.log(rows.join('\n'));
console.log('\nPort land checks (should be land=false or near):');
const ports = { Kandla:[70.22,23.00], Mundra:[69.73,22.83], Vadinar:[69.72,22.40], Okha:[69.08,22.47], Porbandar:[69.62,21.63], Mandvi:[69.35,22.82], Sikka:[69.84,22.43], Veraval:[70.37,20.91], Diu:[70.98,20.71], Jakhau:[68.80,23.22] };
for(const [n,[lng,lat]] of Object.entries(ports)) console.log(`  ${n} ${lat.toFixed(2)}N ${lng.toFixed(2)}E -> land=${isLand(lng,lat)}`);
console.log('\nIncident + release checks:');
console.log('  incident (22.514,69.554) land=', isLand(69.554,22.514));
console.log('  source/release (69.533,22.528) land=', isLand(69.533,22.528));
console.log('  vsl-001 route pts land:', 
  [[69.795,22.512],[69.681,22.483],[69.555,22.448],[69.39,22.418],[69.13,22.375],[68.82,22.32],[68.48,22.255]].map(([lng,lat])=>isLand(lng,lat)));
