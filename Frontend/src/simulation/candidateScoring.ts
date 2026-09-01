import type { Evidence, OilSpillIncident, SuspectVessel } from '@/types/incident';
import type { VesselType } from '@/types/vessel';
import type { GeoPoint } from '@/types/map';
import { DETECTION_MS } from './incident';
import { driftVectorAt } from './environment';
import { destinationPoint, distanceKm } from './geo';
import { vesselStateAt } from './kinematics';
import { simulationEngine } from './simulationEngine';
import type { SimVessel } from './types';

/**
 * Deterministic candidate scoring for the INC-2026-001 attribution.
 *
 * Every vessel in the simulated fleet is scored against the estimated release
 * region using relationships the task spec calls out — historical AIS
 * proximity to the source, distance from the estimated origin, temporal
 * compatibility with the release window, route compatibility, and movement
 * behaviour — plus a vessel-class prior (a fishing boat or patrol craft does
 * not carry the fuel a tens-of-km² slick implies). The result is a weighted
 * sum with no unexplained percentages: each score component is documented
 * below and reflected in the candidate's evidence list.
 *
 * The final ranking is NOT hard-coded. It falls out of the model applied to
 * the live seeded fleet, so the strongest candidate wins for reasons that are
 * visible in its evidence.
 */

// ---------------------------------------------------------------------------
// Release window (before detection, when a discharge would have occurred).
// ---------------------------------------------------------------------------

const RELEASE_START_MS = DETECTION_MS - 90 * 60_000; // 06:12Z
const RELEASE_END_MS = DETECTION_MS - 15 * 60_000; // 07:27Z
const RELEASE_CENTER_MS = DETECTION_MS - 50 * 60_000; // 06:52Z
/** Temporal correlation reaches 0 at ±110 min from the window centre. */
const TEMPORAL_HALF_SPAN_MS = 110 * 60_000;
/** Sampling step over the release window. */
const SAMPLE_STEP_MS = 6 * 60_000;

/** Vessels are considered "in the area" when within this radius of the source. */
const NEAR_RADIUS_KM = 25;
/** Distance correlation: 0.5 at 25 km, ~0.2 at 50 km. */
const D50_KM = 25;

/** Behavioural peak: slow-but-underway transit, consistent with a discharge. */
const BEHAVIORAL_PEAK_KN = 7.5;
const BEHAVIORAL_SPREAD = 40;

/** Back-track to the middle of the release window (detection − 50 min). */
const RELEASE_BACKTRACK_H = 50 / 60;
/** Corridor length used for drift-coherence: ~12 h of drift. */
const CORRIDOR_HOURS = 12;

/**
 * A-priori plausibility that a vessel class could be the source of a large
 * crude/bunker slick. Tanker > merchant > small craft. These are deliberately
 * discriminative so a patrol craft orbiting right next to the slick (the
 * geometrically closest vessel in the fleet) still ranks below merchant
 * traffic that actually carries the fuel an 18 km² slick implies.
 */
const TYPE_PRIOR: Record<VesselType, number> = {
  tanker: 1.0,
  cargo: 0.85,
  container: 0.7,
  other: 0.3,
  fishing: 0.05,
  patrol: 0.03,
};

/** Factor weights (sum = 1). */
const WEIGHTS = { distance: 0.28, temporal: 0.2, behavioral: 0.2, route: 0.12, type: 0.2 };

/** Scale that turns the "time near source" fraction into a route score. */
const ROUTE_SCALE = 1.8;
/**
 * Number of candidates returned, strongest first: the primary suspect plus a
 * handful of plausible merchant alternatives. Patrol/fishing craft score below
 * this and remain part of the (irrelevant) surrounding fleet.
 */
const CANDIDATE_LIMIT = 4;

interface ScoredCandidate {
  vessel: SimVessel;
  matchScore: number;
  distance: number;
  temporal: number;
  behavioral: number;
  route: number;
  minDistKm: number;
  minAtMs: number;
  speedAtMinKn: number;
  timeNearFraction: number;
  corridorDistKm: number;
}

function distanceCorrelation(minKm: number): number {
  return 1 / (1 + Math.pow(minKm / D50_KM, 2));
}

function temporalCorrelation(minAtMs: number): number {
  const off = Math.abs(minAtMs - RELEASE_CENTER_MS) / TEMPORAL_HALF_SPAN_MS;
  return Math.max(0, 1 - off);
}

function behavioralCorrelation(speedKn: number): number {
  return Math.exp(-Math.pow(speedKn - BEHAVIORAL_PEAK_KN, 2) / BEHAVIORAL_SPREAD);
}

function routeCorrelation(timeNearFraction: number): number {
  return Math.min(1, timeNearFraction * ROUTE_SCALE);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Distance from a point to the drift-corridor segment — the path the slick
 * travelled from its release point along the drift vector.
 */
function distanceToCorridorKm(pos: { lat: number; lng: number }, corridor: [GeoPoint, GeoPoint]): number {
  const [a, b] = corridor;
  const dLat = b.lat - a.lat;
  const dLng = b.lng - a.lng;
  const t = Math.max(
    0,
    Math.min(1, ((pos.lat - a.lat) * dLat + (pos.lng - a.lng) * dLng) / (dLat * dLat + dLng * dLng))
  );
  const foot = { lat: a.lat + t * dLat, lng: a.lng + t * dLng };
  return distanceKm(pos, foot);
}

/** Sample one vessel over the release window and derive its scoring factors. */
function scoreVessel(vessel: SimVessel, source: GeoPoint, corridor: [GeoPoint, GeoPoint]): ScoredCandidate {
  let minDistKm = Infinity;
  let minAtMs = RELEASE_START_MS;
  let speedAtMinKn = 0;
  let nearCount = 0;
  let totalSamples = 0;
  let minCorridorDistKm = Infinity;

  for (let t = RELEASE_START_MS; t <= RELEASE_END_MS; t += SAMPLE_STEP_MS) {
    const state = vesselStateAt(vessel, t);
    const d = distanceKm(source, state);
    totalSamples++;
    if (d <= NEAR_RADIUS_KM) nearCount++;

    const corridorD = distanceToCorridorKm(state, corridor);
    if (corridorD < minCorridorDistKm) minCorridorDistKm = corridorD;

    if (d < minDistKm) {
      minDistKm = d;
      minAtMs = t;
      speedAtMinKn = state.speed;
    }
  }

  const timeNearFraction = totalSamples > 0 ? nearCount / totalSamples : 0;

  return {
    vessel,
    matchScore: 0,
    distance: distanceCorrelation(minDistKm),
    temporal: temporalCorrelation(minAtMs),
    behavioral: behavioralCorrelation(speedAtMinKn),
    route: routeCorrelation(timeNearFraction),
    minDistKm,
    minAtMs,
    speedAtMinKn,
    timeNearFraction,
    corridorDistKm: minCorridorDistKm,
  };
}

/** Format a simulated timestamp for human-readable evidence text (HH:MM). */
function formatTime(ms: number): string {
  return new Date(ms).toISOString().slice(11, 16);
}

function releaseWindowLabel(): string {
  return `${formatTime(RELEASE_START_MS)}–${formatTime(RELEASE_END_MS)} UTC`;
}

function behaviorDescription(speedKn: number): string {
  if (speedKn <= 0.5) {
    return 'Vessel was stopped/drifting at closest approach — no underway discharge trajectory matches the slick.';
  }
  if (speedKn < 5) {
    return `Slow transit at closest approach (${speedKn.toFixed(1)} kn); low-speed station-keeping is only weakly consistent with a discharge.`;
  }
  if (speedKn <= 11) {
    return `Transit speed at closest approach (${speedKn.toFixed(1)} kn) is consistent with a slow discharge maneuver underway.`;
  }
  return `Fast transit at closest approach (${speedKn.toFixed(1)} kn); high speed is inconsistent with an ongoing discharge.`;
}

function routeDescription(f: ScoredCandidate): string {
  const near = Math.round(f.timeNearFraction * 100);
  if (f.timeNearFraction >= 0.6) {
    return `Track crosses the release region — ${near}% of sampled positions within ${NEAR_RADIUS_KM} km of the estimated source.`;
  }
  if (f.timeNearFraction >= 0.2) {
    return `Track clips the outer release region — ${near}% of sampled positions within ${NEAR_RADIUS_KM} km of the estimated source.`;
  }
  return `Track stays clear of the release region — only ${near}% of sampled positions within ${NEAR_RADIUS_KM} km of the source.`;
}

function buildEvidence(f: ScoredCandidate): Evidence[] {
  const driftCoherence = 1 / (1 + Math.pow(f.corridorDistKm / 15, 2));

  return [
    {
      type: 'distance',
      description: `Closest approach to the estimated release point: ${f.minDistKm.toFixed(1)} km at ${formatTime(f.minAtMs)}Z.`,
      score: round3(f.distance),
      supportingData: { minDistKm: round1(f.minDistKm), minAtMs: f.minAtMs },
    },
    {
      type: 'temporal',
      description: `Closest approach fell ${Math.round(Math.abs(f.minAtMs - RELEASE_CENTER_MS) / 60_000)} min from the release-window centre, inside the window (${releaseWindowLabel()}).`,
      score: round3(f.temporal),
      supportingData: { minAtMs: f.minAtMs, releaseStartMs: RELEASE_START_MS, releaseEndMs: RELEASE_END_MS },
    },
    {
      type: 'route',
      description: routeDescription(f),
      score: round3(f.route),
      supportingData: { timeNearFraction: round3(f.timeNearFraction), nearRadiusKm: NEAR_RADIUS_KM },
    },
    {
      type: 'behavioral',
      description: behaviorDescription(f.speedAtMinKn),
      score: round3(f.behavioral),
      supportingData: { speedAtMinKn: round1(f.speedAtMinKn), minAtMs: f.minAtMs },
    },
    {
      type: 'environmental',
      description: `E/ENE wind reinforcing the WSW ebb outflow drives the slick down the Gulf of Kutch toward the mouth; the vessel's closest track lies ${f.corridorDistKm.toFixed(1)} km from that drift corridor.`,
      score: round3(driftCoherence),
      supportingData: { corridorDistKm: round1(f.corridorDistKm) },
    },
  ];
}

/**
 * Score the fleet against an incident and return candidates ordered by
 * descending match score. Pure given a fleet: no RNG, no wall-clock time.
 * Defaults to the live seeded fleet (the same vessels the map renders), so
 * candidates always come from the fleet the user sees.
 */
export function rankCandidates(
  incident: OilSpillIncident,
  fleet: SimVessel[] = simulationEngine.vessels,
  limit: number = CANDIDATE_LIMIT
): SuspectVessel[] {
  const drift = driftVectorAt(DETECTION_MS);

  // Estimated release point: back-tracked up-drift from the incident location.
  const source: GeoPoint = destinationPoint(
    incident.location,
    (drift.bearingDeg + 180) % 360,
    drift.speedKmH * RELEASE_BACKTRACK_H
  );

  // Drift corridor: the ~12 h path the slick travelled from its release point.
  const corridor: [GeoPoint, GeoPoint] = [
    source,
    destinationPoint(source, drift.bearingDeg, drift.speedKmH * CORRIDOR_HOURS),
  ];

  const ranked: ScoredCandidate[] = fleet
    .map((vessel) => scoreVessel(vessel, source, corridor))
    .map((f) => {
      const type = TYPE_PRIOR[f.vessel.type] ?? TYPE_PRIOR.other;
      const matchScore =
        WEIGHTS.distance * f.distance +
        WEIGHTS.temporal * f.temporal +
        WEIGHTS.behavioral * f.behavioral +
        WEIGHTS.route * f.route +
        WEIGHTS.type * type;
      return { ...f, matchScore };
    })
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);

  return ranked.map((f) => ({
    vesselId: f.vessel.id,
    matchScore: round3(f.matchScore),
    distanceFromOriginKm: round1(f.minDistKm),
    temporalCorrelation: round3(f.temporal),
    routeCorrelation: round3(f.route),
    behavioralCorrelation: round3(f.behavioral),
    evidence: buildEvidence(f),
  }));
}
