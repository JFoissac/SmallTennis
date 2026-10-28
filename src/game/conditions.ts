import type { SurfaceType } from '../world/court';

/** Inputs that describe how playable the court is for one player right now. */
export interface Conditions {
  surface: SurfaceType;
  /** Rain intensity, 0..1. */
  rain: number;
  /** Court wetness, 0..1. Stays high after the rain stops, then dries. */
  wetness: number;
  /** Night factor, 0..1. */
  night: number;
  /** Remaining stamina, 1 = fresh, 0 = empty. */
  stamina: number;
  /** Score pressure, 0..1. */
  pressure: number;
}

/** Multipliers applied to the simulation. `accuracy > 1` means more errors. */
export interface ConditionModifiers {
  speed: number;
  accuracy: number;
  servePower: number;
  serveAccuracy: number;
  /** 0..1, for presentation (grip, balance, body language). */
  strain: number;
}

interface SurfaceResponse {
  speed: number;
  error: number;
  serve: number;
}

/** Wet courts hurt grass most, clay least on the serve, and footing differently. */
const WET_RESPONSE: Record<SurfaceType, SurfaceResponse> = {
  clay: { speed: 0.14, error: 0.4, serve: 0.1 },
  grass: { speed: 0.22, error: 0.3, serve: 0.18 },
  hard: { speed: 0.1, error: 0.22, serve: 0.08 },
};

export const STAMINA_DRAIN_PER_POINT = 0.004;
export const STAMINA_RECOVERY_PER_BREAK = 0.06;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

export function conditionsFor(input: Conditions): ConditionModifiers {
  const wet = WET_RESPONSE[input.surface];
  const wetness = clamp01(input.wetness);
  const rain = clamp01(input.rain);
  const night = clamp01(input.night);
  const stamina = clamp01(input.stamina);
  const pressure = clamp01(input.pressure);

  const fatigue = 1 - stamina;
  const speed = Math.max(
    0.55,
    1 - wetness * wet.speed - fatigue * 0.28 - night * 0.03 - rain * 0.02,
  );
  const accuracy = 1 + wetness * wet.error + fatigue * 0.9 + pressure * 0.35 + night * 0.08 + rain * 0.06;
  const servePower = Math.max(0.6, 1 - wetness * wet.serve - fatigue * 0.15);
  const serveAccuracy = accuracy * (1 + wetness * 0.15) * (1 + rain * 0.1);

  return {
    speed,
    accuracy,
    servePower,
    serveAccuracy,
    strain: clamp01(wetness * 0.6 + fatigue * 0.7 + pressure * 0.3),
  };
}

/** How tired a player is after `points` points, for the given stamina stat. */
export function staminaAfterPoints(points: number, staminaStat: number): number {
  return clamp01(1 - points * (STAMINA_DRAIN_PER_POINT / Math.max(0.5, staminaStat)));
}

/** Match pressure from the score, independent from the current rally length. */
export function scorePressure(input: {
  inTiebreak: boolean;
  inMatchTiebreak: boolean;
  decidingPoint: boolean;
  games: [number, number];
  points: [number, number];
}): number {
  if (input.inMatchTiebreak) return 0.9;
  if (input.inTiebreak) return 0.75;
  if (input.decidingPoint) return 0.7;
  const [a, b] = input.games;
  if (a >= 3 && b >= 3) return 0.55;
  if (input.points[0] >= 3 && input.points[1] >= 3) return 0.6;
  if (Math.max(a, b) >= 2 && Math.abs(a - b) <= 1) return 0.4;
  return 0.18;
}
