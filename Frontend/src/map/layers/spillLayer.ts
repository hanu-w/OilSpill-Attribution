import { PolygonLayer, ScatterplotLayer, PathLayer, LineLayer } from '@deck.gl/layers';
import type { Layer } from '@deck.gl/core';
import type { OilSpillIncident, SpillSeverity } from '@/types/incident';

export interface SpillLayerOptions {
  incidents: OilSpillIncident[];
  selectedIncidentId: string | null;
  onSelectIncident?: (incidentId: string) => void;
  isCorrelating?: boolean; // True when scenario is in 'correlating' or 'attribution-ready' phase
}

/**
 * Calibrated severity colors for spills
 */
export const SPILL_SEVERITY_COLORS: Record<SpillSeverity, [number, number, number]> = {
  low: [56, 189, 248],       // Sky / Cyan
  medium: [245, 158, 11],     // Amber
  high: [239, 68, 68],       // Red
  critical: [185, 28, 28],    // Deep Red
};

interface SpillPolygonFeature {
  incident: OilSpillIncident;
  polygon: [number, number][];
}

/**
 * Structural view of the deterministic scenario geometry attached to an
 * incident (see `src/simulation/spillGeometry.ts`).
 */
interface SpillGeometryLike {
  boundary?: number[][];
  origin?: { lat: number; lng: number };
  centroid?: { lat: number; lng: number };
  drift?: { speedKmH: number; bearingDeg: number };
}

function geometryOf(incident: OilSpillIncident): SpillGeometryLike | null {
  const g = incident.geometry;
  if (g && typeof g === 'object' && !Array.isArray(g)) {
    return g as SpillGeometryLike;
  }
  return null;
}

/**
 * Generate a geographically scaled polygon representing the spill extent.
 */
function createSpillPolygon(incident: OilSpillIncident, vertexCount: number = 48): [number, number][] {
  const geom = geometryOf(incident);
  if (geom?.boundary && geom.boundary.length >= 3) {
    return geom.boundary as [number, number][];
  }

  const { location, areaKm2 } = incident;
  const radiusKm = Math.sqrt(areaKm2 / Math.PI);
  const latDeg = radiusKm / 111.32;
  const latRad = (location.lat * Math.PI) / 180;
  const lngDeg = radiusKm / (111.32 * Math.cos(latRad));

  const coordinates: [number, number][] = [];

  for (let i = 0; i < vertexCount; i++) {
    const angle = (i / vertexCount) * 2 * Math.PI;
    const wobble = 1 + 0.07 * Math.sin(3 * angle) + 0.04 * Math.cos(5 * angle);
    const lng = location.lng + Math.cos(angle) * lngDeg * wobble;
    const lat = location.lat + Math.sin(angle) * latDeg * wobble;
    coordinates.push([lng, lat]);
  }

  coordinates.push(coordinates[0]);
  return coordinates;
}

/**
 * Creates deck.gl layers for rendering oil spill geometry and investigation drift:
 * 1. Translucent petroleum slick body (PolygonLayer)
 * 2. High-visibility slick boundary outline (PolygonLayer stroke)
 * 3. Initial SAR Detection Point marker (ScatterplotLayer)
 * 4. Backtrack Trajectory Line (LineLayer, revealed during CORRELATING)
 * 5. Estimated Release Origin Point (ScatterplotLayer, revealed during CORRELATING)
 * 6. Forward Predicted Drift Forecast Corridor (PathLayer, revealed during CORRELATING)
 */
export function createSpillLayers(options: SpillLayerOptions): Layer[] {
  const { incidents, selectedIncidentId, onSelectIncident, isCorrelating = false } = options;

  const layers: Layer[] = [];

  if (!incidents || incidents.length === 0) {
    return layers;
  }

  const spillFeatures: SpillPolygonFeature[] = incidents.map((incident) => ({
    incident,
    polygon: createSpillPolygon(incident),
  }));

  // 1. Spill Polygon Fill & Boundary
  layers.push(
    new PolygonLayer<SpillPolygonFeature>({
      id: 'spill-polygon-layer',
      data: spillFeatures,
      pickable: true,
      autoHighlight: true,
      highlightColor: [239, 68, 68, 40],
      stroked: true,
      filled: true,
      extruded: false,
      wireframe: false,
      lineWidthMinPixels: 2,
      lineWidthMaxPixels: 5,
      getPolygon: (d) => d.polygon,
      getFillColor: (d) => {
        const isSelected = d.incident.id === selectedIncidentId;
        return isSelected ? [24, 24, 27, 160] : [24, 24, 27, 125];
      },
      getLineColor: (d) => {
        const baseColor = SPILL_SEVERITY_COLORS[d.incident.severity] || SPILL_SEVERITY_COLORS.high;
        const isSelected = d.incident.id === selectedIncidentId;
        return isSelected ? [255, 255, 255, 240] : [baseColor[0], baseColor[1], baseColor[2], 210];
      },
      getLineWidth: (d) => (d.incident.id === selectedIncidentId ? 3 : 2),
      onClick: (info) => {
        if (info.object && onSelectIncident) {
          onSelectIncident(info.object.incident.id);
        }
      },
      updateTriggers: {
        getFillColor: [selectedIncidentId],
        getLineColor: [selectedIncidentId],
        getLineWidth: [selectedIncidentId],
      },
    })
  );

  // 2. Initial SAR Detection Point Marker
  layers.push(
    new ScatterplotLayer<OilSpillIncident>({
      id: 'spill-detection-point-layer',
      data: incidents,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 100],
      getPosition: (d) => [d.location.lng, d.location.lat],
      getRadius: 160,
      radiusMinPixels: 5,
      radiusMaxPixels: 12,
      stroked: true,
      filled: true,
      getFillColor: (d) => {
        const color = SPILL_SEVERITY_COLORS[d.severity] || SPILL_SEVERITY_COLORS.high;
        return [color[0], color[1], color[2], 240];
      },
      getLineColor: [255, 255, 255, 255],
      getLineWidth: 2,
      lineWidthMinPixels: 2,
      onClick: (info) => {
        if (info.object && onSelectIncident) {
          onSelectIncident(info.object.id);
        }
      },
      updateTriggers: {
        getFillColor: [selectedIncidentId],
      },
    })
  );

  // -------------------------------------------------------------------------
  // CORRELATION & DRIFT INVESTIGATION LAYERS (Only revealed in 'correlating' / 'attribution-ready')
  // -------------------------------------------------------------------------
  if (isCorrelating) {
    for (const incident of incidents) {
      const geom = geometryOf(incident);
      if (geom?.origin) {
        const originPoint: [number, number] = [geom.origin.lng, geom.origin.lat];
        const centroidPoint: [number, number] = geom.centroid
          ? [geom.centroid.lng, geom.centroid.lat]
          : [incident.location.lng, incident.location.lat];

        // 3. Backtrack Trajectory Line (from current centroid back to estimated release origin)
        layers.push(
          new LineLayer({
            id: `spill-backtrack-line-${incident.id}`,
            data: [{ source: originPoint, target: centroidPoint }],
            pickable: false,
            getSourcePosition: (d) => d.source,
            getTargetPosition: (d) => d.target,
            getColor: [245, 158, 11, 200], // Amber dashed/solid backtrack
            getWidth: 2,
            widthMinPixels: 1.5,
            widthMaxPixels: 3.5,
          })
        );

        // 4. Estimated Release Origin Point Marker (distinct amber target styling)
        layers.push(
          new ScatterplotLayer({
            id: `spill-origin-marker-${incident.id}`,
            data: [{ id: `${incident.id}-origin`, origin: geom.origin, incident }],
            pickable: true,
            autoHighlight: true,
            highlightColor: [255, 255, 255, 120],
            getPosition: () => originPoint,
            getRadius: 280,
            radiusMinPixels: 8,
            radiusMaxPixels: 16,
            stroked: true,
            filled: true,
            getFillColor: [245, 158, 11, 190], // Amber fill
            getLineColor: [255, 255, 255, 255],
            getLineWidth: 2,
            lineWidthMinPixels: 2,
            onClick: () => {
              if (onSelectIncident) {
                onSelectIncident(incident.id);
              }
            },
          })
        );

        // 5. Forward Predicted Drift Forecast Corridor (Projecting 3 hours forward along drift bearing)
        if (geom.drift) {
          const bearingRad = (geom.drift.bearingDeg * Math.PI) / 180;
          const forecastLengthDeg = 0.08; // ~8.5 km forecast
          const forecastPoint: [number, number] = [
            centroidPoint[0] + Math.sin(bearingRad) * forecastLengthDeg,
            centroidPoint[1] + Math.cos(bearingRad) * forecastLengthDeg,
          ];

          layers.push(
            new PathLayer({
              id: `spill-forecast-corridor-${incident.id}`,
              data: [
                {
                  path: [centroidPoint, forecastPoint],
                },
              ],
              pickable: false,
              getPath: (d) => d.path,
              getColor: [56, 189, 248, 140], // Light cyan forecast vector
              getWidth: 2,
              widthMinPixels: 1.5,
              widthMaxPixels: 3,
            })
          );
        }
      }
    }
  }

  return layers;
}
