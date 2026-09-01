import type { OceanConditions } from '@/types/environment';
import { mulberry32, randomRange } from './rng';

/**
 * Deterministic environmental field for the demo scenario.
 *
 * Conditions are a seeded, slowly-varying function of simulated time around
 * the INC-2026-001 baseline (an east-northeasterly wind reinforcing the
 * west-southwest ebb outflow down the Gulf of Kutch — consistent with the
 * drift prediction in the mock timeline). The net surface drift therefore
 * follows the deep-water channel of the gulf toward the Arabian Sea and
 * keeps the slick offshore for the whole progression. There is no external
 * weather API and nothing depends on wall-clock randomness, so the same
 * simulated timestamp always yields the same conditions. This also lets the
 * provider answer `getEnvironment({ timestamp })` for a future Timeline.
 */

const ENVIRONMENT_SEED = 1_337_339_733;

/** Baseline values anchored to the INC-2026-001 scenario. */
const BASE_WIND = { speed: 7.2, direction: 92 };
const BASE_CURRENT = { speed: 0.8, direction: 268 };

const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;

interface HarmonicChannel {
  /** Amplitude of the sinusoid around the baseline value. */
  amp: number;
  /** Cycles per hour. */
  freq: number;
  phase: number;
}

interface EnvHarmonics {
  wind: { speed: HarmonicChannel; direction: HarmonicChannel };
  current: { speed: HarmonicChannel; direction: HarmonicChannel };
}

/** Fixed harmonic coefficients, drawn once from the seed at module load. */
const HARMONICS: EnvHarmonics = (() => {
  const rng = mulberry32(ENVIRONMENT_SEED);
  const channel = (ampMin: number, ampMax: number, freqMin: number, freqMax: number) => ({
    amp: randomRange(rng, ampMin, ampMax),
    freq: randomRange(rng, freqMin, freqMax),
    phase: randomRange(rng, 0, TWO_PI),
  });
  return {
    wind: {
      speed: channel(0.6, 1.4, 1 / 26, 1 / 20),
      direction: channel(4, 9, 1 / 14, 1 / 9),
    },
    current: {
      speed: channel(0.08, 0.18, 1 / 24, 1 / 15),
      direction: channel(5, 10, 1 / 26, 1 / 16),
    },
  };
})();

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function harmonicAt(channel: HarmonicChannel, hours: number): number {
  return channel.amp * Math.sin(TWO_PI * channel.freq * hours + channel.phase);
}

/**
 * Ocean conditions at a simulated timestamp. Deterministic and gentle: the
 * field oscillates slowly around the scenario baseline without drifting away
 * from the values the demo narrative depends on.
 */
export function environmentAt(simTimeMs: number): OceanConditions {
  const hours = simTimeMs / 3_600_000;
  return {
    wind: {
      speed: round1(BASE_WIND.speed + harmonicAt(HARMONICS.wind.speed, hours)),
      direction: Math.round(normalizeDegrees(BASE_WIND.direction + harmonicAt(HARMONICS.wind.direction, hours))),
    },
    current: {
      speed: round1(BASE_CURRENT.speed + harmonicAt(HARMONICS.current.speed, hours)),
      direction: Math.round(normalizeDegrees(BASE_CURRENT.direction + harmonicAt(HARMONICS.current.direction, hours))),
    },
    timestamp: new Date(simTimeMs).toISOString(),
  };
}

/**
 * Simple surface-drift vector combining wind and current.
 *
 * Wind is reported "coming from", so the surface transport blows TOWARD
 * `direction + 180`. Ekman-style, only ~3% of the wind speed is transferred to
 * surface drift; the current contributes at full flow. The vector sum is the
 * drift the slick follows (direction of travel, speed in km/h).
 */
export interface DriftVector {
  speedKmH: number;
  bearingDeg: number;
}

export function driftVectorAt(simTimeMs: number): DriftVector {
  const { wind, current } = environmentAt(simTimeMs);
  const blowBearing = normalizeDegrees(wind.direction + 180);
  const windMs = wind.speed * 0.03;

  const x =
    windMs * Math.cos(blowBearing * DEG) + current.speed * Math.cos(current.direction * DEG);
  const y =
    windMs * Math.sin(blowBearing * DEG) + current.speed * Math.sin(current.direction * DEG);

  return {
    speedKmH: Math.hypot(x, y) * 3.6,
    bearingDeg: Math.round(normalizeDegrees(Math.atan2(y, x) / DEG)),
  };
}
