// The playable court: the player (blue) against the bot (orange), or the bot
// against a copy of itself, one match to the default settings, then the
// start screen's choice again.

import { ACTION_REPEAT, chooseControls, seededRandom } from "./bot";
import { AGENT_IDS, VolleyballGame } from "./game";
import { createPlayerInput } from "./input";
import { BLUE, ORANGE, buildObs, layoutForSize, type Team } from "./obs";
import { loadRocketSim, type CarControls } from "./physics";
import { createPolicy } from "./policy";
import { loadModel, type Release } from "./release";
import { createCourtScene, type CameraView } from "./render/scene";
import { followTilt } from "./tilt";
import { DEFAULT_COURT, DEFAULT_SETTINGS, TICK_RATE } from "./volleyball";

declare const __BOT_RELEASE__: string;

const PLAYER: Team = BLUE;
const BOT: Team = ORANGE;
const TICK_SECONDS = 1 / TICK_RATE;
// A slow frame never makes the game race to catch up by more than this.
const MAX_FRAME_SECONDS = 0.25;
const POINT_PAUSE_SECONDS = 1.5;
// How long a watched match's result shows before the next one starts.
const NEXT_MATCH_SECONDS = 4;
// The camera views Y or C cycles through while watching, the first by default.
const WATCH_VIEWS = ["broadcast", BLUE, ORANGE] as const;
const START_TEXT = "Play against the bot, or watch it play a copy of itself.";
const TOUCH_START_TEXT = "Playing needs a keyboard or a gamepad. Tap to watch the bot play a copy of itself.";
const LOW_CLOCK_SECONDS = 3;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const overlay = $<HTMLDivElement>("overlay");
const message = $<HTMLParagraphElement>("message");
const progress = $<HTMLDivElement>("progress");
const hud = $<HTMLDivElement>("hud");
const clock = $<HTMLDivElement>("clock");
const watching = $<HTMLDivElement>("watching");
const choices = $<HTMLDivElement>("choices");
const controlsHelp = $<HTMLParagraphElement>("controls-help");

function teamName(team: Team): string {
  return team === BLUE ? "Blue" : "Orange";
}

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
  // A phone or tablet with nothing to play with can still watch.
  const touchOnly = window.matchMedia("(pointer: coarse)").matches && !navigator.getGamepads?.().some((p) => p);
  const startText = touchOnly ? TOUCH_START_TEXT : START_TEXT;
  // style.css draws a touch-only page landscape, turned the way the phone is held.
  document.documentElement.classList.toggle("touch-only", touchOnly);
  if (touchOnly) followTilt(document.documentElement);

  const [{ release, policy }, rs] = await Promise.all([loadBot(), loadRocketSim()]);
  const layout = layoutForSize(release.observation.size);
  const seed = (Math.random() * 2 ** 32) >>> 0;
  // Logged so a reported oddity can be replayed with the same bot choices.
  console.info(`bot seed ${seed}`);
  const random = seededRandom(seed);

  const canvas = $<HTMLCanvasElement>("court");
  const scene = createCourtScene(canvas, DEFAULT_COURT);
  const input = createPlayerInput(canvas);
  const randomServer = (): Team => (random() < 0.5 ? BLUE : ORANGE);
  const game = new VolleyballGame(rs, DEFAULT_SETTINGS, DEFAULT_COURT, randomServer());

  // A played match ends "over", back at the start screen; a watched one ends
  // in "nextMatch", which starts the next one by itself.
  type Phase =
    | { kind: "ready" }
    | { kind: "playing" }
    | { kind: "point"; secondsLeft: number }
    | { kind: "over" }
    | { kind: "nextMatch"; result: string; secondsLeft: number };
  let phase: Phase = { kind: "ready" };
  type Mode = "play" | "watch";
  let mode: Mode = "play";
  // A click on Play or Watch, taken at the next frame like a key press.
  let clicked: Mode | null = null;
  for (const m of ["play", "watch"] as const) {
    $<HTMLButtonElement>(m).addEventListener("click", (e) => {
      clicked = m;
      // So Enter or Space afterwards doesn't press the button again.
      (e.currentTarget as HTMLButtonElement).blur();
    });
  }
  // A click or tap anywhere on the overlay, which skips the wait for the next watched match.
  let overlayTapped = false;
  overlay.addEventListener("click", () => {
    tapIntoFullscreen();
    overlayTapped = true;
  });
  // A click or tap on the court while watching moves to the next view, except
  // a phone's first tap after leaving fullscreen, which only goes back in.
  canvas.addEventListener("click", () => {
    if (tapIntoFullscreen()) return;
    if (mode === "watch") pressCameraButton();
  });

  // On a phone, a tap while out of fullscreen asks for it, hiding the browser's
  // bars. Browsers allow that only inside the tap's own handler. Where there is
  // no fullscreen (iPhone Safari) or it is refused, taps work as before.
  let fullscreenRefused = false;
  function tapIntoFullscreen(): boolean {
    if (!touchOnly || fullscreenRefused || document.fullscreenElement || !document.documentElement.requestFullscreen) return false;
    document.documentElement.requestFullscreen().catch(() => (fullscreenRefused = true));
    return true;
  }
  show(startText);
  progress.parentElement!.hidden = true;
  choices.hidden = false;
  $("play").hidden = touchOnly;
  $("watch").querySelector("small")!.hidden = touchOnly;
  controlsHelp.hidden = touchOnly;

  let ballCam = true;
  // Which of WATCH_VIEWS the camera shows while watching.
  let watchView = 0;
  let tick = 0;
  // The teams the bot drives this match; the player drives the rest.
  let botTeams: Team[] = [BOT];
  const botControls: Partial<Record<Team, CarControls>> = {};
  let carry = 0;
  let last = performance.now();

  async function botAct() {
    const state = game.observationState();
    const obs = botTeams.map((team) => buildObs(state, AGENT_IDS[team], layout));
    const controls = await chooseControls(policy, release.actions.table, obs, random);
    botTeams.forEach((team, i) => (botControls[team] = controls[i]!));
  }

  function controlsOf(team: Team): CarControls {
    return botTeams.includes(team) ? botControls[team]! : input.controls();
  }

  function resultText(winner: Team, score: Record<Team, number>): string {
    if (mode === "watch") {
      const loser = winner === BLUE ? ORANGE : BLUE;
      return `${teamName(winner)} wins ${score[winner]}–${score[loser]}.`;
    }
    return `${winner === PLAYER ? "You win" : "The bot wins"} ${score[PLAYER]}–${score[BOT]}.`;
  }

  function updateHud() {
    $("score-blue").textContent = String(game.match.score[BLUE]);
    $("score-orange").textContent = String(game.match.score[ORANGE]);
    const rally = game.rally;
    if (rally.result === null && rally.clockRunning) {
      const seconds = rally.clockTicksLeft / TICK_RATE;
      const whose = mode === "watch" ? teamName(rally.ballSide) + "'s" : rally.ballSide === PLAYER ? "Your" : "Bot's";
      clock.textContent = `${whose} clock ${seconds.toFixed(1)}`;
      clock.classList.toggle("low", seconds < LOW_CLOCK_SECONDS);
    } else {
      clock.textContent = "";
    }
    const view = WATCH_VIEWS[watchView]!;
    watching.textContent = `Bot vs bot · ${view === "broadcast" ? "Broadcast" : `${teamName(view)}'s car`} · ${touchOnly ? "Tap" : "Y or C"}: next view`;
  }

  /** Play or Watch if one was pressed or clicked since the last frame. Taken every frame, so presses during play don't carry over to the next start screen. */
  function takeChoice(): Mode | null {
    const confirmed = input.takeConfirm();
    const watch = input.takeWatch();
    const choice: Mode | null = confirmed ? "play" : watch ? "watch" : clicked;
    clicked = null;
    return choice;
  }

  function takeOverlayTap(): boolean {
    const tapped = overlayTapped;
    overlayTapped = false;
    return tapped;
  }

  function beginMatch(choice: Mode) {
    // The game already holds a fresh match before the first one.
    if (phase.kind !== "ready") game.startMatch(randomServer());
    mode = choice;
    botTeams = mode === "watch" ? [BLUE, ORANGE] : [BOT];
    overlay.hidden = true;
    hud.hidden = false;
    watching.hidden = mode !== "watch";
    startRally();
  }

  /** Abandons the match for the start screen, with a fresh match waiting as before the first. */
  function leaveMatch() {
    game.startMatch(randomServer());
    phase = { kind: "ready" };
    watchView = 0;
    hud.hidden = true;
    choices.hidden = false;
    show(startText);
  }

  function startRally() {
    phase = { kind: "playing" };
    tick = 0;
    carry = 0;
  }

  function waitForServe(pause: Extract<Phase, { kind: "point" }>, dt: number) {
    pause.secondsLeft -= dt;
    if (pause.secondsLeft > 0) return;
    game.serve();
    startRally();
  }

  function waitForNextMatch(wait: Extract<Phase, { kind: "nextMatch" }>, dt: number, skip: boolean) {
    wait.secondsLeft -= dt;
    if (skip || wait.secondsLeft <= 0) {
      beginMatch("watch");
      return;
    }
    show(`${wait.result} Next match in ${Math.ceil(wait.secondsLeft)}…`);
  }

  /** Runs as many physics ticks as dt has time for, stopping early if the rally ends. */
  async function playFor(dt: number) {
    carry += dt;
    while (carry >= TICK_SECONDS && phase.kind === "playing") await playTick();
  }

  async function playTick() {
    if (tick % ACTION_REPEAT === 0) await botAct();
    const events = game.tick({ [BLUE]: controlsOf(BLUE), [ORANGE]: controlsOf(ORANGE) } as Record<Team, CarControls>);
    tick++;
    carry -= TICK_SECONDS;
    if (events.some((e) => e.type === "RallyEnd")) endRally();
  }

  function endRally() {
    const { winner, score } = game.match;
    if (winner === null) {
      phase = { kind: "point", secondsLeft: POINT_PAUSE_SECONDS };
      return;
    }
    if (mode === "watch") {
      phase = { kind: "nextMatch", result: resultText(winner, score), secondsLeft: NEXT_MATCH_SECONDS };
      choices.hidden = true;
      show(`${phase.result} Next match in ${NEXT_MATCH_SECONDS}…`);
      return;
    }
    phase = { kind: "over" };
    choices.hidden = false;
    show(resultText(winner, score));
  }

  function pressCameraButton() {
    if (mode === "watch") watchView = (watchView + 1) % WATCH_VIEWS.length;
    else ballCam = !ballCam;
  }

  function cameraView(): CameraView {
    if (mode === "play") return { kind: "chase", team: PLAYER, ballCam, swivel: input.cameraSwivel() };
    const view = WATCH_VIEWS[watchView]!;
    return view === "broadcast" ? { kind: "broadcast" } : { kind: "chase", team: view, ballCam: true, swivel: input.cameraSwivel() };
  }

  function draw(dt: number) {
    updateHud();
    scene.render(game.ballState(), { 0: game.carState(BLUE), 1: game.carState(ORANGE) }, cameraView(), dt);
  }

  async function frame(now: number) {
    const dt = Math.min((now - last) / 1000, MAX_FRAME_SECONDS);
    last = now;
    input.update();
    if (input.takeCameraButton()) pressCameraButton();
    const choice = takeChoice();
    const tapped = takeOverlayTap();
    const back = input.takeBack();

    if (phase.kind === "ready" || phase.kind === "over") {
      if (choice !== null) beginMatch(choice);
      else if (touchOnly && tapped) beginMatch("watch");
    } else if (back) {
      leaveMatch();
    } else if (phase.kind === "nextMatch") {
      waitForNextMatch(phase, dt, choice !== null || tapped);
    } else if (phase.kind === "point") {
      waitForServe(phase, dt);
    } else {
      await playFor(dt);
    }

    draw(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((e) => {
  console.error(e);
  choices.hidden = true;
  show(`Something went wrong: ${e instanceof Error ? e.message : String(e)}`);
});
