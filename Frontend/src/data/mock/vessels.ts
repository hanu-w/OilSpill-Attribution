import { SCENARIO_START_MS, simulationEngine } from '../../simulation';
import type { Vessel, VesselTrail } from '../../types/vessel';

/**
 * Deterministic snapshot of the simulation fleet at scenario time zero.
 *
 * The live, moving fleet is owned by the `SimulationEngine` and exposed
 * through `MockDataProvider`. These exports freeze the initial (t=0) world
 * for reference and tests — identical on every load because the generator is
 * seeded and the scenario epoch is fixed.
 */
const T0 = SCENARIO_START_MS;

/** Initial fleet positions at scenario time zero. */
export const MOCK_VESSELS: Vessel[] = simulationEngine.getVessels(T0);

/** Initial historical trails at scenario time zero, keyed by vessel id. */
export const MOCK_VESSEL_TRAILS: Record<string, VesselTrail> = Object.fromEntries(
  MOCK_VESSELS.map((v) => {
    const trail = simulationEngine.getVesselTrail(v.id, undefined, T0);
    return [v.id, trail as VesselTrail];
  })
);
