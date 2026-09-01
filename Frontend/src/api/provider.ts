import type { OceanConditions, EnvironmentQuery } from '../types/environment';
import type {
  CandidatesQuery,
  IncidentQuery,
  OilSpillIncident,
  SuspectVessel,
  TimelineEvent,
} from '../types/incident';
import type { GeoPoint, MapViewport } from '../types/map';
import type { TrailQuery, Vessel, VesselQuery, VesselTrail } from '../types/vessel';

/**
 * The frontend owns this contract.
 *
 * UI components consume domain models through this interface only; they
 * never talk directly to FastAPI. Implementations:
 *   - MockDataProvider (permanent dev/demo capability)
 *   - ApiDataProvider (backend integration)
 */
export interface OceanWatchDataProvider {
  getVessels(params?: VesselQuery): Promise<Vessel[]>;
  getVessel(id: string): Promise<Vessel | null>;
  getVesselTrail(id: string, params?: TrailQuery): Promise<VesselTrail | null>;

  getIncidents(params?: IncidentQuery): Promise<OilSpillIncident[]>;
  getIncident(id: string): Promise<OilSpillIncident | null>;
  getCandidates(incidentId: string, params?: CandidatesQuery): Promise<SuspectVessel[]>;

  getTimeline(incidentId: string): Promise<TimelineEvent[]>;

  getEnvironment(location: GeoPoint, params?: EnvironmentQuery): Promise<OceanConditions>;
}

/**
 * Convenience re-export so feature code imports the interface from one place.
 */
export type { GeoPoint, MapViewport };