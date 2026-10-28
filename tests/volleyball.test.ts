import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { BLUE, ORANGE, type Team } from "../src/obs";
import { DEFAULT_COURT, DEFAULT_SETTINGS, Match, Rally, type RallyEvent, type RallyEnd } from "../src/volleyball";

interface FixtureTick {
  ball: { pos: [number, number, number]; vel: [number, number, number] };
  touch_starts: Team[];
  cars: { car_id: number; team: Team; y: number }[];
  events: Record<string, unknown>[];
  clock_fraction_left: [number, number];
}

interface Sequence {
  name: string;
  server: Team;
  settings: { shot_clock_seconds: number; touch_limit: number | null; points_to_win: number; win_by: number; gravity: number; boost_consumption: number };
  ticks: FixtureTick[];
}

const fixtures: { court: Record<string, number>; sequences: Sequence[] } = JSON.parse(
  readFileSync("fixtures/volleyball-rules/rules_events.json", "utf-8"),
);

// The events as volleyball_fixtures.py writes them.
function eventJson(e: RallyEvent): Record<string, unknown> {
  switch (e.type) {
    case "Touch":
      return { type: e.type, team: e.team, touches_this_side: e.touchesThisSide };
    case "BallCrossedNet":
      return { type: e.type, into_side: e.intoSide };
    case "Crossing":
      return { type: e.type, car_id: e.carId, team: e.team };
    case "RallyEnd":
      return { type: e.type, winner: e.winner, reason: e.reason };
  }
}

test("the court matches the one the fixtures were recorded on", () => {
  expect(fixtures.court).toEqual({ half_width: 1750, half_length: 3500, net_height: 450, net_thickness: 20 });
  expect(DEFAULT_COURT).toEqual({ halfWidth: 1750, halfLength: 3500, netHeight: 450, netThickness: 20 });
});

describe("rules events", () => {
  for (const seq of fixtures.sequences) {
    test(seq.name, () => {
      const s = seq.settings;
      const rally = new Rally(DEFAULT_COURT, {
        shotClockSeconds: s.shot_clock_seconds,
        touchLimit: s.touch_limit,
        pointsToWin: s.points_to_win,
        winBy: s.win_by,
        gravity: s.gravity,
        boostConsumption: s.boost_consumption,
      }, seq.server);
      seq.ticks.forEach((t, i) => {
        const events = rally.tick(t.ball, t.touch_starts, t.cars.map((c) => ({ carId: c.car_id, team: c.team, y: c.y })));
        const actual = { events: events.map(eventJson), clock: [rally.clockFractionLeft(BLUE), rally.clockFractionLeft(ORANGE)] };
        expect(actual, `tick ${i}`).toEqual({ events: t.events, clock: t.clock_fraction_left });
      });
      expect(rally.result).not.toBeNull();
    });
  }
});

describe("match", () => {
  const point = (winner: Team): RallyEnd => ({ type: "RallyEnd", winner, reason: "landed_in" });

  test("the rally winner serves next", () => {
    const match = new Match(DEFAULT_SETTINGS, BLUE);
    match.record(point(ORANGE));
    expect(match.server).toBe(ORANGE);
    expect(match.score).toEqual([0, 1]);
  });

  test("first to 11 wins", () => {
    const match = new Match(DEFAULT_SETTINGS);
    for (let i = 0; i < 10; i++) match.record(point(BLUE));
    expect(match.winner).toBeNull();
    match.record(point(BLUE));
    expect(match.winner).toBe(BLUE);
    expect(() => match.record(point(ORANGE))).toThrow("already over");
  });

  test("at 10-10 it takes a two point lead", () => {
    const match = new Match(DEFAULT_SETTINGS);
    for (let i = 0; i < 10; i++) {
      match.record(point(BLUE));
      match.record(point(ORANGE));
    }
    match.record(point(ORANGE));
    expect(match.winner).toBeNull();
    match.record(point(BLUE));
    match.record(point(BLUE));
    expect(match.winner).toBeNull();
    match.record(point(BLUE));
    expect(match.score).toEqual([13, 11]);
    expect(match.winner).toBe(BLUE);
  });
});
