import { expect, test } from "vitest";
import { turnFor } from "../src/tilt";

test("a phone held sideways is read from which way gravity points", () => {
  expect(turnFor(9.8, "clockwise")).toBe("anticlockwise");
  expect(turnFor(-9.8, "anticlockwise")).toBe("clockwise");
});

test("an unclear tilt keeps the turn the page already has", () => {
  expect(turnFor(0.3, "clockwise")).toBe("clockwise");
  expect(turnFor(-4, "anticlockwise")).toBe("anticlockwise");
});
