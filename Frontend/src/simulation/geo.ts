/**
 * Small geographic helpers used by the maritime simulation.
 *
 * These are intentionally lightweight — visually believable AIS-style
 * movement, not a physically accurate ocean-navigation model. Movement is
 * computed along great-circle-ish rhumb segments, which naturally accounts
 * for latitude when converting distance into longitude deltas.
 */

export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface SimRoute {
  waypoints: RoutePoint[];
  /** Total length of the route in km. */
  totalKm: number;
  /** Cumulative distance (km) at each waypoint; length === waypoints.length. */
  cumKm: number[];
}

const EARTH_RADIUS_KM = 6371.0088;
const DEG = Math.PI / 180;

/** Great-circle distance between two points in km. */
export function distanceKm(a: RoutePoint, b: RoutePoint): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Initial bearing from a to b in degrees (0° north, clockwise). */
export function bearingDeg(a: RoutePoint, b: RoutePoint): number {
  const y = Math.sin((b.lng - a.lng) * DEG) * Math.cos(b.lat * DEG);
  const x =
    Math.cos(a.lat * DEG) * Math.sin(b.lat * DEG) -
    Math.sin(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.cos((b.lng - a.lng) * DEG);
  return (Math.atan2(y, x) / DEG + 360) % 360;
}

/**
 * Destination point given a start point, bearing (degrees) and distance (km).
 * The longitude delta is scaled by latitude automatically.
 */
export function destinationPoint(
  start: RoutePoint,
  bearing: number,
  distanceKm_: number
): RoutePoint {
  const delta = distanceKm_ / EARTH_RADIUS_KM;
  const theta = bearing * DEG;
  const phi1 = start.lat * DEG;
  const lambda1 = start.lng * DEG;
  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) +
      Math.cos(phi1) * Math.sin(delta) * Math.cos(theta)
  );
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2)
    );
  return { lat: phi2 / DEG, lng: lambda2 / DEG };
}

/** Build a route with precomputed segment lengths. */
export function buildRoute(waypoints: RoutePoint[]): SimRoute {
  const cumKm: number[] = [0];
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) {
    total += distanceKm(waypoints[i - 1], waypoints[i]);
    cumKm.push(total);
  }
  return { waypoints, totalKm: total, cumKm };
}

/** Total length of a route in km. */
export function routeLengthKm(route: SimRoute): number {
  return route.totalKm;
}

export interface RouteState {
  lat: number;
  lng: number;
  /** Bearing of forward travel at this point, degrees (0° north, clockwise). */
  heading: number;
}

/**
 * Position and forward heading along a route at a given distance (km).
 * `distanceKmAt` is clamped to [0, totalKm]; a single-waypoint (stationary)
 * route returns that point with heading 0.
 */
export function pointAlongRoute(route: SimRoute, distanceKmAt: number): RouteState {
  const { waypoints, totalKm, cumKm } = route;
  if (waypoints.length === 0) {
    return { lat: 0, lng: 0, heading: 0 };
  }
  if (waypoints.length === 1 || totalKm <= 0) {
    return { lat: waypoints[0].lat, lng: waypoints[0].lng, heading: 0 };
  }

  const d = Math.max(0, Math.min(distanceKmAt, totalKm));

  // Locate the segment containing d.
  let i = 1;
  while (i < cumKm.length - 1 && cumKm[i] < d) {
    i++;
  }

  const segStart = waypoints[i - 1];
  const segEnd = waypoints[i];
  const segKm = cumKm[i] - cumKm[i - 1];
  const bearing = bearingDeg(segStart, segEnd);
  const along = segKm > 0 ? d - cumKm[i - 1] : 0;
  const pos = destinationPoint(segStart, bearing, along);

  return { lat: pos.lat, lng: pos.lng, heading: bearing };
}
