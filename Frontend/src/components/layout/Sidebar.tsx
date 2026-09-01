import {
  Map as MapIcon,
  AlertTriangle,
  Ship,
  BarChart2,
  Waves,
  FileText,
  Eye,
  EyeOff,
  GitCommit,
  Droplet,
  Wind,
  SquareDashed,
  Route,
} from 'lucide-react';
import { useUIStore, useMapStore } from '@/store';
import type { MapLayerId } from '@/types/map';
import { cn } from '@/lib/utils';

/**
 * Primary Navigation items matching reference.png
 */
const NAV_ITEMS = [
  { id: 'map', label: 'Map', icon: MapIcon },
  { id: 'incidents', label: 'Incidents', icon: AlertTriangle },
  { id: 'vessels', label: 'Vessels', icon: Ship },
  { id: 'analysis', label: 'Analysis', icon: BarChart2 },
  { id: 'environment', label: 'Environment', icon: Waves },
  { id: 'reports', label: 'Reports', icon: FileText },
];

/**
 * Map Layers with specific icons matching reference.png
 */
const LAYERS: Array<{ id: MapLayerId; label: string; icon: typeof Ship }> = [
  { id: 'vessels', label: 'Vessels', icon: Ship },
  { id: 'vesselTrails', label: 'Vessel Trails', icon: GitCommit },
  { id: 'oilSpills', label: 'Oil Spills', icon: Droplet },
  { id: 'oceanCurrents', label: 'Ocean Currents', icon: Waves },
  { id: 'windFlow', label: 'Wind Flow', icon: Wind },
  { id: 'eezBoundaries', label: 'EEZ Boundaries', icon: SquareDashed },
  { id: 'shippingLanes', label: 'Shipping Lanes', icon: Route },
];

/**
 * OceanWatch Floating Left Sidebar
 *
 * Provides two discrete floating cards:
 * 1. Top Card: Primary Navigation fully synchronized with global UI store
 * 2. Bottom Card: Maritime Layers toggle controls
 */
export function Sidebar() {
  const { activePanel, setActivePanel } = useUIStore();
  const { layerVisibility, toggleLayer } = useMapStore();

  // Sync active navigation tab with activePanel
  const activeNavId = activePanel === null ? 'map' : activePanel;

  const handleNavClick = (id: string) => {
    if (id === 'map') {
      setActivePanel(null);
    } else if (id === 'incidents') {
      setActivePanel('incidents');
    } else if (id === 'vessels') {
      setActivePanel('vessels');
      // If no vessel selected, show fleet list
    } else {
      setActivePanel(null);
    }
  };

  return (
    <div className="absolute left-6 top-24 z-20 flex flex-col gap-4 select-none">
      {/* Top Card: Primary Navigation */}
      <div className="w-60 rounded-2xl bg-white/95 backdrop-blur-md border border-white/80 shadow-[0_12px_32px_rgba(0,0,0,0.08),0_2px_6px_rgba(0,0,0,0.04)] p-3 overflow-hidden">
        <div className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeNavId === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={cn(
                  'w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-smooth',
                  isActive
                    ? 'bg-blue-50/90 text-ocean-900 border border-blue-200/50 shadow-xs'
                    : 'text-ocean-700 hover:text-ocean-900 hover:bg-ocean-50/80 border border-transparent'
                )}
              >
                <Icon
                  className={cn(
                    'w-4 h-4',
                    isActive ? 'text-blue-accent' : 'text-ocean-600'
                  )}
                />
                <span className="flex-1 text-left">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Card: Layers Panel */}
      <div className="w-60 rounded-2xl bg-white/95 backdrop-blur-md border border-white/80 shadow-[0_12px_32px_rgba(0,0,0,0.08),0_2px_6px_rgba(0,0,0,0.04)] p-3 overflow-hidden">
        <div className="px-3 pt-1 pb-2">
          <h2 className="text-[11px] font-bold text-ocean-500 uppercase tracking-wider">
            LAYERS
          </h2>
        </div>
        <div className="space-y-1">
          {LAYERS.map((layer) => {
            const isVisible = layerVisibility[layer.id];
            const EyeIcon = isVisible ? Eye : EyeOff;
            const LayerIcon = layer.icon;
            const isHighlighted = layer.id === 'oilSpills';

            return (
              <button
                key={layer.id}
                type="button"
                onClick={() => toggleLayer(layer.id)}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-smooth',
                  isHighlighted && isVisible
                    ? 'bg-blue-50/80 text-ocean-900 border border-blue-200/50'
                    : 'text-ocean-700 hover:text-ocean-900 hover:bg-ocean-50/80 border border-transparent'
                )}
              >
                <div className="flex items-center gap-3">
                  <LayerIcon
                    className={cn(
                      'w-3.5 h-3.5',
                      isHighlighted && isVisible ? 'text-blue-accent' : 'text-ocean-500'
                    )}
                  />
                  <span>{layer.label}</span>
                </div>
                <EyeIcon
                  className={cn(
                    'w-3.5 h-3.5 transition-smooth',
                    isVisible
                      ? isHighlighted
                        ? 'text-blue-accent'
                        : 'text-ocean-600'
                      : 'text-ocean-300'
                  )}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
