# OceanWatch Frontend Agent Instructions

## Purpose

This document defines how AI coding agents must work on the OceanWatch frontend.

The objective is to build a maintainable, high-performance, polished maritime
intelligence dashboard, not a pile of generated components that happens to
compile.

The frontend is a major part of the SIH demonstration. Visual quality,
investigation clarity, map performance, and reliable backend integration are
all first-class requirements.

---

# 1. Read Before Coding

Before making changes, read:

1. `PRD.md`
2. `PROGRESS.md`
3. `AGENTS.md`

Do not begin implementation from the user's latest message alone.

The PRD is the product source of truth.

The progress file is the implementation source of truth.

This file defines agent behavior and engineering rules.

If the implementation and documentation disagree, do not silently choose one.
Inspect the code and update `PROGRESS.md` so the project state becomes
accurate before continuing.

---

# 2. Current Project State

The frontend currently has:

- React + TypeScript + Vite
- Tailwind CSS v4
- shadcn/ui configuration
- Zustand
- TanStack Query
- Zod
- MapLibre GL
- react-map-gl
- deck.gl
- Turf.js
- Framer Motion
- a domain/data-provider architecture
- mock data support
- the OceanWatch application shell
- a first light maritime visual-design pass

The current visual design is intentionally **not a final design freeze**.

The supplied OceanWatch reference remains the visual target. The interface
must be refined again after the real map, vessel visualization, spill
geometry, investigation workflow, and timeline exist.

Do not mistake "the UI exists" for "the UI is finished."

---

# 3. Core Mission

Build a desktop-first OceanWatch maritime intelligence dashboard with:

- map-first composition
- custom maritime map styling
- MapLibre geography
- deck.gl visualization
- efficient vessel rendering
- selective 3D ship models
- oil-spill visualization
- vessel trails
- investigation mode
- candidate attribution
- evidence visualization
- timeline playback
- search
- mock/demo mode
- FastAPI integration
- strong loading, empty, and error states

The frontend must be fully usable in mock mode before backend integration.

The central UX story is:

```text
Oil spill detected
        ↓
Where is it?
        ↓
How did it move?
        ↓
Which vessels were nearby?
        ↓
Which vessel is the strongest candidate?
        ↓
Why?
        ↓
Show the evidence on the map
```

If a feature does not help this story, it is lower priority.

---

# 4. Non-Negotiable Architecture Rule

## Never couple UI components directly to FastAPI.

Bad:

```ts
function VesselPanel() {
  const data = await fetch("/api/vessels");
}
```

Good:

```text
Component
   ↓
Feature/service
   ↓
OceanWatchDataProvider
   ↓
MockDataProvider / ApiDataProvider
```

Components consume domain models, not backend response shapes.

Backend-specific concerns stay inside the API adapter.

---

# 5. Data Provider Rule

The frontend owns:

```ts
interface OceanWatchDataProvider
```

Implement:

```text
MockDataProvider
ApiDataProvider
```

The mock provider is not disposable throwaway code.

It is a permanent development, testing, fallback, and demo capability.

Do not delete mock mode after backend integration.

Switching between mock and API mode should not require rewriting feature
components.

---

# 6. TypeScript Rules

- Use strict TypeScript.
- Avoid `any`.
- Prefer explicit domain types.
- Validate external data with Zod.
- Keep API types separate from domain types when their structures differ.
- Do not spread unknown backend payloads directly into UI objects.
- Use discriminated unions for known variants.
- Prefer small typed utility functions over repeated casting.
- Do not silence TypeScript errors with unnecessary assertions.

Bad:

```ts
const vessel: any = response;
```

Good:

```ts
const vessel = VesselSchema.parse(response);
```

---

# 7. State Management Rules

Use Zustand for client/UI state such as:

- selected vessel
- selected incident
- active panel
- map UI state
- layer visibility
- investigation mode
- timeline position
- transient investigation selections

Use TanStack Query for:

- API/server data
- caching
- loading
- errors
- refetching
- request lifecycle

Do not duplicate server data unnecessarily into Zustand.

Do not use React Context as a giant global state container.

High-frequency visualization state should remain outside React state whenever
possible.

---

# 8. Map Architecture Rules

MapLibre owns:

- basemap
- geography
- labels
- terrain/bathymetry
- static cartographic layers
- map navigation
- map projection
- geographic styling

deck.gl owns:

- vessels
- vessel trails
- oil spills
- investigation paths
- analytical overlays
- environmental visualization
- high-volume dynamic data

The intended relationship is:

```text
MapLibre
  ├── Ocean / land / labels / geography
  └── Base cartography

deck.gl
  ├── Vessels
  ├── Trails
  ├── Oil spills
  ├── Investigation overlays
  └── Environmental / analytical layers
```

Do not implement thousands of vessel markers as DOM elements.

Use deck.gl.

---

# 9. Visual Design Rules

The supplied OceanWatch reference is the primary visual target.

Target characteristics:

- large map-first canvas
- blue/cyan ocean
- pale cream/green land
- subtle terrain/bathymetry
- restrained geographic labels
- white/translucent floating panels
- strong rounded corners
- soft shadows
- deep navy typography
- blue/cyan interaction accents
- green LIVE indicator
- restrained red/orange warnings
- clean Lucide-style icons
- dense information without clutter
- attractive maritime vessel visualization

The map is visually dominant.

UI panels frame the map rather than compete with it.

## Important: visual work is iterative

Do not treat the current shell or current light-theme pass as the final design.

The design process is:

```text
Initial visual direction
        ↓
Real map integration
        ↓
Real data visualization
        ↓
Investigation workflow
        ↓
Timeline / interaction
        ↓
Visual refinement
        ↓
SIH final polish
```

Once real content exists, refine:

- panel dimensions
- spacing
- typography
- information density
- contrast
- map/UI balance
- vessel scale
- selected states
- animations
- empty/loading/error states
- responsive behavior
- visual hierarchy

Do not blindly preserve placeholder proportions if real data shows that they
are wrong.

Do not redesign the entire product randomly. Refine toward the reference.

---

# 10. Vessel Rendering Rules

## Never render every vessel as a detailed 3D model.

Use LOD based on zoom, viewport relevance, selection, and investigation state.

Target strategy:

```text
far / zoomed out
    → clusters / compact symbols

medium distance
    → 2D vessel silhouettes / icons

nearby
    → richer 2D representation or lightweight 3D

relevant / selected / candidate
    → high-detail 3D model
```

High-detail rendering is reserved for useful entities.

A vessel may receive high-detail treatment when:

- selected
- hovered
- a candidate
- near an active incident
- part of the investigation path
- explicitly requested by investigation mode

Do not make the map look empty merely to save performance. The goal is to
show the right amount of information at each zoom level.

---

# 11. 3D Asset Rules

Use a shared model registry.

Example:

```text
tanker.glb
cargo.glb
container.glb
fishing.glb
patrol.glb
```

Never create or load a unique 3D asset per vessel.

Models must:

- be reusable
- be optimized
- be cached
- be lazy-loaded when possible
- have reasonable polygon counts
- avoid unnecessary 4K textures
- preserve recognizable silhouettes

Use instancing/shared resources where practical.

The 3D model system should be designed around a small number of vessel
classes, not thousands of assets.

Visual quality matters, but polygon-count theater is not a feature.

---

# 12. Performance Rules

Performance is a product requirement.

## Avoid

- DOM marker per vessel
- React state updates for every vessel every animation frame
- rebuilding huge arrays on every render
- unnecessary layer recreation
- unnecessary picking
- unique model loading per vessel
- sending the entire AIS dataset to the browser
- rendering off-screen entities at high detail
- keeping unnecessary historical data in memory
- expensive effects applied to every map object
- re-rendering the entire application during map movement

## Prefer

- deck.gl GPU layers
- stable data references
- memoization
- viewport-aware queries
- server-side filtering
- vector tiles when dataset size justifies them
- LOD
- model caching
- selective picking
- interpolation
- incremental updates
- throttled/debounced expensive UI work
- spatial filtering
- aggregation/clustering at low zoom

Do not claim that something is "optimized" without testing it.

---

# 13. Viewport and Data Volume Strategy

For large AIS datasets:

```text
Backend dataset
      ↓
viewport / bbox / tile query
      ↓
browser-visible subset
      ↓
deck.gl
      ↓
LOD / aggregation
      ↓
GPU
```

Do not solve a server-data-volume problem entirely in the browser.

If the frontend asks for an entire country's worth of AIS traffic just to
display a small region of ocean, the architecture has already failed.

The frontend should request only what is reasonably required for the current
viewport, zoom, time range, and investigation state.

---

# 14. React Performance Rules

Do not put high-frequency map data in React state unless it genuinely needs
to affect React UI.

Map movement, vessel animation, and high-volume visualization should stay in
the map/deck.gl layer.

Prefer:

- `useMemo`
- `useCallback`
- stable objects
- stable layer configuration
- targeted Zustand selectors
- memoized components where useful

Avoid broad selectors that cause large portions of the application to
re-render.

Do not optimize blindly. Measure first when performance becomes a concern.

---

# 15. deck.gl Rules

Use the simplest layer that solves the problem.

Examples:

```text
IconLayer
PathLayer
PolygonLayer
ScatterplotLayer
ScenegraphLayer
```

Use:

- `IconLayer` for efficient large-scale symbols
- `PathLayer` for vessel trails/investigation paths
- `PolygonLayer` for spill geometry and boundaries
- `ScatterplotLayer` for simple analytical points
- `ScenegraphLayer` for selective 3D vessels

Use custom layers only when necessary.

Use GPU filtering/extensions when they materially improve performance.

Do not build complicated custom WebGL systems merely because they sound
impressive.

---

# 16. Picking and Interaction Rules

Only interactive layers should be pickable.

Example:

```text
Vessels       → pickable
Incidents     → pickable
Trails        → selectively pickable

Wind          → generally not pickable
Current       → generally not pickable
Background    → not pickable
```

Hover behavior must be lightweight.

Clicking a vessel should update centralized selection state.

Do not make every visualization object interactive by default.

---

# 17. Component Rules

Components should have one primary responsibility.

Prefer:

```text
IncidentPanel
IncidentSummary
CandidateList
CandidateEvidence
VesselDetails
LayerPanel
MapControls
Timeline
```

over:

```text
MassiveDashboardComponent.tsx
```

Avoid giant monolithic components.

If a component becomes difficult to reason about, split it by responsibility.

Do not create abstractions simply because two files happen to share three lines
of code.

---

# 18. Feature Boundaries

Organize behavior around actual product features:

```text
incidents
vessels
tracking
investigation
analysis
environment
timeline
search
```

Shared visual primitives belong in common/components.

Feature-specific logic should stay close to the feature.

Do not create deep abstraction trees before a real reuse case exists.

---

# 19. API Rules

FastAPI integration must happen through the API provider.

Recommended shape:

```text
api/
├── client.ts
├── provider.ts
├── apiProvider.ts
├── mockProvider.ts
├── vessels.ts
├── incidents.ts
├── environment.ts
└── investigation.ts
```

API client responsibilities:

- base URL
- HTTP transport
- headers
- timeout
- request handling
- structured errors

Feature API modules:

- endpoint-specific requests

Provider:

- converts API results into domain models
- validates responses
- hides backend-specific structures from UI code

UI:

- knows none of these implementation details.

---

# 20. Backend Contract Changes

If backend response shapes change:

1. Update API types.
2. Update Zod schemas.
3. Update adapter mapping.
4. Do not immediately rewrite UI components.
5. Run typecheck/tests.
6. Update documentation if the contract genuinely changed.

If a contract is still uncertain, do not invent a fake permanent schema and
pretend it is final.

Document assumptions explicitly.

---

# 21. Backend Coordination

When a backend contract is required, document:

- endpoint
- HTTP method
- query parameters
- request body
- response schema
- pagination/tile behavior
- viewport/bbox semantics
- timestamp semantics
- coordinate system
- error format
- update/refresh behavior

The backend team owns FastAPI implementation.

The frontend owns the integration boundary and UI/domain mapping.

Do not silently assume backend behavior.

---

# 22. Mock Data Rules

Mock data must be plausible and internally consistent.

Use:

- realistic vessel types
- realistic headings
- realistic speed ranges
- geographic consistency
- deterministic incidents
- meaningful trails
- candidate rankings that match visible evidence
- realistic timestamps
- realistic spill geometry
- environmental conditions that make geographic sense

Do not generate nonsense such as a vessel teleporting hundreds of kilometers
between adjacent timestamps.

Mock data should be good enough to demonstrate the entire product flow.

---

# 23. Demo Scenario Rules

The primary demo scenario must be deterministic and repeatable.

Preferred flow:

```text
NORMAL TRAFFIC
      ↓
SATELLITE DETECTION
      ↓
SPILL APPEARS
      ↓
INCIDENT ALERT
      ↓
TRACE SOURCE
      ↓
AIS CORRELATION
      ↓
CANDIDATE RANKING
      ↓
TOP VESSEL
      ↓
EVIDENCE + TRAIL
      ↓
TIMELINE
```

The scenario should be runnable repeatedly without editing source code.

The mock system should make the intelligence story obvious to a judge.

---

# 24. Investigation UX Rules

The user must understand why a vessel is a candidate.

Do not display:

```text
91% MATCH
```

without supporting information.

Prefer:

```text
91% MATCH

Temporal correlation   94%
Route correlation      89%
Behavior correlation   91%
Distance                42 km
```

Also visualize the relevant evidence on the map.

The interface should answer:

```text
What happened?
Where?
When?
How did the spill move?
Which vessels were nearby?
Why is this vessel suspicious?
```

Do not hide the reasoning behind a single score.

---

# 25. Timeline Rules

Timeline state must not force the entire application to re-render.

Playback should update visualization data efficiently.

Use interpolation for smooth visual movement where appropriate.

The timeline must represent meaningful investigation time, not merely act as a
decorative slider.

Timeline interactions should visibly affect:

- vessel positions/trails where appropriate
- spill state
- investigation paths
- relevant evidence

---

# 26. Search Rules

Search should eventually support the core entities:

- location
- vessel
- IMO
- incident

Search results should connect directly to the relevant map object or panel.

Do not build a fake global search UI that has no relationship to actual data.

Search behavior must work in mock mode before being considered complete.

---

# 27. Error Handling

Every async operation needs:

- loading state
- success state
- empty state
- error state

Do not leave blank panels when a request fails.

Do not swallow errors silently.

Show useful user-facing recovery information without exposing secrets.

---

# 28. Accessibility

All controls should have:

- keyboard access
- visible focus states
- accessible labels
- semantic elements where practical

Icon-only buttons require labels/tooltips.

Do not rely solely on color to communicate status.

Map interactions should remain usable with standard pointer and keyboard
controls where practical.

---

# 29. Testing Rules

Before marking a feature complete:

1. Run typecheck.
2. Run lint.
3. Run relevant tests.
4. Manually test the feature.
5. Test loading/error/empty states.
6. Test mock mode.
7. Test interaction with the map if applicable.
8. Update `PROGRESS.md`.

For performance-sensitive features:

- profile realistic data sizes
- test different viewport sizes
- test multiple zoom levels
- test selection/picking
- test animation/playback
- document observed behavior
- do not claim performance without measurement

---

# 30. Progress Tracking

After completing a meaningful task, update `PROGRESS.md`.

Use:

```text
- [x] completed
- [ ] pending
```

Do not mark work complete merely because code was written.

A task is complete only when its acceptance criteria are satisfied and the
implementation has been verified.

Keep `PROGRESS.md` aligned with the actual repository state.

Do not claim an entire phase is complete when only a subset of its work exists.

---

# 31. Git / Change Discipline

Keep changes focused.

Good:

```text
feat(map): add MapLibre base map
feat(vessels): add deck.gl vessel layer
feat(incidents): add incident selection
perf(vessels): add viewport filtering
feat(investigation): add candidate evidence
```

Avoid giant commits mixing:

- UI redesign
- backend integration
- refactoring
- unrelated formatting
- model assets
- performance changes

When possible, keep architectural, visual, and data-contract changes separately
reviewable.

---

# 32. Dependency Discipline

Before adding a package, ask:

1. Is the functionality genuinely needed?
2. Does the selected stack already provide it?
3. Is the dependency maintained?
4. Does it significantly increase bundle size?
5. Can the requirement be implemented simply without it?

Already-installed packages should not be reinstalled unnecessarily.

Do not add libraries for trivial helpers.

---

# 33. Visual QA

For major UI work, inspect the actual result visually.

Compare against the supplied reference.

Check:

- overall composition
- map dominance
- panel proportions
- spacing
- typography
- icon alignment
- map hierarchy
- contrast
- overflow
- hover states
- selected states
- loading states
- empty states
- error states
- animation
- responsiveness
- vessel visual quality
- visual density

The reference screenshot is a real visual target, not a suggestion to vaguely
resemble it.

Placeholder UI must not be considered visually final.

---

# 34. Do Not Over-Engineer

Do not build:

- an elaborate plugin architecture
- a generic component framework
- a custom state library
- a full GIS engine
- a custom renderer for things deck.gl already handles
- speculative backend abstractions
- enterprise-scale infrastructure
- unnecessary WebGL infrastructure
- a custom 3D asset pipeline larger than the product needs

Build the smallest architecture that supports the actual product.

---

# 35. Do Not Under-Engineer

Also do not:

- hardcode backend responses into components
- use DOM markers for thousands of vessels
- throw all state into one store
- make one 3,000-line dashboard component
- make every feature depend on mock JSON imports directly
- skip error states
- skip performance testing
- delete mock mode after integration
- load every 3D ship model regardless of relevance
- claim completion based only on build success

A green build is not proof that the product works. Humanity has suffered
enough from that particular misunderstanding.

---

# 36. Priority When Tradeoffs Appear

Use this order:

1. Correctness
2. User workflow
3. Performance
4. Visual quality
5. Maintainability
6. Extra features

However, visual quality is not optional.

The SIH frontend must both work and communicate the intelligence story clearly.

A beautiful feature that breaks the investigation flow is not a win.

A technically correct feature that makes the investigation impossible to
understand visually is also not a win.

---

# 37. When Requirements Are Ambiguous

Do not invent complex behavior.

Choose the simplest behavior consistent with:

- PRD
- existing architecture
- current feature requirements
- reference visual language

If a decision affects architecture, performance, or backend contracts,
document it before implementing it.

When visual details are ambiguous, prefer the supplied reference over generic
dashboard conventions.

---

# 38. Definition of an Agent Task

A task should ideally have:

```text
Goal
Scope
Files/components affected
Acceptance criteria
Verification
Progress update
```

Agents should not quietly expand scope.

If implementation reveals that a task requires an architectural change, stop
and document the change instead of silently turning one task into five.

---

# 39. Recommended Implementation Order

The project should progress in the following order:

```text
PHASE 0
Foundation
- project setup
- dependencies
- aliases
- styling system
- domain types
- data provider contract
- stores
- API client boundary

        ↓

PHASE 1
Core UI Shell
- header
- navigation
- layers
- detail panels
- status/telemetry
- map-first composition

        ↓

PHASE 2
Visual Direction
- light maritime theme
- floating glass panels
- typography
- spacing
- visual hierarchy
- reference matching

        ↓

PHASE 3
MapLibre Integration
- real basemap
- ocean/land styling
- labels
- geography
- navigation
- viewport synchronization

        ↓

PHASE 4
deck.gl Core Visualization
- vessels
- oil spills
- trails
- investigation paths
- layer visibility
- picking/selection

        ↓

PHASE 5
Mock Simulation
- realistic AIS traffic
- deterministic spill
- movement/drift
- environmental data
- demo scenario

        ↓

PHASE 6
Vessel LOD + 3D
- clustering
- 2D vessel silhouettes
- LOD transitions
- shared model registry
- selective 3D
- caching
- viewport filtering

        ↓

PHASE 7
Incident Investigation
- incident selection
- spill details
- trace source
- vessel correlation
- candidate ranking
- evidence visualization

        ↓

PHASE 8
Timeline + Search
- historical playback
- timeline controls
- temporal filtering
- vessel/location/incident search

        ↓

PHASE 9
FastAPI Integration
- endpoint mapping
- schema validation
- real data
- loading/error handling
- mock/API switching

        ↓

PHASE 10
Performance Hardening
- realistic AIS volumes
- viewport filtering
- profiling
- render optimization
- network optimization
- memory checks
- 3D performance checks

        ↓

PHASE 11
Final Visual + SIH Polish
- compare against reference
- refine panel placement
- refine typography
- refine information density
- improve animations
- improve empty/loading/error states
- final demo flow
- final visual QA
```

### Important sequencing rule

Do not jump to detailed 3D ships before the base map and visualization
architecture are stable.

Do not call the visual design finished merely because the first theme pass is
complete.

Do not wait until the very end to care about visual design either.

Visual design is established early and refined continuously.

---

# 40. Definition of Done

The frontend is considered complete when:

- [ ] App shell matches the intended visual language.
- [ ] Map resembles the supplied OceanWatch reference.
- [ ] Map layers work independently.
- [ ] Mock data powers the entire application.
- [ ] Vessels render efficiently.
- [ ] Vessel LOD works.
- [ ] 3D models are reused and selectively rendered.
- [ ] Oil spills render as meaningful geographic geometry.
- [ ] Incident selection works.
- [ ] Trace Source works.
- [ ] Candidate ranking works.
- [ ] Candidate reasoning/evidence is visible.
- [ ] Vessel trails work.
- [ ] Timeline works.
- [ ] Search works.
- [ ] Loading/error/empty states exist.
- [ ] FastAPI adapter works.
- [ ] Mock mode remains available.
- [ ] No major console errors exist.
- [ ] Performance has been tested with realistic dataset sizes.
- [ ] SIH demo scenario can be run from start to finish.
- [ ] Final visual QA has been performed against the reference.
- [ ] `PROGRESS.md` accurately reflects the implementation.

---

# 41. Final Agent Checklist

Before declaring a task or phase complete:

- [ ] Read `PRD.md`.
- [ ] Read `PROGRESS.md`.
- [ ] Read `AGENTS.md`.
- [ ] Confirm scope.
- [ ] Check existing implementation before creating new files.
- [ ] Reuse existing dependencies where appropriate.
- [ ] Keep domain/API/UI boundaries intact.
- [ ] Verify TypeScript.
- [ ] Verify lint.
- [ ] Run relevant tests.
- [ ] Manually inspect the result.
- [ ] Test mock mode.
- [ ] Test loading/empty/error states.
- [ ] Test map interactions when applicable.
- [ ] Measure performance when applicable.
- [ ] Update `PROGRESS.md`.
- [ ] Do not claim work that was not actually verified.

---

# 42. Guiding Principle

The frontend should make the system's intelligence visible.

A user should be able to look at the screen and understand:

```text
WHAT happened?
WHERE did it happen?
WHEN did it happen?
HOW did it move?
WHICH vessels were nearby?
WHY is this vessel suspicious?
```

The UI succeeds when those answers are visually obvious.

The map is not decoration.

The panels are not decoration.

The vessel models are not decoration.

Every visual element should help the user understand the investigation.
