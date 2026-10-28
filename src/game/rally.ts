import type { SurfaceType } from '../world/court';
import type { BallEvent } from './physics';

/** The part of the rally state the rules need. Counters are returned updated. */
export interface RallyView {
  hitter: 0 | 1;
  bounces: number;
  isServe: boolean;
  serveBoxSign: 1 | -1;
  receiverSide: 1 | -1;
  netTouched: boolean;
  serveIn: boolean;
}

export interface RallyCourt {
  singlesHalf: number;
  lengthHalf: number;
  serviceLine: number;
}

export interface RallyHost {
  surface: SurfaceType;
  court: RallyCourt;
  registerBounce(x: number, z: number, power: number): void;
  triggerNetRipple(x: number, over: boolean): void;
  emitCall(text: string, delay?: number, duration?: number): void;
  recordCloseCall(pos: { x: number; y: number; z: number }, lineCall: 'IN' | 'OUT', isServe: boolean): void;
  serveFault(reason: 'OUT' | 'NET'): void;
  let(): void;
  point(winner: 0 | 1, reason: string): void;
  debug(text: string): void;
}

/** A line call is "close" when the bounce lands within 20 cm of a line. */
export function isCloseCall(
  pos: { x: number; z: number },
  court: RallyCourt,
  surface: SurfaceType,
  isServe: boolean,
): boolean {
  if (surface !== 'clay') return false;
  let min = Infinity;
  min = Math.min(min, Math.abs(Math.abs(pos.x) - court.singlesHalf));
  min = Math.min(min, Math.abs(Math.abs(pos.z) - court.lengthHalf));
  if (isServe) {
    min = Math.min(min, Math.abs(Math.abs(pos.z) - court.serviceLine));
    min = Math.min(min, Math.abs(pos.x));
  }
  return min < 0.2;
}

export function isInSingles(pos: { x: number; z: number }, court: RallyCourt, receiverSide: 1 | -1): boolean {
  return (
    Math.abs(pos.x) <= court.singlesHalf + 0.08 &&
    pos.z * receiverSide > 0 &&
    Math.abs(pos.z) <= court.lengthHalf + 0.08
  );
}

export function isInServiceBox(pos: { x: number; z: number }, rally: RallyView, court: RallyCourt): boolean {
  return (
    Math.abs(pos.x) <= court.singlesHalf + 0.08 &&
    pos.z * rally.receiverSide > 0 &&
    Math.abs(pos.z) <= court.serviceLine + 0.08 &&
    Math.sign(pos.x) === rally.serveBoxSign &&
    Math.abs(pos.x) > 0.02
  );
}

/**
 * Applies one ball event to a rally.
 *
 * Pure apart from the host callbacks that describe what happened (bounce mark,
 * net ripple, line call, point). Returns the updated rally so the caller owns
 * the state; point/fault/let endings are signalled through the host.
 */
export function judgeBallEvent(rally: RallyView, event: BallEvent, host: RallyHost): RallyView {
  const next: RallyView = { ...rally };

  if (event.kind === 'bounce') {
    host.debug(
      `bounce pos=${event.pos.x.toFixed(2)},${event.pos.z.toFixed(2)} hitter=${rally.hitter} bounces=${rally.bounces} isServe=${rally.isServe}`,
    );
    host.registerBounce(event.pos.x, event.pos.z, event.speed / 18);
    const inSingles = isInSingles(event.pos, host.court, rally.receiverSide);
    if (isCloseCall(event.pos, host.court, host.surface, rally.isServe)) {
      host.recordCloseCall(event.pos, inSingles ? 'IN' : 'OUT', rally.isServe);
    }

    if (rally.isServe) {
      const inBox = isInServiceBox(event.pos, rally, host.court);
      if (rally.bounces === 0) {
        host.debug(`serve bounce inBox=${inBox}`);
        if (!inBox) {
          host.serveFault('OUT');
          return next;
        }
        next.serveIn = true;
        if (rally.netTouched) {
          host.let();
          return next;
        }
      } else {
        host.point(rally.hitter, rally.bounces === 1 ? 'ACE' : 'WINNER');
        return next;
      }
      next.bounces = rally.bounces + 1;
      return next;
    }

    if (rally.bounces === 0) {
      if (!inSingles) {
        host.recordCloseCall(event.pos, 'OUT', false);
        host.emitCall('OUT!', 0, 1.4);
        host.point((1 - rally.hitter) as 0 | 1, 'OUT');
        return next;
      }
      next.bounces = 1;
      return next;
    }

    host.point(rally.hitter, 'WINNER');
    return next;
  }

  if (event.kind === 'net') {
    host.triggerNetRipple(event.pos.x, event.over);
    if (rally.isServe) {
      if (event.over) {
        next.netTouched = true;
        host.emitCall('NET CORD', 0, 1.0);
      } else {
        host.serveFault('NET');
      }
      return next;
    }
    if (!event.over) {
      host.emitCall('NET', 0, 1.2);
      host.point((1 - rally.hitter) as 0 | 1, 'NET');
    } else {
      next.netTouched = true;
    }
    return next;
  }

  if (event.kind === 'lost') {
    if (rally.isServe) {
      host.serveFault('OUT');
    } else {
      host.emitCall('OUT!', 0, 1.2);
      host.point((1 - rally.hitter) as 0 | 1, 'OUT');
    }
  }
  return next;
}
