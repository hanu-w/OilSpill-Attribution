import type { OilSpillIncident, SuspectVessel } from '@/types/incident';
import type { OceanConditions } from '@/types/environment';
import type { Vessel } from '@/types/vessel';
import {
  ATTRIBUTION_MS,
  INCIDENT_ID,
  SCENARIO_INCIDENT_BASE,
  detectionConfidence,
  incidentStatusForPhase,
  scenarioPhaseAt,
  type ScenarioPhase,
} from './incident';
import { spillStateAt, type SpillState } from './spillGeometry';
import { environmentAt } from './environment';
import { rankCandidates } from './candidateScoring';
import { simulationEngine } from './simulationEngine';

/**
 * Scenario runner: the single entry point for asking "what is the INC-2026-001
 * scenario doing at simulated time T?".
 *
 * All state is derived from `simTimeMs` — phase, incident view, spill
 * geometry, environment, fleet positions and the ranked candidate list. The
 * same timestamp always yields the same state, so this is what a future
 * Timeline (or a determinism test) queries. It is independent of React and of
 * any presentation component.
 */

export interface IncidentView {
  phase: ScenarioPhase;
  /** Null before detection — there is no incident yet. */
  incident: OilSpillIncident | null;
  /** Null before detection — there is no slick yet. */
  spill: SpillState | null;
}

export interface ScenarioState extends IncidentView {
  simTimeMs: number;
  environment: OceanConditions;
  vessels: Vessel[];
  candidates: SuspectVessel[];
}

/** Incident state at a simulated time, derived from the phase machine. */
export function incidentStateAt(simTimeMs: number): IncidentView {
  const phase = scenarioPhaseAt(simTimeMs);
  if (phase === 'normal') {
    return { phase, incident: null, spill: null };
  }

  const spill = spillStateAt(simTimeMs);
  return {
    phase,
    spill,
    incident: {
      ...SCENARIO_INCIDENT_BASE,
      areaKm2: spill ? spill.areaKm2 : SCENARIO_INCIDENT_BASE.areaKm2,
      confidence: detectionConfidence(phase),
      status: incidentStatusForPhase(phase),
      geometry: spill ? spill.geometry : undefined,
    },
  };
}

/**
 * Ranked candidates for an incident. The fleet and incident are fixed, so the
 * ranking is computed once and cached; only the phase gate changes with time
 * (candidates appear once correlation begins).
 */
const candidateCache = new Map<string, SuspectVessel[]>();

export function candidatesAt(incidentId: string, simTimeMs: number): SuspectVessel[] {
  if (incidentId !== INCIDENT_ID) return [];
  const phase = scenarioPhaseAt(simTimeMs);
  if (phase !== 'correlating' && phase !== 'attribution-ready') return [];

  const cached = candidateCache.get(incidentId);
  if (cached) return cached;

  const ranked = rankCandidates(SCENARIO_INCIDENT_BASE, simulationEngine.vessels);
  candidateCache.set(incidentId, ranked);
  return ranked;
}

/** Full scenario state at a simulated time (timeline-addressable). */
export function scenarioStateAt(simTimeMs: number): ScenarioState {
  const view = incidentStateAt(simTimeMs);
  return {
    simTimeMs,
    ...view,
    environment: environmentAt(simTimeMs),
    vessels: simulationEngine.getVessels(simTimeMs),
    candidates: candidatesAt(INCIDENT_ID, simTimeMs),
  };
}

/** Simulated time at which the scenario first reaches attribution-ready. */
export const SCENARIO_ATTRIBUTION_MS = ATTRIBUTION_MS;
