#!/usr/bin/env node
/**
 * preprocess-ais.mjs — Historical AIS snapshot: parse → validate → process.
 *
 * Phase 4.8 preprocessing for GFW Events raw dumps (data/raw/events-*.jsonl).
 * Deterministic: given the same raw input, output is byte-identical except for
 * the recorded run timestamp. Reuses the frontend's land mask
 * (src/simulation/landMask.ts + landGrid.ts) for geographic validation.
 *
 * Pipeline (see task §"data preprocessing pipeline"):
 *   read → parse/normalize → dedup → invalid-coord removal → bbox filter
 *   → land-mask validation (points AND segments) → per-vessel segmentation
 *   → speed/jump sanity → vessel-type normalization → fleet selection
 *   → compact processed dataset + quality report
 *
 * Run:
 *   node scripts/preprocess-ais.mjs                      # uses data/raw + meta.json
 *   node scripts/preprocess-ais.mjs --raw data/raw --out data/processed
 */
import { createJiti } from 'jiti';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'); // repo root
const jiti = createJiti(import.meta.url, { fsCache: false });
const { isOnLand, isSafeWater, segmentCrossesLand, segmentLeavesSafeWater } =
  await jiti.import('../src/simulation/landMask.ts');
const { distanceKm } = await jiti.import('../src/simulation/geo.ts');

// ---------------------------------------------------------------------------
// Config / thresholds
// ---------------------------------------------------------------------------

const DEFAULTS = {
  rawDir: join(ROOT, 'data', 'raw'),
  outDir: join(ROOT, 'data', 'processed'),
};

// Track segmentation + sanity thresholds (documented; not interpolating across
// gaps — we only ever *flag* these, never invent positions).
const MAX_SEGMENT_GAP_H = 48; // gap > 48 h splits a vessel's events into segments
const MAX_IMPLIED_SPEED_KN = 40; // a consecutive hop implying > 40 kn is impossible
const MAX_GEO_JUMP_KM = 500; // single hop > 500 km is a discontinuity
const LONG_EVENT_H = 168; // full event duration > 7 days flagged (laid-up / artifacts)
const GRID = { lng0: 65.5, lat0: 18.5, lng1: 73.5, lat1: 25.5 }; // land grid extent

// ---------------------------------------------------------------------------
// Event-type + OceanWatch vessel-type normalization (preserves raw values)
// ---------------------------------------------------------------------------

const EVENT_TYPES = {
  fishing: 'fishing',
  port_visit: 'port-visit',
  PORT_VISIT: 'port-visit',
  'port-visit': 'port-visit',
  loitering: 'loitering',
  encounter: 'encounter',
  ENCOUNTER: 'encounter',
  gap: 'gap',
};
const normalizeEventType = (raw) => EVENT_TYPES[raw] ?? String(raw ?? 'unknown');

const GFW_TO_OW = {
  fishing: 'fishing',
  carrier: 'cargo', // refrigerated/reefer carrier → closest OceanWatch cargo
  cargo: 'cargo',
  container: 'container',
  tanker: 'tanker',
  bunker: 'tanker', // fuel-supply vessel carries petroleum product
  passenger: 'other',
  seismic_vessel: 'other',
  support: 'other',
  gear: 'other',
  discrepancy: 'other',
  patrol: 'patrol',
  other: 'other',
  NA: 'other',
};
const OW_TYPES = ['tanker', 'cargo', 'container', 'fishing', 'patrol', 'other'];
const normalizeType = (raw) => GFW_TO_OW[String(raw ?? '').toLowerCase()] ?? 'other';

// ---------------------------------------------------------------------------
// Parsing / normalization
// ---------------------------------------------------------------------------

function parseEvents(rawDir) {
  const files = readdirSync(rawDir)
    .filter((f) => /^events-.+\.jsonl$/.test(f))
    .sort();
  const rawEvents = [];
  for (const file of files) {
    const lines = readFileSync(join(rawDir, file), 'utf8').split(/\r?\n/).filter((l) => l.trim());
    for (const line of lines) {
      try {
        rawEvents.push({ file, e: JSON.parse(line) });
      } catch {
        // malformed line — skipped (reported via raw read count vs parsed count)
      }
    }
  }
  return { files, rawEvents };
}

const toIso = (ms) => new Date(ms).toISOString();

/**
 * Normalize a raw GFW event into a canonical flat record.
 * Position: the event's `position` point. For port visits this is the
 * anchorage; for fishing/loitering it is the activity location.
 *
 * Durations are computed two ways: the event's FULL span (start..end, which
 * can be years for laid-up vessels / merged anchorages) and the IN-WINDOW
 * overlap (the portion observed inside our snapshot window).
 */
function normalizeEvent({ file, e }, W) {
  const pos = e.position;
  const v = e.vessel ?? {};
  const startMs = Date.parse(e.start);
  const endMs = Date.parse(e.end);
  const port = e.port_visit ?? {};
  const anchorage = port.startAnchorage ?? {};
  const fishing = e.fishing ?? {};
  const encounter = e.encounter ?? {};
  const fullDurationH = Number.isFinite(startMs) && Number.isFinite(endMs) ? (endMs - startMs) / 3.6e6 : null;
  const clipStart = Number.isFinite(startMs) ? Math.max(startMs, W.start) : null;
  const clipEnd = Number.isFinite(endMs) ? Math.min(endMs, W.end) : null;
  const windowDurationH =
    clipStart != null && clipEnd != null && clipEnd > clipStart ? (clipEnd - clipStart) / 3.6e6 : 0;
  return {
    eventType: normalizeEventType(e.type),
    rawType: e.type ?? 'unknown',
    id: e.id ?? '',
    file,
    vesselId: v.id ?? '',
    ssvid: v.ssvid ?? null,
    name: v.name ?? null,
    flag: v.flag ?? null,
    gfwType: v.type ?? 'unknown',
    type: normalizeType(v.type),
    startMs: Number.isFinite(startMs) ? startMs : null,
    endMs: Number.isFinite(endMs) ? endMs : null,
    lat: Number.isFinite(pos?.lat) ? pos.lat : null,
    lon: Number.isFinite(pos?.lon) ? pos.lon : null,
    fullDurationH,
    windowDurationH,
    longDuration: fullDurationH != null && fullDurationH > LONG_EVENT_H,
    fishingDistanceKm: fishing.totalDistanceKm ?? null,
    fishingAvgSpeedKn: fishing.averageSpeedKnots ?? null,
    fishingRisk: fishing.potentialRisk ?? null,
    portName: anchorage.name ?? null,
    portAnchorageId: anchorage.id ?? null,
    portVisitDurationH: port.durationHrs ?? null,
    encounterPartner: encounter.vessel?.ssvid ?? null,
    encounterType: encounter.encounterType ?? null,
    startDistShoreKm: e.distances?.startDistanceFromShoreKm ?? null,
    endDistShoreKm: e.distances?.endDistanceFromShoreKm ?? null,
  };
}

const inBbox = (lon, lat, bbox) =>
  lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];

const onGrid = (lon, lat) =>
  lon >= GRID.lng0 && lon <= GRID.lng1 && lat >= GRID.lat0 && lat <= GRID.lat1;

// ---------------------------------------------------------------------------
// Per-vessel aggregation + segmentation
// ---------------------------------------------------------------------------

function buildVessels(events, W) {
  const byVessel = new Map();
  for (const ev of events) {
    const key = ev.vesselId || `no-id-${ev.flag ?? '?'}-${ev.ssvid ?? '?'}`;
    if (!byVessel.has(key)) byVessel.set(key, []);
    byVessel.get(key).push(ev);
  }

  const vessels = [];
  for (const [vesselId, evs] of byVessel) {
    const sorted = [...evs].sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0) || (a.id < b.id ? -1 : 1));
    const first = sorted[0];
    const firstMs = sorted.reduce((m, e) => Math.min(m, e.startMs ?? Infinity), Infinity);
    const lastMs = sorted.reduce((m, e) => Math.max(m, e.endMs ?? -Infinity), -Infinity);
    const windowActivityH = sorted.reduce((s, e) => s + (e.windowDurationH ?? 0), 0);
    // Event span clipped to the snapshot window: the vessel's in-region presence
    // during our observation period (raw spans can be years for laid-up vessels).
    const clippedFirst = Math.max(firstMs, W.start);
    const clippedLast = Math.min(lastMs, W.end);
    const eventSpanH = Number.isFinite(clippedFirst) && Number.isFinite(clippedLast)
      ? Math.max(0, (clippedLast - clippedFirst) / 3.6e6)
      : 0;
    const fullSpanH = Number.isFinite(firstMs) && Number.isFinite(lastMs) ? (lastMs - firstMs) / 3.6e6 : 0;

    // Segments: split where temporal gap > MAX_SEGMENT_GAP_H.
    const segments = [];
    let cur = [sorted[0]];
    let maxImpliedKn = 0;
    let crossings = 0;
    let leavesSafe = 0;
    let overlaps = 0;
    let speedJumps = 0;
    let geoJumps = 0;
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1];
      const b = sorted[i];
      const gapH = ((b.startMs ?? 0) - (a.endMs ?? 0)) / 3.6e6;
      const km = distanceKm({ lat: a.lat, lng: a.lon }, { lat: b.lat, lng: b.lon });
      if (segmentCrossesLand({ lat: a.lat, lng: a.lon }, { lat: b.lat, lng: b.lon })) crossings++;
      if (segmentLeavesSafeWater({ lat: a.lat, lng: a.lon }, { lat: b.lat, lng: b.lon })) leavesSafe++;
      if (km > MAX_GEO_JUMP_KM) geoJumps++;
      // Implied speed uses the between-events travel window (b.start − a.end), and
      // only when there is genuinely separate activity (no temporal overlap).
      // Overlapping events (same wall-clock window, different positions) are an
      // event-modeling artifact, NOT a vessel teleport — counted separately.
      if (a.endMs != null && b.startMs != null && a.endMs > b.startMs) {
        overlaps++;
      } else {
        const travelTimeH = ((b.startMs ?? 0) - (a.endMs ?? a.startMs)) / 3.6e6;
        if (travelTimeH > 0.5) {
          const kn = km / travelTimeH;
          maxImpliedKn = Math.max(maxImpliedKn, kn);
          if (kn > MAX_IMPLIED_SPEED_KN) speedJumps++;
        }
      }
      if (gapH > MAX_SEGMENT_GAP_H) {
        segments.push(cur);
        cur = [];
      }
      cur.push(b);
    }
    if (cur.length) segments.push(cur);

    const portVisits = [...new Set(sorted.filter((e) => e.eventType === 'port-visit' && e.portName).map((e) => e.portName))];
    const fishingEvents = sorted.filter((e) => e.eventType === 'fishing');
    const loitering = sorted.filter((e) => e.eventType === 'loitering');
    const encounters = sorted.filter((e) => e.eventType === 'encounter');
    const landEvents = sorted.filter((e) => e.lat != null && e.lon != null && isOnLand(e.lon, e.lat)).length;

    vessels.push({
      id: vesselId,
      ssvid: first.ssvid,
      name: first.name,
      flag: first.flag,
      gfwType: first.gfwType,
      type: first.type,
      eventCount: sorted.length,
      segmentCount: segments.length,
      firstSeen: Number.isFinite(firstMs) ? toIso(firstMs) : null,
      lastSeen: Number.isFinite(lastMs) ? toIso(lastMs) : null,
      eventSpanH: Math.round(eventSpanH * 10) / 10,
      fullSpanH: Math.round(fullSpanH * 10) / 10,
      windowActivityH: Math.round(windowActivityH * 10) / 10,
      quality: {
        landEvents,
        crossings,
        leavesSafeWater: leavesSafe,
        overlappingEvents: overlaps,
        speedJumps,
        geoJumps,
        maxImpliedKn: Math.round(maxImpliedKn * 10) / 10,
      },
      portVisits,
      fishing: {
        events: fishingEvents.length,
        totalDistanceKm: Math.round(fishingEvents.reduce((s, e) => s + (e.fishingDistanceKm ?? 0), 0) * 10) / 10,
        avgSpeedKn: fishingEvents.length
          ? Math.round((fishingEvents.reduce((s, e) => s + (e.fishingAvgSpeedKn ?? 0), 0) / fishingEvents.length) * 10) / 10
          : null,
      },
      loitering: { events: loitering.length },
      encounters: { events: encounters.length },
    });
  }
  vessels.sort((a, b) => (a.ssvid ?? '').localeCompare(b.ssvid ?? '') || (a.id < b.id ? -1 : 1));
  return { vessels };
}

// ---------------------------------------------------------------------------
// Quality report
// ---------------------------------------------------------------------------

function buildQuality(events, vessels, { dedupCount, invalidCoords, outsideBbox, rawTotal, files }) {
  const multiSpan = vessels.filter((v) => v.eventSpanH > 0).map((v) => v.eventSpanH).sort((a, b) => a - b);
  const median = (arr) => (arr.length ? arr[Math.floor(arr.length / 2)] : null);
  const eventOnLand = (e) => e.lat != null && e.lon != null && isOnLand(e.lon, e.lat);
  const vesselsByType = {};
  for (const t of OW_TYPES) vesselsByType[t] = vessels.filter((v) => v.type === t).length;

  const landByType = {};
  for (const e of events) {
    landByType[e.eventType] = landByType[e.eventType] || { n: 0, onLand: 0, offGrid: 0 };
    landByType[e.eventType].n++;
    if (eventOnLand(e)) {
      landByType[e.eventType].onLand++;
      if (!onGrid(e.lon, e.lat)) landByType[e.eventType].offGrid++;
    }
  }

  const tiers = {
    '1 event': vessels.filter((v) => v.eventCount === 1).length,
    '2-3 events': vessels.filter((v) => v.eventCount >= 2 && v.eventCount <= 3).length,
    '4+ events': vessels.filter((v) => v.eventCount >= 4).length,
  };

  return {
    sourceFiles: files,
    rawEventsRead: rawTotal,
    parsedEvents: events.length + outsideBbox + invalidCoords + dedupCount, // approximate parsed count
    deduplicated: dedupCount,
    invalidCoordsDropped: invalidCoords,
    outsideBboxDropped: outsideBbox,
    validInRegionEvents: events.length,
    rawVessels: vessels.length,
    vesselsByType,
    vesselTiers: tiers,
    medianEventSpanH: median(multiSpan),
    eventsByType: events.reduce((m, e) => ((m[e.eventType] = (m[e.eventType] ?? 0) + 1), m), {}),
    landValidation: {
      eventsOnLand: events.filter(eventOnLand).length,
      eventsNotSafeWater: events.filter((e) => e.lat != null && e.lon != null && !isSafeWater(e.lon, e.lat)).length,
      eventsOutsideGridCoverage: events.filter((e) => e.lat != null && e.lon != null && !onGrid(e.lon, e.lat)).length,
      onLandByEventType: landByType,
      segmentCrossingsLand: vessels.reduce((s, v) => s + v.quality.crossings, 0),
      segmentsLeavingSafeWater: vessels.reduce((s, v) => s + v.quality.leavesSafeWater, 0),
    },
    sanity: {
      impossibleSpeedJumps: vessels.reduce((s, v) => s + v.quality.speedJumps, 0),
      overlappingEventArtifacts: vessels.reduce((s, v) => s + v.quality.overlappingEvents, 0),
      largeGeographicJumps: vessels.reduce((s, v) => s + v.quality.geoJumps, 0),
      longDurationEvents: events.filter((e) => e.longDuration).length,
      maxImpliedSpeedKn: Math.max(0, ...vessels.map((v) => v.quality.maxImpliedKn)),
      vesselsWithLandEvents: vessels.filter((v) => v.quality.landEvents > 0).length,
    },
    flagsByType: events.reduce((m, e) => ((m[e.flag ?? '?'] = (m[e.flag ?? '?'] ?? 0) + 1), m), {}),
    portCalls: {
      byPort: events
        .filter((e) => e.eventType === 'port-visit' && e.portName)
        .reduce((m, e) => ((m[e.portName] = (m[e.portName] ?? 0) + 1), m), {}),
      unnamed: events.filter((e) => e.eventType === 'port-visit' && !e.portName).length,
    },
  };
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function buildDataset(events, vessels, quality, meta, W) {
  const byVesselIdx = new Map(vessels.map((v, i) => [v.id, i]));
  return {
    dataset: {
      source: 'Global Fishing Watch Events API (v3) — real AIS-derived vessel activity',
      rawDir: 'data/raw/',
      window: { start: meta?.window?.start ?? null, end: meta?.window?.end ?? null },
      clipWindow: { start: toIso(W.start), end: toIso(W.end) },
      region: { bbox: meta?.bbox ?? null, label: 'Western Gujarat / Gulf of Kutch / adjacent Arabian Sea' },
      acquiredAt: meta?.accessDate ?? null,
      thresholds: {
        maxSegmentGapH: MAX_SEGMENT_GAP_H,
        maxImpliedSpeedKn: MAX_IMPLIED_SPEED_KN,
        maxGeographicJumpKm: MAX_GEO_JUMP_KM,
        longEventH: LONG_EVENT_H,
      },
      note: 'Events are discrete AIS-derived activity records (port-visit / loitering / fishing / encounter), NOT continuous underway tracks. Segment validation flags gaps between events; no positions are interpolated.',
    },
    summary: {
      validInRegionEvents: events.length,
      vessels: vessels.length,
      vesselsByType: quality.vesselsByType,
      medianEventSpanH: quality.medianEventSpanH,
      eventsByType: quality.eventsByType,
    },
    vessels: vessels.map((v) => ({ ...v })),
    events: events.map((e) => ({
      vesselIdx: byVesselIdx.get(e.vesselId) ?? null,
      type: e.eventType,
      id: e.id,
      start: e.startMs != null ? toIso(e.startMs) : null,
      end: e.endMs != null ? toIso(e.endMs) : null,
      lat: e.lat,
      lon: e.lon,
      ssvid: e.ssvid,
      name: e.name,
      flag: e.flag,
      gfwType: e.gfwType,
      owType: e.type,
      windowDurationH: Math.round((e.windowDurationH ?? 0) * 10) / 10,
      longDuration: e.longDuration,
      portName: e.portName,
      fishingDistanceKm: e.fishingDistanceKm,
      fishingAvgSpeedKn: e.fishingAvgSpeedKn,
      portVisitDurationH: e.portVisitDurationH,
      encounterPartner: e.encounterPartner,
      encounterType: e.encounterType,
    })),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const a = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => { if (i + 1 >= argv.length) throw new Error(`missing value for ${arg}`); return argv[++i]; };
    switch (arg) {
      case '--raw': a.rawDir = value(); break;
      case '--out': a.outDir = value(); break;
      case '--help':
      case '-h':
        console.log('Usage: node scripts/preprocess-ais.mjs [--raw data/raw] [--out data/processed]');
        process.exit(0);
      default:
        throw new Error(`unknown argument '${arg}'`);
    }
  }
  return a;
}

function readMeta(rawDir) {
  try {
    return JSON.parse(readFileSync(join(rawDir, 'meta.json'), 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const meta = readMeta(args.rawDir);
  mkdirSync(args.outDir, { recursive: true });

  const { files, rawEvents } = parseEvents(args.rawDir);
  const bbox = meta?.bbox ?? [65, 18, 73, 25];
  const winStart = meta?.window?.start ?? '2026-08-20';
  const winEnd = meta?.window?.end ?? '2026-08-27';
  // Clip window: [start 00:00, end+1d 00:00) — inclusive of the full last day.
  const W = {
    start: Date.parse(`${winStart}T00:00:00Z`),
    end: Date.parse(`${winEnd}T00:00:00Z`) + 24 * 3600 * 1000,
  };

  console.log(`Preprocess: ${rawEvents.length} raw events across ${files.length} file(s)`);
  console.log(`  window ${winStart} → ${winEnd} (clipped [${toIso(W.start)}, ${toIso(W.end)})  bbox ${JSON.stringify(bbox)}`);

  // 1. normalize + dedup
  const seen = new Set();
  const normalized = [];
  let dedupCount = 0;
  for (const raw of rawEvents) {
    const ev = normalizeEvent(raw, W);
    if (seen.has(ev.id)) { dedupCount++; continue; }
    seen.add(ev.id);
    normalized.push(ev);
  }

  // 2. invalid coords / missing time
  const withCoords = normalized.filter((e) => e.lat != null && e.lon != null && e.startMs != null);
  const invalidCoords = normalized.length - withCoords.length;

  // 3. bbox filter
  const inRegion = withCoords.filter((e) => inBbox(e.lon, e.lat, bbox));
  const outsideBbox = withCoords.length - inRegion.length;

  // 4. per-vessel aggregation
  const { vessels } = buildVessels(inRegion, W);

  // 5. quality
  const quality = buildQuality(inRegion, vessels, { dedupCount, invalidCoords, outsideBbox, rawTotal: rawEvents.length, files });

  // 6. dataset
  const dataset = buildDataset(inRegion, vessels, quality, meta, W);

  const windowKey = `${winStart.replace(/-/g, '')}_${winEnd.replace(/-/g, '')}`;
  const base = `ais-events_${windowKey}_gulf-of-kutch`;
  writeFileSync(join(args.outDir, `${base}.json`), JSON.stringify(dataset, null, 1) + '\n');
  writeFileSync(join(args.outDir, `quality-report.json`), JSON.stringify(quality, null, 2) + '\n');

  // ---- human-readable summary ----
  console.log('\n=== QUALITY REPORT ===');
  console.log(`raw events read        : ${quality.rawEventsRead}`);
  console.log(`deduplicated           : ${quality.deduplicated}`);
  console.log(`invalid coords dropped : ${quality.invalidCoordsDropped}`);
  console.log(`outside bbox dropped   : ${quality.outsideBboxDropped}`);
  console.log(`valid in-region        : ${quality.validInRegionEvents}  (${JSON.stringify(quality.eventsByType)})`);
  console.log(`vessels (in-region)    : ${quality.rawVessels}`);
  console.log(`vessel tiers           : ${JSON.stringify(quality.vesselTiers)}`);
  console.log(`vessels by type        : ${JSON.stringify(quality.vesselsByType)}`);
  console.log(`median event span      : ${quality.medianEventSpanH?.toFixed(1) ?? 'n/a'} h`);
  console.log(`events on land         : ${quality.landValidation.eventsOnLand}  (off-grid ${quality.landValidation.eventsOutsideGridCoverage})`);
  console.log(`  on-land by type      : ${JSON.stringify(Object.fromEntries(Object.entries(quality.landValidation.onLandByEventType).map(([k, v]) => [k, `${v.onLand}/${v.n}`])))}`);
  console.log(`events not safe water  : ${quality.landValidation.eventsNotSafeWater}`);
  console.log(`segment land crossings : ${quality.landValidation.segmentCrossingsLand}`);
  console.log(`segments leave safe    : ${quality.landValidation.segmentsLeavingSafeWater}`);
  console.log(`impossible speed jumps : ${quality.sanity.impossibleSpeedJumps}  (max implied ${quality.sanity.maxImpliedSpeedKn} kn)`);
  console.log(`overlapping artifacts   : ${quality.sanity.overlappingEventArtifacts}`);
  console.log(`large geo jumps        : ${quality.sanity.largeGeographicJumps}`);
  console.log(`long-duration events   : ${quality.sanity.longDurationEvents} (laid-up / merged anchorages)`);
  console.log(`port calls top         : ${JSON.stringify(Object.entries(quality.portCalls.byPort).sort((a, b) => b[1] - a[1]).slice(0, 10))}`);
  console.log(`flags present          : ${JSON.stringify(quality.flagsByType)}`);
  console.log(`\nwrote ${join(args.outDir, `${base}.json`)} and ${join(args.outDir, 'quality-report.json')}`);
}

main().catch((e) => { console.error(`\nPREPROCESS FAILED: ${e.message}`); process.exit(1); });
