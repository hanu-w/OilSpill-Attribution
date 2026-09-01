import type { OceanConditions } from '../../types/environment';
import { SCENARIO_START_MS, environmentAt } from '../../simulation';

/**
 * Reference environmental conditions for the demo scenario.
 *
 * The live conditions returned by the data provider are now derived from the
 * deterministic simulation environment (`environmentAt`), which oscillates
 * slowly around this baseline — an E/ENE wind reinforcing the WSW ebb outflow
 * is consistent with the drift prediction in INC-2026-001's mock timeline
 * (spill carried west-southwest down the Gulf of Kutch channel).
 * `MOCK_ENVIRONMENT` is kept as the scenario-start snapshot.
 */

/** Baseline at scenario start (t=0), for reference and tests. */
export const MOCK_ENVIRONMENT: OceanConditions = environmentAt(SCENARIO_START_MS);

/** A deterministic spot-condition at scenario start, for any queried point. */
export function getMockEnvironmentPoint(): OceanConditions {
  return structuredClone(MOCK_ENVIRONMENT);
}
