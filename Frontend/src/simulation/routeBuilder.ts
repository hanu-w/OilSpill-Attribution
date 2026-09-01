import { buildRoute, destinationPoint, distanceKm, type RoutePoint, type SimRoute } from './geo';
import { checkNavigability } from './landMask';
import { hashString, mulberry32 } from './rng';
import {
  ANCHORAGES,
  CORRIDOR_DEEP_LANE,
  CORRIDOR_GULF_APPROACH,
  CORRIDOR_GULF_INNER,
  CORRIDOR_GULF_SOUTH_SHORE,
  CORRIDOR_WEST_COAST,
  CORRIDOR_WEST_OFFSHORE,
  FISHING_GROUNDS,
  PATROL_CENTERS,
  PORTS,
  type Port,
} from './maritimeNetwork';

/**
 * Route builder — assembles navigable routes from the validated maritime
 * network. Every route is asserted with `checkNavigability` at build time:
 * a route can never be returned (and thus a vessel never spawned or routed)
 * that crosses land, crosses an island, or clips the coast. Failures throw,
 * so a network regression surfaces immediately instead of putting a vessel on
 * dry land.
 *
 * Corridor constants are interior centerlines; port `approach` points are
 * prepended/appended. Directions are handled by reversing a corridor when the
 * voyage runs against its authored direction.
 */

/** Chain point groups into one waypoint list, dropping duplicate consecutive points. */
export function chainPoints(...groups: RoutePoint[][]): RoutePoint[] {
  const out: RoutePoint[] = [];
  for (const group of groups) {
    for (const p of group) {
      const last = out[out.length - 1];
      if (!last || last.lng !== p.lng || last.lat !== p.lat) {
        out.push(p);
      }
    }
  }
  return out;
}

/** Reverse a point list (traverse a corridor in the opposite direction). */
export function reversePoints(ps: RoutePoint[]): RoutePoint[] {
  return ps.slice().reverse();
}

export interface RouteBuildOptions {
  label?: string;
  /** Relax the safe-water requirement for the first/last waypoint (default true). */
  endpointsCoastal?: boolean;
}

/** Build a SimRoute from waypoint groups, asserting navigability. */
export function buildNavigableRoute(groups: RoutePoint[][], options: RouteBuildOptions = {}): SimRoute {
  const waypoints = chainPoints(...groups);
  const result = checkNavigability(waypoints, options.endpointsCoastal ?? true);
  if (!result.ok) {
    const reason = result.land ? 'on land' : 'not safe water';
    const where =
      result.badWaypoint !== undefined
        ? `waypoint ${result.badWaypoint} ${JSON.stringify(waypoints[result.badWaypoint])}`
        : `segment ${result.badSegment}`;
    throw new Error(`Route [${options.label ?? 'unlabeled'}] not navigable (${where} ${reason})`);
  }
  return buildRoute(waypoints);
}

function portPoint(id: string): RoutePoint {
  const p = PORTS[id];
  if (!p) throw new Error(`Unknown port '${id}'`);
  return p.approach;
}

/**
 * Deep-water lane Karachi ↔ Mumbai. `from`/`to` must be karachi/mumbai.
 */
export function deepLaneRoute(from: 'karachi' | 'mumbai', to: 'karachi' | 'mumbai'): SimRoute {
  const forward = from === 'karachi';
  return buildNavigableRoute(
    [
      [portPoint(from)],
      forward ? CORRIDOR_DEEP_LANE : reversePoints(CORRIDOR_DEEP_LANE),
      [portPoint(to)],
    ],
    { label: `deep ${from}→${to}` }
  );
}

/**
 * Gulf corridor route between an outer port (karachi/mumbai) and a Gulf of
 * Kutch port (kandla/mundra/vadinar/sikka/mandvi).
 */
export function gulfRoute(from: string, to: string): SimRoute {
  const fromPort = PORTS[from];
  const toPort = PORTS[to];
  if (!fromPort || !toPort) throw new Error(`gulfRoute: unknown port ${from}/${to}`);
  const intoGulf = from === 'karachi' || from === 'mumbai';

  // Build the chain from the open-sea side toward the gulf head, then orient it.
  const approach = intoGulf
    ? gulfApproachChain(fromPort, toPort)
    : reversePoints(gulfApproachChain(toPort, fromPort));

  return buildNavigableRoute([[portPoint(from)], approach, [portPoint(to)]], {
    label: `gulf ${from}→${to}`,
  });
}

/** Interior chain from an outer approach toward a gulf-port approach. */
function gulfApproachChain(fromPort: Port, toPort: Port): RoutePoint[] {
  // From Karachi: run down the deep lane then the gulf approach.
  // From Mumbai: up the west coast then the gulf approach.
  // Both stems run "from the outer port toward the gulf mouth" — the authored
  // corridor direction already matches, so no reversal here.
  const stem: RoutePoint[] = fromPort.id === 'karachi'
    ? CORRIDOR_DEEP_LANE.slice(0, 4)
    : CORRIDOR_WEST_COAST.slice(0, 4);

  const head = gulfHeadChain(toPort);
  return [...stem, ...CORRIDOR_GULF_APPROACH, ...head];
}

/** Chain from the gulf mouth to a specific gulf port's approach point. */
function gulfHeadChain(toPort: Port): RoutePoint[] {
  switch (toPort.id) {
    case 'kandla':
      // GULF_INNER[0] sits off Mundra; Kandla approach lies a short hop further in.
      return [CORRIDOR_GULF_INNER[0]];
    case 'mundra':
      return CORRIDOR_GULF_INNER.slice(0, 2);
    case 'mandvi':
      return CORRIDOR_GULF_INNER.slice(0, 3);
    case 'vadinar':
    case 'sikka': {
      const shore = CORRIDOR_GULF_SOUTH_SHORE;
      if (toPort.id === 'sikka') {
        return [...shore, { lat: 22.56, lng: 69.86 }];
      }
      return shore;
    }
    default:
      throw new Error(`gulfHeadChain: ${toPort.id} is not a Gulf port`);
  }
}

/**
 * Coastal feeder route along the Saurashtra west coast. Supports the specific
 * Mumbai ↔ Veraval / Porbandar / Okha pairs and short coastal hops — each
 * explicitly authored so the corridor is sliced in the correct direction
 * (Mumbai sits at the southern end of the authored chain).
 */
export function coastalRoute(from: string, to: string): SimRoute {
  const WC = CORRIDOR_WEST_COAST;
  const mum = [portPoint('mumbai')];
  const ver = [portPoint('veraval')];
  const por = [portPoint('porbandar')];
  const okha = [portPoint('okha')];

  let groups: RoutePoint[][];
  if (from === 'mumbai' && to === 'veraval') groups = [mum, WC.slice(0, 3), ver];
  else if (from === 'veraval' && to === 'mumbai') groups = [ver, reversePoints(WC.slice(0, 3)), mum];
  else if (from === 'mumbai' && to === 'porbandar') groups = [mum, WC.slice(0, 5), por];
  else if (from === 'porbandar' && to === 'mumbai') groups = [por, reversePoints(WC.slice(0, 5)), mum];
  else if (from === 'mumbai' && to === 'okha') groups = [mum, WC, okha];
  else if (from === 'okha' && to === 'mumbai') groups = [okha, reversePoints(WC), mum];
  else if (from === 'porbandar' && to === 'veraval') groups = [por, reversePoints(WC.slice(2, 5)), ver];
  else if (from === 'veraval' && to === 'porbandar') groups = [ver, WC.slice(2, 5), por];
  else if (from === 'okha' && to === 'porbandar') groups = [okha, reversePoints(WC.slice(4)), por];
  else throw new Error(`coastalRoute: unsupported ${from}→${to}`);

  return buildNavigableRoute(groups, { label: `coastal ${from}→${to}` });
}

/** Offshore connector Karachi ↔ Veraval / Porbandar (west of Saurashtra). */
export function offshoreRoute(from: string, to: string): SimRoute {
  const f = PORTS[from];
  const t = PORTS[to];
  if (!f || !t) throw new Error(`offshoreRoute: unknown port ${from}/${to}`);
  const forward = from === 'karachi';
  const chain = forward ? CORRIDOR_WEST_OFFSHORE : reversePoints(CORRIDOR_WEST_OFFSHORE);
  return buildNavigableRoute([[portPoint(from)], chain, [portPoint(to)]], {
    label: `offshore ${from}→${to}`,
  });
}

/** Short hop between adjacent Gulf ports (Mundra → Vadinar → Sikka). */
export function gulfHopRoute(from: string, to: string): SimRoute {
  const chain: RoutePoint[] = [];
  if (from === 'mundra' && to === 'vadinar') chain.push(...CORRIDOR_GULF_SOUTH_SHORE);
  else if (from === 'vadinar' && to === 'sikka') chain.push({ lat: 22.56, lng: 69.86 });
  else throw new Error(`gulfHopRoute: unsupported pair ${from}→${to}`);
  return buildNavigableRoute([[portPoint(from)], chain, [portPoint(to)]], {
    label: `hop ${from}→${to}`,
  });
}

// ---------------------------------------------------------------------------
// Fishing routes: home port → ground → small loiter circuit → home port.
// Returns the route plus the cumulative-km landmarks the journey needs.
// ---------------------------------------------------------------------------

export interface FishingRouteSpec {
  route: SimRoute;
  /** km at first arrival at the ground. */
  outEndKm: number;
  /** km at the end of the loiter circuit (back at the ground centre). */
  loopEndKm: number;
}

/** Upper bound for trawling sweeps around the ground centre (km). */
const FISHING_SWEEP_RADIUS_KM = 4.8;
/** Deterministic radius shrink used when the sweep clips the coast. */
const FISHING_LOOP_SHRINKS = [1, 0.75, 0.5, 0.35];

/**
 * Trawling sweep around a fishing ground.
 *
 * Real fishing vessels work a fishing bank using elongated trawling sweeps
 * (long linear drags back and forth across the ground) rather than tight
 * geometric loops. Vertices are derived per vessel from `seedKey`, producing
 * natural, realistic paths that remain 100% deterministic and navigable.
 */
export function fishingRoute(homeId: string, groundKey: string, seedKey = `${homeId}:${groundKey}`): FishingRouteSpec {
  const home = PORTS[homeId];
  const ground = FISHING_GROUNDS[groundKey];
  if (!home || !ground) throw new Error(`fishingRoute: unknown ${homeId}/${groundKey}`);

  const rng = mulberry32(hashString(seedKey));
  const trawlAngle = Math.floor(rng() * 180);
  const sweepLengthKm = 3.5 + rng() * (FISHING_SWEEP_RADIUS_KM - 3.5);

  let lastError: string | undefined;
  for (const shrink of FISHING_LOOP_SHRINKS) {
    const p1 = destinationPoint(ground, trawlAngle, sweepLengthKm * shrink);
    const p2 = destinationPoint(ground, (trawlAngle + 180) % 360, sweepLengthKm * shrink);
    const waypoints = chainPoints([home.approach], [ground], [p1], [p2], [ground], [home.approach]);
    const result = checkNavigability(waypoints);
    if (result.ok) {
      const route = buildRoute(waypoints);
      let outIdx = -1;
      let retIdx = -1;
      for (let i = 0; i < waypoints.length; i++) {
        if (distanceKm(waypoints[i], ground) < 0.02) {
          if (outIdx === -1) outIdx = i;
          retIdx = i;
        }
      }
      if (outIdx === -1 || retIdx === -1) {
        throw new Error(`Fishing route ${homeId}→${groundKey} ground centre lost from waypoints`);
      }
      return { route, outEndKm: route.cumKm[outIdx], loopEndKm: route.cumKm[retIdx] };
    }
    lastError = `(${result.badWaypoint ?? result.badSegment})`;
  }
  throw new Error(`Fishing route ${homeId}→${groundKey} not navigable at any scale ${lastError}`);
}

// ---------------------------------------------------------------------------
// Patrol sweeps and anchored holds.
// ---------------------------------------------------------------------------

/**
 * Elongated maritime patrol sweep along a sector fairway / approach corridor.
 *
 * Real coast guard and naval patrol vessels maintain steady sweeps back and
 * forth along major navigation fairways and border corridors rather than
 * orbiting tiny circles.
 */
export function patrolCircuit(centerKey: string): SimRoute {
  const center = PATROL_CENTERS[centerKey];
  if (!center) throw new Error(`patrolCircuit: unknown ${centerKey}`);

  let waypoints: RoutePoint[];
  if (centerKey === 'kandla') {
    waypoints = [
      { lat: 22.78, lng: 70.02 },
      { lat: 22.7, lng: 69.8 },
      { lat: 22.65, lng: 69.52 },
      { lat: 22.7, lng: 69.8 },
      { lat: 22.78, lng: 70.02 },
    ];
  } else if (centerKey === 'mundra') {
    waypoints = [
      { lat: 22.72, lng: 69.62 },
      { lat: 22.62, lng: 69.3 },
      { lat: 22.52, lng: 69.05 },
      { lat: 22.62, lng: 69.3 },
      { lat: 22.72, lng: 69.62 },
    ];
  } else if (centerKey === 'porbandar') {
    waypoints = [
      { lat: 21.75, lng: 69.2 },
      { lat: 21.52, lng: 69.38 },
      { lat: 21.35, lng: 69.6 },
      { lat: 21.52, lng: 69.38 },
      { lat: 21.75, lng: 69.2 },
    ];
  } else if (centerKey === 'okha') {
    waypoints = [
      { lat: 22.47, lng: 68.96 },
      { lat: 22.3, lng: 68.88 },
      { lat: 22.1, lng: 68.8 },
      { lat: 22.3, lng: 68.88 },
      { lat: 22.47, lng: 68.96 },
    ];
  } else {
    // diu / South Saurashtra
    waypoints = [
      { lat: 20.66, lng: 70.9 },
      { lat: 20.55, lng: 70.6 },
      { lat: 20.5, lng: 70.3 },
      { lat: 20.55, lng: 70.6 },
      { lat: 20.66, lng: 70.9 },
    ];
  }

  const result = checkNavigability(waypoints);
  if (!result.ok) {
    throw new Error(`Patrol sweep ${centerKey} not navigable (${result.badWaypoint ?? result.badSegment})`);
  }
  return buildRoute(waypoints);
}

/** Stationary hold at an anchorage point. */
export function anchoredRoute(anchKey: string): SimRoute {
  const point = ANCHORAGES[anchKey];
  if (!point) throw new Error(`anchoredRoute: unknown ${anchKey}`);
  if (checkNavigability([point]).ok === false) {
    throw new Error(`Anchorage ${anchKey} not in safe water`);
  }
  return buildRoute([point]);
}
