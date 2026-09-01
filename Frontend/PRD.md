# OceanWatch Frontend PRD

**Project:** OceanWatch  
**Context:** Smart India Hackathon 2026, Problem Statement 26143  
**Owner:** Frontend  
**Backend:** FastAPI, owned by backend team  
**Status:** Active implementation

## 1. Product

OceanWatch is a maritime intelligence dashboard for detecting oil spills from satellite imagery, reconstructing spill movement, correlating the event with AIS vessel traffic, and ranking likely responsible vessels.

Frontend owns the operational UI, interactive map, visualization system, mock/demo mode, investigation workflow, timeline UX, and FastAPI integration boundary. The UI must make the attribution story visually understandable rather than merely displaying raw data.

## 2. Product Goal

A user must be able to:

1. Observe maritime traffic on an interactive map.
2. View detected oil spills and their geographic extent.
3. Inspect wind/current conditions.
4. Select an incident.
5. Trace its likely source.
6. Inspect historical vessel movement.
7. View and understand candidate rankings.
8. Select the strongest candidate.
9. Replay the incident through time.
10. Switch from mock data to FastAPI without rewriting UI components.

### North star

> An oil spill was detected here. The system reconstructs where it came from, correlates that movement with AIS traffic, and explains why this vessel is the strongest candidate.

## 3. Core Architecture Principle

**Build against contracts, not the backend.**

The frontend owns `OceanWatchDataProvider` and the domain model. `MockDataProvider` and `ApiDataProvider` implement that contract. Backend-specific schemas stay inside the API adapter and are validated/mapped before reaching UI code.

## 4. Visual Direction

The supplied OceanWatch reference is the primary visual target.

Required visual characteristics:

- Map-first composition
- Blue/cyan ocean
- Pale cream/green land
- Subtle terrain/bathymetry
- Sparse geographic labels
- White/translucent floating panels
- Rounded corners and soft shadows
- Deep navy typography
- Blue/cyan interaction accents
- Green LIVE indicator
- Restrained red/orange warning states
- Clean Lucide-style icons
- Dense information without clutter
- Attractive maritime vessel visualization

The map is the product. UI panels frame it rather than compete with it.

### Visual work is iterative

The current light maritime redesign is a **visual direction pass**, not the final design freeze. Once the real map, vessels, spills, investigation mode, and timeline exist, spacing, density, contrast, typography, motion, and panel placement must be refined against the reference again.

## 5. Technology

- React 19
- TypeScript
- Vite
- Tailwind CSS v4
- shadcn/ui
- Zustand
- TanStack Query
- Zod
- MapLibre GL JS
- react-map-gl
- deck.gl
- Turf.js
- Framer Motion
- Recharts only when a non-map analytical chart is actually needed
- FastAPI backend

Already-installed mapping packages must not be reinstalled unnecessarily.

## 6. High-Level Architecture

```text
OceanWatch Frontend
        |
  +-----+------+----------------+
  |            |                |
App Shell   Map Engine      Feature UI
             |    |
          MapLibre deck.gl
             |    |
          Basemap  Layers
                |
          State / Services
                |
     OceanWatchDataProvider
          /             \
       Mock              API
        |                 |
   Simulation          FastAPI
```

## 7. Repository Direction

```text
src/
├── app/                 # app shell/providers/router
├── components/          # reusable presentation UI
├── features/            # feature-specific UI/workflows
├── map/                 # map engine, managers, layers
├── api/                 # provider, client, endpoint adapters
├── simulation/          # deterministic mock/demo simulation
├── data/mock/           # mock datasets/scenarios
├── store/               # Zustand stores
├── types/               # domain types
└── lib/                 # geo/format/constants/helpers
```

Do not create abstractions just to satisfy a directory diagram. Add them when the corresponding functionality is implemented.

## 8. Domain Models

```ts
interface Vessel {
  id: string;
  imo: string;
  name: string;
  type: "tanker" | "cargo" | "container" | "fishing" | "patrol" | "other";
  position: { lat: number; lng: number };
  heading: number;
  speed: number;
  lastUpdated: string;
  status: "active" | "stopped" | "unknown";
  modelType?: string;
}

interface VesselTrail {
  vesselId: string;
  points: Array<{
    lat: number;
    lng: number;
    timestamp: string;
    speed?: number;
    heading?: number;
  }>;
}

interface OilSpillIncident {
  id: string;
  detectedAt: string;
  location: { lat: number; lng: number };
  areaKm2: number;
  confidence: number;
  severity: "low" | "medium" | "high" | "critical";
  source: "sar" | "optical" | "combined";
  status: "detected" | "investigating" | "attributed" | "resolved";
  geometry?: unknown;
}

interface SuspectVessel {
  vesselId: string;
  matchScore: number;
  distanceFromOriginKm: number;
  temporalCorrelation: number;
  behavioralCorrelation: number;
  routeCorrelation: number;
  evidence: Evidence[];
}

interface OceanConditions {
  wind: { speed: number; direction: number };
  current: { speed: number; direction: number };
  timestamp: string;
}
```

## 9. Data Provider Contract

```ts
interface OceanWatchDataProvider {
  getVessels(params?: VesselQuery): Promise<Vessel[]>;
  getVessel(id: string): Promise<Vessel>;
  getVesselTrail(id: string, params?: TrailQuery): Promise<VesselTrail>;
  getIncidents(): Promise<OilSpillIncident[]>;
  getIncident(id: string): Promise<OilSpillIncident>;
  getCandidates(incidentId: string): Promise<SuspectVessel[]>;
  getTimeline(incidentId: string): Promise<TimelineEvent[]>;
  getEnvironment(location: GeoPoint): Promise<OceanConditions>;
}
```

Every feature must work with mock data before FastAPI integration.

## 10. Core UI

### Header

- OceanWatch branding
- Global search
- Timestamp
- LIVE/connection state
- Notifications
- Settings

### Navigation

- Map
- Incidents
- Vessels
- Analysis
- Environment
- Reports

### Layers

- Vessels
- Vessel Trails
- Oil Spills
- Ocean Currents
- Wind Flow
- EEZ Boundaries
- Shipping Lanes
- Investigation Paths

### Right intelligence panel

Context-dependent incident, vessel, candidate, analysis, and environment information.

### Bottom telemetry

Vessel count, active spills, alerts, region/coordinates, wind, and current when useful. It must not obscure important map content.

## 11. Map Architecture

### MapLibre owns

- Basemap
- Ocean
- Land
- Coastlines
- Labels
- Borders
- Terrain/bathymetry where available
- Base maritime geography

### deck.gl owns

- Vessels
- Vessel trails
- Spill polygons/boundaries/origin
- Investigation paths
- Wind/current overlays
- Shipping lanes
- EEZ
- Analytical overlays
- High-volume geographic datasets

## 12. Deck.gl Layer System

Expected layers:

```text
VesselClusterLayer
VesselIconLayer
VesselScenegraphLayer
VesselTrailLayer
SpillPolygonLayer
SpillBoundaryLayer
SpillOriginLayer
InvestigationPathLayer
WindLayer
CurrentLayer
ShippingLaneLayer
EEZLayer
AnnotationLayer
```

Layers must be independently toggleable. Layer construction should be centralized rather than embedded in UI components.

## 13. Vessel Visualization + LOD

Use a small shared optimized model library:

```text
tanker.glb
cargo.glb
container.glb
fishing.glb
patrol.glb
```

No unique model per vessel.

### LOD 0: Overview

- Clusters/dots
- No labels
- No 3D

### LOD 1: Operational

- 2D silhouettes/icons
- Heading
- Selective labels
- Picking

### LOD 2: Investigation

- 3D models
- Detailed selected vessel
- Highlighted suspects

High detail can override zoom for selected, hovered, top-candidate, incident-nearby, or investigation-participating vessels.

### Performance rules

- Prefer server-side viewport/bbox or tile filtering.
- Cull irrelevant client data.
- Use deck.gl rather than DOM markers.
- Keep large data references stable.
- Avoid React-driven per-vessel animation.
- Lazy-load and cache models.
- Reuse/instance shared models.
- Enable picking only where needed.
- Measure capacity rather than guessing.

## 14. Map Performance

Potential request:

```text
GET /api/v1/vessels?bbox=minLng,minLat,maxLng,maxLat&zoom=8&timestamp=...
```

For very large datasets, vector tiles or equivalent tiling may be introduced later.

Required test sizes: 100, 1,000, and 5,000 vessels plus large trails and multiple simultaneous layers.

## 15. Mock Operational Data

Mock mode is first-class and must support the complete investigation narrative.

Components:

- Vessel generator
- Vessel movement simulator
- Trail generator
- Incident generator
- Spill geometry generator
- Candidate scoring mock
- Wind/current generator
- Timeline generator
- Scenario runner

Deterministic demo sequence:

```text
Normal traffic
  ↓
Spill detected
  ↓
Spill appears
  ↓
AIS correlation
  ↓
Candidates ranked
  ↓
Top candidate
  ↓
Trace Source
  ↓
Historical trail
  ↓
Timeline replay
```

## 16. Investigation Mode

`Trace Source` should:

- Dim unrelated layers
- Highlight spill
- Show origin
- Show predicted drift
- Show historical vessel paths
- Show candidate vessels
- Highlight selected/top candidate
- Open analysis UI
- Enable timeline

The map must communicate the attribution chain visually.

## 17. Spill Visualization

A spill must be geographic geometry, not only a marker.

States:

- Detected extent
- Boundary
- Origin
- Confidence
- Selected/active state
- Investigation state

Mock mode must generate deterministic synthetic geometry when real geometry is unavailable.

## 18. Timeline

```text
[ Previous ] [ Play / Pause ] [ Next ]

12:00 ───── 14:00 ───── 16:00 ───── 18:00
```

Can update vessel positions, trails, spill geometry, environmental values, and event markers. Interpolate visually where useful. Timeline state must not trigger unnecessary full-map React renders.

## 19. Search

Support vessel name, IMO, incident ID, location, and incident type. Selecting a result flies the map to the entity, selects it, and opens the correct panel.

## 20. Incident / Vessel / Attribution UX

Incident detail should expose ID, time, location, area, confidence, severity, status, source imagery, spill geometry, environmental context, candidates, and timeline.

Vessel detail should expose name, IMO, type, position, speed, heading, status, trail, incident associations, and attribution evidence.

Candidate ranking must explain overall score through temporal, route, behavioral, distance, and supporting evidence. Do not show a mysterious percentage with no explanation.

## 21. FastAPI Integration

Expected capabilities:

```text
GET /api/v1/vessels
GET /api/v1/vessels/{id}
GET /api/v1/vessels/{id}/trail
GET /api/v1/incidents
GET /api/v1/incidents/{id}
GET /api/v1/incidents/{id}/candidates
GET /api/v1/incidents/{id}/timeline
GET /api/v1/environment
GET /api/v1/environment/wind
GET /api/v1/environment/current
```

Optional later:

```text
GET /api/v1/map/tiles/{z}/{x}/{y}
WS /api/v1/ws/vessels
```

Integration rules:

- UI never calls `fetch` directly.
- Validate external payloads with Zod.
- Map backend schemas into domain types.
- Handle errors, empty results, and slow requests.
- Preserve mock mode.
- Keep backend quirks inside adapters.

## 22. Loading / Empty / Error

Every remote feature needs loading, empty, and error states, with retry where meaningful. These are part of the product, not an end-of-project cleanup item.

## 23. Routing

```text
/ → /map
/map
/incidents
/incidents/:id
/vessels
/vessels/:id
/analysis
/environment
/reports
```

## 24. Accessibility

- Keyboard-accessible controls
- Visible focus states
- Semantic buttons
- Readable contrast
- Tooltips/labels for icon-only controls
- Reduced-motion consideration
- Status not communicated by color alone

## 25. Implementation Roadmap

### Phase 0 — Architecture & Contracts

Foundation: project setup, design tokens, providers, domain types, stores, API client, mock/API switching, and Zod validation.

**Current:** Mostly complete. Zod validation remains.

### Phase 1 — UI Foundation & Visual Direction

#### 1.1 Core UI shell — COMPLETE

Header, navigation, layer panel, detail panel, telemetry, map placeholder, controls, interactions, Zustand integration.

#### 1.2 Visual direction pass — COMPLETE

Light maritime theme, floating panels, reference-inspired layout, incident intelligence card, telemetry strip, floating controls.

**Important:** this is a direction pass. Final visual polish is later after real map/data density exists.

### Phase 2 — Map Foundation — NEXT

- Real MapLibre map
- Replace placeholder
- Arabian Sea initial viewport
- Basemap
- Ocean/land/coastline/labels
- Maritime map style
- Controls
- MapStore synchronization
- Viewport manager/controller
- Avoid React render storms

### Phase 3 — Deck.gl Visualization

- Deck overlay
- Vessel 2D layer
- Clustering
- Picking
- Spill geometry
- Origin
- Trails
- Investigation path
- Shipping lanes
- EEZ
- Wind/current placeholders
- Layer visibility

### Phase 4 — Mock Operational Data

- Realistic vessels
- Incidents
- Spill geometry
- Trails
- Candidate rankings/evidence
- Environment data
- Movement simulation
- Scenario runner

### Phase 5 — Vessel LOD / 3D

- Model registry
- Shared GLB assets
- Optimization/licensing
- 2D/3D representations
- Zoom + relevance LOD
- Viewport culling
- Lazy loading
- Caching/instancing
- Profiling

### Phase 6 — Incident Investigation

- Incident selection/detail
- Trace Source
- Investigation mode
- Drift path
- Historical trails
- Candidate visualization/ranking
- Vessel details
- Evidence presentation

### Phase 7 — Timeline / Playback

- Timeline UI/state
- Playback controls
- Scrubbing
- Interpolation
- Vessel/trail/spill/environment playback
- Event markers

### Phase 8 — FastAPI Integration

- Confirm actual backend contract
- Configure base URL
- Implement real adapter mappings
- Zod validation
- Loading/error/empty states
- Slow request handling
- Preserve mock mode

### Phase 9 — Performance / Reliability

- Dataset stress tests
- Map/deck/3D profiling
- React render profiling
- Picking/model/network tests
- Memory tests
- Network throttling
- Failure/reconnect tests where applicable

### Phase 10 — Final Visual Polish + SIH Demo

- Full reference comparison
- Typography/spacing/icon/panel/map-density passes
- Layer contrast
- Selection/hover states
- Motion polish
- Loading/empty/error polish
- Demo mode
- Repeatable scripted scenario
- Final browser/performance testing

## 26. Definition of Done

- Mock mode works end-to-end.
- FastAPI mode works end-to-end.
- Map resembles the supplied reference.
- Core UI is polished.
- Layers work independently.
- Vessel LOD works.
- 3D is selective and performant.
- Spill investigation works.
- Attribution is explainable.
- Timeline works.
- Search works.
- Loading/error/empty states work.
- Performance is measured at realistic sizes.
- SIH demo runs start-to-finish without manual data editing.
- No known P0 bugs remain.

## 27. Non-goals

Do not prioritize mobile-first UI, user profiles, complex auth, an elaborate report editor, a full GIS editor, photorealistic ship simulation, real ocean physics, unnecessary 3D, or backend/database implementation owned by teammates.

## 28. Engineering Rules

1. Keep map rendering as independent from normal React rendering as practical.
2. Never create a DOM node per vessel.
3. Never create a unique 3D model per vessel.
4. Keep backend-specific logic in adapters.
5. Keep mock scenarios deterministic.
6. Keep layers independently toggleable.
7. Measure performance before adding optimization complexity.
8. Do not add libraries without a concrete need.
9. Every phase must leave the app buildable.
10. Visual polish is iterative and continues after map/data integration.
11. Protect the investigation narrative from decorative complexity.
