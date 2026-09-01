import type { VesselType } from '@/types/vessel';
import { buildRoute, destinationPoint, routeLengthKm, type SimRoute } from './geo';
import { hashString, mulberry32, pick, randomRange } from './rng';
import { SCENARIO_VESSELS, type ScenarioVesselSeed } from './scenario';
import { buildJourney, type Journey, type JourneyLegInput } from './journey';
import {
  anchoredRoute,
  coastalRoute,
  deepLaneRoute,
  fishingRoute,
  gulfHopRoute,
  gulfRoute,
  offshoreRoute,
  patrolCircuit,
} from './routeBuilder';
import type { AisJitter, SimVessel, TrafficPattern } from './types';

/**
 * Deterministic 36-vessel fleet.
 *
 * The fleet is deliberately sized to the GFW calibration snapshot: 5 hand-
 * authored scenario vessels (vsl-001..vsl-005, preserved exactly for the
 * INC-2026-001 narrative) plus 31 generated vessels. The 25 baseline vessels
 * keep the original design; 6 more close the gaps the real AIS data exposes
 * (see data/processed/realism-analysis.md):
 *
 *   - 2 Sikka-bound merchant calls (vsl-031/032) — Sikka is the most-visited
 *     Gulf port in the window (229 calls ≫ Kandla 15 / Mundra 19).
 *   - 2 more fishing vessels on the dominant grounds (vsl-033/034) — the real
 *     window assigned 14 events to gulfMouth and 11 to offMandvi.
 *   - 2 roadstead drifters at Sikka and Mundra (vsl-035/036) — real anchorages
 *     hold far more laid-up tonnage than the baseline 3.
 *
 * Generated behaviour follows real maritime practice:
 *
 *   - commercial corridor (deep lane / Gulf of Kutch, slow approach near port)
 *   - coastal / offshore feeders
 *   - fishing (port → transit → ground → meander → transit → port)
 *   - patrol (localized closed circuits)
 *   - anchored (stationary holds at anchorages)
 *
 * Every generated vessel is derived from the seeded PRNG alone (no
 * Math.random, no Date.now): routes come from the validated maritime network,
 * and all variability (speed, name, IMO, AIS jitter, departure times, dwell
 * and loiter durations) is drawn deterministically per vessel. Same seed ⇒
 * same fleet, same positions, same behaviour, same trails.
 *
 * Departure schedules are anchored to a fixed scenario day
 * (2026-08-27T00:00Z) and chosen so that no new vessel is near the
 * INC-2026-001 release region during the release window (06:12–07:27Z): all
 * Gulf-adjacent merchant traffic is still in its origin-hold leg then (the
 * nearest pass belongs to the Sikka-bound cargo vsl-032 at ~21 km — far below
 * the top candidate), and the only vessels under way (deep-lane) stay
 * >200 km away. The attribution ranking therefore still emerges from the
 * scoring model.
 */

/** Fixed seed for the whole deterministic demo world. */
export const SIMULATION_SEED = 20_260_827;

/** Total fleet size (scenario core + generated traffic). */
export const VESSEL_COUNT = 50;

const MS_PER_MIN = 60_000;
const MS_PER_HOUR = 3_600_000;

/** Scenario day zero — every daily schedule is anchored to this fixed epoch. */
const DAY_START_MS = Date.parse('2026-08-27T00:00:00Z');

/** Deterministic name pools — no runtime randomness anywhere. */
const NAME_PREFIX = [
  'Ocean', 'Arabian', 'Gulf', 'Sagar', 'Indus', 'Monsoon', 'Mariner', 'Star',
  'Pearl', 'Coral', 'Harbor', 'Kutch', 'Pride', 'Meridian', 'Falcon', 'Dawn',
  'Tide', 'Golden', 'Sapphire', 'Emerald', 'Raj', 'Shakti', 'Deep', 'Blue',
  'Silver', 'Neptune', 'Trident', 'Seas', 'Wave', 'Cliff', 'Sundari', 'Ganga',
  'Narmada', 'Tapi', 'Jumna', 'Gomati', 'Lakshmi', 'Kaveri', 'Surya', 'Varun',
  'Albatross', 'Sentinel', 'Osprey', 'Cormorant', 'Garuda', 'Vijay',
];

const NAME_SUFFIX = [
  'Navigator', 'Trader', 'Voyager', 'Horizon', 'Knight', 'Pride', 'Express',
  'Spirit', 'Rose', 'Comet', 'Dolphin', 'Heron', 'Quest', 'Merchant',
  'Success', 'Fortune', 'Venture', 'Rider', 'Sailor', 'Queen', 'Star',
  'Glory', 'Light', 'Companion', 'Grace', 'Arrow', 'Guardian', 'Leader',
  'Pioneer', 'Defender', 'Protector',
];

/** AIS realism defaults per vessel class. */
const AIS_PROFILE: Record<
  VesselType,
  { radius: [number, number]; heading: [number, number]; speed: [number, number]; periodS: [number, number] }
> = {
  tanker: { radius: [0.1, 0.25], heading: [3, 7], speed: [0.03, 0.07], periodS: [120, 240] },
  cargo: { radius: [0.1, 0.25], heading: [3, 7], speed: [0.03, 0.07], periodS: [120, 240] },
  container: { radius: [0.1, 0.25], heading: [3, 7], speed: [0.03, 0.07], periodS: [120, 240] },
  fishing: { radius: [0.05, 0.15], heading: [5, 12], speed: [0.05, 0.12], periodS: [180, 420] },
  patrol: { radius: [0.05, 0.15], heading: [2, 6], speed: [0.02, 0.05], periodS: [60, 180] },
  other: { radius: [0.05, 0.12], heading: [2, 5], speed: [0.02, 0.05], periodS: [300, 600] },
};

/** Hand-authored table for the generated fleet. */
interface NewVesselSpec {
  id: string;
  type: VesselType;
  routeKind: 'deep' | 'gulf' | 'coastal' | 'offshore' | 'hop' | 'fishing' | 'patrol' | 'anchored';
  /** Route arguments: port ids / ground keys / patrol centre key. */
  args: string[];
  speedRange: [number, number];
  /** Departure window as minutes from scenario day start (00:00Z). */
  departWindowMin: [number, number];
  /** Merchant dwell time at destination (hours). */
  dwellHours?: [number, number];
  originLabel: string;
  destinationLabel: string;
}

const GENERATED_SPECS: NewVesselSpec[] = [
  // --- commercial corridor (tanker / cargo / container) ---
  { id: 'vsl-006', type: 'tanker', routeKind: 'deep', args: ['karachi', 'mumbai'], speedRange: [9, 13], departWindowMin: [300, 390], dwellHours: [4, 8], originLabel: 'Karachi', destinationLabel: 'Mumbai' },
  { id: 'vsl-007', type: 'cargo', routeKind: 'gulf', args: ['mumbai', 'kandla'], speedRange: [11, 15], departWindowMin: [450, 600], dwellHours: [3, 6], originLabel: 'Mumbai', destinationLabel: 'Kandla' },
  { id: 'vsl-008', type: 'container', routeKind: 'gulf', args: ['kandla', 'mumbai'], speedRange: [14, 19], departWindowMin: [450, 600], dwellHours: [3, 6], originLabel: 'Kandla', destinationLabel: 'Mumbai' },
  { id: 'vsl-009', type: 'cargo', routeKind: 'gulf', args: ['karachi', 'mundra'], speedRange: [11, 15], departWindowMin: [450, 660], dwellHours: [3, 6], originLabel: 'Karachi', destinationLabel: 'Mundra' },
  { id: 'vsl-010', type: 'container', routeKind: 'deep', args: ['mumbai', 'karachi'], speedRange: [14, 19], departWindowMin: [360, 450], dwellHours: [4, 8], originLabel: 'Mumbai', destinationLabel: 'Karachi' },
  // --- coastal / offshore feeders ---
  { id: 'vsl-011', type: 'cargo', routeKind: 'coastal', args: ['mumbai', 'veraval'], speedRange: [11, 15], departWindowMin: [450, 620], dwellHours: [2, 5], originLabel: 'Mumbai', destinationLabel: 'Veraval' },
  { id: 'vsl-012', type: 'cargo', routeKind: 'coastal', args: ['veraval', 'mumbai'], speedRange: [11, 15], departWindowMin: [450, 620], dwellHours: [2, 5], originLabel: 'Veraval', destinationLabel: 'Mumbai' },
  { id: 'vsl-013', type: 'container', routeKind: 'coastal', args: ['mumbai', 'okha'], speedRange: [14, 19], departWindowMin: [450, 620], dwellHours: [2, 5], originLabel: 'Mumbai', destinationLabel: 'Okha' },
  { id: 'vsl-014', type: 'cargo', routeKind: 'offshore', args: ['karachi', 'porbandar'], speedRange: [11, 15], departWindowMin: [450, 660], dwellHours: [3, 6], originLabel: 'Karachi', destinationLabel: 'Porbandar' },
  { id: 'vsl-015', type: 'cargo', routeKind: 'coastal', args: ['porbandar', 'mumbai'], speedRange: [11, 15], departWindowMin: [450, 620], dwellHours: [2, 5], originLabel: 'Porbandar', destinationLabel: 'Mumbai' },
  { id: 'vsl-016', type: 'cargo', routeKind: 'hop', args: ['mundra', 'vadinar'], speedRange: [8, 12], departWindowMin: [450, 620], dwellHours: [2, 5], originLabel: 'Mundra', destinationLabel: 'Vadinar' },
  { id: 'vsl-017', type: 'cargo', routeKind: 'hop', args: ['vadinar', 'sikka'], speedRange: [8, 12], departWindowMin: [450, 620], dwellHours: [2, 5], originLabel: 'Vadinar', destinationLabel: 'Sikka' },
  // --- fishing (port → transit → ground → loiter → transit → port) ---
  { id: 'vsl-018', type: 'fishing', routeKind: 'fishing', args: ['porbandar', 'offPorbandar'], speedRange: [4, 7], departWindowMin: [375, 540], originLabel: 'Porbandar', destinationLabel: 'Ground: off Porbandar' },
  { id: 'vsl-019', type: 'fishing', routeKind: 'fishing', args: ['veraval', 'offVeraval'], speedRange: [4, 7], departWindowMin: [375, 540], originLabel: 'Veraval', destinationLabel: 'Ground: off Veraval' },
  { id: 'vsl-020', type: 'fishing', routeKind: 'fishing', args: ['diu', 'offDiu'], speedRange: [4, 7], departWindowMin: [375, 540], originLabel: 'Diu', destinationLabel: 'Ground: off Diu' },
  { id: 'vsl-021', type: 'fishing', routeKind: 'fishing', args: ['mandvi', 'offMandvi'], speedRange: [4, 7], departWindowMin: [375, 540], originLabel: 'Mandvi', destinationLabel: 'Ground: off Mandvi' },
  { id: 'vsl-022', type: 'fishing', routeKind: 'fishing', args: ['okha', 'offOkha'], speedRange: [4, 7], departWindowMin: [375, 540], originLabel: 'Okha', destinationLabel: 'Ground: off Okha' },
  { id: 'vsl-023', type: 'fishing', routeKind: 'fishing', args: ['porbandar', 'southOffshore'], speedRange: [4, 7], departWindowMin: [375, 540], originLabel: 'Porbandar', destinationLabel: 'Ground: south offshore' },
  { id: 'vsl-024', type: 'fishing', routeKind: 'fishing', args: ['mandvi', 'gulfMouth'], speedRange: [4, 7], departWindowMin: [375, 540], originLabel: 'Mandvi', destinationLabel: 'Ground: gulf mouth' },
  // --- patrol (localized sweeps) ---
  { id: 'vsl-025', type: 'patrol', routeKind: 'patrol', args: ['kandla'], speedRange: [12, 18], departWindowMin: [0, 0], originLabel: 'Patrol: Kandla fairway', destinationLabel: 'Patrol: Kandla fairway' },
  { id: 'vsl-026', type: 'patrol', routeKind: 'patrol', args: ['mundra'], speedRange: [12, 18], departWindowMin: [0, 0], originLabel: 'Patrol: Mundra fairway', destinationLabel: 'Patrol: Mundra fairway' },
  { id: 'vsl-027', type: 'patrol', routeKind: 'patrol', args: ['porbandar'], speedRange: [12, 18], departWindowMin: [0, 0], originLabel: 'Patrol: Porbandar coast', destinationLabel: 'Patrol: Porbandar coast' },
  // --- anchored (stationary holds at anchorages) ---
  { id: 'vsl-028', type: 'other', routeKind: 'anchored', args: ['kandla'], speedRange: [0.6, 1.2], departWindowMin: [0, 0], originLabel: 'Anchored: Kandla roadstead', destinationLabel: 'Anchored: Kandla roadstead' },
  { id: 'vsl-029', type: 'other', routeKind: 'anchored', args: ['porbandar'], speedRange: [0.6, 1.2], departWindowMin: [0, 0], originLabel: 'Anchored: Porbandar roadstead', destinationLabel: 'Anchored: Porbandar roadstead' },
  { id: 'vsl-030', type: 'other', routeKind: 'anchored', args: ['mumbai'], speedRange: [0.6, 1.2], departWindowMin: [0, 0], originLabel: 'Anchored: Mumbai roadstead', destinationLabel: 'Anchored: Mumbai roadstead' },
  // --- calibration add-ons (see realism-analysis.md) ---
  // Sikka is the most-visited Gulf port in the GFW window (229 calls).
  { id: 'vsl-031', type: 'cargo', routeKind: 'gulf', args: ['karachi', 'sikka'], speedRange: [11, 15], departWindowMin: [390, 540], dwellHours: [3, 6], originLabel: 'Karachi', destinationLabel: 'Sikka' },
  { id: 'vsl-032', type: 'cargo', routeKind: 'gulf', args: ['sikka', 'mumbai'], speedRange: [11, 15], departWindowMin: [390, 540], dwellHours: [3, 6], originLabel: 'Sikka', destinationLabel: 'Mumbai' },
  // Fishing on the two dominant real grounds (gulfMouth 14 / offMandvi 11 events).
  { id: 'vsl-033', type: 'fishing', routeKind: 'fishing', args: ['mandvi', 'gulfMouth'], speedRange: [4, 7], departWindowMin: [450, 600], originLabel: 'Mandvi', destinationLabel: 'Ground: gulf mouth' },
  { id: 'vsl-034', type: 'fishing', routeKind: 'fishing', args: ['mandvi', 'offMandvi'], speedRange: [4, 7], departWindowMin: [450, 600], originLabel: 'Mandvi', destinationLabel: 'Ground: off Mandvi' },
  // Roadstead drifters for the busy Gulf terminals
  { id: 'vsl-035', type: 'other', routeKind: 'anchored', args: ['sikka'], speedRange: [0.6, 1.2], departWindowMin: [0, 0], originLabel: 'Anchored: Sikka roadstead', destinationLabel: 'Anchored: Sikka roadstead' },
  { id: 'vsl-036', type: 'other', routeKind: 'anchored', args: ['mundra'], speedRange: [0.6, 1.2], departWindowMin: [0, 0], originLabel: 'Anchored: Mundra roadstead', destinationLabel: 'Anchored: Mundra roadstead' },
  // --- fleet expansion to 50 vessels ---
  // Additional patrol sweeps
  { id: 'vsl-037', type: 'patrol', routeKind: 'patrol', args: ['okha'], speedRange: [13, 17], departWindowMin: [0, 0], originLabel: 'Patrol: Okha approach', destinationLabel: 'Patrol: Okha approach' },
  { id: 'vsl-038', type: 'patrol', routeKind: 'patrol', args: ['diu'], speedRange: [13, 17], departWindowMin: [0, 0], originLabel: 'Patrol: South Saurashtra', destinationLabel: 'Patrol: South Saurashtra' },
  // Deep-lane and Gulf commercial corridors
  { id: 'vsl-039', type: 'tanker', routeKind: 'deep', args: ['mumbai', 'karachi'], speedRange: [10, 14], departWindowMin: [320, 420], dwellHours: [4, 8], originLabel: 'Mumbai', destinationLabel: 'Karachi' },
  { id: 'vsl-040', type: 'tanker', routeKind: 'gulf', args: ['mumbai', 'vadinar'], speedRange: [10, 13], departWindowMin: [450, 600], dwellHours: [4, 7], originLabel: 'Mumbai', destinationLabel: 'Vadinar' },
  { id: 'vsl-041', type: 'container', routeKind: 'deep', args: ['karachi', 'mumbai'], speedRange: [15, 20], departWindowMin: [360, 480], dwellHours: [4, 8], originLabel: 'Karachi', destinationLabel: 'Mumbai' },
  { id: 'vsl-042', type: 'cargo', routeKind: 'coastal', args: ['okha', 'porbandar'], speedRange: [11, 14], departWindowMin: [450, 600], dwellHours: [2, 5], originLabel: 'Okha', destinationLabel: 'Porbandar' },
  { id: 'vsl-043', type: 'cargo', routeKind: 'coastal', args: ['porbandar', 'veraval'], speedRange: [10, 14], departWindowMin: [450, 600], dwellHours: [2, 5], originLabel: 'Porbandar', destinationLabel: 'Veraval' },
  { id: 'vsl-044', type: 'container', routeKind: 'gulf', args: ['karachi', 'kandla'], speedRange: [14, 18], departWindowMin: [450, 620], dwellHours: [3, 6], originLabel: 'Karachi', destinationLabel: 'Kandla' },
  // Fishing operations
  { id: 'vsl-045', type: 'fishing', routeKind: 'fishing', args: ['okha', 'gulfMouth'], speedRange: [4, 7], departWindowMin: [400, 560], originLabel: 'Okha', destinationLabel: 'Ground: gulf mouth' },
  { id: 'vsl-046', type: 'fishing', routeKind: 'fishing', args: ['porbandar', 'offPorbandar'], speedRange: [4, 7], departWindowMin: [400, 560], originLabel: 'Porbandar', destinationLabel: 'Ground: off Porbandar' },
  { id: 'vsl-047', type: 'fishing', routeKind: 'fishing', args: ['veraval', 'offVeraval'], speedRange: [4, 7], departWindowMin: [400, 560], originLabel: 'Veraval', destinationLabel: 'Ground: off Veraval' },
  // Additional commercial / offshore
  { id: 'vsl-048', type: 'tanker', routeKind: 'deep', args: ['karachi', 'mumbai'], speedRange: [9, 13], departWindowMin: [340, 460], dwellHours: [4, 8], originLabel: 'Karachi', destinationLabel: 'Mumbai' },
  { id: 'vsl-049', type: 'cargo', routeKind: 'offshore', args: ['karachi', 'porbandar'], speedRange: [11, 15], departWindowMin: [420, 580], dwellHours: [3, 6], originLabel: 'Karachi', destinationLabel: 'Porbandar' },
  { id: 'vsl-050', type: 'container', routeKind: 'coastal', args: ['mumbai', 'veraval'], speedRange: [14, 18], departWindowMin: [420, 580], dwellHours: [3, 6], originLabel: 'Mumbai', destinationLabel: 'Veraval' },
];

/** All parameters a vessel needs, derived deterministically from the seed. */
interface FleetParams {
  speedKn: number;
  imo: string;
  name: string;
  jitter: AisJitter;
  aisReportPeriodS: number;
  departMs: number;
  dwellMs: number;
  loiterKn: number;
  idleHeadingDeg?: number;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function generateName(rng: () => number, used: Set<string>): string {
  const prefix = pick(rng, NAME_PREFIX);
  const suffix = pick(rng, NAME_SUFFIX);
  let name = `${prefix} ${suffix}`;
  let counter = 2;
  while (used.has(name)) {
    name = `${prefix} ${suffix} ${counter++}`;
  }
  used.add(name);
  return name;
}

/**
 * Draw a vessel's variable parameters from the seeded RNG. RNG calls are
 * consumed in a fixed order so the fleet is fully reproducible.
 */
function fleetParams(id: string, index: number, type: VesselType, spec: NewVesselSpec, usedNames: Set<string>): FleetParams {
  const rng = mulberry32(hashString(`${SIMULATION_SEED}:${id}`));
  const profile = AIS_PROFILE[type];

  const speedKn = round1(randomRange(rng, spec.speedRange[0], spec.speedRange[1]));
  const imo = `${9000000 + index}`;
  const name = generateName(rng, usedNames);
  const jitter: AisJitter = {
    radiusKm: round2(randomRange(rng, profile.radius[0], profile.radius[1])),
    headingDeg: round1(randomRange(rng, profile.heading[0], profile.heading[1])),
    speedFraction: round3(randomRange(rng, profile.speed[0], profile.speed[1])),
  };
  const aisReportPeriodS = Math.round(randomRange(rng, profile.periodS[0], profile.periodS[1]));
  const departMs = DAY_START_MS + Math.round(randomRange(rng, spec.departWindowMin[0], spec.departWindowMin[1])) * MS_PER_MIN;
  const dwellMs = spec.dwellHours ? Math.round(randomRange(rng, spec.dwellHours[0], spec.dwellHours[1])) * MS_PER_HOUR : 0;
  const loiterKn = round1(randomRange(rng, 1.2, 2.4));
  const idleHeadingDeg = type === 'other' ? Math.floor(rng() * 360) : undefined;

  return { speedKn, imo, name, jitter, aisReportPeriodS, departMs, dwellMs, loiterKn, idleHeadingDeg };
}

/** Build the route for a generated spec (throws if not navigable). */
function buildSpecRoute(spec: NewVesselSpec): SimRoute {
  const [a, b] = spec.args;
  switch (spec.routeKind) {
    case 'deep':
      return deepLaneRoute(a as 'karachi' | 'mumbai', b as 'karachi' | 'mumbai');
    case 'gulf':
      return gulfRoute(a, b);
    case 'coastal':
      return coastalRoute(a, b);
    case 'offshore':
      return offshoreRoute(a, b);
    case 'hop':
      return gulfHopRoute(a, b);
    case 'fishing':
      return fishingRoute(a, b, spec.id).route;
    case 'patrol':
      return patrolCircuit(a);
    case 'anchored':
      return anchoredRoute(a);
  }
}

/** Merchant voyage: origin hold → cruise → slow approach → dwell → slow depart → cruise home. */
function merchantJourney(route: SimRoute, params: FleetParams): Journey {
  const total = routeLengthKm(route);
  const slowKm = Math.min(12, total * 0.15);
  const cruiseOut = total - slowKm;
  const cruiseKn = params.speedKn;
  const approachKn = cruiseKn * 0.45;
  const cruiseMs = Math.round((cruiseOut / (cruiseKn * 1.852)) * MS_PER_HOUR);
  const approachMs = Math.round((slowKm / (approachKn * 1.852)) * MS_PER_HOUR);
  const departT = params.departMs;
  const dwellMs = params.dwellMs;

  const t1 = departT;
  const t2 = t1 + cruiseMs;
  const t3 = t2 + approachMs;
  const t4 = t3 + dwellMs;
  const t5 = t4 + approachMs;
  const t6 = t5 + cruiseMs;

  const legs: JourneyLegInput[] = [
    { startAtMs: DAY_START_MS, endAtMs: t1, fromKm: 0, toKm: 0 },
    { startAtMs: t1, endAtMs: t2, fromKm: 0, toKm: cruiseOut },
    { startAtMs: t2, endAtMs: t3, fromKm: cruiseOut, toKm: total },
    { startAtMs: t3, endAtMs: t4, fromKm: total, toKm: total },
    { startAtMs: t4, endAtMs: t5, fromKm: total, toKm: total - slowKm },
    { startAtMs: t5, endAtMs: t6, fromKm: total - slowKm, toKm: 0 },
  ];
  return buildJourney(route, legs, true);
}

/** Fishing voyage: home hold → transit out → slow loiter circuit → transit home. */
function fishingJourney(route: SimRoute, params: FleetParams, outEndKm: number, loopEndKm: number): Journey {
  const transitKn = params.speedKn;
  const loiterKn = params.loiterKn;
  const departT = params.departMs;
  const outMs = Math.round((outEndKm / (transitKn * 1.852)) * MS_PER_HOUR);
  const loiterMs = Math.round(((loopEndKm - outEndKm) / (loiterKn * 1.852)) * MS_PER_HOUR);
  const backMs = Math.round((loopEndKm / (transitKn * 1.852)) * MS_PER_HOUR);

  const legs: JourneyLegInput[] = [
    { startAtMs: DAY_START_MS, endAtMs: departT, fromKm: 0, toKm: 0 },
    { startAtMs: departT, endAtMs: departT + outMs, fromKm: 0, toKm: outEndKm },
    { startAtMs: departT + outMs, endAtMs: departT + outMs + loiterMs, fromKm: outEndKm, toKm: loopEndKm },
    { startAtMs: departT + outMs + loiterMs, endAtMs: departT + outMs + loiterMs + backMs, fromKm: loopEndKm, toKm: 0 },
  ];
  return buildJourney(route, legs, true);
}

/** Patrol: one full closed circuit per leg cycle. */
function patrolJourney(route: SimRoute, params: FleetParams): Journey {
  const total = routeLengthKm(route);
  const circuitMs = Math.round((total / (params.speedKn * 1.852)) * MS_PER_HOUR);
  const legs: JourneyLegInput[] = [
    { startAtMs: DAY_START_MS, endAtMs: DAY_START_MS + circuitMs, fromKm: 0, toKm: total },
  ];
  return buildJourney(route, legs, true);
}

function resolveScenarioVessel(seed: ScenarioVesselSeed): SimVessel {
  const route = buildRoute(seed.waypoints);
  return {
    id: seed.id,
    imo: seed.imo,
    name: seed.name,
    type: seed.type,
    speed: seed.speed,
    status: seed.status,
    route,
    startProgressKm: route.cumKm[seed.startIndex],
    pattern: seed.pattern,
    pingPong: seed.pingPong ?? true,
  };
}

/** Build one generated vessel from its spec. */
function buildGeneratedVessel(spec: NewVesselSpec, index: number, usedNames: Set<string>): SimVessel {
  const params = fleetParams(spec.id, index, spec.type, spec, usedNames);

  if (spec.routeKind === 'anchored') {
    const anchor = anchoredRoute(spec.args[0]).waypoints[0];
    // Gentle micro-drift line so anchored vessels are visibly "on the hook".
    const driftRoute = buildRoute([anchor, destinationPoint(anchor, 70, 0.6)]);
    return {
      id: spec.id,
      imo: params.imo,
      name: params.name,
      type: spec.type,
      speed: params.speedKn,
      status: 'stopped',
      route: driftRoute,
      startProgressKm: 0,
      pattern: 'anchored',
      pingPong: true,
      idleHeadingDeg: params.idleHeadingDeg,
      aisReportPeriodS: params.aisReportPeriodS,
      aisJitter: params.jitter,
      originLabel: spec.originLabel,
      destinationLabel: spec.destinationLabel,
    };
  }

  let route = buildSpecRoute(spec);
  let journey: Journey;
  if (spec.routeKind === 'fishing') {
    const f = fishingRoute(spec.args[0], spec.args[1], spec.id);
    route = f.route;
    journey = fishingJourney(route, params, f.outEndKm, f.loopEndKm);
  } else if (spec.routeKind === 'patrol') {
    journey = patrolJourney(route, params);
  } else {
    journey = merchantJourney(route, params);
  }

  const pattern: TrafficPattern =
    spec.routeKind === 'fishing'
      ? 'fishing'
      : spec.routeKind === 'patrol'
        ? 'patrol'
        : spec.routeKind === 'deep' || spec.routeKind === 'gulf'
          ? 'commercial-corridor'
          : 'coastal';

  return {
    id: spec.id,
    imo: params.imo,
    name: params.name,
    type: spec.type,
    speed: params.speedKn,
    status: 'active',
    route,
    startProgressKm: 0,
    pattern,
    pingPong: false,
    journey,
    aisReportPeriodS: params.aisReportPeriodS,
    aisJitter: params.jitter,
    originLabel: spec.originLabel,
    destinationLabel: spec.destinationLabel,
  };
}

/**
 * Generate the full deterministic fleet: the fixed scenario core followed by
 * the seeded generated traffic. Given the same seed and count this always
 * returns the same vessels in the same order.
 */
export function generateSimVessels(count = VESSEL_COUNT, seed = SIMULATION_SEED): SimVessel[] {
  if (seed !== SIMULATION_SEED) {
    // The generated fleet is authored against the fixed seed; other seeds are
    // out of scope for the demo (determinism is per-seed).
    throw new Error(`generateSimVessels only supports SIMULATION_SEED=${SIMULATION_SEED}`);
  }
  const vessels: SimVessel[] = SCENARIO_VESSELS.map(resolveScenarioVessel);
  const usedNames = new Set(vessels.map((v) => v.name));
  let index = vessels.length + 1; // scenario core occupies vsl-001..vsl-005
  for (const spec of GENERATED_SPECS) {
    if (vessels.length >= count) break;
    vessels.push(buildGeneratedVessel(spec, index, usedNames));
    index++;
  }
  return vessels;
}
