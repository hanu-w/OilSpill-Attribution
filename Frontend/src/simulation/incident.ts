import type { IncidentStatus, OilSpillIncident } from '@/types/incident';

/**
 * Primary incident definition and scenario phase machine.
 *
 * The whole INC-2026-001 attribution scenario is derived from simulated time.
 * `scenarioPhaseAt` is a pure function of `simTimeMs` — no React, store, or
 * per-frame state — so a Timeline (or a determinism test) can ask "what is the
 * scenario doing at time T?" and always get the same answer for the same T.
 *
 * Progression (anchored to the mock timeline in `data/mock/incidents.ts`):
 *
 *   normal             t < 07:42   — traffic proceeds, nothing detected
 *   spill-detected     07:42–08:00 — SAR detection; initial extent established
 *   correlating        08:00–08:41 — slick expands/drifts; AIS correlation runs
 *   attribution-ready  ≥ 08:41    — candidates ranked, investigation ready
 */

export const INCIDENT_ID = 'INC-2026-001';
export const DETECTED_AT_ISO = '2026-08-27T07:42:00Z';
export const DETECTION_MS = Date.parse(DETECTED_AT_ISO);

/** When the slick leaves its initial observed extent and starts drifting. */
export const DRIFT_START_MS = Date.parse('2026-08-27T08:00:00Z');
/** When AIS correlation completes and candidates are ranked. */
export const ATTRIBUTION_MS = Date.parse('2026-08-27T08:41:00Z');

export type ScenarioPhase = 'normal' | 'spill-detected' | 'correlating' | 'attribution-ready';

export function scenarioPhaseAt(simTimeMs: number): ScenarioPhase {
  if (simTimeMs < DETECTION_MS) return 'normal';
  if (simTimeMs < DRIFT_START_MS) return 'spill-detected';
  if (simTimeMs < ATTRIBUTION_MS) return 'correlating';
  return 'attribution-ready';
}

/** Incident status the phase machine reports to the UI. */
export function incidentStatusForPhase(phase: ScenarioPhase): IncidentStatus {
  return phase === 'correlating' || phase === 'attribution-ready' ? 'investigating' : 'detected';
}

/**
 * Detection confidence grows as evidence accumulates: a provisional SAR hit is
 * less certain than a spill corroborated by AIS correlation.
 */
export function detectionConfidence(phase: ScenarioPhase): number {
  return phase === 'correlating' || phase === 'attribution-ready' ? 0.92 : 0.85;
}

/**
 * Fixed incident definition (the detection geometry is computed per simulated
 * timestamp by `spillGeometry`). `areaKm2` here is the nominal value used
 * before any computed spill extent is available.
 */
export const SCENARIO_INCIDENT_BASE: OilSpillIncident = {
  id: INCIDENT_ID,
  detectedAt: DETECTED_AT_ISO,
  location: { lat: 22.514, lng: 69.554 },
  areaKm2: 18.6,
  confidence: 0.92,
  severity: 'high',
  source: 'sar',
  status: 'investigating',
};
