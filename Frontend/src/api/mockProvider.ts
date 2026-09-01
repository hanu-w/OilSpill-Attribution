import { MOCK_TIMELINES } from '../data/mock/incidents';
import {
  INCIDENT_ID,
  simulationEngine,
  incidentStateAt,
  candidatesAt,
  environmentAt,
} from '../simulation';
import type { OceanConditions, EnvironmentQuery } from '../types/environment';
import type {
  CandidatesQuery,
  IncidentQuery,
  OilSpillIncident,
  SuspectVessel,
  TimelineEvent,
} from '../types/incident';
import type { GeoPoint } from '../types/map';
import type { TrailQuery, Vessel, VesselQuery, VesselTrail } from '../types/vessel';
import type { OceanWatchDataProvider } from './provider';

/**
 * Deterministic mock data provider.
 *
 * This is a permanent development and demo capability (see AGENTS.md §4),
 * not temporary throwaway code. Vessels and trails come from the centralized
 * `SimulationEngine`, which advances a single deterministic simulation clock.
 * Incidents, candidates and environment are derived from the same simulated
 * time by the INC-2026-001 scenario runner, so the whole world is coherent:
 * the slick the map draws, the vessels passing through it, and the ranked
 * candidate list all describe the same simulated moment. No direct network
 * access; every value is a pure function of (seed, simulated time).
 */
export class MockDataProvider implements OceanWatchDataProvider {
  private readonly timelines: Record<string, TimelineEvent[]>;

  constructor() {
    this.timelines = structuredClone(MOCK_TIMELINES);
  }

  async getVessels(params?: VesselQuery): Promise<Vessel[]> {
    const atMs = params?.timestamp ? Date.parse(params.timestamp) : undefined;
    let result = simulationEngine.getVessels(atMs);

    if (params?.types && params.types.length > 0) {
      const types = new Set(params.types);
      result = result.filter((v) => types.has(v.type));
    }

    if (params?.limit !== undefined) {
      result = result.slice(0, params.limit);
    }

    return result;
  }

  async getVessel(id: string): Promise<Vessel | null> {
    return simulationEngine.getVessel(id);
  }

  async getVesselTrail(id: string, params?: TrailQuery): Promise<VesselTrail | null> {
    const trail = simulationEngine.getVesselTrail(id);
    if (!trail) return null;

    let points = trail.points;
    if (params?.startTime) {
      points = points.filter((p) => p.timestamp >= (params.startTime as string));
    }
    if (params?.endTime) {
      points = points.filter((p) => p.timestamp <= (params.endTime as string));
    }
    if (params?.maxPoints !== undefined) {
      points = points.slice(-(params.maxPoints as number));
    }

    return { vesselId: trail.vesselId, points };
  }

  async getIncidents(params?: IncidentQuery): Promise<OilSpillIncident[]> {
    const simTime = params?.timestamp ? Date.parse(params.timestamp) : simulationEngine.getSimTimeMs();
    const { incident } = incidentStateAt(simTime);
    let result: OilSpillIncident[] = incident ? [incident] : [];

    if (params?.status && params.status.length > 0) {
      const statuses = new Set(params.status);
      result = result.filter((i) => statuses.has(i.status));
    }

    if (params?.severity && params.severity.length > 0) {
      const severities = new Set(params.severity);
      result = result.filter((i) => severities.has(i.severity));
    }

    if (params?.limit !== undefined) {
      result = result.slice(0, params.limit);
    }

    return structuredClone(result);
  }

  async getIncident(id: string): Promise<OilSpillIncident | null> {
    if (id !== INCIDENT_ID) return null;
    const { incident } = incidentStateAt(simulationEngine.getSimTimeMs());
    return incident ? structuredClone(incident) : null;
  }

  async getCandidates(incidentId: string, params?: CandidatesQuery): Promise<SuspectVessel[]> {
    const simTime = params?.timestamp ? Date.parse(params.timestamp) : simulationEngine.getSimTimeMs();
    return structuredClone(candidatesAt(incidentId, simTime));
  }

  async getTimeline(incidentId: string): Promise<TimelineEvent[]> {
    return structuredClone(this.timelines[incidentId] ?? []);
  }

  async getEnvironment(location: GeoPoint, params?: EnvironmentQuery): Promise<OceanConditions> {
    // Location is accepted for contract compatibility; mock conditions are
    // currently uniform across the region.
    void location;
    const simTime = params?.timestamp ? Date.parse(params.timestamp) : simulationEngine.getSimTimeMs();
    return structuredClone(environmentAt(simTime));
  }
}
