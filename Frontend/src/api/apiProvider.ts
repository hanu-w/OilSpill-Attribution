import type { EnvironmentQuery, OceanConditions } from '../types/environment';
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
import { MockDataProvider } from './mockProvider';

/**
 * API-backed data provider for OceanWatch.
 *
 * This provider implements the OceanWatchDataProvider interface using
 * the FastAPI backend. Currently stubbed with mock fallback until
 * backend integration is complete.
 *
 * See AGENTS.md §3: Components never call fetch directly; they go
 * through this provider boundary.
 */
export class ApiDataProvider implements OceanWatchDataProvider {
  private mockFallback = new MockDataProvider();

  async getVessels(params?: VesselQuery): Promise<Vessel[]> {
    // TODO: Implement actual API call when backend is ready
    // Example: return apiClient.get<Vessel[]>('/api/v1/vessels', { params });
    return this.mockFallback.getVessels(params);
  }

  async getVessel(id: string): Promise<Vessel | null> {
    // TODO: Implement actual API call when backend is ready
    return this.mockFallback.getVessel(id);
  }

  async getVesselTrail(id: string, params?: TrailQuery): Promise<VesselTrail | null> {
    // TODO: Implement actual API call when backend is ready
    return this.mockFallback.getVesselTrail(id, params);
  }

  async getIncidents(params?: IncidentQuery): Promise<OilSpillIncident[]> {
    // TODO: Implement actual API call when backend is ready
    return this.mockFallback.getIncidents(params);
  }

  async getIncident(id: string): Promise<OilSpillIncident | null> {
    // TODO: Implement actual API call when backend is ready
    return this.mockFallback.getIncident(id);
  }

  async getCandidates(incidentId: string, params?: CandidatesQuery): Promise<SuspectVessel[]> {
    // TODO: Implement actual API call when backend is ready
    return this.mockFallback.getCandidates(incidentId, params);
  }

  async getTimeline(incidentId: string): Promise<TimelineEvent[]> {
    // TODO: Implement actual API call when backend is ready
    return this.mockFallback.getTimeline(incidentId);
  }

  async getEnvironment(location: GeoPoint, params?: EnvironmentQuery): Promise<OceanConditions> {
    // TODO: Implement actual API call when backend is ready
    return this.mockFallback.getEnvironment(location, params);
  }
}
