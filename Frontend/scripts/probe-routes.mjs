// Validate every route template the 30-vessel fleet generator will use.
// Builds each route through routeBuilder (which asserts navigability) and
// reports per-route OK/FAIL plus the resulting length.
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url, { fsCache: false });

const rb = await jiti.import('../src/simulation/routeBuilder.ts');
const { routeLengthKm } = await jiti.import('../src/simulation/geo.ts');

const cases = [
  // commercial / corridor
  ['deepLane karachi→mumbai', () => rb.deepLaneRoute('karachi', 'mumbai')],
  ['deepLane mumbai→karachi', () => rb.deepLaneRoute('mumbai', 'karachi')],
  ['gulf karachi→kandla', () => rb.gulfRoute('karachi', 'kandla')],
  ['gulf kandla→karachi', () => rb.gulfRoute('kandla', 'karachi')],
  ['gulf karachi→mundra', () => rb.gulfRoute('karachi', 'mundra')],
  ['gulf mumbai→kandla', () => rb.gulfRoute('mumbai', 'kandla')],
  ['gulf mumbai→mundra', () => rb.gulfRoute('mumbai', 'mundra')],
  ['gulf kandla→mumbai', () => rb.gulfRoute('kandla', 'mumbai')],
  ['gulf mundra→karachi', () => rb.gulfRoute('mundra', 'karachi')],
  // coastal
  ['coastal mumbai→veraval', () => rb.coastalRoute('mumbai', 'veraval')],
  ['coastal veraval→mumbai', () => rb.coastalRoute('veraval', 'mumbai')],
  ['coastal porbandar→mumbai', () => rb.coastalRoute('porbandar', 'mumbai')],
  ['coastal mumbai→okha', () => rb.coastalRoute('mumbai', 'okha')],
  ['coastal porbandar→veraval', () => rb.coastalRoute('porbandar', 'veraval')],
  ['coastal okha→porbandar', () => rb.coastalRoute('okha', 'porbandar')],
  // offshore
  ['offshore karachi→porbandar', () => rb.offshoreRoute('karachi', 'porbandar')],
  ['offshore porbandar→karachi', () => rb.offshoreRoute('porbandar', 'karachi')],
  // gulf hops
  ['hop mundra→vadinar', () => rb.gulfHopRoute('mundra', 'vadinar')],
  ['hop vadinar→sikka', () => rb.gulfHopRoute('vadinar', 'sikka')],
  // fishing
  ['fishing porbandar→offPorbandar', () => rb.fishingRoute('porbandar', 'offPorbandar').route],
  ['fishing veraval→offVeraval', () => rb.fishingRoute('veraval', 'offVeraval').route],
  ['fishing diu→offDiu', () => rb.fishingRoute('diu', 'offDiu').route],
  ['fishing mandvi→offMandvi', () => rb.fishingRoute('mandvi', 'offMandvi').route],
  ['fishing okha→offOkha', () => rb.fishingRoute('okha', 'offOkha').route],
  ['fishing porbandar→southOffshore', () => rb.fishingRoute('porbandar', 'southOffshore').route],
  ['fishing mandvi→gulfMouth', () => rb.fishingRoute('mandvi', 'gulfMouth').route],
  // patrol / anchored
  ['patrol kandla', () => rb.patrolCircuit('kandla')],
  ['patrol mundra', () => rb.patrolCircuit('mundra')],
  ['patrol porbandar', () => rb.patrolCircuit('porbandar')],
  ['anchored kandla', () => rb.anchoredRoute('kandla')],
  ['anchored porbandar', () => rb.anchoredRoute('porbandar')],
  ['anchored mumbai', () => rb.anchoredRoute('mumbai')],
];

let fails = 0;
for (const [label, build] of cases) {
  try {
    const route = build();
    console.log(`OK  ${label.padEnd(32)} ${routeLengthKm(route).toFixed(1)} km`);
  } catch (err) {
    fails++;
    console.log(`FAIL ${label.padEnd(31)} ${err instanceof Error ? err.message : String(err)}`);
  }
}
console.log(`\n${cases.length - fails}/${cases.length} route templates navigable`);
process.exit(fails > 0 ? 1 : 0);
