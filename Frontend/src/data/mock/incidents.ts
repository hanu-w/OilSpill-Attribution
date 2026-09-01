import type { TimelineEvent } from '../../types/incident';
import { INCIDENT_ID } from '../../simulation';

/**
 * Deterministic mock incident scenario.
 *
 * The incident itself and its candidate ranking are no longer static data:
 * they are derived by the INC-2026-001 scenario runner from the seeded fleet
 * and simulated time (see `src/simulation`). This module keeps the fixed
 * scenario definition and the investigation timeline as reference data.
 *
 * The spill narrative — Ocean Guardian (vsl-001) as the top candidate — is
 * preserved because the scenario's multi-factor scoring selects it from the
 * real fleet, not because it is hard-coded here.
 */

/** Static incident definition (detection geometry is computed per timestamp). */
export { SCENARIO_INCIDENT_BASE as MOCK_INCIDENT } from '../../simulation';

export const MOCK_TIMELINES: Record<string, TimelineEvent[]> = {
  [INCIDENT_ID]: [
    {
      id: 'evt-001',
      incidentId: INCIDENT_ID,
      timestamp: '2026-08-27T07:20:00Z',
      type: 'satellite_pass',
      description: 'SAR satellite pass captured 20 km swath over region AU-7.',
    },
    {
      id: 'evt-002',
      incidentId: INCIDENT_ID,
      timestamp: '2026-08-27T07:42:00Z',
      type: 'detection',
      description: 'Oil spill detected from SAR imagery; extent initialized.',
    },
    {
      id: 'evt-003',
      incidentId: INCIDENT_ID,
      timestamp: '2026-08-27T07:52:00Z',
      type: 'investigation_started',
      description: 'Investigation opened; spill shape analyzed.',
    },
    {
      id: 'evt-004',
      incidentId: INCIDENT_ID,
      timestamp: '2026-08-27T08:20:00Z',
      type: 'environmental_update',
      description: 'E/ENE wind reinforcing the WSW ebb outflow; surface drift projected west-southwest down the Gulf of Kutch channel.',
    },
    {
      id: 'evt-005',
      incidentId: INCIDENT_ID,
      timestamp: '2026-08-27T08:34:00Z',
      type: 'ais_correlation',
      description: 'AIS tracks intersected with back-projected spill drift path.',
    },
    {
      id: 'evt-006',
      incidentId: INCIDENT_ID,
      timestamp: '2026-08-27T08:41:00Z',
      type: 'candidate_ranked',
      description: 'Candidate vessels ranked by correlation; top candidate Ocean Guardian (vsl-001).',
    },
    {
      id: 'evt-007',
      incidentId: INCIDENT_ID,
      timestamp: '2026-08-27T09:10:00Z',
      type: 'drift_prediction',
      description: 'Predicted drift path computed over next 12 hours.',
    },
  ],
};
