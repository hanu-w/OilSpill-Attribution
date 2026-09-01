import { PathLayer } from '@deck.gl/layers';
import type { Layer } from '@deck.gl/core';
import type { VesselTrail } from '@/types/vessel';

export interface TrailLayerOptions {
  trails: VesselTrail[];
  selectedVesselId: string | null;
  candidateVesselIds?: string[];
  topCandidateId?: string | null;
  isCorrelating?: boolean;
  isAttributed?: boolean;
  isTraceSourceActive?: boolean;
}

/**
 * Creates deck.gl layers for rendering historical vessel trails.
 *
 * Provides clear visual hierarchy:
 * 1. Top attributed candidate in Trace Source: prominent golden/amber historical track (4.2px)
 * 2. Active selected vessel / top candidate: golden highlight (3.6px)
 * 3. Correlated candidate vessels: cyan correlation highlight (2.2px)
 * 4. General background traffic: restrained translucent blue (1.0px)
 */
export function createTrailLayers(options: TrailLayerOptions): Layer[] {
  const {
    trails,
    selectedVesselId,
    candidateVesselIds = [],
    topCandidateId = null,
    isCorrelating = false,
    isAttributed = false,
    isTraceSourceActive = false,
  } = options;

  const layers: Layer[] = [];

  if (!trails || trails.length === 0) {
    return layers;
  }

  const validTrails = trails.filter((t) => t.points && t.points.length >= 2);

  if (validTrails.length === 0) {
    return layers;
  }

  const candidateSet = new Set(candidateVesselIds);
  const isInvestigationActive = isCorrelating || isAttributed || isTraceSourceActive;

  layers.push(
    new PathLayer<VesselTrail>({
      id: 'vessel-trails-layer',
      data: validTrails,
      pickable: false,
      widthScale: 1,
      widthMinPixels: 1.0,
      widthMaxPixels: 6,
      capRounded: true,
      jointRounded: true,
      getPath: (d: VesselTrail) => d.points.map((p): [number, number] => [p.lng, p.lat]),
      getColor: (d) => {
        if (d.vesselId === selectedVesselId) {
          return [245, 158, 11, 245]; // Golden selected trail
        }
        if ((isAttributed || isTraceSourceActive) && d.vesselId === topCandidateId) {
          return [245, 158, 11, isTraceSourceActive ? 255 : 235]; // Prominent golden/amber top candidate track
        }
        if (isInvestigationActive && candidateSet.has(d.vesselId)) {
          return [6, 182, 212, isTraceSourceActive ? 120 : 175]; // Cyan candidate correlation trail
        }
        return [59, 130, 246, isTraceSourceActive ? 25 : (isInvestigationActive ? 45 : 80)]; // Subdued background trail
      },
      getWidth: (d) => {
        if (d.vesselId === selectedVesselId) return 3.6;
        if ((isAttributed || isTraceSourceActive) && d.vesselId === topCandidateId) {
          return isTraceSourceActive ? 4.2 : 3.6;
        }
        if (isInvestigationActive && candidateSet.has(d.vesselId)) {
          return isTraceSourceActive ? 1.8 : 2.2;
        }
        return 1.0;
      },
      updateTriggers: {
        getColor: [selectedVesselId, topCandidateId, Array.from(candidateSet).join(','), isInvestigationActive, isAttributed, isTraceSourceActive],
        getWidth: [selectedVesselId, topCandidateId, Array.from(candidateSet).join(','), isInvestigationActive, isAttributed, isTraceSourceActive],
      },
    })
  );

  return layers;
}
