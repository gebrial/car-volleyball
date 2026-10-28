// Plays the bot against itself on the WASM court with no rendering and
// reports what volleyball_measurements.py reports in the training repo, next
// to that tool's numbers for the same milestone. The browser and Python
// drift apart within a second of play, so this compares how the bot plays,
// not individual rallies.
//
//     npx tsx scripts/measure.ts [rallies] [seed]

import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ACTION_REPEAT, chooseControls, seededRandom } from "../src/bot";
import { VolleyballGame, AGENT_IDS } from "../src/game";
import { BLUE, ORANGE, buildObs, layoutForSize, type Team } from "../src/obs";
import { loadRocketSim, type CarControls } from "../src/physics";
import { createPolicy } from "../src/policy";
import { loadModel, type Release } from "../src/release";
import { DEFAULT_SETTINGS, TICK_RATE } from "../src/volleyball";

const MILESTONE = "volleyball1-gravity-ramp-post";
// Matches the training env's safety timeout; the shot clock ends real rallies long before.
const MAX_RALLY_TICKS = 300 * TICK_RATE;

const rallies = Number(process.argv[2] ?? 400);
const seed = Number(process.argv[3] ?? 0);
const dir = join("releases", MILESTONE);
const release: Release = JSON.parse(readFileSync(join(dir, "release.json"), "utf-8"));
const layout = layoutForSize(release.observation.size);
const policy = await createPolicy(await loadModel(release, (n) => readFile(join(dir, n)).then((b) => new Uint8Array(b))), release.observation.size);
const random = seededRandom(seed);
const game = new VolleyballGame(await loadRocketSim(), DEFAULT_SETTINGS);

const reasons: Record<string, number> = {};
const touchesPerRally: number[] = [];
const netCrossingsPerRally: number[] = [];
const rallySeconds: number[] = [];
let serverWon = 0, returned = 0, carCrossings = 0;

for (let i = 0; i < rallies; i++) {
  // A random server every rally, as volleyball_measurements.py does; the match only keeps score.
  const server = random() < 0.5 ? BLUE : ORANGE;
  const rally = game.startMatch(server);
  let ticks = 0, touches = 0, netCrossings = 0, wasReturned = false;
  let controls: Record<Team, CarControls> | null = null;
  while (rally.result === null && ticks < MAX_RALLY_TICKS) {
    if (ticks % ACTION_REPEAT === 0) {
      const state = game.observationState();
      const [blue, orange] = await chooseControls(policy, release.actions.table, [buildObs(state, AGENT_IDS[BLUE], layout), buildObs(state, AGENT_IDS[ORANGE], layout)], random);
      controls = { 0: blue!, 1: orange! };
    }
    for (const e of game.tick(controls!)) {
      if (e.type === "Touch") touches++;
      else if (e.type === "BallCrossedNet") { netCrossings++; wasReturned ||= touches > 0; }
      else if (e.type === "Crossing") carCrossings++;
      else if (e.type === "RallyEnd") { reasons[e.reason] = (reasons[e.reason] ?? 0) + 1; serverWon += Number(e.winner === server); }
    }
    ticks++;
  }
  touchesPerRally.push(touches);
  netCrossingsPerRally.push(netCrossings);
  rallySeconds.push(ticks / TICK_RATE);
  returned += Number(wasReturned);
  if ((i + 1) % 50 === 0) console.error(`${i + 1}/${rallies} rallies`);
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.floor((p / 100) * (xs.length - 1))]!;
const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
const browser = {
  rallies,
  end_reasons: reasons,
  server_won_share: round(serverWon / rallies),
  returned_over_net_share: round(returned / rallies),
  mean_touches_per_rally: round(mean(touchesPerRally), 2),
  ball_net_crossings_per_rally_mean: round(mean(netCrossingsPerRally), 2),
  rally_seconds: { 50: round(pct(rallySeconds, 50), 1), 90: round(pct(rallySeconds, 90), 1) },
  car_crossings_per_minute: round(carCrossings / (rallySeconds.reduce((a, b) => a + b, 0) / 60), 2),
};
const python = JSON.parse(readFileSync(join("fixtures", "measurements", `${MILESTONE}.json`), "utf-8"));
console.log(JSON.stringify({ milestone: MILESTONE, seed, browser, python: Object.fromEntries(Object.keys(browser).map((k) => [k, python[k]])) }, null, 2));
game.dispose();
