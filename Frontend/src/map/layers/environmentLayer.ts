import { LineLayer, ScatterplotLayer } from '@deck.gl/layers';
import type { Layer } from '@deck.gl/core';
import type { OceanConditions } from '@/types/environment';
import type { DriftVector } from '@/simulation/environment';
import type { GeoPoint } from '@/types/map';

export interface EnvironmentLayerOptions {
  oceanConditions: OceanConditions;
  driftVector?: DriftVector;
  showCurrents: boolean;
  showWind: boolean;
  showDriftVector?: boolean;
  driftOrigin?: GeoPoint;
}

interface VectorItem {
  id: string;
  source: [number, number]; // [lng, lat]
  target: [number, number]; // [lng, lat]
  speed: number;
  type: 'current' | 'wind';
}

/**
 * Generate a subtle spatial grid of flow vectors across the Gulf of Kutch / Saurashtra region.
 * Uses real geography bounds: lng 68.4..70.4, lat 22.0..23.0
 */
function generateFlowGrid(
  conditions: OceanConditions,
  type: 'current' | 'wind',
  stepDeg = 0.22
): VectorItem[] {
  const items: VectorItem[] = [];
  const minLng = 68.4;
  const maxLng = 70.4;
  const minLat = 22.0;
  const maxLat = 23.0;

  const isCurrent = type === 'current';
  const speed = isCurrent ? conditions.current.speed : conditions.wind.speed;
  // Wind direction is reported "coming from", flow moves toward dir + 180
  const dirDeg = isCurrent ? conditions.current.direction : (conditions.wind.direction + 180) % 360;
  const dirRad = (dirDeg * Math.PI) / 180;

  // Vector length in degrees (subtle, scaled by speed)
  const lengthDeg = isCurrent ? 0.045 : 0.065;

  let idx = 0;
  for (let lat = minLat; lat <= maxLat; lat += stepDeg) {
    for (let lng = minLng; lng <= maxLng; lng += stepDeg) {
      // Stagger rows slightly for organic ocean flow appearance
      const staggeredLng = lng + ((Math.floor(lat / stepDeg) % 2) * stepDeg * 0.4);
      
      const targetLng = staggeredLng + Math.sin(dirRad) * lengthDeg;
      const targetLat = lat + Math.cos(dirRad) * lengthDeg;

      items.push({
        id: `${type}-${idx++}`,
        source: [staggeredLng, lat],
        target: [targetLng, targetLat],
        speed,
        type,
      });
    }
  }

  return items;
}

/**
 * Creates deck.gl layers for environmental forces:
 * 1. Subtle Ocean Current vector field (LineLayer)
 * 2. Subtle Wind Flow vector field (LineLayer)
 * 3. Net Surface Drift vector indicator at spill origin/centroid (LineLayer + ScatterplotLayer)
 */
export function createEnvironmentLayers(options: EnvironmentLayerOptions): Layer[] {
  const {
    oceanConditions,
    driftVector,
    showCurrents,
    showWind,
    showDriftVector = false,
    driftOrigin,
  } = options;

  const layers: Layer[] = [];

  // 1. Ocean Currents Field
  if (showCurrents && oceanConditions) {
    const currentVectors = generateFlowGrid(oceanConditions, 'current', 0.2);
    layers.push(
      new LineLayer<VectorItem>({
        id: 'env-ocean-currents-layer',
        data: currentVectors,
        pickable: false,
        getSourcePosition: (d) => d.source,
        getTargetPosition: (d) => d.target,
        getColor: [14, 165, 233, 120], // Light Sky Blue, subtle
        getWidth: 1.5,
        widthMinPixels: 1.2,
        widthMaxPixels: 3,
      })
    );
  }

  // 2. Wind Flow Field
  if (showWind && oceanConditions) {
    const windVectors = generateFlowGrid(oceanConditions, 'wind', 0.25);
    layers.push(
      new LineLayer<VectorItem>({
        id: 'env-wind-flow-layer',
        data: windVectors,
        pickable: false,
        getSourcePosition: (d) => d.source,
        getTargetPosition: (d) => d.target,
        getColor: [203, 213, 225, 95], // Slate silver, restrained
        getWidth: 1.2,
        widthMinPixels: 1.0,
        widthMaxPixels: 2.5,
      })
    );
  }

  // 3. Dedicated Net Surface Drift Vector at Spill (visible during correlating phase)
  if (showDriftVector && driftVector && driftOrigin) {
    const rad = (driftVector.bearingDeg * Math.PI) / 180;
    // 5 km visual indicator vector
    const vectorLengthDeg = 0.055;
    const targetLng = driftOrigin.lng + Math.sin(rad) * vectorLengthDeg;
    const targetLat = driftOrigin.lat + Math.cos(rad) * vectorLengthDeg;

    const driftItem = [
      {
        source: [driftOrigin.lng, driftOrigin.lat] as [number, number],
        target: [targetLng, targetLat] as [number, number],
        speed: driftVector.speedKmH,
        bearing: driftVector.bearingDeg,
      },
    ];

    layers.push(
      new LineLayer({
        id: 'spill-drift-vector-line',
        data: driftItem,
        pickable: false,
        getSourcePosition: (d) => d.source,
        getTargetPosition: (d) => d.target,
        getColor: [245, 158, 11, 220], // Amber drift vector
        getWidth: 2.5,
        widthMinPixels: 2,
        widthMaxPixels: 4,
      }),
      new ScatterplotLayer({
        id: 'spill-drift-vector-head',
        data: driftItem,
        pickable: false,
        getPosition: (d) => d.target,
        getRadius: 80,
        radiusMinPixels: 4,
        radiusMaxPixels: 8,
        filled: true,
        getFillColor: [245, 158, 11, 230],
      })
    );
  }

  return layers;
}
