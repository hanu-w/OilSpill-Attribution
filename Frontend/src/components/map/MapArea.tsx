import { useRef, useCallback, useEffect } from 'react';
import Map, { Source, Layer, type MapRef, type ViewStateChangeEvent } from 'react-map-gl/maplibre';
import * as maplibregl from 'maplibre-gl';
import maplibreglWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { Plus, Minus, Navigation as NavigationIcon, Crosshair } from 'lucide-react';
import { useMapStore, useIncidentStore } from '@/store';
import { DeckGLOverlay, useDeckLayers } from '@/map';

// Explicitly configure MapLibre worker URL for Vite dev/prod bundling
maplibregl.setWorkerUrl(maplibreglWorkerUrl);
maplibregl.config.WORKER_URL = maplibreglWorkerUrl;

// Ensure MapLibre map.transform is aliased to painter/camera transform for @deck.gl/mapbox compatibility
if (typeof window !== 'undefined') {
  try {
    Object.defineProperty(maplibregl.Map.prototype, 'transform', {
      get() {
        return (
          (this as unknown as { painter?: { transform?: unknown } }).painter?.transform ??
          (this as unknown as { _camera?: { transform?: unknown } })._camera?.transform
        );
      },
      configurable: true,
      enumerable: true,
    });
  } catch {
    // Ignore if already configured
  }
}

/**
 * Standard Positron basemap style
 */
const BASEMAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

/**
 * AWS Open Data Global Elevation (Terrarium RGB DEM)
 */
const TERRAIN_SOURCE_ID = 'terrain-dem-3d';
const HILLSHADE_SOURCE_ID = 'terrain-dem-hillshade';
const TERRAIN_TILES_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

/**
 * Enhance Positron basemap water & land palette to match maritime reference design
 */
function applyMaritimeCartography(map: maplibregl.Map) {
  try {
    // Set rich maritime ocean blue for water layers
    const waterLayers = ['water', 'waterway', 'water_shadow'];
    for (const layerId of waterLayers) {
      if (map.getLayer(layerId)) {
        map.setPaintProperty(layerId, 'fill-color', '#1e6896');
        map.setPaintProperty(layerId, 'fill-opacity', 0.88);
      }
    }

    if (map.getLayer('background')) {
      map.setPaintProperty('background', 'background-color', '#195e8a');
    }
  } catch (err) {
    console.warn('[MapArea] Custom cartography styling applied with notes:', err);
  }
}

/**
 * Apply terrain mode directly to a MapLibre Map instance
 */
function applyTerrainMode(mode: 'flat' | 'hillshade' | '3d', map: maplibregl.Map | undefined | null) {
  if (!map) return;
  try {
    // 1. Manage Hillshade layer visibility
    if (map.getLayer('terrain-hillshade')) {
      map.setLayoutProperty(
        'terrain-hillshade',
        'visibility',
        mode === 'hillshade' || mode === '3d' ? 'visible' : 'none'
      );
    }

    // 2. Manage 3D DEM Terrain mesh & camera pitch
    if (mode === '3d') {
      if (!map.getSource(TERRAIN_SOURCE_ID)) {
        map.addSource(TERRAIN_SOURCE_ID, {
          type: 'raster-dem',
          tiles: [TERRAIN_TILES_URL],
          encoding: 'terrarium',
          tileSize: 256,
          maxzoom: 14,
        });
      }
      map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: 2.5 });
      map.easeTo({ pitch: 55, duration: 800 });
    } else {
      map.setTerrain(null);
      if (map.getPitch() > 10) {
        map.easeTo({ pitch: 0, duration: 600 });
      }
    }
  } catch (err) {
    console.error('[MapArea] Error applying terrain mode:', err);
  }
}

/**
 * Map Controls Component
 *
 * Clean floating controls matching reference.png bottom-right:
 * 1. Circular Navigation / Compass button
 * 2. Vertical Zoom Pill [ + ] / [ - ]
 * 3. Circular 3D toggle button
 */
function MapControls({ mapRef }: { mapRef: React.RefObject<MapRef | null> }) {
  const { viewport, resetViewport, setViewport, terrainMode, setTerrainMode } = useMapStore();

  const handleZoomIn = () => {
    if (mapRef.current) {
      mapRef.current.zoomIn();
    } else {
      setViewport({ zoom: Math.min(viewport.zoom + 1, 18) });
    }
  };

  const handleZoomOut = () => {
    if (mapRef.current) {
      mapRef.current.zoomOut();
    } else {
      setViewport({ zoom: Math.max(viewport.zoom - 1, 1) });
    }
  };

  const handleResetView = () => {
    resetViewport();
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [68.8, 20.6],
        zoom: 7.2,
        pitch: terrainMode === '3d' ? 55 : 0,
        bearing: 0,
        duration: 1200,
      });
    }
  };

  const handleToggle3D = () => {
    const nextMode = terrainMode === '3d' ? 'flat' : '3d';
    setTerrainMode(nextMode);
    const map = mapRef.current?.getMap();
    applyTerrainMode(nextMode, map);
  };

  return (
    <div className="absolute bottom-6 right-6 flex flex-col items-center gap-3 z-30 select-none">
      {/* 1. Circular Compass / Orientation Button */}
      <button
        type="button"
        onClick={handleResetView}
        className="w-11 h-11 rounded-full bg-white/95 backdrop-blur-md border border-white/80 shadow-[0_8px_24px_rgba(0,0,0,0.08),0_2px_6px_rgba(0,0,0,0.04)] flex items-center justify-center text-ocean-700 hover:text-ocean-900 hover:bg-white active:scale-95 transition-smooth"
        aria-label="Reset orientation"
        title="Reset to North / Center Scenario"
      >
        <NavigationIcon className="w-4 h-4 fill-current transform rotate-45 text-ocean-800" />
      </button>

      {/* 2. Vertical Zoom Pill [ + ] / [ - ] */}
      <div className="w-11 rounded-full bg-white/95 backdrop-blur-md border border-white/80 shadow-[0_8px_24px_rgba(0,0,0,0.08),0_2px_6px_rgba(0,0,0,0.04)] flex flex-col items-center overflow-hidden">
        <button
          type="button"
          onClick={handleZoomIn}
          className="w-full h-10 flex items-center justify-center text-ocean-700 hover:text-ocean-900 hover:bg-ocean-50 active:scale-95 transition-smooth"
          aria-label="Zoom in"
        >
          <Plus className="w-4 h-4" />
        </button>
        <div className="w-6 h-px bg-ocean-200/80" />
        <button
          type="button"
          onClick={handleZoomOut}
          className="w-full h-10 flex items-center justify-center text-ocean-700 hover:text-ocean-900 hover:bg-ocean-50 active:scale-95 transition-smooth"
          aria-label="Zoom out"
        >
          <Minus className="w-4 h-4" />
        </button>
      </div>

      {/* 3. Circular 3D Toggle Button */}
      <button
        type="button"
        onClick={handleToggle3D}
        className={`w-11 h-11 rounded-full bg-white/95 backdrop-blur-md border border-white/80 shadow-[0_8px_24px_rgba(0,0,0,0.08),0_2px_6px_rgba(0,0,0,0.04)] flex items-center justify-center text-xs font-extrabold active:scale-95 transition-smooth ${
          terrainMode === '3d'
            ? 'bg-blue-accent text-white border-blue-400/80 shadow-md shadow-blue-500/20'
            : 'text-ocean-800 hover:text-ocean-950 hover:bg-white'
        }`}
        aria-label="Toggle 3D Terrain"
        title="Toggle 3D Elevation Terrain"
      >
        3D
      </button>
    </div>
  );
}

/**
 * Crosshair Center Indicator
 */
function CrosshairOverlay() {
  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-0">
      <div className="relative">
        <Crosshair className="w-8 h-8 text-blue-accent/20" />
      </div>
    </div>
  );
}

/**
 * OceanWatch Map Area Component
 *
 * Main interactive MapLibre map viewport with controls, terrain modes,
 * and deck.gl overlay integration.
 */
export function MapArea() {
  const mapRef = useRef<MapRef | null>(null);
  const viewport = useMapStore((state) => state.viewport);
  const setViewport = useMapStore((state) => state.setViewport);
  const terrainMode = useMapStore((state) => state.terrainMode);
  const deckLayers = useDeckLayers();

  const handleMove = useCallback((evt: ViewStateChangeEvent) => {
    setViewport({
      longitude: evt.viewState.longitude,
      latitude: evt.viewState.latitude,
      zoom: evt.viewState.zoom,
      bearing: evt.viewState.bearing,
      pitch: evt.viewState.pitch,
    });
  }, [setViewport]);

  // Gentle camera transition when entering focused Trace Source workflow
  const isTraceSourceActive = useIncidentStore((state) => state.isTraceSourceActive);
  const prevTraceSourceRef = useRef(false);

  useEffect(() => {
    if (isTraceSourceActive && !prevTraceSourceRef.current) {
      const map = mapRef.current?.getMap();
      if (map) {
        map.flyTo({
          center: [69.46, 22.53],
          zoom: 8.8,
          pitch: 0,
          bearing: 0,
          duration: 1000,
        });
      }
    }
    prevTraceSourceRef.current = isTraceSourceActive;
  }, [isTraceSourceActive]);

  // Synchronize 3D terrain, hillshade layer visibility, and pitch with terrainMode
  useEffect(() => {
    const map = mapRef.current?.getMap();
    applyTerrainMode(terrainMode, map);
  }, [terrainMode]);

  return (
    <main className="w-full h-full absolute inset-0 overflow-hidden bg-[#1e6896]">
      {/* MapLibre Map Container */}
      <Map
        ref={mapRef}
        mapLib={maplibregl}
        initialViewState={{
          longitude: viewport.longitude,
          latitude: viewport.latitude,
          zoom: viewport.zoom,
          bearing: viewport.bearing ?? 0,
          pitch: viewport.pitch ?? 0,
        }}
        mapStyle={BASEMAP_STYLE}
        onMove={handleMove}
        onLoad={(evt) => {
          const map = evt.target;
          (window as unknown as { mapInstance?: unknown }).mapInstance = map;
          console.log('[MapArea] Map loaded successfully', map);
          applyMaritimeCartography(map);
          applyTerrainMode(terrainMode, map);
        }}
        onError={(err) => {
          console.error('[MapArea] Map error event:', err);
        }}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
      >
        {/* Hillshade DEM Source & Layer */}
        <Source
          id={HILLSHADE_SOURCE_ID}
          type="raster-dem"
          tiles={[TERRAIN_TILES_URL]}
          encoding="terrarium"
          tileSize={256}
          maxzoom={14}
        >
          <Layer
            id="terrain-hillshade"
            type="hillshade"
            source={HILLSHADE_SOURCE_ID}
            beforeId="water"
            layout={{
              visibility: terrainMode === 'hillshade' || terrainMode === '3d' ? 'visible' : 'none',
            }}
            paint={{
              'hillshade-shadow-color': '#0f172a',
              'hillshade-highlight-color': '#ffffff',
              'hillshade-accent-color': '#475569',
              'hillshade-illumination-direction': 315,
              'hillshade-exaggeration': 0.35,
            }}
          />
        </Source>

        {/* Deck.gl WebGL Layer Overlay */}
        <DeckGLOverlay layers={deckLayers} />
      </Map>

      {/* Crosshair */}
      <CrosshairOverlay />

      {/* Map Controls */}
      <MapControls mapRef={mapRef} />
    </main>
  );
}