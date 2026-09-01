import { destinationPoint } from './geo';
import { SCENARIO_START_MS, vesselStateAt } from './kinematics';
import type { VesselKinematicState } from './kinematics';
import { hashString, mulberry32 } from './rng';
import type { SimVessel } from './types';

/**
 * AIS-like observation realism.
 *
 * Live AIS positions are *reported*, not measured: a vessel's broadcast
 * position, heading and speed all carry small deterministic errors that vary
 * from report to report, and reports arrive at irregular intervals. This
 * module derives those errors purely from the seeded RNG — no Math.random —
 * so the world stays reproducible while looking like real coastal AIS.
 *
 * Scoring/candidate ranking deliberately uses the jitter-free
 * `vesselStateAt`; jitter is applied only where humans look (live positions,
 * trails).
 */

/** Index of the AIS report window containing `t` (stable step function). */
export function reportIndexOf(def: SimVessel, t: number): number {
  const periodS = def.aisReportPeriodS ?? 1200;
  return Math.floor((t - SCENARIO_START_MS) / (periodS * 1000));
}

/**
 * Observed state at `t`: pure kinematic state plus per-report deterministic
 * jitter. Anchored/stopped vessels report their held position cleanly.
 */
export function observedStateAt(def: SimVessel, t: number): VesselKinematicState {
  const base = vesselStateAt(def, t);
  const jitter = def.aisJitter;
  if (!jitter || def.status === 'stopped') {
    return base;
  }

  // Per-vessel, per-report RNG: (vessel, report index) → stable jitter.
  const idx = reportIndexOf(def, t);
  const rng = mulberry32(hashString(`${def.id}:${idx}`));

  // Position: nudge forward along the true heading, plus a small lateral wobble.
  const fwdKm = rng() * jitter.radiusKm;
  const latKm = (rng() - 0.5) * 2 * jitter.radiusKm;
  const ahead = destinationPoint(base, base.heading, fwdKm);
  const jittered = destinationPoint(ahead, (base.heading + 90) % 360, latKm);

  // Heading/speed: AIS broadcasts rounded, lagging values.
  const reportedHeading = (base.heading - jitter.headingDeg * rng() + 360) % 360;
  const reportedSpeed = Math.max(0, base.speed * (1 - jitter.speedFraction * rng()));

  return {
    lat: round6(jittered.lat),
    lng: round6(jittered.lng),
    heading: Math.round(reportedHeading) % 360,
    speed: Math.round(reportedSpeed * 10) / 10,
  };
}

function round6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}
