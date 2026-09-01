# Provenance — Historical AIS-Derived Activity Snapshot (Gulf of Kutch)

**Phase 4.8 deliverable.** Every fact below is recorded so a future engineer
can re-acquire, re-process, or audit this snapshot without guessing.

---

## 1. Dataset identity

| Field | Value |
|---|---|
| Name | Historical AIS-derived vessel-activity snapshot — Gulf of Kutch / western Gujarat / adjacent Arabian Sea |
| Artifact (processed) | `data/processed/ais-events_20260820_20260827_gulf-of-kutch.json` |
| Quality report | `data/processed/quality-report.json` |
| Realism analysis | `data/processed/realism-analysis.md` |
| Source decision memo | `data/provenance/01-source-selection.md` |
| Acquisition script | `scripts/acquire-ais.mjs` |
| Preprocessing script | `Frontend/scripts/preprocess-ais.mjs` |

## 2. Source

- **Provider:** Global Fishing Watch (GFW) — AIS data aggregated from
  terrestrial + satellite receivers by GFW and partners, modelled into
  *events* (fishing / port visits / loitering / encounters / gaps).
- **API:** v3 gateway, `POST https://gateway.api.globalfishingwatch.org/v3/events`
  (paginated; filters in JSON body — `startDate`, `endDate`, `flags`).
- **Datasets queried:**
  - `public-global-port-visits-events:latest`
  - `public-global-fishing-events:latest`
  - `public-global-loitering-events:latest`
  - `public-global-encounters-events:latest`
  - `public-global-gaps-events:latest`
- **Access token:** `GFW_API_ACCESS_TOKEN` (environment variable). Verified
  present and usable at acquisition time; **never printed, stored, or
  committed**. See `01-source-selection.md` §3 for what the token can/cannot
  access (individual vessel *tracks* are **not** accessible — events only).

## 3. Acquisition parameters

| Field | Value |
|---|---|
| Access date | 2026-08-31 (window in the past, fixed) |
| Window (requested) | 2026-08-20 → 2026-08-27 inclusive (8 calendar days; API `endDate` passed exclusive → +1 day) |
| Region (bbox, recorded) | lng 65–73, lat 18–25 (applied client-side during preprocessing; GFW events API is global and does not take a bbox) |
| Flags (full download) | IND — fishing, port-visits, loitering, gaps; IND+PAN+LBR+MHL+MLT+SGP+ARE — encounters |
| Flags (capped foreign sample) | PAN,LBR,MHL,MLT,SGP,ARE — port-visits, loitering (cap 2,500/query) |
| Raw files | 7 × `.jsonl` in `data/raw/` (git-ignored) + `data/raw/meta.json` (per-query totals, hashes, access time) |

## 4. Processing chain (deterministic)

`preprocess-ais.mjs` (Node, reads `.jsonl` → writes compact JSON). Pipeline,
in order:

1. Parse each raw event; normalize event types and timestamps.
2. Dedup by event id (1 duplicate found across all files).
3. Drop events with invalid coordinates (0 found).
4. Bbox filter to lng 65–73, lat 18–25 (13,123 dropped).
5. Land-mask validation **reusing the app's own `landMask.ts`** functions
   (`isOnLand`, `isSafeWater`, `segmentCrossesLand`, `segmentLeavesSafeWater`).
6. Per-vessel grouping, chronological sort, track segmentation on gaps > 48 h,
   speed / geographic-jump sanity checks.
7. Vessel-type normalization GFW → OceanWatch
   (`fishing`→fishing, `carrier/cargo`→cargo, `container`→container,
   `tanker`→tanker, `bunker`→tanker, else→other), original `gfwType` retained.
8. Quality report + compact dataset written.

Reproducibility: rerunning the script on the same raw files is
**byte-identical** (verified by sha256 on both outputs).

## 5. Contents of the processed snapshot

- **3,538** valid in-region events (2,732 port-visits, 767 loitering, 39 fishing).
- **969** distinct vessels (GFW vessel ids); 381 have ≥ 2 events (interpolatable
  within the window).
- Per-vessel: id/ssvid/name/flag, GFW type + normalized type, event span
  (clipped to window), quality flags, port-visit list, fishing/loitering/
  encounter aggregates.
- Per-event: canonical type, vessel index, start/end (ISO), position
  (lat/lon), dwell, port name / fishing / encounter fields.

## 6. License / terms (sourced only — nothing invented)

- GFW makes data available for **non-commercial / research** use; the API is
  documented as restricted to such purposes. This project is a hackathon
  prototype and uses the data for analysis and calibration only — consistent
  with that scope.
- Raw AIS event dumps are **not redistributed in this repository**: `data/raw/`
  is git-ignored. Only derived compact aggregate statistics and the processed
  JSON (events/positions/timestamps per vessel) are committed. Anyone wishing
  to redistribute the processed file should re-check GFW's current terms.
- No license text beyond what GFW's own documentation states is asserted here.
  **Do not treat these notes as legal advice.** Re-verify terms at
  https://globalfishingwatch.org (Data & Research pages) before any
  non-internal use.
- Attribution: "Data courtesy of Global Fishing Watch — globalfishingwatch.org".

## 7. Caveats (read before using)

1. **Events, not continuous tracks.** The snapshot contains *activity events*
   (port visits, fishing bouts, loitering) with single representative
   positions, not the full underway trajectory between them. Consecutive
   events for one vessel are a coarse path, not a dense AIS track. Do not use
   this file to reproduce continuous vessel movement.
2. **Position semantics.** Port-visit `position` = anchorage location where the
   visit *started*; the visit `end` timestamp is the departure time. Comparing
   one visit's anchorage position to the next event's position can imply
   implausible speeds (max 73 kn seen) — an **artifact of event geometry, not
   bad AIS**. See `realism-analysis.md` §3.
3. **Vessel type granularity.** GFW coarse typing marks most non-fishing
   vessels `other`, so normalized OceanWatch type is reliable mainly for
   `fishing`. `tanker`/`container` counts in the snapshot are lower bounds.
4. **Coverage bias.** Loitering / fishing / port-visit detections are model
   outputs with their own thresholds; quiet anchorage dwell and small-craft
   activity can be under-detected. GFW loitering in this window concentrates
   off Maharashtra (Bombay High / Mumbai approaches); little in the Gulf of
   Kutch itself.
5. **Foreign-flag sample is capped** (≤ 2,500 events/query). Foreign Gulf
   traffic is present but not exhaustively enumerated (82 in-region foreign
   events: 71 loitering, 11 port-visits).
6. **Window is a fixed historical 8-day slice** (2026-08-20 → 08-27). Not
   live; no re-fetch without re-running acquisition.
7. **Anchorage "on-land" detections** (481 events, of which 477 are port
   visits) are real anchorages on tidal flats mapped as land by the coarse
   land grid — expected, not data errors (see realism analysis §4).

## 8. Reproducing

```bash
# 1. Acquire (requires GFW_API_ACCESS_TOKEN in env / .env)
node scripts/acquire-ais.mjs --env-file .env

# 2. Preprocess + validate (deterministic)
node Frontend/scripts/preprocess-ais.mjs

# 3. Audit outputs
#    data/raw/meta.json            — per-query totals + file hashes
#    data/processed/quality-report.json
#    data/processed/ais-events_20260820_20260827_gulf-of-kutch.json
```
