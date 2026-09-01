import { create } from 'zustand';
import {
  scenarioController,
  type ScenarioClockSnapshot,
} from '@/simulation';
import type { ScenarioPhase } from '@/simulation';

/**
 * Scenario store state interface.
 */
export interface ScenarioState {
  isPlaying: boolean;
  simTimeMs: number;
  progress: number;
  phase: ScenarioPhase;
  playbackSpeed: number;

  // Actions
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  resume: () => void;
  reset: () => void;
  setSimTime: (timeMs: number) => void;
  setProgress: (progress: number) => void;
  setSpeed: (speed: number) => void;
}

/**
 * Zustand store for Scenario Controller clock & timeline state.
 *
 * Subscribes directly to the authoritative ScenarioController singleton,
 * providing reactive, predictable state for the entire OceanWatch UI
 * without putting heavy simulation math inside React components.
 */
export const useScenarioStore = create<ScenarioState>((set) => {
  const initial = scenarioController.getSnapshot();

  // Listen to controller updates (running tick, pause, play, seek, reset)
  scenarioController.subscribe((snapshot: ScenarioClockSnapshot) => {
    set({
      isPlaying: snapshot.isPlaying,
      simTimeMs: snapshot.simTimeMs,
      progress: snapshot.progress,
      phase: snapshot.phase,
      playbackSpeed: snapshot.playbackSpeed,
    });
  });

  return {
    isPlaying: initial.isPlaying,
    simTimeMs: initial.simTimeMs,
    progress: initial.progress,
    phase: initial.phase,
    playbackSpeed: initial.playbackSpeed,

    play: () => scenarioController.play(),
    pause: () => scenarioController.pause(),
    togglePlay: () => scenarioController.togglePlay(),
    resume: () => scenarioController.resume(),
    reset: () => scenarioController.reset(),
    setSimTime: (timeMs: number) => scenarioController.setSimTimeMs(timeMs),
    setProgress: (progress: number) => scenarioController.setProgress(progress),
    setSpeed: (speed: number) => scenarioController.setPlaybackSpeed(speed),
  };
});
