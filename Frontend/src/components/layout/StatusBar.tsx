import { Ship, Droplet, Bell, MapPin, Wind, Waves } from 'lucide-react';
import { useMapStore, useScenarioStore } from '@/store';
import { environmentAt } from '@/simulation';

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const MS_TO_KN = 1.94384;

function compass(dir: number): string {
  return COMPASS[Math.round(dir / 22.5) % 16];
}

/**
 * OceanWatch Floating Status Bar Component
 *
 * Renders the multi-column telemetry strip matching reference.png:
 * [ 🚢 12,482 | 💧 7 ACTIVE | 🔔 3 ALERTS | 📍 Arabian Sea | 💨 14.6kn | 🌊 0.8kn ]
 */
export function StatusBar() {
  const { viewport } = useMapStore();
  const simTimeMs = useScenarioStore((state) => state.simTimeMs);
  const env = environmentAt(simTimeMs);

  const latStr = `${Math.abs(viewport.latitude).toFixed(2)}° ${viewport.latitude >= 0 ? 'N' : 'S'}`;
  const lngStr = `${Math.abs(viewport.longitude).toFixed(2)}° ${viewport.longitude >= 0 ? 'E' : 'W'}`;

  return (
    <div className="absolute bottom-5 left-1/2 transform -translate-x-1/2 z-30 select-none">
      <div className="flex items-center gap-5 px-7 py-2.5 rounded-2xl bg-white/95 backdrop-blur-md border border-white/80 shadow-[0_12px_32px_rgba(0,0,0,0.08),0_2px_6px_rgba(0,0,0,0.04)] text-ocean-900">
        {/* Metric 1: Vessels */}
        <div className="flex items-center gap-2.5">
          <Ship className="w-4 h-4 text-ocean-600 shrink-0" />
          <div className="flex flex-col leading-none">
            <span className="font-extrabold text-xs text-ocean-900">12,482</span>
            <span className="text-[9px] font-bold text-ocean-500 tracking-wider uppercase mt-0.5">
              VESSELS
            </span>
          </div>
        </div>

        <div className="w-px h-6 bg-ocean-200/80" />

        {/* Metric 2: Active Spills */}
        <div className="flex items-center gap-2.5">
          <Droplet className="w-4 h-4 text-ocean-600 shrink-0 fill-current" />
          <div className="flex flex-col leading-none">
            <span className="font-extrabold text-xs text-ocean-900">7</span>
            <span className="text-[9px] font-bold text-ocean-500 tracking-wider uppercase mt-0.5">
              ACTIVE SPILLS
            </span>
          </div>
        </div>

        <div className="w-px h-6 bg-ocean-200/80" />

        {/* Metric 3: Alerts */}
        <div className="flex items-center gap-2.5">
          <Bell className="w-4 h-4 text-ocean-600 shrink-0" />
          <div className="flex flex-col leading-none">
            <span className="font-extrabold text-xs text-ocean-900">3</span>
            <span className="text-[9px] font-bold text-ocean-500 tracking-wider uppercase mt-0.5">
              ALERTS
            </span>
          </div>
        </div>

        <div className="w-px h-6 bg-ocean-200/80" />

        {/* Metric 4: Region & Position */}
        <div className="flex items-center gap-2.5">
          <MapPin className="w-4 h-4 text-ocean-600 shrink-0" />
          <div className="flex flex-col leading-none">
            <span className="font-extrabold text-xs text-ocean-900">Arabian Sea</span>
            <span className="text-[9px] font-medium text-ocean-500 font-mono mt-0.5">
              {latStr}, {lngStr}
            </span>
          </div>
        </div>

        <div className="w-px h-6 bg-ocean-200/80" />

        {/* Metric 5: Wind */}
        <div className="flex items-center gap-2.5">
          <Wind className="w-4 h-4 text-ocean-600 shrink-0" />
          <div className="flex flex-col leading-none">
            <span className="font-extrabold text-xs text-ocean-900">
              {(env.wind.speed * MS_TO_KN).toFixed(1)} kn, {compass(env.wind.direction)}
            </span>
            <span className="text-[9px] font-bold text-ocean-500 tracking-wider uppercase mt-0.5">
              WIND
            </span>
          </div>
        </div>

        <div className="w-px h-6 bg-ocean-200/80" />

        {/* Metric 6: Current */}
        <div className="flex items-center gap-2.5">
          <Waves className="w-4 h-4 text-ocean-600 shrink-0" />
          <div className="flex flex-col leading-none">
            <span className="font-extrabold text-xs text-ocean-900">
              {(env.current.speed * MS_TO_KN).toFixed(1)} kn, {compass(env.current.direction)}
            </span>
            <span className="text-[9px] font-bold text-ocean-500 tracking-wider uppercase mt-0.5">
              CURRENT
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
