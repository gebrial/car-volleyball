// RocketSim compiled to WASM (wasm/bindings.cpp, built by
// scripts/build-wasm.mjs). State field names follow the RocketSim Python
// bindings, as the physics parity fixtures record them.

import createRocketSim from "./wasm/rocketsim.mjs";
import type { Vec3 } from "./obs";

/** Forward, right, up. */
export type RotMat = [Vec3, Vec3, Vec3];

export interface CarControls {
  throttle: number;
  steer: number;
  pitch: number;
  yaw: number;
  roll: number;
  jump: boolean;
  boost: boolean;
  handbrake: boolean;
}

export interface BallHitInfo {
  is_valid: boolean;
  relative_pos_on_ball: Vec3;
  ball_pos: Vec3;
  extra_hit_vel: Vec3;
  /** -1 for never. */
  tick_count_when_hit: number;
  tick_count_when_extra_impulse_applied: number;
}

export interface SimCarState {
  pos: Vec3;
  vel: Vec3;
  ang_vel: Vec3;
  rot_mat: RotMat;
  is_on_ground: boolean;
  wheels_with_contact: [boolean, boolean, boolean, boolean];
  has_jumped: boolean;
  has_double_jumped: boolean;
  has_flipped: boolean;
  flip_rel_torque: Vec3;
  jump_time: number;
  flip_time: number;
  is_flipping: boolean;
  is_jumping: boolean;
  air_time: number;
  air_time_since_jump: number;
  boost: number;
  boosting_time: number;
  is_supersonic: boolean;
  supersonic_time: number;
  handbrake_val: number;
  is_auto_flipping: boolean;
  auto_flip_timer: number;
  auto_flip_torque_scale: number;
  has_world_contact: boolean;
  world_contact_normal: Vec3;
  car_contact_id: number;
  car_contact_cooldown_timer: number;
  is_demoed: boolean;
  demo_respawn_timer: number;
  ball_hit_info: BallHitInfo;
  last_controls: CarControls;
}

export interface SimBallState {
  pos: Vec3;
  vel: Vec3;
  ang_vel: Vec3;
  rot_mat: RotMat;
  last_hit_car_id: number;
}

export interface Mutators {
  gravity: Vec3;
  boost_used_per_second: number;
}

export interface Sim {
  addStaticPlane(pos: Vec3, normal: Vec3): void;
  addStaticMesh(vertices: Vec3[], triangles: number[]): void;
  /** 0 blue, 1 orange. Returns the car's id. */
  addCar(team: number): number;
  getMutators(): Mutators;
  setMutators(m: Mutators): void;
  getCarState(id: number): SimCarState;
  setCarState(id: number, s: SimCarState): void;
  setCarControls(id: number, c: CarControls): void;
  getBallState(): SimBallState;
  setBallState(s: SimBallState): void;
  step(ticks: number): void;
  delete(): void;
}

interface Module {
  Sim: new (tickRate: number) => Sim;
  VecList: new () => { push_back(v: Vec3): void; delete(): void };
  IntList: new () => { push_back(i: number): void; delete(): void };
}

export interface RocketSim {
  createSim(tickRate: number): Sim;
}

export async function loadRocketSim(): Promise<RocketSim> {
  const m = (await createRocketSim()) as Module;
  return {
    createSim(tickRate) {
      const sim = new m.Sim(tickRate);
      const addStaticMesh = sim.addStaticMesh.bind(sim);
      // embind takes std::vector arguments as its own list objects.
      sim.addStaticMesh = (vertices, triangles) => {
        const vs = new m.VecList();
        const ts = new m.IntList();
        vertices.forEach((v) => vs.push_back(v));
        triangles.forEach((t) => ts.push_back(t));
        addStaticMesh(vs as unknown as Vec3[], ts as unknown as number[]);
        vs.delete();
        ts.delete();
      };
      return sim;
    },
  };
}
