#!/usr/bin/env node
/**
 * acquire-ais.mjs — Historical AIS-derived vessel activity (Global Fishing Watch Events API, v3)
 *
 * Phase 4.8 acquisition for the Gulf of Kutch / western Gujarat region.
 *
 * Credentials come from the GFW_API_ACCESS_TOKEN environment variable only
 * (or an explicit --env-file). The token is NEVER printed, never written to
 * disk, and never included in error messages or output files.
 *
 * Usage:
 *   node scripts/acquire-ais.mjs --probe                       # print per-query totals, write nothing
 *   node scripts/acquire-ais.mjs                               # full paginated download to data/raw/
 *   node scripts/acquire-ais.mjs --env-file .env --probe
 *   node scripts/acquire-ais.mjs --start 2026-08-20 --end 2026-08-27 --force
 *
 * Output: one JSONL file per (event type × flag set) under data/raw/, plus a
 * data/raw/meta.json sidecar recording query config, totals, file hashes and
 * access time. Filenames are deterministic (derived only from query params).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_URL = 'https://gateway.api.globalfishingwatch.org/v3/events';

const EVENT_TYPES = [
  { key: 'fishing',     dataset: 'public-global-fishing-events:latest' },
  { key: 'port-visits', dataset: 'public-global-port-visits-events:latest' },
  { key: 'loitering',   dataset: 'public-global-loitering-events:latest' },
  { key: 'encounters',  dataset: 'public-global-encounters-events:latest' },
  { key: 'gaps',        dataset: 'public-global-gaps-events:latest' },
];

// Default query matrix — the full IND-flagged download, plus encounters (small,
// global). Foreign transit flags (tankers/bulkers on the Karachi↔Mumbai lane)
// are captured as a *capped* sample via a second invocation:
//   node scripts/acquire-ais.mjs --env-file .env \
//     --flags port-visits:PAN,LBR,MHL,MLT,SGP,ARE loitering:PAN,LBR,MHL,MLT,SGP,ARE \
//     --max-events 3000
const DEFAULT_FLAGS = {
  fishing: ['IND'],
  'port-visits': ['IND'],
  loitering: ['IND'],
  encounters: ['IND', 'PAN', 'LBR', 'MHL', 'MLT', 'SGP', 'ARE'],
  gaps: ['IND'],
};

const DEFAULTS = {
  start: '2026-08-20T00:00:00Z',
  end: '2026-08-27T23:59:59Z',
  bbox: [65, 18, 73, 25], // lng0, lat0, lng1, lat1 (applied at preprocess; recorded in meta)
  limit: 100,
  maxEvents: 50000, // hard safety bound per query
  delayMs: 300,
  outDir: join(ROOT, 'data', 'raw'),
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const a = { ...DEFAULTS, flags: {}, force: false, probe: false, envFile: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    // Closure over the loop's `i` binding, so consuming a value advances the loop.
    const value = () => { if (i + 1 >= argv.length) throw new Error(`missing value for ${arg}`); return argv[++i]; };
    switch (arg) {
      case '--probe': a.probe = true; break;
      case '--force': a.force = true; break;
      case '--start': a.start = normalizeDate(value()); break;
      case '--end': a.end = normalizeDate(value()); break;
      case '--limit': a.limit = Number(value()); break;
      case '--max-events': a.maxEvents = Number(value()); break;
      case '--delay-ms': a.delayMs = Number(value()); break;
      case '--out-dir': a.outDir = value(); break;
      case '--env-file': a.envFile = value(); break;
      case '--bbox':
        a.bbox = value().split(',').map(Number);
        if (a.bbox.length !== 4) throw new Error('--bbox expects lng0,lat0,lng1,lat1');
        break;
      case '--flags':
        // Grammar: TYPE:F1,F2,...  — ';' separates type specs, ',' separates flags
        // within a type. Repeatable; the same TYPE merges (union of flags).
        for (const spec of value().split(';')) {
          const colon = spec.indexOf(':');
          const type = colon < 0 ? spec : spec.slice(0, colon);
          const flags = colon < 0 ? [] : spec.slice(colon + 1).split(',').filter(Boolean);
          if (!EVENT_TYPES.some((t) => t.key === type)) throw new Error(`unknown event type '${type}' in --flags`);
          if (!flags.length) {
            a.flags[type] = DEFAULT_FLAGS[type];
          } else {
            a.flags[type] = [...new Set([...(a.flags[type] ?? []), ...flags])];
          }
        }
        break;
      case '--help':
      case '-h':
        console.log(`Usage: node scripts/acquire-ais.mjs [options]
  --probe              print per-query totals without downloading
  --start ISO_DATE     query start (default ${DEFAULTS.start})
  --end ISO_DATE       query end (default ${DEFAULTS.end})
  --bbox lng0,lat0,lng1,lat1  filter region recorded in meta (applied in preprocess)
  --flags TYPE:F1,F2;TYPE:F1   override flag set per event type; repeatable,
                            ';' separates types, ',' separates flags
                            e.g. --flags "port-visits:PAN,LBR;loitering:PAN,LBR"
  --max-events N       hard cap per query (default ${DEFAULTS.maxEvents})
  --delay-ms N         pause between pages (default ${DEFAULTS.delayMs})
  --limit N            page size (default ${DEFAULTS.limit})
  --out-dir DIR        raw output dir (default data/raw)
  --env-file PATH      load KEY=VALUE pairs (e.g. GFW_API_ACCESS_TOKEN=...) from PATH
  --force              overwrite existing raw files (default: skip completed queries)
  --help               this help

Credentials: GFW_API_ACCESS_TOKEN env var (or --env-file). Never printed or written.`);
        process.exit(0);
      default:
        throw new Error(`unknown argument '${arg}' (see --help)`);
    }
  }
  a.start = normalizeDate(a.start);
  a.end = normalizeDate(a.end);
  return a;
}

function normalizeDate(s) {
  // GFW v3 accepts date-only YYYY-MM-DD (query-param charset is lowercase + dashes).
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid date '${s}'`);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// .env loader (KEY=VALUE lines; skips comments/blanks; no quoting semantics)
// ---------------------------------------------------------------------------

function loadEnvFile(path) {
  const abs = join(process.cwd(), path);
  const text = readFileSync(abs, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
}

// ---------------------------------------------------------------------------
// Token handling — verify existence only; never print the value
// ---------------------------------------------------------------------------

function resolveToken(args) {
  if (args.envFile) loadEnvFile(args.envFile);
  const token = process.env.GFW_API_ACCESS_TOKEN;
  if (!token || token.length < 20) {
    console.error('ERROR: GFW_API_ACCESS_TOKEN is not set (or looks truncated).');
    console.error('       Set it in the environment or pass --env-file PATH.');
    console.error('       The token is never printed or written to disk.');
    process.exit(2);
  }
  return token;
}

// ---------------------------------------------------------------------------
// GFW client
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchEventsPage(token, { dataset, query, body }) {
  // Query params: only pagination. All filters (startDate/endDate/flags/…) go
  // in the JSON body — confirmed from the official python client + live probes.
  const url = new URL(API_URL);
  for (const [k, v] of Object.entries(query)) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  let lastErr;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ datasets: [dataset], ...body }),
        signal: AbortSignal.timeout(90000),
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`);
        await sleep(1000 * Math.pow(2, attempt));
        continue;
      }
      if (!res.ok) {
        const text = (await res.text()).slice(0, 400);
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      return await res.json();
    } catch (e) {
      lastErr = e;
      await sleep(1000 * Math.pow(2, attempt));
    }
  }
  throw lastErr;
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function fetchAllEvents(token, args, type) {
  const flags = args.flags[type.key] ?? DEFAULT_FLAGS[type.key];
  const flagKey = flags.join('_');
  const startDate = args.start; // inclusive, user-facing
  const endDate = addDays(args.end, 1); // API end_date is exclusive → covers full last day
  const all = [];
  let offset = 0;
  let total = null;
  let metadata = null;
  let pages = 0;
  const maxPages = Math.ceil(args.maxEvents / args.limit) + 2;
  while (true) {
    const body = await fetchEventsPage(token, {
      dataset: type.dataset,
      query: { limit: args.limit, offset },
      body: { startDate, endDate, flags },
    });
    if (pages === 0) metadata = body.metadata ?? null;
    total = body.total;
    const entries = body.entries ?? [];
    all.push(...entries);
    const next = body.nextOffset;
    pages++;
    if (args.probe) break; // one page only
    if (entries.length === 0 || next == null) break;
    if (next <= offset) break;
    offset = next;
    if (all.length >= total || all.length >= args.maxEvents) break;
    if (pages >= maxPages) break;
    await sleep(args.delayMs);
  }
  return {
    entries: all,
    total,
    flags,
    metadata,
    fileBase: `${type.key}-${flagKey}_${clean(startDate)}_${clean(args.end)}`,
  };
}

function clean(iso) {
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function sha256(p) {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = resolveToken(args);
  mkdirSync(args.outDir, { recursive: true });

  console.log(`GFW Events acquisition  start=${args.start}  end=${args.end}`);
  console.log(`  region (applied at preprocess): ${JSON.stringify(args.bbox)}  out: ${args.outDir}`);
  console.log(`  token: ${token ? 'present (verified only)' : 'MISSING'}\n`);

  const runMeta = {
    source: 'globalfishingwatch.org Events API (v3)',
    endpoint: API_URL,
    accessDate: new Date().toISOString(),
    window: { start: args.start, end: args.end },
    bbox: args.bbox,
    queries: [],
    note: 'Raw event dumps are git-ignored (data/raw/). Token never stored.',
  };

  for (const type of EVENT_TYPES) {
    const flags = args.flags[type.key] ?? DEFAULT_FLAGS[type.key];
    const flagKey = flags.join('_');
    const file = `events-${type.key}-${flagKey}_${clean(args.start)}_${clean(args.end)}.jsonl`;
    const outPath = join(args.outDir, file);

    if (!args.probe && !args.force && existsSync(outPath) && statSync(outPath).size > 0) {
      const n = readFileSync(outPath, 'utf8').split(/\r?\n/).filter((l) => l.trim()).length;
      console.log(`  skip  ${type.key.padEnd(12)} (${file} exists, ${n} lines) — use --force to re-download`);
      runMeta.queries.push({ type: type.key, flags, file, skipped: true, lines: n });
      continue;
    }

    const { entries, total, metadata } = await fetchAllEvents(token, args, type);
    const tag = args.probe ? 'probe' : 'ok';
    console.log(`  ${tag.padEnd(5)} ${type.key.padEnd(12)} total=${total ?? '?'}  fetched=${entries.length}  flags=${flags.join(',')}`);

    if (args.probe) {
      const types = {};
      for (const e of entries) {
        const k = e.vessel?.type ?? 'unknown';
        types[k] = (types[k] ?? 0) + 1;
      }
      console.log(`        sample vessel-type dist (page 1 of ${total ?? '?'}): ${JSON.stringify(types)}`);
      continue;
    }

    if (entries.length > 0) {
      let out = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
      writeFileSync(outPath, out);
    } else {
      writeFileSync(outPath, ''); // record that the query returned nothing
    }
    runMeta.queries.push({
      type: type.key,
      flags,
      file,
      total,
      downloaded: entries.length,
      metadata: metadata ?? undefined,
      sha256: sha256(outPath),
    });
    await sleep(args.delayMs);
  }

  if (!args.probe) {
    const metaPath = join(args.outDir, 'meta.json');
    writeFileSync(metaPath, JSON.stringify(runMeta, null, 2) + '\n');
    console.log(`\nWrote ${metaPath}`);
  } else {
    console.log('\nProbe only — nothing written.');
  }
}

main().catch((e) => {
  console.error(`\nACQUISITION FAILED: ${e.message}`);
  process.exit(1);
});
