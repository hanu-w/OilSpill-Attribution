/**
 * Deterministic maritime simulation for OceanWatch mock mode.
 *
 * The simulation owns the mock vessel world: a seeded fleet generator, a
 * centralized simulation clock, and deterministic historical trail
 * generation. It is consumed exclusively through the data provider boundary
 * (`MockDataProvider`) — UI components never touch it directly.
 */
export { SimulationEngine, simulationEngine } from './simulationEngine';
export {
  ScenarioController,
  scenarioController,
  SCENARIO_TIMELINE_START_ISO,
  SCENARIO_TIMELINE_START_MS,
  SCENARIO_TIMELINE_END_ISO,
  SCENARIO_TIMELINE_END_MS,
  SCENARIO_TIMELINE_DURATION_MS,
  DEFAULT_PLAYBACK_SPEED,
} from './scenarioController';
export type { ScenarioClockSnapshot, ScenarioListener } from './scenarioController';
export { generateSimVessels, SIMULATION_SEED, VESSEL_COUNT } from './vesselGenerator';
export { SCENARIO_START_ISO, SCENARIO_START_MS, TIME_SCALE } from './kinematics';
export type { SimVessel, TrafficPattern, TrailGenOptions } from './types';
export type { SimRoute, RoutePoint, RouteState } from './geo';
export {
  INCIDENT_ID,
  DETECTED_AT_ISO,
  DETECTION_MS,
  DRIFT_START_MS,
  ATTRIBUTION_MS,
  SCENARIO_INCIDENT_BASE,
  scenarioPhaseAt,
  incidentStatusForPhase,
  detectionConfidence,
} from './incident';
export type { ScenarioPhase } from './incident';
export { environmentAt, driftVectorAt } from './environment';
export type { DriftVector } from './environment';
export { spillStateAt, spillAreaKm2At, estimatedOrigin } from './spillGeometry';
export type { SpillGeometryData, SpillState } from './spillGeometry';
export { rankCandidates } from './candidateScoring';
export { incidentStateAt, candidatesAt, scenarioStateAt, SCENARIO_ATTRIBUTION_MS } from './scenarioRunner';
export type { IncidentView, ScenarioState } from './scenarioRunner';
