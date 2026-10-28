import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { backLineY, netMesh, teeY } from "../src/court";
import { BLUE, ORANGE } from "../src/obs";
import { DEFAULT_COURT } from "../src/volleyball";

const physics = JSON.parse(readFileSync("fixtures/physics/one_step.json", "utf-8"));

test("the net is the mesh the training court is built from", () => {
  const court = physics.arenas.find((a: { name: string }) => a.name === "volleyball court");
  const net = netMesh(DEFAULT_COURT);
  expect(net.vertices).toEqual(court.meshes[0].vertices);
  expect(net.triangles).toEqual(court.meshes[0].triangles.flat());
});

test("each side serves from 1000 uu in front of its back line", () => {
  expect([backLineY(BLUE, DEFAULT_COURT), backLineY(ORANGE, DEFAULT_COURT)]).toEqual([-3500, 3500]);
  expect([teeY(BLUE, DEFAULT_COURT), teeY(ORANGE, DEFAULT_COURT)]).toEqual([-2500, 2500]);
});
