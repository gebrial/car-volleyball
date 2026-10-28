// One volleyball match on the WASM court: RocketSim and the rules, ticked
// together, as the training repo's VolleyballEngine does it.

import { CAR_REST_Z, TEE_HEIGHT, backLineY, facingNet, netMesh, teeY } from "./court";
import { BLUE, ORANGE, type GameState, type Team } from "./obs";
import type { CarControls, RocketSim, Sim, SimBallState, SimCarState } from "./physics";
import { DEFAULT_COURT, Match, Rally, TICK_RATE, type CourtConfig, type MatchSettings, type RallyEvent } from "./volleyball";

const GRAVITY_Z = -650;
const IDENTITY: [[number, number, number], [number, number, number], [number, number, number]] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

export const AGENT_IDS: Record<Team, string> = { 0: "blue-0", 1: "orange-0" };

export class VolleyballGame {
  match: Match;
  rally: Rally;
  private readonly sim: Sim;
  private readonly carIds: Record<Team, number>;
  private touching = new Set<number>();

  constructor(
    rs: RocketSim,
    readonly settings: MatchSettings,
    readonly court: CourtConfig = DEFAULT_COURT,
    firstServer: Team = BLUE,
  ) {
    this.sim = rs.createSim(TICK_RATE);
    this.sim.addStaticPlane([0, 0, 0], [0, 0, 1]);
    const net = netMesh(court);
    this.sim.addStaticMesh(net.vertices, net.triangles);
    // boostConsumption 0 is unlimited boost.
    this.sim.setMutators({
      gravity: [0, 0, GRAVITY_Z * settings.gravity],
      boost_used_per_second: (100 / 3) * settings.boostConsumption,
    });
    this.carIds = { 0: this.sim.addCar(BLUE), 1: this.sim.addCar(ORANGE) };
    this.match = new Match(settings, firstServer);
    this.rally = this.serve();
  }

  startMatch(firstServer: Team): Rally {
    this.match = new Match(this.settings, firstServer);
    return this.serve();
  }

  /** Both cars at rest in the middle of their back lines with full boost, the ball asleep on the server's tee. */
  serve(): Rally {
    const server = this.match.server;
    for (const team of [BLUE, ORANGE] as const) {
      this.sim.resetCar(this.carIds[team], [0, backLineY(team, this.court), CAR_REST_Z], facingNet(team), 100);
    }
    this.sim.setBallState({ pos: [0, teeY(server, this.court), TEE_HEIGHT], vel: [0, 0, 0], ang_vel: [0, 0, 0], rot_mat: IDENTITY, last_hit_car_id: 0 });
    this.touching = new Set();
    this.rally = new Rally(this.court, this.settings, server);
    return this.rally;
  }

  /** One physics tick with these controls, then the rules. A crossing car respawns at once. */
  tick(controls: Record<Team, CarControls>): RallyEvent[] {
    for (const team of [BLUE, ORANGE] as const) this.sim.setCarControls(this.carIds[team], controls[team]);
    this.sim.step(1);

    const touching = new Set(this.sim.touchedCarIds());
    const touchStarts = [BLUE, ORANGE].filter((t) => {
      const id = this.carIds[t as Team];
      return touching.has(id) && !this.touching.has(id);
    }) as Team[];
    this.touching = touching;

    const ball = this.sim.getBallState();
    const cars = ([BLUE, ORANGE] as const).map((team) => ({ carId: this.carIds[team], team, y: this.sim.getCarState(this.carIds[team]).pos[1] }));
    const events = this.rally.tick({ pos: ball.pos, vel: ball.vel }, touchStarts, cars);
    for (const e of events) {
      if (e.type === "Crossing") {
        const boost = this.sim.getCarState(e.carId).boost;
        this.sim.resetCar(e.carId, [0, backLineY(e.team, this.court), CAR_REST_Z], facingNet(e.team), boost);
      } else if (e.type === "RallyEnd") {
        this.match.record(e);
      }
    }
    return events;
  }

  ballState(): SimBallState {
    return this.sim.getBallState();
  }

  carState(team: Team): SimCarState {
    return this.sim.getCarState(this.carIds[team]);
  }

  /** The state the bot's observation is built from, in the parity fixtures' format. */
  observationState(): GameState {
    const ball = this.sim.getBallState();
    return {
      ball: { pos: ball.pos, vel: ball.vel, ang_vel: ball.ang_vel, rot_mat: ball.rot_mat.flat() },
      cars: ([BLUE, ORANGE] as const).map((team) => {
        const s = this.carState(team);
        return {
          agent_id: AGENT_IDS[team],
          team,
          pos: s.pos,
          vel: s.vel,
          ang_vel: s.ang_vel,
          rot_mat: s.rot_mat.flat(),
          boost: s.boost,
          is_demoed: s.is_demoed,
          demo_respawn_timer: s.demo_respawn_timer,
          wheels_with_contact: s.wheels_with_contact,
          supersonic_time: s.supersonic_time,
          time_spent_boosting: s.boosting_time,
          handbrake_val: s.handbrake_val,
          has_jumped: s.has_jumped,
          last_controls_jump: s.last_controls.jump,
          is_jumping: s.is_jumping,
          jump_time: s.jump_time,
          has_flipped: s.has_flipped,
          has_double_jumped: s.has_double_jumped,
          air_time_since_jump: s.air_time_since_jump,
          flip_time: s.flip_time,
        };
      }),
      boost_pad_cooldowns: [],
      rally: { ball_side: this.rally.ballSide, clock_ticks_left: this.rally.clockTicksLeft, clock_length_ticks: this.rally.clockLengthTicks },
    };
  }

  dispose(): void {
    this.sim.delete();
  }
}
