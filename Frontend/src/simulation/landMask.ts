import { LAND_GRID } from './landGrid';
import { distanceKm, type RoutePoint } from './geo';

/**
 * Geographic constraint primitives for the Arabian Sea demo region.
 *
 * Two bit-packed masks are embedded in `landGrid.ts` (derived from public-domain
 * Natural Earth 50m land polygons — see the header comment there):
 *
 * - the raw land mask answers "is this exact point on land?" (vessels must
 *   never be placed here, and no route may cross here);
 * - the seaward-eroded "safe water" mask answers "is this point comfortably
 *   offshore?" (≥ ~4 km from any coastline). Route waypoints and spawned vessel
 *   positions must lie in safe water so nothing hugs or clips a coast.
 *
 * Both are pure lookups: O(1) per point, deterministic, offline.
 */

/** Decode a base64 bit-mask into a byte array (browser and Node compatible). */
function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

const LAND = decodeBase64(LAND_GRID.landB64);
const SAFE = decodeBase64(LAND_GRID.safeB64);
const BYTES_PER_ROW = Math.ceil(LAND_GRID.cols / 8);

function cellAt(lng: number, lat: number): [number, number] | null {
  const c = Math.round((lng - LAND_GRID.lng0) / LAND_GRID.step);
  const r = Math.round((lat - LAND_GRID.lat0) / LAND_GRID.step);
  if (c < 0 || c >= LAND_GRID.cols || r < 0 || r >= LAND_GRID.rows) {
    return null;
  }
  return [r, c];
}

function bitAt(bytes: Uint8Array, r: number, c: number): boolean {
  return (bytes[r * BYTES_PER_ROW + (c >> 3)] & (1 << (c % 8))) !== 0;
}

/** Whether a point is on a land polygon. Cells outside the grid are treated as sea. */
export function isOnLand(lng: number, lat: number): boolean {
  const cell = cellAt(lng, lat);
  return cell ? bitAt(LAND, cell[0], cell[1]) : false;
}

/** Whether a point is comfortably offshore (≥ ~4 km from any coastline). */
export function isSafeWater(lng: number, lat: number): boolean {
  const cell = cellAt(lng, lat);
  return cell ? bitAt(SAFE, cell[0], cell[1]) : false;
}

const SAMPLES_PER_KM = 1;

/**
 * Whether the straight segment a→b passes over any land cell. Used to reject
 * impossible coastal shortcuts and island crossings.
 */
export function segmentCrossesLand(a: RoutePoint, b: RoutePoint): boolean {
  const km = distanceKm(a, b);
  const steps = Math.max(2, Math.ceil(km * SAMPLES_PER_KM));
  const dLat = (b.lat - a.lat) / steps;
  const dLng = (b.lng - a.lng) / steps;
  for (let i = 0; i <= steps; i++) {
    if (isOnLand(a.lng + dLng * i, a.lat + dLat * i)) {
      return true;
    }
  }
  return false;
}

/**
 * Whether the straight segment a→b ever leaves safe water (i.e. passes within
 * ~4 km of a coastline). Stricter than `segmentCrossesLand`: it keeps corridor
 * legs visibly offshore instead of skimming a shore.
 */
export function segmentLeavesSafeWater(a: RoutePoint, b: RoutePoint): boolean {
  const km = distanceKm(a, b);
  const steps = Math.max(2, Math.ceil(km * SAMPLES_PER_KM));
  const dLat = (b.lat - a.lat) / steps;
  const dLng = (b.lng - a.lng) / steps;
  for (let i = 0; i <= steps; i++) {
    if (!isSafeWater(a.lng + dLng * i, a.lat + dLat * i)) {
      return true;
    }
  }
  return false;
}

export interface NavigabilityResult {
  ok: boolean;
  /** First waypoint (index) that is not safe water, if any. */
  badWaypoint?: number;
  /** First waypoint pair (i-1, i) whose connecting segment fails, if any. */
  badSegment?: number;
  land?: boolean;
}

/**
 * Validate a sequence of route waypoints: every waypoint must be safe water and
 * every connecting segment must neither cross land nor skim the shore.
 *
 * `endpointsCoastal` relaxes the check for the first/last waypoint (port
 * approaches may legitimately sit nearer the shore), but they must still not be
 * ON land.
 */
export function checkNavigability(
  waypoints: RoutePoint[],
  endpointsCoastal = false
): NavigabilityResult {
  for (let i = 0; i < waypoints.length; i++) {
    const p = waypoints[i];
    const isEndpoint = endpointsCoastal && (i === 0 || i === waypoints.length - 1);
    if (isOnLand(p.lng, p.lat)) {
      return { ok: false, badWaypoint: i, land: true };
    }
    if (!isEndpoint && !isSafeWater(p.lng, p.lat)) {
      return { ok: false, badWaypoint: i, land: false };
    }
  }
  for (let i = 1; i < waypoints.length; i++) {
    if (segmentCrossesLand(waypoints[i - 1], waypoints[i])) {
      return { ok: false, badSegment: i, land: true };
    }
  }
  return { ok: true };
}
