import type { GeoPoint } from './map';

/**
 * Vessel types as defined in the OceanWatch domain model
 */
export type VesselType = 'tanker' | 'cargo' | 'container' | 'fishing' | 'patrol' | 'other';

/**
 * Vessel operational status
 */
export type VesselStatus = 'active' | 'stopped' | 'unknown';

/**
 * Core vessel domain model
 */
export interface Vessel {
  id: string;
  imo: string;
  name: string;
  type: VesselType;
  position: GeoPoint;
  heading: number;
  speed: number;
  lastUpdated: string;
  status: VesselStatus;
  modelType?: string;
}

/**
 * Vessel trail with historical positions
 */
export interface VesselTrail {
  vesselId: string;
  points: Array<{
    lat: number;
    lng: number;
    timestamp: string;
    speed?: number;
    heading?: number;
  }>;
}

/**
 * Query parameters for fetching vessels
 */
export interface VesselQuery {
  bbox?: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  zoom?: number;
  timestamp?: string;
  types?: VesselType[];
  limit?: number;
}

/**
 * Query parameters for fetching vessel trails
 */
export interface TrailQuery {
  startTime?: string;
  endTime?: string;
  maxPoints?: number;
}