import { useEffect } from 'react';
import {
  X,
  Droplet,
  ArrowRight,
  ArrowLeft,
  Ship,
  Navigation,
  Compass,
  Gauge,
  Clock,
  Radio,
  RotateCcw,
  Wind,
  Waves,
  Activity,
  CheckCircle2,
  Play,
  Pause,
  RotateCw,
  MapPin,
  Calendar,
  Crosshair,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useUIStore, useIncidentStore, useScenarioStore } from '@/store';
import { useDataProvider } from '@/app/providers';
import { environmentAt, driftVectorAt } from '@/simulation';
import { VESSEL_TYPE_COLORS } from '@/map/layers';
import type { VesselType } from '@/types/vessel';
import type { SuspectVessel } from '@/types/incident';

/** Human-readable class label for candidate items. */
function vesselClassLabel(type: VesselType): string {
  switch (type) {
    case 'tanker':
      return 'Oil Tanker';
    case 'cargo':
      return 'Cargo Vessel';
    case 'container':
      return 'Container Ship';
    case 'fishing':
      return 'Fishing Vessel';
    case 'patrol':
      return 'Patrol Craft';
    default:
      return 'Vessel';
  }
}

/** Format timestamp to e.g. "27 Aug 2026, 07:42 UTC" */
function formatIncidentDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    const day = d.getUTCDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getUTCMonth()];
    const year = d.getUTCFullYear();
    const hours = String(d.getUTCHours()).padStart(2, '0');
    const minutes = String(d.getUTCMinutes()).padStart(2, '0');
    return `${day} ${month} ${year}, ${hours}:${minutes} UTC`;
  } catch {
    return isoString;
  }
}

/**
 * Floating Oil Spill Detection Card
 */
function OilSpillCard({
  incident,
  phase,
  onInvestigate,
}: {
  incident: {
    id: string;
    detectedAt: string;
    areaKm2: number;
    confidence: number;
    severity?: string;
    status?: string;
    source?: string;
  };
  phase: string;
  onInvestigate: () => void;
}) {
  const { setActivePanel } = useUIStore();
  const simTimeMs = useScenarioStore((state) => state.simTimeMs);
  const drift = driftVectorAt(simTimeMs);

  const severity = (incident.severity || 'high').toUpperCase();
  const status = (incident.status || 'detected').toUpperCase();
  const source = incident.source === 'sar' ? 'SAR SATELLITE (Sentinel-1A)' : (incident.source || 'SAR SATELLITE').toUpperCase();
  const isCorrelating = phase === 'correlating' || phase === 'attribution-ready';

  return (
    <div className="w-84 rounded-2xl bg-white/95 backdrop-blur-md border border-white/80 shadow-[0_12px_32px_rgba(0,0,0,0.08),0_2px_6px_rgba(0,0,0,0.04)] p-5 text-ocean-900 transition-smooth">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          <h3 className="text-xs font-bold uppercase tracking-wider text-ocean-900">
            OIL SPILL DETECTED
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setActivePanel(null)}
          className="text-ocean-400 hover:text-ocean-700 p-1 rounded-md transition-smooth"
          aria-label="Dismiss panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Incident Tag & Status Badges */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-ocean-700">
          <div className="w-5 h-5 rounded-full bg-red-50 flex items-center justify-center text-red-600">
            <Droplet className="w-3 h-3 fill-current" />
          </div>
          <span>#{incident.id}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide uppercase bg-red-50 text-red-700 border border-red-200/60">
            {severity}
          </span>
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide uppercase bg-ocean-50 text-ocean-700 border border-ocean-200/60">
            {status}
          </span>
        </div>
      </div>

      {/* Details Grid */}
      <div className="space-y-3 mb-4 text-xs">
        <div>
          <div className="text-[10px] font-semibold text-ocean-500 uppercase tracking-wider">Classification</div>
          <div className="font-bold text-ocean-900 mt-0.5">HYDROCARBON SLICK</div>
        </div>

        <div>
          <div className="text-[10px] font-semibold text-ocean-500 uppercase tracking-wider">Detection Source</div>
          <div className="font-semibold text-ocean-800 mt-0.5">{source}</div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-ocean-100/70">
          <div>
            <div className="text-[10px] font-semibold text-ocean-500 uppercase tracking-wider">Detected Time</div>
            <div className="font-semibold text-ocean-800 mt-0.5">
              {formatIncidentDate(incident.detectedAt)}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-ocean-500 uppercase tracking-wider">Observed Area</div>
            <div className="text-base font-extrabold text-ocean-900 mt-0.5">
              {incident.areaKm2.toFixed(1)} km²
            </div>
          </div>
        </div>

        {/* Environmental Drift Telemetry (Revealed during correlating phase) */}
        {isCorrelating && (
          <div className="pt-2 border-t border-ocean-100/70">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-ocean-500 font-semibold uppercase tracking-wider">Surface Drift Force</span>
              <span className="font-mono font-bold text-amber-700">
                {drift.speedKmH.toFixed(1)} km/h @ {drift.bearingDeg}° WSW
              </span>
            </div>
            <div className="text-[10px] text-ocean-600 leading-tight">
              Ebb outflow + ENE wind driving slick WSW down-channel
            </div>
          </div>
        )}

        <div className="pt-1">
          <div className="flex items-center justify-between text-[11px] font-medium mb-1.5">
            <span className="text-ocean-500">Confidence</span>
            <span className="font-bold text-ocean-900">{(incident.confidence * 100).toFixed(1)}%</span>
          </div>
          <div className="w-full bg-ocean-100/80 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-blue-accent h-full rounded-full transition-all duration-700 ease-out"
              style={{ width: `${incident.confidence * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Investigation Action */}
      <button
        type="button"
        onClick={onInvestigate}
        className="w-full py-2.5 rounded-xl bg-ocean-900 text-white font-bold text-xs tracking-wider uppercase hover:bg-ocean-800 active:scale-[0.99] transition-smooth shadow-md shadow-ocean-900/10 flex items-center justify-center gap-2"
      >
        <Activity className="w-3.5 h-3.5 text-cyan-400" />
        <span>{isCorrelating ? 'View Drift & AIS Correlation' : 'Begin Correlation Analysis'}</span>
      </button>
    </div>
  );
}

/**
 * Floating AIS Correlation Card (Phase: 'correlating')
 *
 * Communicates: "These vessels are relevant to the investigation."
 * Displays active spatiotemporal correlation parameters, drift model summary,
 * and compact relevant candidate vessels.
 */
function AISCorrelationCard({
  candidates,
  onSelectCandidate,
}: {
  candidates: SuspectVessel[];
  onSelectCandidate: (vesselId: string) => void;
}) {
  const dataProvider = useDataProvider();
  const simTimeMs = useScenarioStore((state) => state.simTimeMs);
  const env = environmentAt(simTimeMs);
  const drift = driftVectorAt(simTimeMs);

  const { data: vessels = [] } = useQuery({
    queryKey: ['vessels'],
    queryFn: () => dataProvider.getVessels(),
  });

  return (
    <div className="w-84 rounded-2xl bg-white/95 backdrop-blur-md border border-white/80 shadow-[0_12px_32px_rgba(0,0,0,0.08),0_2px_6px_rgba(0,0,0,0.04)] p-5 text-ocean-900 transition-smooth">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-accent animate-pulse" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-ocean-900">
            AIS CORRELATION IN PROGRESS
          </span>
        </div>
        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-blue-50 text-blue-700 border border-blue-200/60">
          50 VESSELS ANALYZED
        </span>
      </div>

      {/* Spatiotemporal Parameters & Drift Vector */}
      <div className="p-3 rounded-xl bg-ocean-50/70 border border-border-subtle mb-3 space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-ocean-500 uppercase tracking-wider">Release Window:</span>
          <span className="font-mono font-bold text-ocean-900">06:12–07:27 UTC</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-ocean-500 uppercase tracking-wider">Net Drift Vector:</span>
          <span className="font-mono font-bold text-ocean-900">
            {drift.speedKmH.toFixed(1)} km/h @ {drift.bearingDeg}°
          </span>
        </div>
        <div className="flex items-center justify-between pt-1 border-t border-ocean-200/50 text-[11px] text-ocean-600">
          <div className="flex items-center gap-1">
            <Wind className="w-3 h-3 text-ocean-500" />
            <span>{(env.wind.speed * 1.94).toFixed(1)} kn ENE</span>
          </div>
          <div className="flex items-center gap-1">
            <Waves className="w-3 h-3 text-ocean-500" />
            <span>{(env.current.speed * 1.94).toFixed(1)} kn W</span>
          </div>
        </div>
      </div>

      {/* Relevant Candidate Vessels List */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold text-ocean-600 uppercase tracking-wider">
          Relevant Candidates ({candidates.length})
        </span>
        <span className="text-[10px] text-ocean-400 font-medium">Trajectory & Proximity Match</span>
      </div>

      <div className="space-y-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
        {candidates.map((cand, idx) => {
          const v = vessels.find((item) => item.id === cand.vesselId);
          const color = v ? VESSEL_TYPE_COLORS[v.type] : '#64748b';

          return (
            <button
              key={cand.vesselId}
              type="button"
              onClick={() => onSelectCandidate(cand.vesselId)}
              className="w-full p-2.5 rounded-xl bg-surface-white border border-border-subtle hover:border-blue-accent/50 hover:bg-ocean-50/80 transition-smooth text-left shadow-xs group"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-xs font-bold text-ocean-900 group-hover:text-blue-accent transition-smooth">
                    #{idx + 1} {v ? v.name : cand.vesselId}
                  </span>
                </div>
                <span className="font-mono text-[11px] font-bold text-ocean-700">
                  {cand.distanceFromOriginKm.toFixed(1)} km
                </span>
              </div>

              <div className="flex items-center justify-between text-[10px] text-ocean-500">
                <span>{v ? `${vesselClassLabel(v.type)} • IMO ${v.imo}` : 'Vessel'}</span>
                <div className="flex items-center gap-1 font-semibold text-blue-accent">
                  <span>Inspect Track</span>
                  <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-smooth" />
                </div>
              </div>

              {/* Correlation Tags */}
              <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-ocean-100/60">
                <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/50">
                  TEMPORAL MATCH
                </span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/50">
                  ROUTE MATCH
                </span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-ocean-50 text-ocean-700 border border-ocean-200/50">
                  DISTANCE MATCH
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Explainable Source Attribution Summary Card (Phase: 'attribution-ready')
 *
 * Answers: "Which candidate is the strongest source and why?"
 * Presents:
 * 1. Primary Source Candidate identity & classification
 * 2. 96.5% Source Match + High Confidence operational rating
 * 3. Factor Decomposition (Distance, Temporal, Route, Behavior, Environmental)
 * 4. Supporting Evidence checklist with real deterministic model findings
 * 5. Ranked Candidates List (01..04 with margin analysis)
 * 6. Primary CTA: TRACE SOURCE →
 */
function AttributionSummaryCard({
  candidates,
  onSelectCandidate,
  onTraceSource,
}: {
  candidates: SuspectVessel[];
  onSelectCandidate: (vesselId: string) => void;
  onTraceSource: (vesselId: string) => void;
}) {
  const dataProvider = useDataProvider();
  const { data: vessels = [] } = useQuery({
    queryKey: ['vessels'],
    queryFn: () => dataProvider.getVessels(),
  });

  const topCandidate = candidates[0] || null;
  const topVessel = topCandidate ? vessels.find((v) => v.id === topCandidate.vesselId) : null;
  const topColor = topVessel ? VESSEL_TYPE_COLORS[topVessel.type] : '#f59e0b';

  // Factor breakdown extracted from evidence / candidate fields
  const distEvidence = topCandidate?.evidence.find((e) => e.type === 'distance');
  const tempEvidence = topCandidate?.evidence.find((e) => e.type === 'temporal');
  const routeEvidence = topCandidate?.evidence.find((e) => e.type === 'route');
  const behEvidence = topCandidate?.evidence.find((e) => e.type === 'behavioral');
  const envEvidence = topCandidate?.evidence.find((e) => e.type === 'environmental');

  const factors = [
    {
      label: 'Distance Proximity',
      scorePct: distEvidence ? (distEvidence.score * 100).toFixed(1) : '98.7',
      subtext: `Min ${topCandidate?.distanceFromOriginKm.toFixed(1) ?? '2.8'} km at 07:00Z`,
      color: 'bg-emerald-500',
    },
    {
      label: 'Temporal Window',
      scorePct: tempEvidence ? (tempEvidence.score * 100).toFixed(1) : '92.7',
      subtext: 'Inside 06:12–07:27 UTC window',
      color: 'bg-blue-500',
    },
    {
      label: 'Route Coherence',
      scorePct: routeEvidence ? (routeEvidence.score * 100).toFixed(1) : '100.0',
      subtext: '100% proximity to release corridor',
      color: 'bg-cyan-500',
    },
    {
      label: 'Discharge Behavior',
      scorePct: behEvidence ? (behEvidence.score * 100).toFixed(1) : '91.4',
      subtext: '9.4 kn transit discharge speed',
      color: 'bg-amber-500',
    },
    {
      label: 'Drift Alignment',
      scorePct: envEvidence ? (envEvidence.score * 100).toFixed(1) : '97.0',
      subtext: '2.6 km from net drift vector',
      color: 'bg-purple-500',
    },
  ];

  return (
    <div className="w-84 rounded-2xl bg-white/95 backdrop-blur-md border border-white/80 shadow-[0_12px_32px_rgba(0,0,0,0.08),0_2px_6px_rgba(0,0,0,0.04)] p-5 text-ocean-900 transition-smooth">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-ocean-900">
            AIS CORRELATION COMPLETE
          </span>
        </div>
        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200/60">
          ATTRIBUTION READY
        </span>
      </div>

      {/* Top Source Candidate Primary Hero Card */}
      {topCandidate && (
        <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-300/80 mb-3 shadow-xs">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center border shrink-0 shadow-xs"
                style={{ backgroundColor: `${topColor}20`, borderColor: `${topColor}60` }}
              >
                <Ship className="w-4.5 h-4.5" style={{ color: topColor }} />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-900 flex items-center gap-1">
                  <span>SOURCE CANDIDATE</span>
                </div>
                <h4 className="text-sm font-extrabold text-ocean-900 truncate">
                  {topVessel ? topVessel.name : topCandidate.vesselId}
                </h4>
                <div className="text-[10px] font-medium text-ocean-600 truncate">
                  {topVessel ? `${vesselClassLabel(topVessel.type)} • IMO ${topVessel.imo}` : 'Tanker'}
                </div>
              </div>
            </div>

            {/* Match Score Display */}
            <div className="text-right shrink-0">
              <div className="text-lg font-black text-amber-900 font-mono leading-none">
                {(topCandidate.matchScore * 100).toFixed(1)}%
              </div>
              <div className="text-[9px] font-bold text-amber-800 uppercase tracking-tight mt-0.5">
                SOURCE MATCH
              </div>
            </div>
          </div>

          {/* Operational Confidence Badge & Wording */}
          <div className="pt-2 border-t border-amber-200/60">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900">
                CONFIDENCE LEVEL
              </span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase bg-emerald-100/90 text-emerald-800 border border-emerald-300/70">
                HIGH CONFIDENCE
              </span>
            </div>
            <p className="text-[10px] text-ocean-700 leading-tight">
              Strongest candidate based on spatiotemporal, route, distance, and behavioral correlation.
            </p>
          </div>
        </div>
      )}

      {/* Factor Breakdown (The Explainable Score) */}
      <div className="p-3 rounded-xl bg-ocean-50/70 border border-border-subtle mb-3 space-y-2 text-xs">
        <div className="flex items-center justify-between pb-1 border-b border-ocean-200/50">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ocean-700">
            FACTOR BREAKDOWN
          </span>
          <span className="text-[10px] font-mono text-ocean-500">Decomposed Model</span>
        </div>

        <div className="space-y-1.5 pt-0.5">
          {factors.map((f) => (
            <div key={f.label} className="space-y-0.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-ocean-600 font-medium">{f.label}</span>
                <span className="font-mono font-bold text-ocean-900">{f.scorePct}%</span>
              </div>
              <div className="w-full bg-ocean-200/50 rounded-full h-1 overflow-hidden">
                <div
                  className={`h-full rounded-full ${f.color} transition-all duration-500`}
                  style={{ width: `${Math.min(100, Math.max(0, parseFloat(f.scorePct)))}%` }}
                />
              </div>
              <div className="text-[9px] text-ocean-500 leading-none">{f.subtext}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Supporting Evidence Checklist */}
      <div className="p-3 rounded-xl bg-surface-white border border-border-subtle mb-3 space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-ocean-700 pb-1 border-b border-ocean-100">
          SUPPORTING EVIDENCE
        </div>
        <div className="space-y-1.5 text-[11px] text-ocean-700">
          <div className="flex items-start gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
            <span>AIS trajectory intersects estimated release origin (2.8 km at 07:00Z)</span>
          </div>
          <div className="flex items-start gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
            <span>Historical position falls inside the release window (06:12–07:27 UTC)</span>
          </div>
          <div className="flex items-start gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
            <span>Route crosses the release corridor (100% trajectory proximity)</span>
          </div>
          <div className="flex items-start gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
            <span>Transit speed (9.4 kn) matches underway discharge maneuver</span>
          </div>
          <div className="flex items-start gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
            <span>Track aligns with modeled wind and current drift corridor</span>
          </div>
        </div>
      </div>

      {/* Source Candidates Ranking List */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ocean-700">
            SOURCE CANDIDATES ({candidates.length})
          </span>
          <span className="text-[9px] text-ocean-400 font-medium">Relative Margin</span>
        </div>

        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 custom-scrollbar">
          {candidates.map((cand, idx) => {
            const v = vessels.find((item) => item.id === cand.vesselId);
            const isTop = idx === 0;
            const matchPct = (cand.matchScore * 100).toFixed(1);

            return (
              <button
                key={cand.vesselId}
                type="button"
                onClick={() => onSelectCandidate(cand.vesselId)}
                className={`w-full px-2.5 py-1.5 rounded-xl text-left flex items-center justify-between transition-smooth text-xs group ${
                  isTop
                    ? 'bg-amber-500/10 border border-amber-300/80 hover:bg-amber-500/15'
                    : 'bg-surface-white border border-border-subtle hover:bg-ocean-50/70'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`font-mono text-[10px] font-bold ${isTop ? 'text-amber-800' : 'text-ocean-400'}`}>
                    0{idx + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="font-bold text-ocean-900 truncate flex items-center gap-1.5">
                      <span className="group-hover:text-blue-accent transition-smooth">{v ? v.name : cand.vesselId}</span>
                      {isTop && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase bg-amber-200/80 text-amber-900">
                          Primary Suspect
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-ocean-500">
                      {cand.distanceFromOriginKm.toFixed(1)} km to origin
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`font-mono font-extrabold ${isTop ? 'text-amber-800' : 'text-ocean-700'}`}>
                    {matchPct}%
                  </div>
                  {idx > 0 && topCandidate && (
                    <div className="text-[9px] text-ocean-400 font-mono">
                      -{(topCandidate.matchScore * 100 - cand.matchScore * 100).toFixed(1)}%
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Primary CTA: TRACE SOURCE → */}
      <button
        type="button"
        onClick={() => topCandidate && onTraceSource(topCandidate.vesselId)}
        className="w-full py-2.5 rounded-xl bg-ocean-900 text-white font-bold text-xs tracking-wider uppercase hover:bg-ocean-800 active:scale-[0.99] transition-smooth shadow-md shadow-ocean-900/15 flex items-center justify-center gap-2 group"
      >
        <span>TRACE SOURCE</span>
        <ArrowRight className="w-3.5 h-3.5 text-cyan-400 group-hover:translate-x-0.5 transition-smooth" />
      </button>
    </div>
  );
}

/**
 * Deep Vessel Telemetry Inspection Card
 */
function VesselTelemetryDrawer({
  vessel,
  onClose,
}: {
  vessel: {
    id: string;
    name: string;
    type: VesselType;
    imo: string;
    speed: number;
    heading: number;
    status: string;
    position: { lat: number; lng: number };
  };
  onClose: () => void;
}) {
  const color = VESSEL_TYPE_COLORS[vessel.type] || VESSEL_TYPE_COLORS.other;

  return (
    <div className="w-84 rounded-2xl bg-white/95 backdrop-blur-md border border-white/80 shadow-[0_12px_32px_rgba(0,0,0,0.08),0_2px_6px_rgba(0,0,0,0.04)] p-5 text-ocean-900 transition-smooth">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center border shadow-xs"
            style={{ backgroundColor: `${color}15`, borderColor: `${color}40` }}
          >
            <Ship className="w-5 h-5" style={{ color }} />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-ocean-900 leading-tight">{vessel.name}</h3>
            <span className="text-xs font-semibold text-ocean-500 font-mono">IMO {vessel.imo}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 text-ocean-400 hover:text-ocean-700 hover:bg-ocean-100/60 rounded-lg transition-smooth"
          title="Back to overview / close"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Telemetry Metrics Grid */}
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <div className="p-3 rounded-xl bg-ocean-50/70 border border-border-subtle">
          <div className="flex items-center gap-1.5 text-ocean-500 text-[11px] font-medium mb-1">
            <Gauge className="w-3.5 h-3.5 text-blue-accent" />
            <span>Speed</span>
          </div>
          <div className="font-mono text-sm font-bold text-ocean-900">
            {vessel.speed.toFixed(1)} <span className="text-xs font-normal text-ocean-600">kn</span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-ocean-50/70 border border-border-subtle">
          <div className="flex items-center gap-1.5 text-ocean-500 text-[11px] font-medium mb-1">
            <Compass className="w-3.5 h-3.5 text-blue-accent" />
            <span>Heading</span>
          </div>
          <div className="font-mono text-sm font-bold text-ocean-900">
            {vessel.heading}°
          </div>
        </div>

        <div className="p-3 rounded-xl bg-ocean-50/70 border border-border-subtle">
          <div className="flex items-center gap-1.5 text-ocean-500 text-[11px] font-medium mb-1">
            <Radio className="w-3.5 h-3.5 text-green-live" />
            <span>Type</span>
          </div>
          <div className="text-xs font-bold text-ocean-900 capitalize">
            {vessel.type}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-ocean-50/70 border border-border-subtle">
          <div className="flex items-center gap-1.5 text-ocean-500 text-[11px] font-medium mb-1">
            <Clock className="w-3.5 h-3.5 text-blue-accent" />
            <span>Status</span>
          </div>
          <div className="text-xs font-bold text-ocean-900 capitalize">
            {vessel.status}
          </div>
        </div>
      </div>

      {/* Position Telemetry */}
      <div className="p-3 rounded-xl bg-ocean-50/70 border border-border-subtle flex items-center justify-between text-xs mb-3">
        <div className="flex items-center gap-1.5 text-ocean-600 font-medium">
          <Navigation className="w-3.5 h-3.5 text-blue-accent" />
          <span>Position:</span>
        </div>
        <div className="font-mono font-bold text-ocean-900">
          {vessel.position.lat.toFixed(4)}°N, {vessel.position.lng.toFixed(4)}°E
        </div>
      </div>
    </div>
  );
}

/**
 * Vessel Fleet List Panel
 */
function VesselFleetList({
  onSelectVessel,
  onClose,
}: {
  onSelectVessel: (vesselId: string) => void;
  onClose: () => void;
}) {
  const dataProvider = useDataProvider();
  const { data: vessels = [] } = useQuery({
    queryKey: ['vessels'],
    queryFn: () => dataProvider.getVessels(),
  });

  return (
    <div className="w-84 max-h-[calc(100vh-10rem)] rounded-2xl bg-white/95 backdrop-blur-md border border-white/80 shadow-[0_12px_32px_rgba(0,0,0,0.08),0_2px_6px_rgba(0,0,0,0.04)] p-5 text-ocean-900 flex flex-col transition-smooth">
      <div className="flex items-center justify-between pb-3 border-b border-ocean-100 mb-3">
        <div className="flex items-center gap-2">
          <Ship className="w-4 h-4 text-blue-accent" />
          <h3 className="text-xs font-bold text-ocean-900 uppercase tracking-wider">
            Active Fleet ({vessels.length})
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-ocean-400 hover:text-ocean-700 transition-smooth"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
        {vessels.map((v) => {
          const color = VESSEL_TYPE_COLORS[v.type] || VESSEL_TYPE_COLORS.other;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onSelectVessel(v.id)}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-surface-white border border-border-subtle hover:border-blue-accent/40 hover:bg-ocean-50/70 transition-smooth text-left shadow-xs group"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center border shrink-0"
                  style={{ backgroundColor: `${color}15`, borderColor: `${color}30` }}
                >
                  <Ship className="w-4 h-4" style={{ color }} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-ocean-900 truncate group-hover:text-blue-accent transition-smooth">
                    {v.name}
                  </div>
                  <div className="text-[11px] text-ocean-500 capitalize truncate">
                    {v.type} • {v.speed.toFixed(1)} kn
                  </div>
                </div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-ocean-400 group-hover:text-blue-accent group-hover:translate-x-0.5 transition-smooth shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Detailed Incident Investigation & Drift Analysis Panel
 */
function IncidentInvestigationPanel({
  incident,
  candidates,
  onSelectCandidate,
  onClose,
}: {
  incident: { id: string; detectedAt: string; areaKm2: number; confidence: number };
  candidates: SuspectVessel[];
  onSelectCandidate: (vesselId: string) => void;
  onClose: () => void;
}) {
  const dataProvider = useDataProvider();
  const simTimeMs = useScenarioStore((state) => state.simTimeMs);
  const env = environmentAt(simTimeMs);
  const drift = driftVectorAt(simTimeMs);

  const { data: vessels = [] } = useQuery({
    queryKey: ['vessels'],
    queryFn: () => dataProvider.getVessels(),
  });

  return (
    <div className="w-84 max-h-[calc(100vh-10rem)] rounded-2xl bg-white/95 backdrop-blur-md border border-white/80 shadow-[0_12px_32px_rgba(0,0,0,0.08),0_2px_6px_rgba(0,0,0,0.04)] p-5 text-ocean-900 flex flex-col transition-smooth">
      <div className="flex items-center justify-between pb-3 border-b border-ocean-100 mb-3">
        <div className="flex items-center gap-2">
          <Droplet className="w-4 h-4 text-red-alert fill-current" />
          <h3 className="text-xs font-bold text-ocean-900 uppercase tracking-wider">
            Incident #{incident.id} Analysis
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-ocean-400 hover:text-ocean-700 transition-smooth"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Environmental & Drift Summary */}
      <div className="p-3 rounded-xl bg-ocean-50/70 border border-border-subtle mb-3 space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-ocean-500 font-semibold">Current Extent:</span>
          <span className="font-bold text-ocean-900">{incident.areaKm2.toFixed(1)} km²</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ocean-500 font-semibold">Net Surface Drift:</span>
          <span className="font-mono font-bold text-ocean-900">
            {drift.speedKmH.toFixed(1)} km/h @ {drift.bearingDeg}°
          </span>
        </div>
        <div className="flex justify-between text-[11px] text-ocean-600 pt-1 border-t border-ocean-200/50">
          <span>Wind: {(env.wind.speed * 1.94).toFixed(1)} kn ENE</span>
          <span>Current: {(env.current.speed * 1.94).toFixed(1)} kn W</span>
        </div>
      </div>

      <h4 className="text-[11px] font-bold text-ocean-600 uppercase tracking-wider mb-2">
        Correlated Candidates ({candidates.length})
      </h4>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
        {candidates.map((cand, idx) => {
          const v = vessels.find((item) => item.id === cand.vesselId);
          const isTop = idx === 0;

          return (
            <div
              key={cand.vesselId}
              className={`p-3 rounded-xl border shadow-xs ${
                isTop ? 'bg-amber-50/60 border-amber-300' : 'bg-surface-white border-border-subtle'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-ocean-900">
                  #{idx + 1} {v ? v.name : cand.vesselId}
                </span>
                <span className="font-mono text-xs font-bold text-amber-800">
                  {(cand.matchScore * 100).toFixed(1)}% Match
                </span>
              </div>
              <p className="text-[11px] text-ocean-500 mb-2">
                {v ? `${vesselClassLabel(v.type)} • IMO ${v.imo}` : 'Vessel'} • {cand.distanceFromOriginKm.toFixed(1)} km
              </p>
              <button
                type="button"
                onClick={() => onSelectCandidate(cand.vesselId)}
                className="w-full py-1.5 rounded-lg bg-blue-accent/10 hover:bg-blue-accent text-blue-accent hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-smooth"
              >
                <span>Inspect Candidate Track</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Focused Trace Source Dossier Card (Active in Trace Source Workflow)
 *
 * Provides:
 *  1. Header with back navigation: ← BACK TO ATTRIBUTION
 *  2. Primary Source Suspect card (Ocean Guardian, 96.5%, High Confidence)
 *  3. Reconstructed Event Metrics (Release window, closest approach, origin coordinate)
 *  4. Supporting Evidence Findings
 *  5. Interactive Historical Replay controls (Play/Pause, scrub, milestone highlights)
 */
function TraceSourceDossierCard({
  candidate,
  onBack,
}: {
  candidate: SuspectVessel;
  onBack: () => void;
}) {
  const dataProvider = useDataProvider();
  const isReplaying = useIncidentStore((state) => state.isReplaying);
  const replayPointIndex = useIncidentStore((state) => state.replayPointIndex);
  const setIsReplaying = useIncidentStore((state) => state.setIsReplaying);
  const setReplayPointIndex = useIncidentStore((state) => state.setReplayPointIndex);

  const { data: vessels = [] } = useQuery({
    queryKey: ['vessels'],
    queryFn: () => dataProvider.getVessels(),
  });

  const { data: trail = null } = useQuery({
    queryKey: ['vessel-trail', candidate.vesselId],
    queryFn: () => dataProvider.getVesselTrail(candidate.vesselId),
  });

  const vessel = vessels.find((v) => v.id === candidate.vesselId);
  const color = vessel ? VESSEL_TYPE_COLORS[vessel.type] : '#f59e0b';
  const totalPoints = trail?.points.length ?? 32;
  const currentIndex = replayPointIndex ?? (totalPoints - 1);

  // Automatic sequential replay timer (advances through the 32 historical AIS points)
  useEffect(() => {
    if (!isReplaying) return;
    const timer = setInterval(() => {
      useIncidentStore.setState((state) => {
        const next = (state.replayPointIndex ?? 0) + 1;
        if (next >= totalPoints) {
          return { isReplaying: false, replayPointIndex: totalPoints - 1 };
        }
        return { replayPointIndex: next };
      });
    }, 240);
    return () => clearInterval(timer);
  }, [isReplaying, totalPoints]);

  const currentPoint = trail?.points[Math.min(currentIndex, (trail?.points.length ?? 1) - 1)];
  const currentTimestampLabel = currentPoint?.timestamp
    ? new Date(currentPoint.timestamp).toISOString().slice(11, 16) + ' UTC'
    : '08:41 UTC';

  const handleToggleReplay = () => {
    if (isReplaying) {
      setIsReplaying(false);
    } else {
      if (replayPointIndex === null || replayPointIndex >= totalPoints - 1) {
        setReplayPointIndex(0);
      }
      setIsReplaying(true);
    }
  };

  const handleRestartReplay = () => {
    setReplayPointIndex(0);
    setIsReplaying(true);
  };

  return (
    <div className="w-88 rounded-2xl bg-white/95 backdrop-blur-md border border-amber-300/90 shadow-[0_16px_40px_rgba(0,0,0,0.12),0_2px_8px_rgba(245,158,11,0.08)] p-5 text-ocean-900 transition-smooth">
      {/* Back to Attribution Header */}
      <div className="flex items-center justify-between pb-3 border-b border-ocean-100 mb-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-bold text-ocean-600 hover:text-ocean-900 transition-smooth group"
        >
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-smooth" />
          <span>BACK TO ATTRIBUTION</span>
        </button>
        <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-amber-100 text-amber-900 border border-amber-300">
          SOURCE RECONSTRUCTION
        </span>
      </div>

      {/* Suspect Protagonist Card */}
      <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-300 mb-3 shadow-xs">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 shadow-xs"
              style={{ backgroundColor: `${color}25`, borderColor: `${color}80` }}
            >
              <Ship className="w-5 h-5" style={{ color }} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-900">
                IDENTIFIED SOURCE
              </div>
              <h3 className="text-base font-extrabold text-ocean-900 leading-tight truncate">
                {vessel ? vessel.name : candidate.vesselId}
              </h3>
              <div className="text-[11px] font-medium text-ocean-600 truncate">
                {vessel ? `${vesselClassLabel(vessel.type)} • IMO ${vessel.imo}` : 'Oil Tanker'}
              </div>
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="text-xl font-black text-amber-900 font-mono leading-none">
              {(candidate.matchScore * 100).toFixed(1)}%
            </div>
            <div className="text-[9px] font-bold text-amber-800 uppercase tracking-tight mt-0.5">
              SOURCE MATCH
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-amber-200/80 text-[10px]">
          <span className="font-bold text-amber-900 uppercase">Operational Status</span>
          <span className="px-1.5 py-0.2 rounded font-extrabold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
            HIGH CONFIDENCE
          </span>
        </div>
      </div>

      {/* Reconstructed Event Evidence Metrics */}
      <div className="p-3 rounded-xl bg-ocean-50/70 border border-border-subtle mb-3 space-y-2 text-xs">
        <div className="text-[10px] font-bold uppercase tracking-wider text-ocean-700 pb-1 border-b border-ocean-200/50 flex items-center justify-between">
          <span>RECONSTRUCTED EVENT</span>
          <span className="font-mono text-ocean-500">INC-2026-001</span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <div className="p-2 rounded-lg bg-surface-white border border-border-subtle">
            <div className="flex items-center gap-1 text-[10px] font-semibold text-ocean-500 uppercase">
              <Calendar className="w-3.5 h-3.5 text-blue-accent" />
              <span>Release Window</span>
            </div>
            <div className="font-mono font-bold text-xs text-ocean-900 mt-0.5">06:12–07:27 UTC</div>
          </div>

          <div className="p-2 rounded-lg bg-surface-white border border-border-subtle">
            <div className="flex items-center gap-1 text-[10px] font-semibold text-ocean-500 uppercase">
              <MapPin className="w-3.5 h-3.5 text-amber-600" />
              <span>Closest Approach</span>
            </div>
            <div className="font-mono font-bold text-xs text-amber-800 mt-0.5">2.8 km @ 07:00Z</div>
          </div>

          <div className="p-2 rounded-lg bg-surface-white border border-border-subtle">
            <div className="flex items-center gap-1 text-[10px] font-semibold text-ocean-500 uppercase">
              <Gauge className="w-3.5 h-3.5 text-blue-accent" />
              <span>Underway Speed</span>
            </div>
            <div className="font-mono font-bold text-xs text-ocean-900 mt-0.5">9.4 kn Transit</div>
          </div>

          <div className="p-2 rounded-lg bg-surface-white border border-border-subtle">
            <div className="flex items-center gap-1 text-[10px] font-semibold text-ocean-500 uppercase">
              <Crosshair className="w-3.5 h-3.5 text-purple-600" />
              <span>Estimated Origin</span>
            </div>
            <div className="font-mono font-bold text-[11px] text-ocean-900 mt-0.5">22.517°N, 69.586°E</div>
          </div>
        </div>
      </div>

      {/* Supporting Evidence Checklist */}
      <div className="p-3 rounded-xl bg-surface-white border border-border-subtle mb-3 space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-ocean-700 pb-1 border-b border-ocean-100">
          ATTRIBUTION EVIDENCE
        </div>
        <div className="space-y-1.5 text-[11px] text-ocean-700">
          <div className="flex items-start gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
            <span>AIS trajectory intersects release corridor (2.8 km at 07:00Z)</span>
          </div>
          <div className="flex items-start gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
            <span>Historical position falls inside release window (06:12–07:27 UTC)</span>
          </div>
          <div className="flex items-start gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
            <span>Route crosses the release corridor (100% trajectory proximity)</span>
          </div>
          <div className="flex items-start gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
            <span>Transit speed (9.4 kn) matches underway discharge maneuver</span>
          </div>
          <div className="flex items-start gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
            <span>Track aligns with modeled wind and current drift vector</span>
          </div>
        </div>
      </div>

      {/* Interactive Historical Source Replay */}
      <div className="p-3.5 rounded-xl bg-ocean-900 text-white shadow-md mb-2 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-ocean-200">
              HISTORICAL SOURCE REPLAY
            </span>
          </div>
          <span className="font-mono text-xs font-extrabold text-cyan-300">
            {currentTimestampLabel}
          </span>
        </div>

        {/* Scrub Slider */}
        <div className="space-y-1">
          <input
            type="range"
            min={0}
            max={totalPoints - 1}
            value={currentIndex}
            onChange={(e) => {
              setIsReplaying(false);
              setReplayPointIndex(parseInt(e.target.value, 10));
            }}
            className="w-full h-1.5 bg-ocean-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
          <div className="flex justify-between text-[9px] text-ocean-400 font-mono">
            <span>06:12Z (Start)</span>
            <span className="text-amber-400 font-bold">07:00Z (Closest)</span>
            <span>08:41Z (Now)</span>
          </div>
        </div>

        {/* Replay Controls */}
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={handleToggleReplay}
            className="flex-1 py-1.5 rounded-lg bg-blue-accent hover:bg-blue-accent/90 active:scale-95 text-white font-bold text-xs tracking-wider uppercase flex items-center justify-center gap-1.5 transition-smooth"
          >
            {isReplaying ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Pause Replay</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Replay Source Event</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleRestartReplay}
            className="ml-2 p-2 rounded-lg bg-ocean-800 hover:bg-ocean-700 text-ocean-300 hover:text-white transition-smooth"
            title="Restart Replay"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * OceanWatch Right Intelligence Stack
 *
 * Reacts dynamically to scenario phase and user interactions:
 * - normal (07:20): clean map
 * - spill-detected (07:42): OilSpillCard
 * - correlating (08:00): OilSpillCard + AISCorrelationCard
 * - attribution-ready (08:41): OilSpillCard + AttributionSummaryCard (Explainable attribution conclusion)
 * - trace-source active (08:41+): TraceSourceDossierCard (Full source reconstruction and replay)
 * - panel toggles: VesselTelemetryDrawer, VesselFleetList, IncidentInvestigationPanel
 */
export function DetailPanel() {
  const dataProvider = useDataProvider();
  const { activePanel, setActivePanel, closePanel } = useUIStore();
  const selectedVesselId = useIncidentStore((state) => state.selectedVesselId);
  const isTraceSourceActive = useIncidentStore((state) => state.isTraceSourceActive);
  const setTraceSourceActive = useIncidentStore((state) => state.setTraceSourceActive);
  const selectVessel = useIncidentStore((state) => state.selectVessel);
  const selectIncident = useIncidentStore((state) => state.selectIncident);
  const isPlaying = useScenarioStore((state) => state.isPlaying);
  const phase = useScenarioStore((state) => state.phase);

  const { data: incidents = [] } = useQuery({
    queryKey: ['incidents'],
    queryFn: () => dataProvider.getIncidents(),
    staleTime: 0,
    refetchInterval: isPlaying ? 300 : false,
  });

  const activeIncident = incidents[0] || null;
  const isDetected = activeIncident !== null && phase !== 'normal';
  const isInvestigationActive = phase === 'correlating' || phase === 'attribution-ready';

  const { data: candidates = [] } = useQuery({
    queryKey: ['candidates', activeIncident?.id],
    queryFn: () => (activeIncident ? dataProvider.getCandidates(activeIncident.id) : []),
    enabled: Boolean(activeIncident && isInvestigationActive),
    staleTime: 0,
    refetchInterval: isPlaying ? 300 : false,
  });

  const { data: vessels = [] } = useQuery({
    queryKey: ['vessels'],
    queryFn: () => dataProvider.getVessels(),
    staleTime: 0,
    refetchInterval: isPlaying ? 150 : false,
  });

  const selectedVessel = selectedVesselId
    ? vessels.find((v) => v.id === selectedVesselId) || null
    : null;

  const topCandidate = candidates[0] || null;

  const handleInvestigate = () => {
    if (activeIncident) {
      selectIncident(activeIncident.id);
      setActivePanel('incidents');
    }
  };

  const handleSelectCandidateFromCard = (vesselId: string) => {
    selectVessel(vesselId);
    setActivePanel('vessels');
  };

  const handleSelectVesselFromList = (vesselId: string) => {
    selectVessel(vesselId);
  };

  const handleTraceSource = () => {
    if (topCandidate) {
      selectVessel(topCandidate.vesselId);
      setTraceSourceActive(true);
      setActivePanel(null); // Return to main map overview with Trace Source card
    }
  };

  const handleBackFromTraceSource = () => {
    setTraceSourceActive(false);
  };

  // If nothing to display in default mode before detection, return null
  if (activePanel === null && !isDetected && !selectedVessel && !isTraceSourceActive) {
    return null;
  }

  return (
    <div className="absolute right-6 top-24 z-20 flex flex-col gap-3 max-h-[calc(100vh-7.5rem)] overflow-y-auto pr-1 custom-scrollbar">
      {/* 1. Vessels View */}
      {activePanel === 'vessels' ? (
        selectedVessel ? (
          <VesselTelemetryDrawer
            vessel={selectedVessel}
            onClose={() => selectVessel(null)}
          />
        ) : (
          <VesselFleetList
            onSelectVessel={handleSelectVesselFromList}
            onClose={() => closePanel()}
          />
        )
      ) : activePanel === 'incidents' ? (
        /* 2. Incidents Investigation View */
        activeIncident ? (
          <IncidentInvestigationPanel
            incident={activeIncident}
            candidates={candidates}
            onSelectCandidate={handleSelectCandidateFromCard}
            onClose={() => closePanel()}
          />
        ) : null
      ) : isTraceSourceActive && topCandidate ? (
        /* 3. Dedicated Trace Source Reconstructed Dossier Card */
        <TraceSourceDossierCard
          candidate={topCandidate}
          onBack={handleBackFromTraceSource}
        />
      ) : (
        /* 4. Default Overview: Dynamic Spill Detection, Correlation, & Explainable Attribution Progression */
        <>
          {isDetected && activeIncident && (
            <OilSpillCard
              incident={activeIncident}
              phase={phase}
              onInvestigate={handleInvestigate}
            />
          )}

          {isDetected && phase === 'correlating' && candidates.length > 0 && (
            <AISCorrelationCard
              candidates={candidates}
              onSelectCandidate={handleSelectCandidateFromCard}
            />
          )}

          {isDetected && phase === 'attribution-ready' && candidates.length > 0 && (
            <AttributionSummaryCard
              candidates={candidates}
              onSelectCandidate={handleSelectCandidateFromCard}
              onTraceSource={handleTraceSource}
            />
          )}

          {selectedVessel && (
            <VesselTelemetryDrawer
              vessel={selectedVessel}
              onClose={() => selectVessel(null)}
            />
          )}
        </>
      )}
    </div>
  );
}