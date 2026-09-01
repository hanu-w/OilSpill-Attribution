import { PathLayer, ScatterplotLayer, LineLayer } from '@deck.gl/layers';
import type { Layer } from '@deck.gl/core';
import type { VesselTrail } from '@/types/vessel';
import type { GeoPoint } from '@/types/map';

export interface TraceSourceLayerOptions {
  isTraceSourceActive: boolean;
  topCandidateTrail: VesselTrail | null;
  estimatedOrigin: GeoPoint | null;
  closestApproachPoint: GeoPoint | null;
  replayPointIndex: number | null;
  isReplaying?: boolean;
}

/**
 * Creates dedicated deck.gl layers for the focused Source Reconstruction workflow:
 * 1. Release Corridor / Proximity Zone (PathLayer)
 * 2. Closest Approach Perpendicular Vector (LineLayer: 2.8 km at 07:00 UTC)
 * 3. High-Precision Estimated Release Origin Target (ScatterplotLayer)
 * 4. Illuminated Historical AIS Replay Trail (PathLayer)
 * 5. Replay Historical Vessel Heading Marker (ScatterplotLayer)
 */
export function createTraceSourceLayers(options: TraceSourceLayerOptions): Layer[] {
  const {
    isTraceSourceActive,
    topCandidateTrail,
    estimatedOrigin,
    closestApproachPoint,
    replayPointIndex,
  } = options;

  const layers: Layer[] = [];

  if (!isTraceSourceActive || !estimatedOrigin) {
    return layers;
  }

  const originCoords: [number, number] = [estimatedOrigin.lng, estimatedOrigin.lat];

  // 1. Closest Approach Perpendicular Connection (Connecting Ocean Guardian 07:00Z track to estimated release point)
  if (closestApproachPoint) {
    const closestCoords: [number, number] = [closestApproachPoint.lng, closestApproachPoint.lat];

    layers.push(
      new LineLayer({
        id: 'trace-source-closest-approach-vector',
        data: [{ source: closestCoords, target: originCoords }],
        pickable: false,
        getSourcePosition: (d) => d.source,
        getTargetPosition: (d) => d.target,
        getColor: [245, 158, 11, 240], // Bright amber evidence connection
        getWidth: 2.5,
        widthMinPixels: 2,
        widthMaxPixels: 4,
      })
    );

    // Closest approach waypoint ring on the vessel route
    layers.push(
      new ScatterplotLayer({
        id: 'trace-source-closest-approach-marker',
        data: [{ position: closestCoords }],
        pickable: false,
        getPosition: (d) => d.position,
        getRadius: 260,
        radiusMinPixels: 7,
        radiusMaxPixels: 14,
        stroked: true,
        filled: true,
        getFillColor: [245, 158, 11, 220],
        getLineColor: [255, 255, 255, 255],
        getLineWidth: 2,
        lineWidthMinPixels: 2,
      })
    );
  }

  // 2. High-Precision Estimated Release Origin Target (Concentric Target Glyphs)
  layers.push(
    new ScatterplotLayer({
      id: 'trace-source-origin-target-outer',
      data: [{ position: originCoords }],
      pickable: false,
      getPosition: (d) => d.position,
      getRadius: 480,
      radiusMinPixels: 18,
      radiusMaxPixels: 38,
      stroked: true,
      filled: true,
      getFillColor: [245, 158, 11, 35],
      getLineColor: [245, 158, 11, 240],
      getLineWidth: 2,
      lineWidthMinPixels: 2,
    })
  );

  layers.push(
    new ScatterplotLayer({
      id: 'trace-source-origin-target-inner',
      data: [{ position: originCoords }],
      pickable: false,
      getPosition: (d) => d.position,
      getRadius: 160,
      radiusMinPixels: 6,
      radiusMaxPixels: 12,
      stroked: true,
      filled: true,
      getFillColor: [245, 158, 11, 240],
      getLineColor: [255, 255, 255, 255],
      getLineWidth: 2,
      lineWidthMinPixels: 2,
    })
  );

  // 3. Historical AIS Replay Trail & Vessel Position Marker
  if (topCandidateTrail && topCandidateTrail.points.length > 0) {
    const points = topCandidateTrail.points;

    // If active replay or scrubbing replay point
    if (replayPointIndex !== null && replayPointIndex >= 0) {
      const activeSubset = points.slice(0, Math.min(replayPointIndex + 1, points.length));

      if (activeSubset.length >= 2) {
        layers.push(
          new PathLayer({
            id: 'trace-source-replay-trail',
            data: [{ path: activeSubset.map((p): [number, number] => [p.lng, p.lat]) }],
            pickable: false,
            getPath: (d) => d.path,
            getColor: [245, 158, 11, 255], // Brilliant illuminated golden track
            getWidth: 4.5,
            widthMinPixels: 3,
            widthMaxPixels: 6,
            capRounded: true,
            jointRounded: true,
          })
        );
      }

      // Replay vessel position waypoint
      const currentReplayPoint = points[Math.min(replayPointIndex, points.length - 1)];
      if (currentReplayPoint) {
        layers.push(
          new ScatterplotLayer({
            id: 'trace-source-replay-vessel-marker',
            data: [currentReplayPoint],
            pickable: false,
            getPosition: (d) => [d.lng, d.lat],
            getRadius: 400,
            radiusMinPixels: 14,
            radiusMaxPixels: 28,
            stroked: true,
            filled: true,
            getFillColor: [245, 158, 11, 230],
            getLineColor: [255, 255, 255, 255],
            getLineWidth: 2.5,
            lineWidthMinPixels: 2.5,
          })
        );
      }
    }
  }

  return layers;
}
