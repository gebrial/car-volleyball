// The bot's side of play: observations in, sampled controls out, as the
// training repo's policy.act() samples them.

import type { CarControls } from "./physics";
import type { Policy } from "./policy";

// One policy step is this many physics ticks, as in training.
export const ACTION_REPEAT = 8;
const MIN_PROB = 1e-11;

/** A seeded generator (mulberry32), so a reported oddity can be replayed. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An action index drawn in proportion to probs, each floored at MIN_PROB as torch.multinomial is fed in training. */
export function sampleAction(probs: ArrayLike<number>, random: () => number): number {
  let total = 0;
  for (let i = 0; i < probs.length; i++) total += Math.max(probs[i]!, MIN_PROB);
  let r = random() * total;
  for (let i = 0; i < probs.length; i++) {
    r -= Math.max(probs[i]!, MIN_PROB);
    if (r < 0) return i;
  }
  return probs.length - 1;
}

/** A row of the release's action table: throttle, steer, pitch, yaw, roll, jump, boost, handbrake. */
export function controlsFor(row: number[]): CarControls {
  const [throttle, steer, pitch, yaw, roll, jump, boost, handbrake] = row as [number, number, number, number, number, number, number, number];
  return { throttle, steer, pitch, yaw, roll, jump: jump > 0, boost: boost > 0, handbrake: handbrake > 0 };
}

export async function chooseControls(policy: Policy, table: number[][], obs: Float32Array[], random: () => number): Promise<CarControls[]> {
  const probs = await policy.probs(obs);
  return probs.map((p) => controlsFor(table[sampleAction(p, random)]!));
}
