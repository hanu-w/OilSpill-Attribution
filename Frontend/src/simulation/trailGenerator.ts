import { observedStateAt } from './aisJitter';
import { hashString, mulberry32 } from './rng';
import type { SimVessel, TrailGenOptions } from './types';
import type { VesselTrail } from '@/types/vessel';

/** Refined historical window: 32 points (~4-5h of recent track). */
const DEFAULT_POINT_COUNT = 32;
const MAX_POINT_COUNT = 48;

/**
 * Generate a deterministic historical AIS trail for a vessel, sampled
 * backwards from the current position along the vessel's own journey/route.
 *
 * The trail is geographically coherent with the vessel's actual behaviour
 * (same simulated journey as the live vessel): the points use the same
 * `observedStateAt` path as the live marker — including per-report AIS
 * jitter — so the trail tip coincides with the current reported position.
 * Sampling gaps are irregular (real AIS reports are not uniform), derived
 * deterministically per vessel and per point — no Math.random.
 *
 * Stationary (anchored) vessels return an empty trail so no degenerate
 * zero-length path is drawn.
 */
export function generateTrailPoints(
  def: SimVessel,
  atMs: number,
  options?: TrailGenOptions
): VesselTrail['points'] {
  if (def.route.totalKm <= 0 || def.status === 'stopped') {
    return [];
  }

  const count = Math.max(2, Math.min(options?.pointCount ?? DEFAULT_POINT_COUNT, MAX_POINT_COUNT));
  const baseIntervalS = options?.intervalSeconds ?? (def.aisReportPeriodS ?? 1200) * 1.5;

  const points: VesselTrail['points'] = [];
  let t = atMs;
  for (let i = 0; i < count; i++) {
    const state = observedStateAt(def, t);
    points.push({
      lat: state.lat,
      lng: state.lng,
      timestamp: new Date(t).toISOString(),
      speed: state.speed,
      heading: state.heading,
    });
    // Irregular per-point gap (oldest samples get progressively older).
    const rng = mulberry32(hashString(`${def.id}:trail:${i}`));
    t -= Math.round(baseIntervalS * (0.6 + 0.8 * rng())) * 1000;
  }
  // Oldest → newest (newest = current reported position at index count-1).
  points.reverse();
  return points;
}
