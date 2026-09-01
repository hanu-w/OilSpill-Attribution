import type { GeoPoint } from './map';

/**
 * Ocean wind conditions
 */
export interface WindConditions {
  speed: number; // m/s
  direction: number; // degrees, where the wind is coming from
}

/**
 * Ocean current conditions
 */
export interface CurrentConditions {
  speed: number; // m/s
  direction: number; // degrees, direction of flow
}

/**
 * Ambient ocean conditions at a point
 */
export interface OceanConditions {
  wind: WindConditions;
  current: CurrentConditions;
  timestamp: string;
}

/**
 * Query parameters for fetching environmental conditions
 */
export interface EnvironmentQuery {
  location?: GeoPoint;
  bbox?: [number, number, number, number];
  timestamp?: string;
}