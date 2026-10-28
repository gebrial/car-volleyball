// The playable court: the player (blue) against the bot (orange), one match
// to the default settings, then "play again".

import { ACTION_REPEAT, chooseControls, seededRandom } from "./bot";
import { AGENT_IDS, VolleyballGame } from "./game";
import { createPlayerInput } from "./input";
import { BLUE, ORANGE, buildObs, layoutForSize, type Team } from "./obs";
import { loadRocketSim, type CarControls } from "./physics";
import { createPolicy } from "./policy";
import { loadModel, type Release } from "./release";
import { createCourtScene } from "./render/scene";
import { DEFAULT_COURT, DEFAULT_SETTINGS, TICK_RATE } from "./volleyball";

declare const __BOT_RELEASE__: string;

const PLAYER: Team = BLUE;
const BOT: Team = ORANGE;
const TICK_SECONDS = 1 / TICK_RATE;
// A slow frame never makes the game race to catch up by more than this.
const MAX_FRAME_SECONDS = 0.25;
const POINT_PAUSE_SECONDS = 1.5;
const LOW_CLOCK_SECONDS = 3;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const overlay = $<HTMLDivElement>("overlay");
const message = $<HTMLParagraphElement>("message");
const progress = $<HTMLDivElement>("progress");
const hud = $<HTMLDivElement>("hud");
const clock = $<HTMLDivElement>("clock");

function show(text: string) {
  overlay.hidden = false;
  message.textContent = text;
}

async function fetchWithProgress(url: string, onBytes: (n: number) => void): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`${url}: ${response.status}`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    onBytes(value.length);
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

async function loadBot() {
  const base = `releases/${__BOT_RELEASE__}/`;
  const release: Release = await (await fetch(base + "release.json")).json();
  // Parts are 20 MiB except the last; close enough for a progress bar.
  const expected = release.policy_onnx_parts.length * 20 * 1024 * 1024;
  let loaded = 0;
  const model = await loadModel(release, (name) =>
    fetchWithProgress(base + name, (n) => {
      loaded += n;
      progress.style.width = `${Math.min(100, (100 * loaded) / expected)}%`;
    }),
  );
  progress.style.width = "100%";
  return { release, policy: await createPolicy(model, release.observation.size) };
}

async function main() {
  if (window.matchMedia("(pointer: coarse)").matches && !navigator.getGamepads?.().some((p) => p)) {
    show("This game needs a keyboard or a gamepad. Try it on a computer.");
    progress.parentElement!.hidden = true;
    return;
  }

  const [{ release, policy }, rs] = await Promise.all([loadBot(), loadRocketSim()]);
  const layout = layoutForSize(release.observation.size);
  const seed = (Math.random() * 2 ** 32) >>> 0;
  // Logged so a reported oddity can be replayed with the same bot choices.
  console.info(`bot seed ${seed}`);
  const random = seededRandom(seed);

  const canvas = $<HTMLCanvasElement>("court");
  const scene = createCourtScene(canvas, DEFAULT_COURT);
  const input = createPlayerInput(canvas);
  const game = new VolleyballGame(rs, DEFAULT_SETTINGS, DEFAULT_COURT, random() < 0.5 ? BLUE : ORANGE);

  type Phase = { kind: "ready" } | { kind: "playing" } | { kind: "point"; secondsLeft: number } | { kind: "over" };
  let phase: Phase = { kind: "ready" };
  show("Press A, Enter or Space to start");
  progress.parentElement!.hidden = true;

  let ballCam = true;
  let tick = 0;
  let botControls: CarControls | null = null;
  let carry = 0;
  let last = performance.now();

  async function botAct() {
    const state = game.observationState();
    const [controls] = await chooseControls(policy, release.actions.table, [buildObs(state, AGENT_IDS[BOT], layout)], random);
    botControls = controls!;
  }

  function updateHud() {
    $("score-blue").textContent = String(game.match.score[BLUE]);
    $("score-orange").textContent = String(game.match.score[ORANGE]);
    const rally = game.rally;
    if (rally.result === null && rally.clockRunning) {
      const seconds = rally.clockTicksLeft / TICK_RATE;
      clock.textContent = `${rally.ballSide === PLAYER ? "Your" : "Bot's"} clock ${seconds.toFixed(1)}`;
      clock.classList.toggle("low", seconds < LOW_CLOCK_SECONDS);
    } else {
      clock.textContent = "";
    }
  }

  async function frame(now: number) {
    const dt = Math.min((now - last) / 1000, MAX_FRAME_SECONDS);
    last = now;
    input.update();
    if (input.takeBallCamToggle()) ballCam = !ballCam;
    const confirmed = input.takeConfirm();

    if (phase.kind === "ready" || phase.kind === "over") {
      if (confirmed) {
        if (phase.kind === "over") game.startMatch(random() < 0.5 ? BLUE : ORANGE);
        overlay.hidden = true;
        hud.hidden = false;
        phase = { kind: "playing" };
        tick = 0;
        carry = 0;
      }
    } else if (phase.kind === "point") {
      phase.secondsLeft -= dt;
      if (phase.secondsLeft <= 0) {
        game.serve();
        phase = { kind: "playing" };
        tick = 0;
        carry = 0;
      }
    } else {
      carry += dt;
      while (carry >= TICK_SECONDS && phase.kind === "playing") {
        if (tick % ACTION_REPEAT === 0) await botAct();
        const events = game.tick({ [PLAYER]: input.controls(), [BOT]: botControls! } as Record<Team, CarControls>);
        tick++;
        carry -= TICK_SECONDS;
        for (const e of events) {
          if (e.type !== "RallyEnd") continue;
          if (game.match.winner !== null) {
            phase = { kind: "over" };
            show(`${game.match.winner === PLAYER ? "You win" : "The bot wins"} ${game.match.score[PLAYER]}–${game.match.score[BOT]}. Press A, Enter or Space to play again`);
          } else {
            phase = { kind: "point", secondsLeft: POINT_PAUSE_SECONDS };
          }
        }
      }
    }

    updateHud();
    scene.render(game.ballState(), { 0: game.carState(BLUE), 1: game.carState(ORANGE) }, PLAYER, ballCam, input.cameraSwivel(), dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((e) => {
  console.error(e);
  show(`Something went wrong: ${e instanceof Error ? e.message : String(e)}`);
});
