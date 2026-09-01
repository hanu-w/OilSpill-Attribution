import { useControl } from 'react-map-gl/maplibre';
import { MapboxOverlay, type MapboxOverlayProps } from '@deck.gl/mapbox';
import type { PickingInfo } from '@deck.gl/core';
import type { Vessel } from '@/types/vessel';
import type { OilSpillIncident } from '@/types/incident';

/**
 * Lightweight, high-performance tooltip resolver for deck.gl objects.
 * Evaluates on the WebGL canvas thread without triggering React state updates.
 */
function getDeckTooltip(info: PickingInfo) {
  if (!info.picked || !info.object) {
    return null;
  }

  const layerId = info.layer?.id || '';

  // Vessel hover tooltip
  if (layerId === 'vessels-2d-layer') {
    const v = info.object as Vessel;
    return {
      html: `
        <div style="padding: 8px 12px; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; font-size: 12px; line-height: 1.35; color: #f8fafc; background: rgba(15, 23, 42, 0.94); border-radius: 8px; border: 1px solid rgba(148, 163, 184, 0.25); box-shadow: 0 8px 24px rgba(0,0,0,0.35); backdrop-filter: blur(8px);">
          <div style="font-weight: 700; color: #38bdf8; font-size: 13px; margin-bottom: 2px;">${v.name}</div>
          <div style="color: #cbd5e1; font-size: 11px; text-transform: uppercase; font-weight: 500; letter-spacing: 0.05em;">${v.type} • ${v.status} • IMO ${v.imo}</div>
          <div style="margin-top: 6px; padding-top: 4px; border-top: 1px solid rgba(148, 163, 184, 0.2); display: flex; gap: 10px; color: #94a3b8; font-size: 11px;">
            <span>Speed: <strong style="color: #f1f5f9;">${v.speed.toFixed(1)} kn</strong></span>
            <span>Heading: <strong style="color: #f1f5f9;">${v.heading}°</strong></span>
          </div>
        </div>
      `,
      style: {
        backgroundColor: 'transparent',
        boxShadow: 'none',
        padding: '0',
      },
    };
  }

  // Estimated Release Point Marker hover tooltip
  if (layerId.startsWith('spill-origin-marker')) {
    const data = info.object as { incident?: OilSpillIncident };
    const inc = data.incident;
    const geom = inc?.geometry as
      | { drift?: { speedKmH: number; bearingDeg: number } }
      | undefined;
    const drift = geom?.drift
      ? `<span>Drift: <strong style="color: #f1f5f9;">${geom.drift.speedKmH.toFixed(1)} km/h @ ${geom.drift.bearingDeg}°</strong></span>`
      : '';
    return {
      html: `
        <div style="padding: 8px 12px; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; font-size: 12px; line-height: 1.35; color: #f8fafc; background: rgba(15, 23, 42, 0.94); border-radius: 8px; border: 1px solid rgba(245, 158, 11, 0.5); box-shadow: 0 8px 24px rgba(0,0,0,0.35); backdrop-filter: blur(8px);">
          <div style="font-weight: 700; color: #fbbf24; font-size: 13px; margin-bottom: 2px;">ESTIMATED RELEASE POINT</div>
          <div style="color: #cbd5e1; font-size: 11px; font-weight: 500;">Back-tracked from SAR detection along net drift</div>
          <div style="margin-top: 6px; padding-top: 4px; border-top: 1px solid rgba(245, 158, 11, 0.25); display: flex; gap: 10px; color: #94a3b8; font-size: 11px;">
            <span>Release Window: <strong style="color: #f1f5f9;">06:12–07:27Z</strong></span>
            ${drift}
          </div>
        </div>
      `,
      style: {
        backgroundColor: 'transparent',
        boxShadow: 'none',
        padding: '0',
      },
    };
  }

  // Spill body / Detection Point hover tooltip
  if (layerId === 'spill-polygon-layer' || layerId === 'spill-detection-point-layer') {
    const inc = (info.object.incident ?? info.object) as OilSpillIncident;
    const isDetectionPoint = layerId === 'spill-detection-point-layer';
    const geom = inc.geometry as
      | { drift?: { speedKmH: number; bearingDeg: number } }
      | undefined;
    const drift = geom?.drift
      ? `<span>Drift: <strong style="color: #f1f5f9;">${geom.drift.speedKmH.toFixed(1)} km/h @ ${geom.drift.bearingDeg}°</strong></span>`
      : '';
    return {
      html: `
        <div style="padding: 8px 12px; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; font-size: 12px; line-height: 1.35; color: #f8fafc; background: rgba(15, 23, 42, 0.94); border-radius: 8px; border: 1px solid rgba(239, 68, 68, 0.45); box-shadow: 0 8px 24px rgba(0,0,0,0.35); backdrop-filter: blur(8px);">
          <div style="font-weight: 700; color: #f87171; font-size: 13px; margin-bottom: 2px;">${isDetectionPoint ? 'SAR DETECTION POINT' : 'OIL SPILL DETECTED'}</div>
          <div style="color: #cbd5e1; font-size: 11px; font-weight: 500;">Incident: <strong style="color: #f1f5f9;">${inc.id}</strong></div>
          <div style="margin-top: 6px; padding-top: 4px; border-top: 1px solid rgba(239, 68, 68, 0.25); display: flex; gap: 10px; color: #94a3b8; font-size: 11px;">
            <span>Area: <strong style="color: #f1f5f9;">${inc.areaKm2} km²</strong></span>
            <span>Severity: <strong style="color: #f87171; text-transform: uppercase;">${inc.severity}</strong></span>
            <span>Confidence: <strong style="color: #f1f5f9;">${Math.round(inc.confidence * 100)}%</strong></span>
            ${drift}
          </div>
        </div>
      `,
      style: {
        backgroundColor: 'transparent',
        boxShadow: 'none',
        padding: '0',
      },
    };
  }

  return null;
}

/**
 * DeckGLOverlay Component
 *
 * Integrates deck.gl MapboxOverlay as an IControl into react-map-gl / MapLibre.
 * Coordinates WebGL overlay rendering for high-performance dynamic layers
 * (vessels, trails, spills, analytics) while preserving MapLibre's basemap.
 */
export function DeckGLOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(
    () =>
      new MapboxOverlay({
        ...props,
        getTooltip: getDeckTooltip,
      })
  );

  overlay.setProps({
    ...props,
    getTooltip: getDeckTooltip,
  });

  return null;
}
