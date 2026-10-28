import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, test } from "vitest";
import { loadRocketSim, type CarControls, type RocketSim, type SimBallState, type SimCarState } from "../src/physics";
import type { Vec3 } from "../src/obs";

interface Arena {
  name: string;
  planes: { pos: Vec3; normal: Vec3 }[];
  meshes: { vertices: Vec3[]; triangles: [number, number, number][] }[];
  gravity: number;
  boost_used_per_second: number;
  samples: {
    before: { cars: SimCarState[]; ball: SimBallState };
    controls: CarControls[];
    after: Record<string, { cars: SimCarState[]; ball: SimBallState }>;
  }[];
}

const fixtures: { tick_rate: number; step_ticks: number[]; arenas: Arena[] } = JSON.parse(
  readFileSync("fixtures/physics/one_step.json", "utf-8"),
);

let rs: RocketSim;
beforeAll(async () => {
  rs = await loadRocketSim();
});

function play(arena: Arena, sample: Arena["samples"][number], ticks: number) {
  const sim = rs.createSim(fixtures.tick_rate);
  arena.planes.forEach((p) => sim.addStaticPlane(p.pos, p.normal));
  arena.meshes.forEach((m) => sim.addStaticMesh(m.vertices, m.triangles.flat()));
  sim.setMutators({ gravity: [0, 0, -650 * arena.gravity], boost_used_per_second: arena.boost_used_per_second });
  const ids = [sim.addCar(0), sim.addCar(1)];
  ids.forEach((id, i) => {
    sim.setCarState(id, sample.before.cars[i]!);
    sim.setCarControls(id, sample.controls[i]!);
  });
  sim.setBallState(sample.before.ball);
  sim.step(ticks);
  const out = { cars: ids.map((id) => sim.getCarState(id)), ball: sim.getBallState() };
  sim.delete();
  return out;
}

type Kind = "pos" | "vel" | "angVel" | "unit" | "other";

function kindOf(field: string): Kind {
  if (field.endsWith("pos") || field === "relative_pos_on_ball") return "pos";
  if (field === "vel" || field === "extra_hit_vel") return "vel";
  if (field === "ang_vel") return "angVel";
  if (field === "rot_mat" || field === "world_contact_normal" || field === "flip_rel_torque") return "unit";
  return "other";
}

// Measured on 2026-10-27 (WASM against native Windows RocketSim). One tick
// agrees to float32 rounding: 3.7e-4 uu/s at speeds near 2300, where float32
// steps are 2.4e-4. Over 8 ticks a contact (ball hit, car bump) amplifies
// that rounding to as much as 0.66 uu and 11 uu/s; samples without contacts
// stay near rounding. The bounds are about twice the worst measured.
const TOLERANCE: Record<number, Record<Kind, number>> = {
  1: { pos: 1e-4, vel: 1e-3, angVel: 2e-5, unit: 2e-6, other: 1e-4 },
  8: { pos: 1.5, vel: 25, angVel: 0.75, unit: 0.1, other: 0.1 },
};

// Largest |difference| per kind of field over numbers; booleans count mismatches.
function diff(a: unknown, b: unknown, field: string, worst: Record<Kind, number>, mismatches: string[]) {
  if (typeof a === "number" && typeof b === "number") {
    const k = kindOf(field);
    worst[k] = Math.max(worst[k], Math.abs(a - b));
  } else if (typeof a === "boolean" || typeof b === "boolean") {
    if (a !== b) mismatches.push(field);
  } else if (Array.isArray(a) && Array.isArray(b)) {
    a.forEach((x, i) => diff(x, b[i], field, worst, mismatches));
  } else if (a && b && typeof a === "object") {
    for (const k of Object.keys(b as object)) diff((a as never)[k], (b as never)[k], k, worst, mismatches);
  }
}

describe("one physics step", () => {
  for (const arena of fixtures.arenas) {
    for (const ticks of fixtures.step_ticks) {
      test(`${arena.name}, ${ticks} ticks`, () => {
        const worst: Record<Kind, number> = { pos: 0, vel: 0, angVel: 0, unit: 0, other: 0 };
        const mismatches: string[] = [];
        for (const sample of arena.samples) diff(play(arena, sample, ticks), sample.after[String(ticks)], "", worst, mismatches);
        for (const kind of Object.keys(worst) as Kind[]) {
          expect(worst[kind], kind).toBeLessThanOrEqual(TOLERANCE[ticks]![kind]);
        }
        // A contact can tip a flag one way over 8 ticks; never in one.
        expect(mismatches.length, mismatches.join(", ")).toBeLessThanOrEqual(ticks === 1 ? 0 : 2);
      });
    }
  }
});
