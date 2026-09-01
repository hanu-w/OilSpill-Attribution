import type { RoutePoint } from './geo';
import type { TrafficPattern } from './types';

/**
 * Seed definition for the fixed operational scenario vessels.
 *
 * These five vessels are hand-authored (not seeded) so the deterministic
 * INC-2026-001 attribution narrative — Ocean Guardian as the top candidate —
 * stays exactly as designed. Every generated vessel is layered on top of
 * this fixed core. Each route includes the t=0 position as a vertex so the
 * initial scenario exactly matches the historical mock fleet.
 */
export interface ScenarioVesselSeed {
  id: string;
  imo: string;
  name: string;
  type: 'tanker' | 'cargo' | 'container' | 'fishing' | 'patrol';
  speed: number;
  status: 'active' | 'stopped';
  pattern: TrafficPattern;
  waypoints: RoutePoint[];
  /** Index of the t=0 position vertex within `waypoints`. */
  startIndex: number;
  /** Reflect at lane ends (default true; closed circuits set false). */
  pingPong?: boolean;
}

export const SCENARIO_VESSELS: ScenarioVesselSeed[] = [
  {
    id: 'vsl-001',
    imo: '9300283',
    name: 'Ocean Guardian',
    type: 'tanker',
    speed: 9.4,
    status: 'active',
    pattern: 'gulf-lane',
    // Outbound down the deep-water Gulf of Kutch channel (kept fully in safe
    // water), passing ~3 km from the INC-2026-001 release point around 07:00Z
    // inside the release window, then out the gulf mouth. startIndex=4 puts
    // the t=0 (09:10Z) position at the mouth, consistent with a predawn
    // departure from the Sikka approaches.
    waypoints: [
      { lat: 22.56, lng: 69.9 },
      { lat: 22.6, lng: 69.7 },
      { lat: 22.54, lng: 69.58 },
      { lat: 22.53, lng: 69.42 },
      { lat: 22.51, lng: 69.22 },
      { lat: 22.52, lng: 68.95 },
      { lat: 22.4, lng: 68.85 },
      { lat: 22.2, lng: 68.75 },
    ],
    startIndex: 4,
    pingPong: true,
  },
  {
    id: 'vsl-002',
    imo: '9154236',
    name: 'Sagar Pratham',
    type: 'cargo',
    speed: 12.1,
    status: 'active',
    pattern: 'gulf-lane',
    // North-east bound through the outer gulf / approach to the Kandla-Mundra
    // complex. Re-routed from the Rann tidal flats to the validated mouth
    // corridor (all waypoints + segments in safe water).
    waypoints: [
      { lat: 22.82, lng: 68.86 },
      { lat: 22.62, lng: 69.02 },
      { lat: 22.58, lng: 69.22 },
      { lat: 22.6, lng: 69.45 },
      { lat: 22.65, lng: 69.8 },
      { lat: 22.7, lng: 70.0 },
    ],
    startIndex: 1,
    pingPong: true,
  },
  {
    id: 'vsl-003',
    imo: '9407721',
    name: 'Arabian Star',
    type: 'container',
    speed: 10.4,
    status: 'active',
    pattern: 'south-lane',
    // North-west bound along the Saurashtra west-coast lane (Veraval →
    // Porbandar → Okha). The former south-east lane ran across the Saurashtra
    // peninsula; the west-coast corridor is the navigable equivalent.
    waypoints: [
      { lat: 20.91, lng: 70.27 },
      { lat: 21.35, lng: 69.8 },
      { lat: 21.63, lng: 69.52 },
      { lat: 21.8, lng: 69.2 },
      { lat: 22.05, lng: 69.05 },
      { lat: 22.3, lng: 68.9 },
      { lat: 22.47, lng: 68.96 },
    ],
    startIndex: 1,
    pingPong: true,
  },
  {
    id: 'vsl-004',
    imo: '8123459',
    name: 'Kutch Fisher',
    type: 'fishing',
    speed: 3.2,
    status: 'stopped',
    pattern: 'fishing',
    // Small coastal circuit; reported as stopped so it only drifts slowly.
    waypoints: [
      { lat: 22.552, lng: 69.441 },
      { lat: 22.566, lng: 69.441 },
      { lat: 22.568, lng: 69.462 },
      { lat: 22.548, lng: 69.47 },
      { lat: 22.542, lng: 69.445 },
    ],
    startIndex: 0,
    pingPong: false,
  },
  {
    id: 'vsl-005',
    imo: '9674832',
    name: 'Coast Guard 07',
    type: 'patrol',
    speed: 15.6,
    status: 'active',
    pattern: 'patrol',
    // Elongated maritime security sweep along the Gulf of Kutch entrance fairway:
    // Paces between the outer Okha approach and the mid-gulf channel (~75 km corridor)
    // with smooth, gradual turns along the deep-water navigation channel.
    waypoints: [
      { lat: 22.42, lng: 68.85 },
      { lat: 22.52, lng: 69.05 },
      { lat: 22.58, lng: 69.28 },
      { lat: 22.65, lng: 69.52 },
    ],
    startIndex: 1,
    pingPong: true,
  },
];
