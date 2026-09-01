import { create } from 'zustand';
import type { LayerVisibility, MapLayerId, MapViewport, TerrainMode } from '../types/map';

/**
 * Default layer visibility state.
 * All layers are visible by default.
 */
const DEFAULT_LAYER_VISIBILITY: LayerVisibility = {
  vessels: true,
  vesselTrails: false,
  oilSpills: true,
  oceanCurrents: false,
  windFlow: false,
  eezBoundaries: false,
  shippingLanes: false,
  investigationPaths: true,
};

/**
 * Default map viewport centered on active mock scenario (Gulf of Kutch / Saurashtra).
 */
const DEFAULT_VIEWPORT: MapViewport = {
  longitude: 69.6,
  latitude: 22.4,
  zoom: 7.5,
  pitch: 0,
  bearing: 0,
};

/**
 * Map store state interface
 */
interface MapState {
  viewport: MapViewport;
  layerVisibility: LayerVisibility;
  terrainMode: TerrainMode;

  // Viewport actions
  setViewport: (viewport: Partial<MapViewport>) => void;
  resetViewport: () => void;

  // Terrain actions
  setTerrainMode: (mode: TerrainMode) => void;

  // Layer actions
  setLayerVisibility: (layerId: MapLayerId, visible: boolean) => void;
  toggleLayer: (layerId: MapLayerId) => void;
  setAllLayersVisible: (visible: boolean) => void;
  resetLayerVisibility: () => void;
}

/**
 * Map store for viewport state and layer visibility.
 *
 * This store manages map-related UI state that components need to access.
 * High-frequency map movement updates should stay in the map/deck.gl layer
 * and not trigger React re-renders unnecessarily.
 *
 * See AGENTS.md §6: Use Zustand for map UI state and layer visibility.
 */
export const useMapStore = create<MapState>((set) => ({
  viewport: DEFAULT_VIEWPORT,
  layerVisibility: DEFAULT_LAYER_VISIBILITY,
  terrainMode: 'flat',

  setTerrainMode: (mode) => set({ terrainMode: mode }),

  setViewport: (viewport) =>
    set((state) => ({
      viewport: { ...state.viewport, ...viewport },
    })),

  resetViewport: () =>
    set({ viewport: DEFAULT_VIEWPORT }),

  setLayerVisibility: (layerId, visible) =>
    set((state) => ({
      layerVisibility: {
        ...state.layerVisibility,
        [layerId]: visible,
      },
    })),

  toggleLayer: (layerId) =>
    set((state) => ({
      layerVisibility: {
        ...state.layerVisibility,
        [layerId]: !state.layerVisibility[layerId],
      },
    })),

  setAllLayersVisible: (visible) =>
    set((state) => ({
      layerVisibility: Object.keys(state.layerVisibility).reduce(
        (acc, key) => {
          acc[key as MapLayerId] = visible;
          return acc;
        },
        {} as LayerVisibility
      ),
    })),

  resetLayerVisibility: () =>
    set({ layerVisibility: DEFAULT_LAYER_VISIBILITY }),
}));
