# AIS Source Selection — Gulf of Kutch Historical Snapshot

**Phase 4.8 deliverable.** This memo records *why* Global Fishing Watch was
chosen, what the provided access token can and cannot do, and why the 
acquisition targets GFW *events* rather than raw per-vessel tracks.

---

## 1. Requirement (from task brief)

Acquire ~3–7 days of historical AIS data for the Gulf of Kutch / western
Gujarat / adjacent Arabian Sea (target window **2026-08-20 → 2026-08-27**;
proposed region lng 65–73, lat 18–25), to be processed into a static
historical snapshot for realism analysis and (later, outside this task) an
optional real-traffic provider. Credentials are supplied via the
`GFW_API_ACCESS_TOKEN` environment variable only.

## 2. Candidates considered

| Source | Individual tracks? | Gulf of Kutch coverage? | Access model | Verdict |
|---|---|---|---|---|
| **Global Fishing Watch v3 API** | **No** under provided token | Yes (global AIS) | Bearer token (non-commercial) | **Selected — events** |
| GFW open AIS *presence* dataset (4Wings) | No — hourly *aggregate* presence per cell, not per-vessel | Yes | Open tiles/4Wings | Rejected: aggregate, not trajectories |
| MarineTraffic API | Yes (exportvesseltrack, bbox query) | Yes | **Paid** per-credit, metered rows | Rejected: commercial |
| Spire / exactEarth / ORBCOMM | Yes | Yes | Commercial contracts | Rejected: commercial |
| Indian Govt open data (DG Shipping / Mercantile Marine Dept) | Vessel registration, not AIS | Partial | Open portals | Rejected: no AIS tracks |
| Public GitHub / sample archives | Yes (samples) | No (global misc. samples) | Open | Rejected: not region-specific |

## 3. What the provided GFW token can access (verified by live probing)

Probed the v3 gateway (`https://gateway.api.globalfishingwatch.org/v3/`)
with the supplied token on 2026-08-31:

| Endpoint | Result |
|---|---|
| `POST /v3/events` (list, `flags`+`startDate`+`endDate`+`limit`/`offset`) | **Works** — returns real AIS-derived events with vessel identity |
| `GET /v3/events/{id}` (event detail) | **403** — no permission |
| `GET /v3/vessels/search` | **403** — no permission |
| `GET /v3/vessels/{id}` (vessel detail) | **403** — no permission |
| `GET /v3/vessels/{id}/tracks?datasets=…` | Endpoint exists; every `tracks:*` dataset id → **404 upstream**; non-tracks datasets → 422 type-gate. **Token cannot fetch tracks.** |
| `GET /v3/bulk-reports` | **Works** (management only) |
| `POST /v3/bulk-reports` | 422 — `bulk-download:*` type not available |
| `GET /v3/datasets` | Broken upstream (total=47025, entries=[]) |
| Context-layers (SAR fixed infrastructure) | **Works** |

**Conclusion: individual vessel trajectories are NOT obtainable with this
token.** The token is scoped to events, context layers, and bulk-report
management. Per the task brief, this triggers evaluation of another source.

## 4. Decision

**GFW Events API is the best practical accessible source.** It returns *real
AIS-derived vessel activity* — genuine vessel identity (GFW id, MMSI/ssvid,
name, flag, type), positions, timestamps, durations and locations — in the
exact target region. No other accessible source offers real, region-specific,
recent (≤72 h lag) AIS-derived activity for free.

What events give us:

- **fishing events** → real fishing grounds + fishing-vessel roster + fishing durations
- **port visits** → real port calls, anchorages (id/name/lat/lon), dwell times
- **loitering events** → real anchorage/loiter hotspots (e.g. Kandla / Mundra outer anchorages)
- **encounters** → real vessel-to-vessel meetings
- **gaps** → AIS-gap (dark) periods

What events do **not** give us: the continuous underway track between
events. Where the demo needs an underway trajectory, the synthetic fleet
remains the right vehicle (see realism analysis + recommendation).

## 5. Sizing (IND-flagged, 2026-08-20 → 08-27, verified)

| Event type | Count |
|---|---|
| Port visits | 4,471 |
| Fishing | 1,404 |
| Loitering | 4,639 |
| Gaps | 0 |

Client-side bounding-box filtering narrows these to the Gulf of Kutch region.

## 6. Terms / licensing (to be confirmed, not invented)

GFW data is made available for **non-commercial** use; the API is documented
as restricted to research/non-commercial purposes. AIS source data originates
from terrestrial/satellite AIS receivers aggregated by GFW partners. Exact
redistribution terms for raw event dumps are recorded in the provenance file
(`data/provenance/provenance.md`); this task keeps **raw dumps in
`data/raw/` (git-ignored)** and only derives compact aggregate stats for the
repo. No license text is asserted here that is not sourced from GFW's own
documentation.

## 7. Acquisition plan

1. `scripts/acquire-ais.mjs` — reproducible, env-driven, paginated fetch of
   events for the target window and region, deterministic filenames, raw JSONL
   into `data/raw/`, metadata sidecar, never prints or writes the token.
2. `scripts/preprocess-ais.mjs` — parse → normalize → dedup → bbox filter →
   land-mask validation (reusing `landGrid.ts`/`landMask.ts`) → per-vessel
   event sequence + track segmentation → vessel-type normalization →
   compact processed dataset + quality report.
