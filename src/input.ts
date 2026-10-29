// The player's controls from the first gamepad or the keyboard and mouse,
// whichever was used last.
//
// Gamepad (standard mapping, Xbox names): RT/LT throttle and reverse, left
// stick steer, pitch and yaw, A jump, B boost, LB/RB air roll left and right
// and, on the ground, powerslide, X powerslide and free air roll (with the
// stick), Y ball cam, right stick swivels the camera. X on the start screen
// watches.
// Keyboard: W/S throttle and pitch, A/D steer and yaw, right mouse or Space
// jump, left mouse or K boost, Shift powerslide and free air roll, Q/E air
// roll left and right, C ball cam, Tab on the start screen watches.

import type { CarControls } from "./physics";

const DEADZONE = 0.15;
const BUTTON = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, START: 9 } as const;

function deadzone(v: number): number {
  return Math.abs(v) < DEADZONE ? 0 : (v - Math.sign(v) * DEADZONE) / (1 - DEADZONE);
}

export interface PlayerInput {
  /** Reads the gamepad. Call once per frame, before the other methods. */
  update(): void;
  /** The current controls. */
  controls(): CarControls;
  /** Where the right stick points the camera, in radians from the car's heading (positive to its right), or null when centred. */
  cameraSwivel(): number | null;
  /** True once per press of the ball cam button. */
  takeBallCamToggle(): boolean;
  /** True once per press of A, Start, Enter or Space: for "press to continue" screens. */
  takeConfirm(): boolean;
  /** True once per press of X or Tab: the start screen's Watch. */
  takeWatch(): boolean;
}

export function createPlayerInput(target: HTMLElement): PlayerInput {
  const keys = new Set<string>();
  const mouse = new Set<number>();
  let usingPad = false;
  let ballCamToggles = 0;
  let confirms = 0;
  let watches = 0;
  let pad: Gamepad | null = null;
  let padButtonsBefore: boolean[] = [];

  window.addEventListener("keydown", (e) => {
    usingPad = false;
    if (!e.repeat) {
      if (e.code === "KeyC") ballCamToggles++;
      if (e.code === "Enter" || e.code === "Space") confirms++;
      if (e.code === "Tab") watches++;
    }
    // Tab would otherwise move focus off the court.
    if (e.code === "Tab") e.preventDefault();
    keys.add(e.code);
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));
  window.addEventListener("blur", () => {
    keys.clear();
    mouse.clear();
  });
  target.addEventListener("mousedown", (e) => {
    usingPad = false;
    mouse.add(e.button);
  });
  window.addEventListener("mouseup", (e) => mouse.delete(e.button));
  target.addEventListener("contextmenu", (e) => e.preventDefault());

  function keyboard(): CarControls {
    const key = (code: string) => (keys.has(code) ? 1 : 0);
    const forward = key("KeyW") - key("KeyS");
    const right = key("KeyD") - key("KeyA");
    const freeRoll = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const roll = key("KeyE") - key("KeyQ");
    return {
      throttle: forward,
      steer: right,
      pitch: -forward,
      yaw: freeRoll ? 0 : right,
      roll: roll !== 0 ? roll : freeRoll ? right : 0,
      jump: mouse.has(2) || keys.has("Space"),
      boost: mouse.has(0) || keys.has("KeyK"),
      handbrake: freeRoll || roll !== 0,
    };
  }

  function gamepadControls(p: Gamepad): CarControls {
    const x = deadzone(p.axes[0] ?? 0);
    const y = deadzone(p.axes[1] ?? 0);
    const pressed = (b: number) => p.buttons[b]?.pressed ?? false;
    const value = (b: number) => p.buttons[b]?.value ?? 0;
    const freeRoll = pressed(BUTTON.X);
    const roll = Number(pressed(BUTTON.RB)) - Number(pressed(BUTTON.LB));
    return {
      throttle: value(BUTTON.RT) - value(BUTTON.LT),
      steer: x,
      // Stick forward (up, negative y) is nose down.
      pitch: y,
      yaw: freeRoll ? 0 : x,
      roll: roll !== 0 ? roll : freeRoll ? x : 0,
      jump: pressed(BUTTON.A),
      boost: pressed(BUTTON.B),
      handbrake: freeRoll || pressed(BUTTON.LB) || pressed(BUTTON.RB),
    };
  }

  return {
    update() {
      pad = navigator.getGamepads?.().find((p) => p !== null && p.connected) ?? null;
      if (!pad) return;
      const now = pad.buttons.map((b) => b.pressed);
      const pressedNow = (b: number) => !!now[b] && !padButtonsBefore[b];
      if (pressedNow(BUTTON.Y)) ballCamToggles++;
      if (pressedNow(BUTTON.A) || pressedNow(BUTTON.START)) confirms++;
      if (pressedNow(BUTTON.X)) watches++;
      if (now.some((b, i) => b && !padButtonsBefore[i]) || pad.axes.some((a) => Math.abs(a) > 0.5)) usingPad = true;
      padButtonsBefore = now;
    },
    controls() {
      return usingPad && pad ? gamepadControls(pad) : keyboard();
    },
    cameraSwivel() {
      if (!usingPad || !pad) return null;
      const x = pad.axes[2] ?? 0;
      const y = pad.axes[3] ?? 0;
      if (Math.hypot(x, y) < 0.5) return null;
      // Stick up (negative y) looks ahead, down looks behind.
      return Math.atan2(x, -y);
    },
    takeBallCamToggle() {
      const toggled = ballCamToggles > 0;
      ballCamToggles = 0;
      return toggled;
    },
    takeConfirm() {
      const confirmed = confirms > 0;
      confirms = 0;
      return confirmed;
    },
    takeWatch() {
      const watch = watches > 0;
      watches = 0;
      return watch;
    },
  };
}
