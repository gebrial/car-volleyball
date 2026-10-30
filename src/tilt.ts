// Which way a touch-only page is turned while the browser stays portrait, so
// the game is upright whichever way the phone is held sideways. Gravity along
// the phone's x axis (its short side when upright) says which long edge faces
// down. Only Android reports it without asking; iPhones keep the default.

/** How the viewer holds the phone, seen from the front: turned anticlockwise (top to the left) or clockwise. */
export type Turn = "anticlockwise" | "clockwise";

// m/s² along x, about 30° of tilt; anything less, such as a phone lying flat,
// keeps the turn it had.
const CLEAR_TILT = 5;

/** The turn for this reading of accelerationIncludingGravity.x, which points up along whichever edge is uppermost. */
export function turnFor(gravityX: number, previous: Turn): Turn {
  if (gravityX > CLEAR_TILT) return "anticlockwise";
  if (gravityX < -CLEAR_TILT) return "clockwise";
  return previous;
}

/** Marks root with "held-clockwise" while the phone is turned clockwise; style.css turns the page to match. */
export function followTilt(root: HTMLElement): void {
  let turn: Turn = "anticlockwise";
  window.addEventListener("devicemotion", (e) => {
    const x = e.accelerationIncludingGravity?.x;
    if (x === null || x === undefined) return;
    const next = turnFor(x, turn);
    if (next === turn) return;
    turn = next;
    root.classList.toggle("held-clockwise", turn === "clockwise");
  });
}
