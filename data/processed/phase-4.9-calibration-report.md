# Phase 4.9 Report — Calibrate & Correct the Deterministic Maritime Traffic Simulation

**Standalone task · OceanWatch SIH demo · 2026-08-31**

Goal: make the synthetic traffic simulation (a) geographically credible — no
vessels, trails, or spill on land; (b) behaviourally believable — no perfect
circular/racing-loop fishing paths; (c) calibrated against the real GFW AIS
event dataset acquired in Phase 4.8 — calibration/reference **only**, the
synthetic fleet stays the demo driver, no runtime GFW requests, no API token,
fully offline; and (d) deterministic.

Constraint reminders honoured throughout: **no "legacy vessel" exemptions** (the
scenario core vsl-001..vsl-005 obeys the same land-mask checks as the fleet);
**no hard-coded ranking** (vsl-001 must stay top via the scoring model);
**no visual cheating** (underlying simulation data fixed, not rendering);
**the browser wins** if it ever contradicts the scripts (browser/CDP
verification was run); and the final implementation remains deterministic,
offline-capable, performant, and compatible with the existing provider
architecture and attribution scenario.

---

## 1. Root causes

Three defects made the previous 30-vessel build fail geographic / behavioural
plausibility:

1. **Vessels, trails and spill on land — a gulf geography issue.**
   The Gulf-of-Kutch navigable channel is **centre-north**, ~22.5–22.7°N; the
   coarse land mask (0.02° cells, Natural Earth 50 m, eroded ~4.4 km offshore)
   flags 22.4°N as intertidal flats. Legacy un-asserted scenario routes (and
   some network constants) hugged the south shore, putting scenario vessels,
   their trails, and the spill on dry land. Additionally, real port-visit
   positions for Sikka (22.49,69.86) and Mundra (22.75,69.71) fall on the
   flats the mask calls land, so anchorages placed at the on-shore reference
   were on land.
2. **Identical circular fishing paths.** `fishingRoute` built the same
   equilateral triangle loop for every fishing vessel — a perfect, obviously
   synthetic racetrack, identical across the fleet.
3. **Environment contradicted the drift narrative.** The StatusBar hard-coded
   "14.6 kn, NW" wind / "0.8 kn, SE" current that disagreed with the
   calibrated E/ENE wind driving the spill WSW.

## 2. GFW calibration applied

Phase 4.8 (`data/processed/realism-analysis.md`) delivered the reference
numbers; Phase 4.9 turns them into concrete corrections:

| Observation (real 8-day window) | Synthetic correction |
|---|---|
| **SIKKA 229** ≫ MUNDRA 19 ≈ KANDLA 15 ≈ PORBANDAR 13 | Sikka is the busiest Gulf port in the window — it is now a real traffic destination (`maritimeNetwork.ts` PORTS.sikka nudged to the real visit position 22.49,69.86) and gets merchant traffic (see §3). |
| Fishing hotspot = **gulf mouth / northern gulf** (gulfMouth 14 + offMandvi 11 real events, 82% of events within 100 km of a synthetic ground, median 51 km) | `FISHING_GROUNDS.gulfMouth` → (22.6,69.5) and `offMandvi` → (22.68,69.35) nudged northeast into the observed cluster; both doubled with a new vessel each (§3). Both centres verified safe water. |
| Real anchorages hold **far more** laid-up tonnage than 3 (969 vessels; 570 long-duration events ≥168 h) | `ANCHORAGES` extended: sikka (22.55,69.88) + mundra (22.72,69.62) roadsteads in safe water off each terminal, each hosting a laid-up vessel (§3). |
| Kandla/Okha exact (0 km); Mundra 9 km, Sikka 7 km | PORTS coordinates already ≤13 km of real positions; on-shore refs for Sikka/Mundra corrected to the exact GFW visit positions; anchorages moved offshore into the safe channel. |
| Gulf patrol circuits **not** independently evidenced (real loitering is the offshore belt off Mumbai/Bombay High) | Patrol kept at 3 generated vessels — not over-interpreted. |

The snapshot was never intended to replace the synthetic fleet (its event
points are coarse, not continuous tracks — realism-analysis §7), so it is used
as calibration/reference only. No runtime GFW dependency, no API token, no
network: the simulation still runs from the fixed seed.

## 3. Fleet decision — hybrid 30 → 36 (justified)

Decision: **hybrid — keep the quality-first core and grow the fleet by six
calibrated additions**, not a wholesale reset and not a pure density jump.

Rationale (per realism-analysis):

- **§1 (ports):** Sikka's real dominance (229 ≫ everyone else) demands visible
  merchant traffic. Added **vsl-031** (cargo, karachi→sikka) and **vsl-032**
  (cargo, sikka→mumbai) — real gulf-corridor movements.
- **§2 (fishing):** the observed hotspot concentrates at gulfMouth + offMandvi.
  Added **vsl-033** (mandvi→gulfMouth) and **vsl-034** (mandvi→offMandvi) —
  doubling the two dominant grounds.
- **§5 (anchorage volume):** real anchorages hold far more laid-up tonnage than
  3. Added **vsl-035** (anchored, sikka) and **vsl-036** (anchored, mundra).

Growth mechanics keep determinism: each vessel's parameters draw from a
**per-vessel-id RNG** (`mulberry32(hashString(\`${SIMULATION_SEED}:${id}\`))`),
so appending new ids perturbs nothing. Byte-identical existing fleet verified.

Fleet composition now: **tanker 2 · cargo 11 · container 4 · fishing 10 ·
patrol 4 · other 5** (36 total; 5 scenario core + 31 generated).

## 4. Geography corrections

- **Scenario core re-routed through the verified channel (no exemptions).**
  - vsl-001 (tanker, Ocean Guardian): gulf-lane waypoints at 22.5–22.6°N,
    69.9 → 68.75°E; `startIndex:4, pingPong:true`; release window and closest
    approach to the drift corridor preserved.
  - vsl-002 (cargo): gulf corridor 68.86 → 70.0°E at 22.6–22.7°N.
  - vsl-003 (container): west-coast lane 20.91 → 22.47°N.
  - vsl-005 (patrol): 1.8 km closed circuit centred ~(22.45,69.25) — all four
    vertices safe water.
  - All 36 routes re-asserted with `checkNavigability`; all positions,
    observed (AIS-jittered) positions and trails verified off land.
- **Anchorages** for Sikka (22.55,69.88) and Mundra (22.72,69.62) sit in the
  safe-water channel immediately off each terminal — off the tidal flats the
  mask flags as land. Vessels still terminate at each port's offshore
  `approach` point, never at a berth.
- **Spill progression** stays offshore for its whole life: `BASE_WIND
  {7.2 kn, 92°}` (E/ENE) + `BASE_CURRENT {0.8 kn, 268°}` (W) → net drift
  **3.92 km/h @ 264° (WSW)** down the Gulf of Kutch toward the mouth
  (`environment.ts`). Origin, boundary vertices, edges and interior all off
  land from 07:42 → 23:00Z.
- **StatusBar** now derives wind/current from `environmentAt(SCENARIO_START_MS)`
  — "Wind 12.6 kn, E / Current 1.6 kn, W" — so the telemetry strip can never
  contradict the drift narrative again (`StatusBar.tsx`).

## 5. Behaviour corrections

- **Fishing meanders** (`routeBuilder.ts`): replaced the shared triangle with
  an **irregular, per-vessel meander** — 4–6 vertices, bearing advances
  `(bearing + 60 + rng()*100) % 360`, radii 0.5–2.4 km, all seeded from the
  vessel id (different across vessels, deterministic across runs). A
  shrink-retry ladder (`[1, 0.7, 0.5, 0.35]`) guarantees the meander never
  clips the coast. Verified: max bearing-gap deviation ≥5° from a regular
  polygon, radius spread ≥0.15, and no two vessels share an identical meander.
- **AIS jitter** re-validated unchanged (`aisJitter.ts`): per-report seeded
  jitter to position/heading/speed, irregular reporting intervals; scoring
  still uses the jitter-free pure state.

## 6. Attribution — vsl-001 stays top, naturally

The ranking still emerges from the unmodified scoring model
(`candidateScoring.ts`; weights distance 0.28 / temporal 0.2 / behavioral 0.2 /
route 0.12 / type 0.2; NEAR_RADIUS 25 km; release window 06:12–07:27Z). The
evidence text was updated to the calibrated drift narrative (E/ENE wind
reinforcing the WSW ebb outflow). **Nothing is hard-coded.**

Verified ranking (from `verify-fleet.mjs`):

```
vsl-001   match=0.965   <- top (Ocean Guardian)
vsl-032   match=0.662
vsl-017   match=0.624
vsl-016   match=0.619
```

vsl-001 is top at 0.965 (±0.015) with a >0.1 margin over second place — the
attribution scenario is intact and still tells the same intelligence story.

## 7. Verification

Authoritative gate **`Frontend/scripts/verify-fleet.mjs`** (no exemptions):

- 36 vessels, unique ids; scenario core vsl-001..vsl-005 preserved.
- **Every** vessel: route navigable + position and AIS-observed position never
  on land across 6 sampled times (00:00 / 06:00 / 07:00 / 09:10 / 14:00 /
  22:00Z); trails (points + consecutive segments) off land for all vessels.
- Spill origin/vertices/edges/interior off land every 30 min 07:42→23:00Z;
  incident point off land.
- Fishing meanders irregular (gap deviation ≥5°, radius spread ≥0.15) and
  distinct across vessels.
- Determinism: two generations byte-identical.
- Ranking: vsl-001 top ≈0.965, second place clearly below.

Output: **ALL CHECKS PASSED**.

Also passing:

- `Frontend/scripts/verify-determinism.mjs` — fleet/positions/routes/journeys/
  patterns/trails/environment/spill/incident/candidates identical across two
  fresh module graphs.
- `tsc -b`, `oxlint`, and the production build — all clean.
- **Browser/CDP (browser wins):** live Chromium — map loads, zero console/WebGL
  errors; deck.gl layers = spill-polygon/fill/stroke, spill-origin, vessel
  trails (36), vessels-2d (36); live layer data cross-checked against the land
  mask inside the browser → 0 vessels on land, 0 trail points/segments on land,
  spill origin/vertices/edges offshore; Incident panel shows INC-2026-001 /
  97% Match / Ocean Guardian; Vessels panel shows ACTIVE FLEET (36); StatusBar
  shows E wind / W current.

## 8. Remaining issues / notes

- **Coastal-lane "leaves safe water" notes:** a few near-shore waypoints on
  coastal lanes are flagged as not-fully-safe-water during route validation;
  every such waypoint is verified **in safe water and off land**, and the
  `endpointsCoastal` relaxation is the intended behaviour for approach points.
  No vessel, trail point, or trail segment is on land.
- **Exploratory probe scripts** (`Frontend/scripts/probe-*.mjs`, ~11 files)
  remain in the tree from the investigation phase. The authoritative gates are
  `verify-fleet.mjs` and `verify-determinism.mjs`; the probes are harmless but
  could be folded or removed in a cleanup pass.
- **StatusBar global counters** (12,482 vessels / 7 spills / 3 alerts) are
  decorative global Arabian-Sea telemetry, not the 36-vessel demo fleet — this
  is documented in the component and consistent with the "global telemetry vs
  demo fleet" reading, but it is worth an explicit call-out if the demo is
  scrutinized on numbers.

## 9. Files changed

- `Frontend/src/simulation/environment.ts` — BASE_WIND/BASE_CURRENT → drift
  3.92 km/h @ 264° (WSW).
- `Frontend/src/simulation/scenario.ts` — vsl-001/002/003/005 re-routed through
  the verified channel (no exemptions).
- `Frontend/src/simulation/routeBuilder.ts` — irregular per-vessel fishing
  meanders (seeded, shrink-retry).
- `Frontend/src/simulation/maritimeNetwork.ts` — Sikka/Mundra real visit
  coords; fishing grounds nudged into the hotspot; sikka/mundra anchorages
  offshore.
- `Frontend/src/simulation/vesselGenerator.ts` — VESSEL_COUNT 30→36; vsl-031..
  036 calibrated additions.
- `Frontend/src/simulation/candidateScoring.ts` — evidence text updated to the
  calibrated drift narrative.
- `Frontend/src/data/mock/incidents.ts`, `Frontend/src/data/mock/environment.ts`
  — comments/description updated to WSW drift.
- `Frontend/src/components/layout/StatusBar.tsx` — wind/current derived from the
  simulation environment.
- `Frontend/scripts/verify-fleet.mjs` — rewritten authoritative gate (36
  vessels, all vessels checked, spill progression, meander irregularity,
  ranking).
- `Frontend/PROGRESS.md` — Phase 4.9 section + changelog.
- This report: `data/processed/phase-4.9-calibration-report.md`.

---

Suggested commit message:

```
fix(simulation): calibrate traffic and enforce geographic realism
```
