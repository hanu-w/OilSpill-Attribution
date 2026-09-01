/**
 * Geographic point
 */
export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * Map viewport state
 */
export interface MapViewport {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch?: number;
  bearing?: number;
}

/**
 * Layer identifiers that can be toggled on the map
 */
export type MapLayerId =
  | 'vessels'
  | 'vesselTrails'
  | 'oilSpills'
  | 'oceanCurrents'
  | 'windFlow'
  | 'eezBoundaries'
  | 'shippingLanes'
  | 'investigationPaths';

export type LayerVisibility = Record<MapLayerId, boolean>;

/**
 * Map coordinate bounds as [minLng, minLat, maxLng, maxLat]
 */
export type Bounds = [number, number, number, number];

/**
 * Terrain rendering mode for MapLibre
 */
export type TerrainMode = 'flat' | 'hillshade' | '3d';