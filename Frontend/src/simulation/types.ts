import type { VesselStatus, VesselType } from '@/types/vessel';
import type { SimRoute } from './geo';
import type { Journey } from './journey';

/**
 * Broad traffic pattern a vessel belongs to. Used only for bookkeeping/
 * debugging; the visible behaviour is encoded in the route/journey.
 * `gulf-lane`/`south-lane` are retained for the fixed scenario core (vsl-001..),
 * the rest describe the generated fleet.
 */
export type TrafficPattern =
  | 'gulf-lane'
  | 'south-lane'
  | 'commercial-corridor'
  | 'coastal'
  | 'fishing'
  | 'patrol'
  | 'anchored';

/**
 * Per-vessel AIS realism parameters (all derived from the seeded generator).
 * They only affect *reported* observations (position/heading/speed jitter and
 * report cadence); pure kinematic state and scoring stay jitter-free.
 */
export interface AisJitter {
  /** Position jitter radius in km (applied along heading ± across). */
  radiusKm: number;
  /** Heading jitter in degrees (one-sided, -jitter..0). */
  headingDeg: number;
  /** Speed jitter fraction (0..1) of cruise speed (one-sided, -fraction..0). */
  speedFraction: number;
}

/**
 * Internal simulation vessel definition.
 *
 * This is deliberately *not* the domain `Vessel` model: the simulation owns
 * routes and kinematics; the provider maps `SimVessel` → `Vessel` at the
 * boundary so UI code never sees simulation internals.
 */
export interface SimVessel {
  id: string;
  imo: string;
  name: string;
  type: VesselType;
  /** Cruise speed in knots. */
  speed: number;
  status: VesselStatus;
  route: SimRoute;
  /** Distance along the route at simulation time zero. */
  startProgressKm: number;
  pattern: TrafficPattern;
  /**
   * When true, the vessel reflects at the ends of an open lane instead of
   * wrapping around (which would look like teleporting).
   */
  pingPong: boolean;
  /**
   * Behavior timeline over `route`. When present it drives vesselStateAt and
   * trails (cargo slowdowns near port, fishing transits + loiter, patrol
   * circuits, anchored holds); the legacy linear/ping-pong path remains for
   * the preserved scenario core (vsl-001..vsl-005).
   */
  journey?: Journey;
  /** Fixed heading while at zero speed (anchored / held). */
  idleHeadingDeg?: number;
  /** Nominal AIS report period in seconds (jittered around it per report). */
  aisReportPeriodS?: number;
  /** Jitter profile applied to reported observations. */
  aisJitter?: AisJitter;
  /** Human labels for the origin / destination of the current run. */
  originLabel?: string;
  destinationLabel?: string;
}

/** Options controlling generated historical trail density. */
export interface TrailGenOptions {
  /** Number of historical points including the current position. */
  pointCount?: number;
  /** Simulated seconds between consecutive trail points. */
  intervalSeconds?: number;
}
