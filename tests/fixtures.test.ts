import { readdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { buildObs, layoutForSize, type GameState } from "../src/obs";
import { createPolicy } from "../src/policy";
import { loadModel, type Release } from "../src/release";

interface Fixtures {
  samples: { rocketsim: GameState; agents: { agent_id: string; obs: number[]; probs: number[] }[] }[];
}

const RELEASES_DIR = "releases";
const OBS_TOLERANCE = 1e-6;
// The training repo's ONNX-vs-PyTorch bar: float32 rounding at logits up to +-150.
const PROBS_TOLERANCE = 5e-5;

function maxAbsDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  expect(a.length).toBe(b.length);
  let max = 0;
  for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i]! - b[i]!));
  return max;
}

for (const label of readdirSync(RELEASES_DIR)) {
  const dir = join(RELEASES_DIR, label);
  const release: Release = JSON.parse(readFileSync(join(dir, "release.json"), "utf-8"));
  const fixtures: Fixtures = JSON.parse(readFileSync(join(dir, "fixtures", "obs_policy.json"), "utf-8"));
  const layout = layoutForSize(release.observation.size);
  const agents = fixtures.samples.flatMap((s) => s.agents.map((a) => ({ state: s.rocketsim, ...a })));

  describe(label, () => {
    test("rebuilds every recorded observation from the raw state", () => {
      const teams = new Set<number>();
      let worst = 0;
      for (const a of agents) {
        teams.add(a.state.cars.find((c) => c.agent_id === a.agent_id)!.team);
        worst = Math.max(worst, maxAbsDiff(buildObs(a.state, a.agent_id, layout), a.obs));
      }
      expect(teams).toEqual(new Set([0, 1]));
      expect(worst).toBeLessThan(OBS_TOLERANCE);
    });

    test("gives the recorded action probabilities", async () => {
      const model = await loadModel(release, (name) => readFile(join(dir, name)).then((b) => new Uint8Array(b)));
      const policy = await createPolicy(model, release.observation.size);
      const probs = await policy.probs(agents.map((a) => Float32Array.from(a.obs)));
      const worst = Math.max(...probs.map((p, i) => maxAbsDiff(p, agents[i]!.probs)));
      expect(probs[0]!.length).toBe(release.actions.table.length);
      expect(worst).toBeLessThan(PROBS_TOLERANCE);
    }, 120_000);
  });
}
