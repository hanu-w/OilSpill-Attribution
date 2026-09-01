import { Search, Bell, Play, Pause, RotateCcw } from 'lucide-react';
import { useUIStore, useScenarioStore } from '@/store';

/**
 * OceanWatch Wave Mark Logo SVG (matches reference 3 wavy lines)
 */
function OceanWatchLogo() {
  return (
    <svg className="w-8 h-8 text-ocean-900" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4 10C8 7 12 13 16 10C20 7 24 13 28 10"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 16C8 13 12 19 16 16C20 13 24 19 28 16"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 22C8 19 12 25 16 22C20 19 24 25 28 22"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Format UTC timestamp for live maritime operations display: e.g. "27 Aug 2026, 07:42 UTC"
 */
function formatUtcTimestamp(date: Date): string {
  const day = date.getUTCDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');

  return `${day} ${month} ${year}, ${hours}:${minutes}:${seconds} UTC`;
}

/**
 * Format human-readable phase badge label
 */
function formatPhaseLabel(phase: string): string {
  switch (phase) {
    case 'normal':
      return 'NORMAL';
    case 'spill-detected':
      return 'SPILL DETECTED';
    case 'correlating':
      return 'CORRELATING';
    case 'attribution-ready':
      return 'ATTRIBUTION READY';
    default:
      return phase.toUpperCase();
  }
}

/**
 * OceanWatch Floating Header Component
 *
 * Provides standalone floating islands directly over the map canvas:
 * 1. Top-Left: OceanWatch wave branding
 * 2. Top-Center: Floating search pill
 * 3. Top-Right: Authoritative Scenario Controller (Play/Pause, Reset, Scrubber, UTC Clock & Live Status)
 */
export function Header() {
  const { setActivePanel, activePanel } = useUIStore();
  const { isPlaying, simTimeMs, progress, phase, togglePlay, reset, setProgress } = useScenarioStore();

  const formattedTime = formatUtcTimestamp(new Date(simTimeMs));
  const phaseLabel = formatPhaseLabel(phase);

  const isAlertPhase = phase === 'spill-detected' || phase === 'correlating' || phase === 'attribution-ready';

  return (
    <header className="absolute top-6 inset-x-6 z-30 pointer-events-none flex items-center justify-between">
      {/* Top Left: Floating Branding */}
      <div className="pointer-events-auto flex items-center gap-3 select-none">
        <OceanWatchLogo />
        <div className="flex flex-col">
          <h1 className="text-xl font-extrabold text-ocean-900 tracking-tight leading-none">
            OceanWatch
          </h1>
          <span className="text-[10px] font-bold text-ocean-600 tracking-[0.18em] uppercase mt-1">
            Marine Intelligence
          </span>
        </div>
      </div>

      {/* Top Center: Floating Standalone Search Pill */}
      <div className="pointer-events-auto flex-1 max-w-xl mx-8">
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="w-4 h-4 text-ocean-500 transition-smooth group-focus-within:text-blue-accent" />
          </div>
          <input
            type="text"
            placeholder="Search location, vessel, or incident..."
            className="w-full h-11 pl-11 pr-5 rounded-full bg-white/95 backdrop-blur-md border border-white/80 shadow-[0_8px_24px_rgba(0,0,0,0.06),0_2px_6px_rgba(0,0,0,0.04)] focus:outline-none focus:ring-2 focus:ring-blue-accent/30 focus:border-blue-accent/50 text-sm text-ocean-900 placeholder-ocean-500 transition-smooth"
          />
        </div>
      </div>

      {/* Top Right: Authoritative Scenario Clock & Controls */}
      <div className="pointer-events-auto flex items-center gap-3">
        {/* Playback & Operational Time Pill */}
        <div className="h-11 px-4 rounded-full bg-white/95 backdrop-blur-md border border-white/80 shadow-[0_8px_24px_rgba(0,0,0,0.06),0_2px_6px_rgba(0,0,0,0.04)] flex items-center gap-3 text-xs font-semibold text-ocean-800">
          {/* Play/Pause Control Button */}
          <button
            type="button"
            onClick={togglePlay}
            className="w-7 h-7 rounded-full bg-ocean-100/80 hover:bg-blue-accent hover:text-white text-ocean-700 flex items-center justify-center transition-smooth active:scale-90"
            title={isPlaying ? 'Pause simulation (freeze time)' : 'Play simulation (resume time)'}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current translate-x-0.5" />
            )}
          </button>

          {/* Reset Control Button */}
          <button
            type="button"
            onClick={reset}
            className="w-7 h-7 rounded-full bg-ocean-100/80 hover:bg-ocean-200 text-ocean-700 flex items-center justify-center transition-smooth active:scale-90"
            title="Reset simulation to scenario start (07:20 UTC)"
            aria-label="Reset scenario"
          >
            <RotateCcw className="w-3 h-3" />
          </button>

          <span className="w-px h-4 bg-ocean-200" />

          {/* UTC Timestamp */}
          <span className="font-mono text-ocean-900 font-bold tracking-tight select-text min-w-[172px]">
            {formattedTime}
          </span>

          <span className="w-px h-4 bg-ocean-200" />

          {/* Interactive Micro Progress Slider */}
          <div className="w-16 flex items-center group relative cursor-pointer" title={`Scenario Progress: ${Math.round(progress * 100)}%`}>
            <input
              type="range"
              min="0"
              max="1"
              step="0.005"
              value={progress}
              onChange={(e) => setProgress(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-ocean-100 rounded-full appearance-none accent-blue-accent cursor-pointer hover:h-2 transition-all"
              aria-label="Scenario timeline progress"
            />
          </div>

          <span className="w-px h-4 bg-ocean-200" />

          {/* Operational Phase Badge */}
          <div
            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
              phase === 'attribution-ready'
                ? 'bg-blue-100 text-blue-800'
                : phase === 'correlating'
                  ? 'bg-amber-100 text-amber-800'
                  : phase === 'spill-detected'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-ocean-100 text-ocean-700'
            }`}
          >
            {phaseLabel}
          </div>

          {/* Live/Paused Status Indicator */}
          <div className="flex items-center gap-1.5 font-bold tracking-wider ml-0.5">
            {isPlaying ? (
              <div className="flex items-center gap-1.5 text-green-live">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-live opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-live" />
                </span>
                <span className="text-[11px] uppercase tracking-wider">LIVE</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-ocean-400">
                <span className="w-2 h-2 rounded-full bg-ocean-400" />
                <span className="text-[11px] uppercase tracking-wider">PAUSED</span>
              </div>
            )}
          </div>
        </div>

        {/* Circular Notification Bell Button */}
        <button
          type="button"
          onClick={() => setActivePanel(activePanel === 'incidents' ? null : 'incidents')}
          className="w-11 h-11 rounded-full bg-white/95 backdrop-blur-md border border-white/80 shadow-[0_8px_24px_rgba(0,0,0,0.06),0_2px_6px_rgba(0,0,0,0.04)] flex items-center justify-center text-ocean-700 hover:text-ocean-900 hover:bg-white transition-smooth relative active:scale-95"
          aria-label="Notifications & Incidents"
          title="Active Alerts"
        >
          <Bell className="w-4 h-4" />
          {isAlertPhase && (
            <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-red-alert ring-2 ring-white" />
          )}
        </button>
      </div>
    </header>
  );
}
