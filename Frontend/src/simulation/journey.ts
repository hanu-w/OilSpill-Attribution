import type { SimRoute } from './geo';
import { routeLengthKm } from './geo';

/**
 * Journey model — the "behavioral" layer between a vessel definition and its
 * position. A `Journey` is a timeline of legs over the vessel's route; each leg
 * advances linear route progress between two timestamps. This produces the
 * realistic behaviors the task requires — cargo slow-downs near destination,
 * fishing transits → loitering circuits, patrol circuits, anchored holds —
 * all deterministically derived from the seeded generator (no randomness at
 * state time).
 *
 * Positions are computed with `journeyProgressAt` and fed to the kinematics
 * `vesselStateAt` path; AIS jitter is applied separately (see `aisJitter.ts`).
 */

/** Seconds→km conversion for knots. Re-exported from kinematics for compatibility. */
export const KNOT_TO_KM_S = 1.852 / 3600;

/** Convert a speed in knots to km per millisecond (the sim's internal unit). */
export function knotsToKmPerMs(kn: number): number {
  return (kn * 1.852) / 3600 / 1000;
}

export interface JourneyLeg {
  /** Leg start time (ms since epoch). */
  startAtMs: number;
  /** Leg end time (ms since epoch). */
  endAtMs: number;
  /** Route progress (km) at leg start. */
  fromKm: number;
  /** Route progress (km) at leg end. */
  toKm: number;
}

export interface Journey {
  /** Route the journey runs over. May repeat (out-and-back / circuits). */
  route: SimRoute;
  /** Ordered legs; the journey is `totalDurationMs` long and repeats. */
  legs: JourneyLeg[];
  /** Total duration of one full journey cycle (ms). */
  totalDurationMs: number;
  /** Route progress at journey cycle start (km). */
  startKm: number;
  /** Whether the journey loops (repeats) when time exceeds totalDurationMs. */
  loops: boolean;
}

const MS_PER_HOUR = 3_600_000;
const MS_PER_MIN = 60_000;

/** Wrap a time into the journey cycle window. */
export function journeyPhaseMs(j: Journey, t: number): number {
  if (!j.loops || j.totalDurationMs <= 0) return t;
  const base = j.legs[0].startAtMs;
  return base + ((t - base) % j.totalDurationMs + j.totalDurationMs) % j.totalDurationMs;
}

/**
 * Route progress (km) along the journey at time `t`. Pure and deterministic:
 * same journey + same time ⇒ same result.
 */
export function journeyProgressAt(j: Journey, t: number): number {
  const legs = j.legs;
  if (legs.length === 0) return 0;
  const tt = journeyPhaseMs(j, t);
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (tt <= leg.endAtMs || i === legs.length - 1) {
      const span = leg.endAtMs - leg.startAtMs;
      if (span <= 0) return leg.fromKm;
      const frac = Math.max(0, Math.min(1, (tt - leg.startAtMs) / span));
      return leg.fromKm + (leg.toKm - leg.fromKm) * frac;
    }
  }
  return legs[legs.length - 1].toKm;
}

/**
 * Speed in knots at time `t` (from the current leg's pace). Used for realistic
 * speed reporting and behavioral scoring; near-zero on hold legs.
 */
export function journeySpeedKnAt(j: Journey, t: number): number {
  const legs = j.legs;
  if (legs.length === 0) return 0;
  const tt = journeyPhaseMs(j, t);
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (tt <= leg.endAtMs || i === legs.length - 1) {
      const span = leg.endAtMs - leg.startAtMs;
      if (span <= 0) return 0;
      // km per millisecond → km per hour → knots.
      const kmPerMs = Math.abs(leg.toKm - leg.fromKm) / span;
      return (kmPerMs * MS_PER_HOUR) / 1.852;
    }
  }
  return 0;
}

export interface JourneyLegInput {
  startAtMs: number;
  endAtMs: number;
  fromKm: number;
  toKm: number;
}

/**
 * Build a full journey from a route and a list of `{start, end, fromKm, toKm}`
 * specs. The route's full length is measured once; the caller passes km offsets
 * that must be ≤ route length.
 */
export function buildJourney(route: SimRoute, specs: JourneyLegInput[], loops: boolean): Journey {
  const legs: JourneyLeg[] = specs.map((s) => ({
    startAtMs: s.startAtMs,
    endAtMs: s.endAtMs,
    fromKm: s.fromKm,
    toKm: s.toKm,
  }));
  const totalDurationMs = specs.length ? specs[specs.length - 1].endAtMs - specs[0].startAtMs : 0;
  return { route, legs, loops, totalDurationMs, startKm: specs.length ? specs[0].fromKm : 0 };
}

/**
 * Convenience: build a legs array for a simple "transit out, transit back"
 * (out-and-back) journey from an origin to a destination offset.
 *
 * @param route     the route (origin approach → destination approach)
 * @param t0        departure time (ms)
 * @param legSpeedKn speed during transit legs
 * @param dwellMs   time spent at the destination (return is `dwellMs` later)
 */
export function buildOutAndBackJourney(
  route: SimRoute,
  t0: number,
  legSpeedKn: number,
  dwellMs: number,
  loops: boolean
): Journey {
  const total = routeLengthKm(route);
  const outMs = Math.round((total / 2 / (legSpeedKn * 1.852)) * MS_PER_HOUR);
  const backMs = outMs;
  const specs: JourneyLegInput[] = [
    { startAtMs: t0, endAtMs: t0 + outMs, fromKm: 0, toKm: total },
    { startAtMs: t0 + outMs, endAtMs: t0 + outMs + dwellMs, fromKm: total, toKm: total },
    { startAtMs: t0 + outMs + dwellMs, endAtMs: t0 + outMs + dwellMs + backMs, fromKm: total, toKm: 0 },
  ];
  return buildJourney(route, specs, loops);
}

/**
 * Convenience: a fishing journey — transit out, reach the ground, drift/loiter
 * in a slow circuit, then transit back. The loiter leg runs at a crawl.
 */
export function buildFishingJourney(
  route: SimRoute,
  t0: number,
  transitKn: number,
  loiterKn: number,
  groundHours: number,
  loops: boolean
): Journey {
  const total = routeLengthKm(route);
  const groundRatio = Math.min(0.9, Math.max(0.3, groundHours / (groundHours + 2)));
  const outMs = Math.round((total * (1 - groundRatio) / 2 / (transitKn * 1.852)) * MS_PER_HOUR);
  const backMs = outMs;
  const loiterMs = Math.round((total * groundRatio / (loiterKn * 1.852)) * MS_PER_HOUR);
  const specs: JourneyLegInput[] = [
    { startAtMs: t0, endAtMs: t0 + outMs, fromKm: 0, toKm: total * (1 - groundRatio) / 2 },
    { startAtMs: t0 + outMs, endAtMs: t0 + outMs + loiterMs, fromKm: total * (1 - groundRatio) / 2, toKm: total * (1 + groundRatio) / 2 },
    { startAtMs: t0 + outMs + loiterMs, endAtMs: t0 + outMs + loiterMs + backMs, fromKm: total * (1 + groundRatio) / 2, toKm: 0 },
  ];
  return buildJourney(route, specs, loops);
}

export { MS_PER_HOUR, MS_PER_MIN };
