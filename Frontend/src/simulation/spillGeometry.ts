import { DETECTION_MS, DRIFT_START_MS, SCENARIO_INCIDENT_BASE } from './incident';
import { driftVectorAt, type DriftVector } from './environment';
import { destinationPoint } from './geo';
import { mulberry32, randomRange } from './rng';
import type { GeoPoint } from '@/types/map';

/**
 * Deterministic oil-spill geometry and progression.
 *
 * The slick is an organic polygon whose shape is fixed by a seed, whose area
 * grows logistically after detection, and whose centroid drifts with the
 * wind+current drift vector. Everything is a pure function of simulated time
 * and is cached per simulated minute, so the geometry is stable across renders
 * within the same simulated minute and identical across runs for the same
 * timestamp. The estimated release point is back-tracked up-drift from the
 * detected location, which is what connects the slick to historical vessel
 * tracks (see `candidateScoring`).
 */

/** Fixed seed shaping the organic slick outline. */
const GEOMETRY_SEED = 3_113_419;

/** The detected spill location (SAR observation). */
const INCIDENT_LOCATION: GeoPoint = SCENARIO_INCIDENT_BASE.location;

/**
 * Reference drift computed once at detection. Using a fixed vector for the
 * whole progression keeps the back-track and the drift path self-consistent
 * and easy to reason about.
 */
const REFERENCE_DRIFT: DriftVector = driftVectorAt(DETECTION_MS);

/** Area growth parameters (logistic). */
const BASE_AREA_KM2 = 6.2;
const AREA_GAIN_KM2 = 19.8;
const AREA_TAU_MIN = 90;
const AREA_CAP_KM2 = 26;

/** Back-track to the middle of the release window (detection − 50 min). */
const RELEASE_BACKTRACK_H = 50 / 60;

const VERTEX_COUNT = 44;
const KM_PER_DEG_LAT = 111.32;

/** Shape harmonics produce the irregular, non-circular outline. */
interface ShapeHarmonic {
  k: number;
  amp: number;
  phase: number;
}

const SHAPE_HARMONICS: ShapeHarmonic[] = (() => {
  const rng = mulberry32(GEOMETRY_SEED);
  return [2, 3, 4, 5, 6].map((k) => ({
    k,
    amp: randomRange(rng, -0.09, 0.09),
    phase: randomRange(rng, 0, Math.PI * 2),
  }));
})();

/** Radial multiplier for a given angle (radians); clamped so the shape never pinches. */
function radialFactor(angleRad: number): number {
  let r = 1;
  for (const h of SHAPE_HARMONICS) {
    r += h.amp * Math.sin(h.k * angleRad + h.phase);
  }
  return Math.max(0.55, r);
}

export interface SpillGeometryData {
  /** GeoJSON-compatible polygon rings ([lng, lat][]). */
  observedExtent: number[][][];
  /** Closed boundary ring ([lng, lat][]) consumed by the map layer. */
  boundary: number[][];
  /** Estimated release point, back-tracked up-drift from detection. */
  origin: GeoPoint;
  /** Current slick centroid (detection point + accumulated drift). */
  centroid: GeoPoint;
  areaKm2: number;
  /** Reference drift used for the whole progression. */
  drift: { speedKmH: number; bearingDeg: number };
}

export interface SpillState {
  geometry: SpillGeometryData;
  areaKm2: number;
  growthStage: 'expanding' | 'drifting' | 'saturated';
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Logistic area growth after detection, km². */
export function spillAreaKm2At(simTimeMs: number): number {
  const elapsedMin = (simTimeMs - DETECTION_MS) / 60_000;
  if (elapsedMin < 0) return 0;
  const growth = 1 - Math.exp(-elapsedMin / AREA_TAU_MIN);
  return Math.min(BASE_AREA_KM2 + AREA_GAIN_KM2 * growth, AREA_CAP_KM2);
}

/** Slick centroid: detection point displaced by the drift vector. */
function centroidAt(simTimeMs: number): GeoPoint {
  const elapsedH = (simTimeMs - DETECTION_MS) / 3_600_000;
  if (elapsedH <= 0) return INCIDENT_LOCATION;
  return destinationPoint(INCIDENT_LOCATION, REFERENCE_DRIFT.bearingDeg, REFERENCE_DRIFT.speedKmH * elapsedH);
}

/**
 * Estimated release point: where the slick most plausibly entered the water,
 * back-tracked up-drift from the detection point along the drift vector.
 */
export function estimatedOrigin(): GeoPoint {
  return destinationPoint(
    INCIDENT_LOCATION,
    (REFERENCE_DRIFT.bearingDeg + 180) % 360,
    REFERENCE_DRIFT.speedKmH * RELEASE_BACKTRACK_H
  );
}

/** Organic boundary ring centred on `centroid` with a given radius (km). */
function buildBoundary(centroid: GeoPoint, radiusKm: number): number[][] {
  const lngPerKm = 1 / (KM_PER_DEG_LAT * Math.cos((centroid.lat * Math.PI) / 180));
  const latPerKm = 1 / KM_PER_DEG_LAT;
  const ring: number[][] = [];
  for (let i = 0; i < VERTEX_COUNT; i++) {
    const angle = (i / VERTEX_COUNT) * Math.PI * 2;
    const r = radialFactor(angle) * radiusKm;
    ring.push([
      centroid.lng + Math.cos(angle) * r * lngPerKm,
      centroid.lat + Math.sin(angle) * r * latPerKm,
    ]);
  }
  ring.push(ring[0]);
  return ring;
}

function growthStageAt(simTimeMs: number): SpillState['growthStage'] {
  if (simTimeMs < DRIFT_START_MS) return 'expanding';
  return spillAreaKm2At(simTimeMs) >= AREA_CAP_KM2 * 0.9 ? 'saturated' : 'drifting';
}

/**
 * Cache keyed by simulated minute so the geometry arrays are stable across
 * repeated calls (e.g. the 300 ms provider poll) within one simulated minute.
 */
const BUCKET_MS = 60_000;
const spillCache = new Map<number, SpillState>();

/**
 * Spill state at a simulated timestamp. Returns null before detection (there
 * is no slick yet). Deterministic: same timestamp ⇒ same geometry, area,
 * centroid and origin.
 */
export function spillStateAt(simTimeMs: number): SpillState | null {
  if (simTimeMs < DETECTION_MS) return null;

  const bucket = Math.floor(simTimeMs / BUCKET_MS);
  const cached = spillCache.get(bucket);
  if (cached) return cached;

  const areaKm2 = round1(spillAreaKm2At(simTimeMs));
  const centroid = centroidAt(simTimeMs);
  const radiusKm = Math.sqrt(areaKm2 / Math.PI);
  const boundary = buildBoundary(centroid, radiusKm);

  const state: SpillState = {
    areaKm2,
    growthStage: growthStageAt(simTimeMs),
    geometry: {
      observedExtent: [boundary],
      boundary,
      origin: estimatedOrigin(),
      centroid,
      areaKm2,
      drift: { speedKmH: round1(REFERENCE_DRIFT.speedKmH), bearingDeg: REFERENCE_DRIFT.bearingDeg },
    },
  };
  spillCache.set(bucket, state);
  return state;
}
