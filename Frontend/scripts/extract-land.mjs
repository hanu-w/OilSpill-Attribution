import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url, { fsCache: false });
const fs = await import('node:fs');
const turf = await jiti.import('../node_modules/@turf/turf/dist/esm/index.js');
const data = JSON.parse(fs.readFileSync('/tmp/ne_50m_land.geojson','utf8'));
const feats = data.features.filter(f => {
  const b=f.bbox;
  return b && b[0]<73 && b[2]>65.5 && b[1]<24.5 && b[3]>18.5;
});
function coordsOf(geom){ if(geom.type==='Polygon')return [geom.coordinates]; if(geom.type==='MultiPolygon')return geom.coordinates; return []; }
const polys=[];
for(const f of feats){ for(const ring of coordsOf(f.geometry)){ polys.push({type:'Polygon',coordinates:[ring[0]]}); } }
const BBOX=[66.0,18.5,73.5,25.0];
const clipped=[];
for(const p of polys){
  try{
    const c=turf.bboxClip(p,BBOX);
    if(c&&c.geometry&&c.geometry.coordinates.length){
      // erode seaward ~0.015deg (~1.6km) so near-coastal valid water is not flagged
      const eroded = turf.buffer(c, -0.015, {units:'degrees'});
      const src = (eroded||c).geometry;
      const s=turf.simplify(src,{tolerance:0.006,highQuality:true});
      const pp = s.geometry.type==='Polygon'?[s.geometry.coordinates]:s.geometry.coordinates;
      for(const r of pp) clipped.push(r[0]);
    }
  }catch(e){ console.log('err',e.message); }
}
console.log('polygons:',clipped.length,'vertices:',clipped.reduce((s,r)=>s+r.length,0));
fs.writeFileSync('/tmp/land_rings.json',JSON.stringify(clipped));
