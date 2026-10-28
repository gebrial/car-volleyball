// The policy's observation, ported from rlgym's DefaultObs (1v1, no zero
// padding) and the training repo's VolleyballObs. Field names follow the
// RocketSim Python bindings, as the parity fixtures record them.

export type Vec3 = [number, number, number];

export type Team = 0 | 1;
export const BLUE: Team = 0;
export const ORANGE: Team = 1;

export interface BallState {
  pos: Vec3;
  vel: Vec3;
  ang_vel: Vec3;
  rot_mat: number[];
}

export interface CarState {
  agent_id: string;
  team: Team;
  pos: Vec3;
  vel: Vec3;
  ang_vel: Vec3;
  // Row-major, rows forward, right, up.
  rot_mat: number[];
  boost: number;
  is_demoed: boolean;
  demo_respawn_timer: number;
  wheels_with_contact: boolean[];
  supersonic_time: number;
  time_spent_boosting: number;
  handbrake_val: number;
  has_jumped: boolean;
  last_controls_jump: boolean;
  is_jumping: boolean;
  jump_time: number;
  has_flipped: boolean;
  has_double_jumped: boolean;
  air_time_since_jump: number;
  flip_time: number;
}

export interface RallyClock {
  ball_side: Team;
  clock_ticks_left: number;
  clock_length_ticks: number;
}

export interface GameState {
  ball: BallState;
  cars: CarState[];
  boost_pad_cooldowns: number[];
  rally?: RallyClock;
}

export type ObsLayout = "soccer" | "volleyball";

const SOCCER_SIZE = 92;
const CLOCK_INPUTS = 2;
const SOCCAR_PAD_COUNT = 34;

export function obsSize(layout: ObsLayout): number {
  return layout === "soccer" ? SOCCER_SIZE : SOCCER_SIZE + CLOCK_INPUTS;
}

export function layoutForSize(size: number): ObsLayout {
  if (size === SOCCER_SIZE) return "soccer";
  if (size === SOCCER_SIZE + CLOCK_INPUTS) return "volleyball";
  throw new Error(`No observation has ${size} inputs.`);
}

const POS_COEF: Vec3 = [1 / 4096, 1 / 6000, 1 / 2044];
const LIN_VEL_COEF = 1 / 2300;
const ANG_VEL_COEF = 1 / 5.5;
const PAD_TIMER_COEF = 1 / 10;
const BOOST_COEF = 1 / 100;
const FLIP_TORQUE_TIME = 0.65;
const DOUBLEJUMP_MAX_DELAY = 1.25;

// Orange sees the field rotated half a turn, so both teams play as blue.
const FLIP_ORANGE: Vec3 = [-1, -1, 1];
const NO_FLIP: Vec3 = [1, 1, 1];

function scaled(v: Vec3 | number[], flip: Vec3, coef: Vec3 | number): number[] {
  return [0, 1, 2].map((i) => v[i]! * flip[i]! * (typeof coef === "number" ? coef : coef[i]!));
}

function onGround(car: CarState): boolean {
  return car.wheels_with_contact.filter(Boolean).length >= 3;
}

function carObs(car: CarState, flip: Vec3): number[] {
  const m = car.rot_mat;
  return [
    ...scaled(car.pos, flip, POS_COEF),
    ...scaled([m[0]!, m[1]!, m[2]!], flip, 1),
    ...scaled([m[6]!, m[7]!, m[8]!], flip, 1),
    ...scaled(car.vel, flip, LIN_VEL_COEF),
    ...scaled(car.ang_vel, flip, ANG_VEL_COEF),
    car.boost * BOOST_COEF,
    car.demo_respawn_timer,
    Number(onGround(car)),
    Number(car.time_spent_boosting > 0),
    Number(car.supersonic_time > 0),
  ];
}

function clockFractionLeft(rally: RallyClock, team: Team): number {
  return team === rally.ball_side ? rally.clock_ticks_left / rally.clock_length_ticks : 1;
}

export function buildObs(state: GameState, agentId: string, layout: ObsLayout): Float32Array {
  const car = state.cars.find((c) => c.agent_id === agentId);
  const opponent = state.cars.find((c) => c.agent_id !== agentId);
  if (!car || !opponent) throw new Error(`Need ${agentId} and one opponent in the state.`);
  const flip = car.team === ORANGE ? FLIP_ORANGE : NO_FLIP;

  // The volleyball court has no pads, and its bot reads all 34 as available.
  const pads = state.boost_pad_cooldowns.length > 0 ? [...state.boost_pad_cooldowns] : new Array<number>(SOCCAR_PAD_COUNT).fill(0);
  if (car.team === ORANGE) pads.reverse();

  const hasFlip = !car.has_double_jumped && !car.has_flipped && car.air_time_since_jump < DOUBLEJUMP_MAX_DELAY;
  const obs = [
    ...scaled(state.ball.pos, flip, POS_COEF),
    ...scaled(state.ball.vel, flip, LIN_VEL_COEF),
    ...scaled(state.ball.ang_vel, flip, ANG_VEL_COEF),
    ...pads.map((t) => t * PAD_TIMER_COEF),
    Number(car.last_controls_jump),
    car.handbrake_val,
    Number(car.has_jumped),
    Number(car.is_jumping),
    Number(car.has_flipped),
    Number(car.has_flipped && car.flip_time < FLIP_TORQUE_TIME),
    Number(car.has_double_jumped),
    Number(!onGround(car) && !car.last_controls_jump && hasFlip),
    car.air_time_since_jump,
    ...carObs(car, flip),
    ...carObs(opponent, flip),
  ];
  if (layout === "volleyball") {
    if (!state.rally) throw new Error("The volleyball observation needs the rally's clock state.");
    obs.push(clockFractionLeft(state.rally, car.team), clockFractionLeft(state.rally, opponent.team));
  }
  return Float32Array.from(obs);
}
