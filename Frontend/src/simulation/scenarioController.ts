import {
  scenarioPhaseAt,
  type ScenarioPhase,
} from './incident';

/**
 * Primary scenario timeline boundaries (anchored to the INC-2026-001 scenario).
 *
 * Timeline progression:
 *   07:20:00Z (0%)   - SCENARIO_TIMELINE_START_MS: Baseline normal traffic / SAR satellite pass
 *   07:42:00Z (20%)  - DETECTION_MS: Spill detected from SAR imagery
 *   08:00:00Z (36%)  - DRIFT_START_MS: Slick begins drifting down-channel
 *   08:41:00Z (74%)  - ATTRIBUTION_MS: AIS correlation completes; candidates ranked
 *   09:10:00Z (100%) - SCENARIO_TIMELINE_END_MS: Full attribution ready / drift prediction
 */
export const SCENARIO_TIMELINE_START_ISO = '2026-08-27T07:20:00Z';
export const SCENARIO_TIMELINE_START_MS = Date.parse(SCENARIO_TIMELINE_START_ISO);

export const SCENARIO_TIMELINE_END_ISO = '2026-08-27T09:10:00Z';
export const SCENARIO_TIMELINE_END_MS = Date.parse(SCENARIO_TIMELINE_END_ISO);

export const SCENARIO_TIMELINE_DURATION_MS =
  SCENARIO_TIMELINE_END_MS - SCENARIO_TIMELINE_START_MS; // 110 minutes (6,600,000 ms)

/**
 * Default playback speed: 1 real second = 2 simulated minutes (120x).
 * At 120x, the entire 110-minute demo scenario plays in ~55 real seconds.
 */
export const DEFAULT_PLAYBACK_SPEED = 120;

/**
 * Immutable snapshot of the authoritative scenario clock state.
 */
export interface ScenarioClockSnapshot {
  isPlaying: boolean;
  simTimeMs: number;
  progress: number;
  phase: ScenarioPhase;
  playbackSpeed: number;
  formattedTime: string;
}

export type ScenarioListener = (snapshot: ScenarioClockSnapshot) => void;

/**
 * ScenarioController: Single authoritative simulation clock for OceanWatch.
 *
 * Independent of React, stores, and individual map components.
 * Owns start, pause, resume, reset, scrubbing, and speed controls.
 * Synchronizes with the existing `scenarioPhaseAt()` phase machine and
 * drives `SimulationEngine` and all scenario providers deterministically.
 */
export class ScenarioController {
  private baseSimTimeMs: number = SCENARIO_TIMELINE_START_MS;
  private playStartTimeMs: number = 0;
  private isPlayingState: boolean = false;
  private speed: number = DEFAULT_PLAYBACK_SPEED;
  private readonly listeners: Set<ScenarioListener> = new Set();
  private timerId: ReturnType<typeof setInterval> | null = null;

  constructor(autoStart: boolean = true, speed: number = DEFAULT_PLAYBACK_SPEED) {
    this.speed = speed;
    this.baseSimTimeMs = SCENARIO_TIMELINE_START_MS;
    if (autoStart) {
      this.playStartTimeMs = typeof performance !== 'undefined' ? performance.now() : 0;
      this.isPlayingState = true;
    }
    this.startNotificationLoop();
  }

  /**
   * Authoritative current simulated epoch (ms since Unix epoch).
   */
  getSimTimeMs(): number {
    if (!this.isPlayingState) {
      return this.baseSimTimeMs;
    }
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    const elapsedRealMs = Math.max(0, now - this.playStartTimeMs);
    const computed = this.baseSimTimeMs + elapsedRealMs * this.speed;

    if (computed >= SCENARIO_TIMELINE_END_MS) {
      return SCENARIO_TIMELINE_END_MS;
    }
    return computed;
  }

  get isPlaying(): boolean {
    return this.isPlayingState;
  }

  get playbackSpeed(): number {
    return this.speed;
  }

  get phase(): ScenarioPhase {
    return scenarioPhaseAt(this.getSimTimeMs());
  }

  get progress(): number {
    const current = this.getSimTimeMs();
    return Math.max(
      0,
      Math.min(1, (current - SCENARIO_TIMELINE_START_MS) / SCENARIO_TIMELINE_DURATION_MS)
    );
  }

  /** Start / resume playback. */
  play(): void {
    if (this.isPlayingState) return;

    const current = this.getSimTimeMs();
    if (current >= SCENARIO_TIMELINE_END_MS) {
      this.baseSimTimeMs = SCENARIO_TIMELINE_START_MS;
    } else {
      this.baseSimTimeMs = current;
    }
    this.playStartTimeMs = typeof performance !== 'undefined' ? performance.now() : 0;
    this.isPlayingState = true;
    this.notify();
  }

  /** Freeze simulated time. */
  pause(): void {
    if (!this.isPlayingState) return;

    this.baseSimTimeMs = this.getSimTimeMs();
    this.isPlayingState = false;
    this.notify();
  }

  /** Resume playback from frozen timestamp. */
  resume(): void {
    this.play();
  }

  /** Toggle between playing and paused. */
  togglePlay(): void {
    if (this.isPlayingState) {
      this.pause();
    } else {
      this.play();
    }
  }

  /** Re-anchor clock to exact scenario start (07:20:00Z, normal phase) and pause. */
  reset(): void {
    this.baseSimTimeMs = SCENARIO_TIMELINE_START_MS;
    this.playStartTimeMs = typeof performance !== 'undefined' ? performance.now() : 0;
    this.isPlayingState = false;
    this.notify();
  }

  /** Directly seek to a simulated timestamp. */
  setSimTimeMs(timeMs: number): void {
    const clamped = Math.max(
      SCENARIO_TIMELINE_START_MS,
      Math.min(SCENARIO_TIMELINE_END_MS, timeMs)
    );
    this.baseSimTimeMs = clamped;
    this.playStartTimeMs = typeof performance !== 'undefined' ? performance.now() : 0;
    this.notify();
  }

  /** Seek to normalized progress [0..1]. */
  setProgress(progress: number): void {
    const clamped = Math.max(0, Math.min(1, progress));
    const targetMs = SCENARIO_TIMELINE_START_MS + clamped * SCENARIO_TIMELINE_DURATION_MS;
    this.setSimTimeMs(targetMs);
  }

  /** Update playback speed multiplier. */
  setPlaybackSpeed(speed: number): void {
    const current = this.getSimTimeMs();
    this.baseSimTimeMs = current;
    this.playStartTimeMs = typeof performance !== 'undefined' ? performance.now() : 0;
    this.speed = Math.max(1, speed);
    this.notify();
  }

  /** Produce an immutable snapshot of the current clock state. */
  getSnapshot(): ScenarioClockSnapshot {
    const simTimeMs = this.getSimTimeMs();
    return {
      isPlaying: this.isPlayingState,
      simTimeMs,
      progress: Math.max(
        0,
        Math.min(1, (simTimeMs - SCENARIO_TIMELINE_START_MS) / SCENARIO_TIMELINE_DURATION_MS)
      ),
      phase: scenarioPhaseAt(simTimeMs),
      playbackSpeed: this.speed,
      formattedTime: new Date(simTimeMs).toISOString(),
    };
  }

  /** Subscribe to clock updates. */
  subscribe(listener: ScenarioListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    // Auto-pause when reaching scenario end during playback
    if (this.isPlayingState && snapshot.simTimeMs >= SCENARIO_TIMELINE_END_MS) {
      this.isPlayingState = false;
      this.baseSimTimeMs = SCENARIO_TIMELINE_END_MS;
      snapshot.isPlaying = false;
    }
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('[ScenarioController] Error in clock subscriber listener:', err);
      }
    }
  }

  private startNotificationLoop(): void {
    if (typeof window !== 'undefined') {
      this.timerId = setInterval(() => {
        if (this.isPlayingState) {
          this.notify();
        }
      }, 100);
    }
  }

  /** Cleanup timer loop if controller instance is destroyed. */
  destroy(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.listeners.clear();
  }
}

/**
 * Shared singleton scenario controller instance across the OceanWatch frontend.
 */
export const scenarioController = new ScenarioController(true, DEFAULT_PLAYBACK_SPEED);
