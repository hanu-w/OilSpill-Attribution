import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url, { fsCache: false });
const fs = await import('node:fs');
const turf = await jiti.import('../node_modules/@turf/turf/dist/esm/index.js');
const data = JSON.parse(fs.readFileSync('/tmp/ne_50m_land.geojson','utf8'));

const LNG0 = 65.5, LAT0 = 18.5, STEP = 0.02;
const COLS = Math.round((73.5 - LNG0)/STEP), ROWS = Math.round((25.5 - LAT0)/STEP);

// Collect region-overlapping polygons only
const polys = [];
for (const f of data.features) {
  const g = f.geometry;
  if (g.type==='Polygon') polys.push({type:'Polygon', coordinates:g.coordinates});
  else if (g.type==='MultiPolygon') for (const c of g.coordinates) polys.push({type:'Polygon', coordinates:c});
}
const regionPolys = polys.filter(p=>{
  const b = turf.bbox(p);
  return b[0] < 73.5 && b[2] > 65.5 && b[1] < 25.5 && b[3] > 18.5;
});
console.log('region polygons:', regionPolys.length);

const raw = new Uint8Array(ROWS * Math.ceil(COLS/8));
const bytesPerRow = Math.ceil(COLS/8);
for(let r=0;r<ROWS;r++){
  const lat = LAT0 + r*STEP;
  for(let c=0;c<COLS;c++){
    const lng = LNG0 + c*STEP;
    const isLand = regionPolys.some(p=>turf.booleanPointInPolygon([lng,lat],p));
    if(isLand) raw[r*bytesPerRow + (c>>3)] |= (1<<(c%8));
  }
}
console.log('raw bytes:', raw.length);
fs.writeFileSync('/tmp/land_raw.bin', raw);

function landAt(lng,lat){
  const c=Math.round((lng-LNG0)/STEP), r=Math.round((lat-LAT0)/STEP);
  if(c<0||c>=COLS||r<0||r>=ROWS) return false;
  return (raw[r*bytesPerRow+(c>>3)] & (1<<(c%8)))!==0;
}
// ASCII render of region
for(let lat=24.0;lat>=20.0;lat-=0.1){
  let line=lat.toFixed(1).padStart(5)+' ';
  for(let lng=67.5;lng<=72.5;lng+=0.1) line+=landAt(lng,lat)?'#':'.';
  console.log(line);
}
