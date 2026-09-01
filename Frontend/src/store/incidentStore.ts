import { create } from 'zustand';

/**
 * Investigation mode states
 */
export type InvestigationMode = 'inactive' | 'active' | 'reviewing';

/**
 * Incident store state interface
 */
interface IncidentState {
  selectedVesselId: string | null;
  selectedIncidentId: string | null;
  investigationMode: InvestigationMode;
  timelinePosition: string | null;
  isTraceSourceActive: boolean;
  replayPointIndex: number | null;
  isReplaying: boolean;

  // Selection actions
  selectVessel: (id: string | null) => void;
  selectIncident: (id: string | null) => void;
  clearSelection: () => void;

  // Investigation actions
  setInvestigationMode: (mode: InvestigationMode) => void;
  startInvestigation: (incidentId: string) => void;
  endInvestigation: () => void;

  // Trace Source & Replay actions
  setTraceSourceActive: (active: boolean) => void;
  setReplayPointIndex: (index: number | null) => void;
  setIsReplaying: (replaying: boolean) => void;

  // Timeline actions
  setTimelinePosition: (timestamp: string | null) => void;
  resetTimeline: () => void;
}

/**
 * Incident store for selection, investigation, and source reconstruction state.
 *
 * Manages which vessel and incident are currently selected,
 * investigation mode, trace source activation, and replay state.
 *
 * See AGENTS.md §6: Use Zustand for selected vessel, incident, and investigation mode.
 */
export const useIncidentStore = create<IncidentState>((set) => ({
  selectedVesselId: null,
  selectedIncidentId: null,
  investigationMode: 'inactive',
  timelinePosition: null,
  isTraceSourceActive: false,
  replayPointIndex: null,
  isReplaying: false,

  selectVessel: (id) =>
    set({ selectedVesselId: id }),

  selectIncident: (id) =>
    set((state) => ({
      selectedIncidentId: id,
      // Clear vessel selection when switching incidents
      selectedVesselId: id !== state.selectedIncidentId ? null : state.selectedVesselId,
    })),

  clearSelection: () =>
    set({
      selectedVesselId: null,
      selectedIncidentId: null,
      isTraceSourceActive: false,
      replayPointIndex: null,
      isReplaying: false,
    }),

  setInvestigationMode: (mode) =>
    set({ investigationMode: mode }),

  startInvestigation: (incidentId) =>
    set({
      selectedIncidentId: incidentId,
      investigationMode: 'active',
      timelinePosition: null,
    }),

  endInvestigation: () =>
    set({
      investigationMode: 'inactive',
      timelinePosition: null,
      isTraceSourceActive: false,
      replayPointIndex: null,
      isReplaying: false,
    }),

  setTraceSourceActive: (active) =>
    set({
      isTraceSourceActive: active,
      replayPointIndex: null,
      isReplaying: false,
    }),

  setReplayPointIndex: (index) =>
    set({ replayPointIndex: index }),

  setIsReplaying: (replaying) =>
    set({ isReplaying: replaying }),

  setTimelinePosition: (timestamp) =>
    set({ timelinePosition: timestamp }),

  resetTimeline: () =>
    set({
      timelinePosition: null,
      isTraceSourceActive: false,
      replayPointIndex: null,
      isReplaying: false,
    }),
}));
