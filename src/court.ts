// Where things stand on the court, ported from the training repo's
// volleyball_engine.py. Blue's half is y < 0.

import { BLUE, type Team, type Vec3 } from "./obs";
import type { RotMat } from "./physics";
import type { CourtConfig } from "./volleyball";

export const CAR_REST_Z = 17;
// The ball rests here, asleep, until the server hits it: above a car driving
// under it, within a single held jump's reach.
export const TEE_HEIGHT = 250;
export const TEE_DISTANCE = 1000;

/** A box netThickness thick and netHeight high, spanning the court's width across y = 0. */
export function netMesh(court: CourtConfig): { vertices: Vec3[]; triangles: number[] } {
  const w = court.halfWidth;
  const t = court.netThickness / 2;
  const h = court.netHeight;
  const vertices: Vec3[] = [];
  for (const x of [-w, w]) for (const y of [-t, t]) for (const z of [0, h]) vertices.push([x, y, z]);
  const faces = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
  return { vertices, triangles: faces.flatMap(([a, b, c, d]) => [a!, b!, c!, a!, c!, d!]) };
}

export function backLineY(team: Team, court: CourtConfig): number {
  return team === BLUE ? -court.halfLength : court.halfLength;
}

/** TEE_DISTANCE in front of the team's spawn, towards the net. */
export function teeY(team: Team, court: CourtConfig): number {
  return backLineY(team, court) * (1 - TEE_DISTANCE / court.halfLength);
}

export function facingNet(team: Team): RotMat {
  const f: Vec3 = team === BLUE ? [0, 1, 0] : [0, -1, 0];
  return [f, [-f[1], f[0], 0], [0, 0, 1]];
}
