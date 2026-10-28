// The volleyball rules, free of any simulator: a Rally takes one physics
// tick's facts and returns what happened, and a Match keeps score. Ported
// from the training repo's volleyball.py; the rules event fixtures keep the
// two in agreement. Terms are defined in CONTEXT.md.
//
// Blue's side of the net is y < 0 and orange's is y > 0. The net stands
// across y = 0 and the court spans |x| <= halfWidth, |y| <= halfLength.

import { BLUE, ORANGE, type Team, type Vec3 } from "./obs";

export const TICK_RATE = 120;
export const BALL_RADIUS = 91.25;

// A ball within this of resting height is on the floor. A fast ball can bounce
// between two ticks without ever sampling that low, so an upward flip of its
// vertical velocity below FLOOR_BOUNCE_HEIGHT also counts, unless a car
// touched it that tick (a dig, not a landing).
export const FLOOR_CONTACT_HEIGHT = BALL_RADIUS + 5;
export const FLOOR_BOUNCE_HEIGHT = BALL_RADIUS + 40;

export interface CourtConfig {
  halfWidth: number;
  halfLength: number;
  netHeight: number;
  netThickness: number;
}

export const DEFAULT_COURT: CourtConfig = { halfWidth: 1750, halfLength: 3500, netHeight: 450, netThickness: 20 };

export interface MatchSettings {
  shotClockSeconds: number;
  /** null is unlimited. */
  touchLimit: number | null;
  pointsToWin: number;
  winBy: number;
  gravity: number;
  /** 0 is unlimited boost. */
  boostConsumption: number;
}

export const DEFAULT_SETTINGS: MatchSettings = {
  shotClockSeconds: 8,
  touchLimit: null,
  pointsToWin: 11,
  winBy: 2,
  gravity: 1,
  boostConsumption: 0,
};

export function other(team: Team): Team {
  return team === BLUE ? ORANGE : BLUE;
}

export function sideOf(y: number): Team {
  return y < 0 ? BLUE : ORANGE;
}

export type Reason = "landed_in" | "landed_out" | "shot_clock" | "touch_limit";

export type RallyEvent =
  | { type: "Touch"; team: Team; touchesThisSide: number }
  | { type: "BallCrossedNet"; intoSide: Team }
  | { type: "Crossing"; carId: number; team: Team }
  | RallyEnd;

export interface RallyEnd {
  type: "RallyEnd";
  winner: Team;
  reason: Reason;
}

export interface BallTick {
  pos: Vec3;
  vel: Vec3;
}

export interface CarTick {
  carId: number;
  team: Team;
  y: number;
}

/** One rally, from the serve to its RallyEnd. tick() is called once per physics tick, after the tick is simulated. */
export class Rally {
  ballSide: Team;
  touchesThisSide = 0;
  lastToucher: Team | null = null;
  clockTicksLeft: number;
  // The serve's clock runs from the start, since an untouched tee never
  // falls. Any other side's clock waits for that side's first touch: a ball
  // nobody touches always lands, so only touching can stall, and a clock
  // started at the crossing let a high enough hit win on time.
  clockRunning = true;
  result: RallyEnd | null = null;
  private prevBallVelZ: number | null = null;

  constructor(
    readonly court: CourtConfig,
    readonly settings: MatchSettings,
    readonly server: Team,
  ) {
    this.ballSide = server;
    this.clockTicksLeft = this.clockLengthTicks;
  }

  get clockLengthTicks(): number {
    return Math.round(this.settings.shotClockSeconds * TICK_RATE);
  }

  /** 1.0 for a full or idle clock, falling to 0 as it runs out: the shot clock observation. */
  clockFractionLeft(team: Team): number {
    if (team !== this.ballSide) return 1;
    return this.clockTicksLeft / this.clockLengthTicks;
  }

  /** touchStarts: the team of every car whose contact with the ball began this tick (held contact counts once). */
  tick(ball: BallTick, touchStarts: Team[], cars: CarTick[]): RallyEvent[] {
    if (this.result !== null) return [];
    const events: RallyEvent[] = [];

    for (const car of cars) {
      if (sideOf(car.y) !== car.team) events.push({ type: "Crossing", carId: car.carId, team: car.team });
    }

    let touched = false;
    for (const team of touchStarts) {
      touched = true;
      this.lastToucher = team;
      if (team === this.ballSide) {
        this.clockRunning = true;
        this.touchesThisSide += 1;
        events.push({ type: "Touch", team, touchesThisSide: this.touchesThisSide });
        const limit = this.settings.touchLimit;
        if (limit !== null && this.touchesThisSide > limit) return this.end(events, other(team), "touch_limit");
      } else {
        events.push({ type: "Touch", team, touchesThisSide: 0 });
      }
    }

    const [x, y, z] = ball.pos;
    if (sideOf(y) !== this.ballSide) {
      this.ballSide = sideOf(y);
      this.touchesThisSide = 0;
      this.clockTicksLeft = this.clockLengthTicks;
      this.clockRunning = false;
      events.push({ type: "BallCrossedNet", intoSide: this.ballSide });
    }

    const velZ = ball.vel[2];
    const bounced = this.prevBallVelZ !== null && this.prevBallVelZ < 0 && 0 <= velZ && z < FLOOR_BOUNCE_HEIGHT && !touched;
    this.prevBallVelZ = velZ;
    if (z <= FLOOR_CONTACT_HEIGHT || bounced) {
      if (Math.abs(x) <= this.court.halfWidth && Math.abs(y) <= this.court.halfLength) {
        return this.end(events, other(sideOf(y)), "landed_in");
      }
      // Nobody touched it, so the server never played the serve
      const loser = this.lastToucher ?? this.server;
      return this.end(events, other(loser), "landed_out");
    }

    if (!this.clockRunning) return events;
    this.clockTicksLeft -= 1;
    if (this.clockTicksLeft <= 0) return this.end(events, other(this.ballSide), "shot_clock");
    return events;
  }

  private end(events: RallyEvent[], winner: Team, reason: Reason): RallyEvent[] {
    this.result = { type: "RallyEnd", winner, reason };
    events.push(this.result);
    return events;
  }
}

export class Match {
  server: Team;
  readonly score: [number, number] = [0, 0];
  winner: Team | null = null;

  constructor(
    readonly settings: MatchSettings,
    server: Team = BLUE,
  ) {
    this.server = server;
  }

  /** The rally's winner scores and serves next. */
  record(rallyEnd: RallyEnd): void {
    if (this.winner !== null) throw new Error("The match is already over.");
    this.score[rallyEnd.winner] += 1;
    this.server = rallyEnd.winner;
    const leader = this.score[BLUE] > this.score[ORANGE] ? BLUE : ORANGE;
    if (this.score[leader] >= this.settings.pointsToWin && this.score[leader] - this.score[other(leader)] >= this.settings.winBy) {
      this.winner = leader;
    }
  }
}
