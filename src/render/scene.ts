// The court in three.js: floor and lines, the net, the ball with its shadow,
// the two cars, and the player's chase camera. Started from the training
// repo's court viewer. It draws whatever state it is given each frame.

import * as THREE from "three";
import { BLUE, ORANGE, type Team, type Vec3 } from "../obs";
import type { SimBallState, SimCarState } from "../physics";
import { BALL_RADIUS, type CourtConfig } from "../volleyball";

const TEAM_COLORS: Record<Team, number> = { 0: 0x3b82f6, 1: 0xf97316 };
const LINE_WIDTH = 24;

// RocketSim's default car (its config index 0): hitbox length, width, height
// and the hitbox's offset from the car's origin, from vendor/RocketSim's
// CarConfig.cpp. The bot trained with this car, so the body matches it.
const HITBOX_SIZE: Vec3 = [120.507, 86.6994, 38.6591];
const HITBOX_OFFSET: Vec3 = [13.8757, 0, 20.755];
const WHEEL_RADIUS = 13;
const CAR_REST_HEIGHT = 17;

// The genre's usual chase camera: wide, a few car lengths back, a little above.
const CAMERA_FOV_HORIZONTAL = 110;
const CAMERA_DISTANCE = 270;
const CAMERA_HEIGHT = 100;
const CAMERA_FOLLOW = 6; // per second; higher follows more tightly

// RocketSim is z up with blue's half at y < 0; three.js is y up. The game's
// world is left-handed (a car facing +x with z up has its right at +y), so
// swapping y and z, a reflection rather than a rotation, draws it unmirrored
// in three.js's right-handed space.
function toScene([x, y, z]: Vec3): THREE.Vector3 {
  return new THREE.Vector3(x, z, y);
}

function courtLines(court: CourtConfig): THREE.Group {
  const { halfWidth: w, halfLength: l } = court;
  const material = new THREE.MeshBasicMaterial({ color: 0xf1f5f9 });
  const strip = (x: number, z: number, sx: number, sz: number) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 1, z);
    return mesh;
  };
  const lines = new THREE.Group();
  lines.add(strip(-w, 0, LINE_WIDTH, 2 * l + LINE_WIDTH), strip(w, 0, LINE_WIDTH, 2 * l + LINE_WIDTH));
  lines.add(strip(0, -l, 2 * w, LINE_WIDTH), strip(0, l, 2 * w, LINE_WIDTH), strip(0, 0, 2 * w, LINE_WIDTH));
  return lines;
}

function floor(court: CourtConfig): THREE.Group {
  const group = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000), new THREE.MeshLambertMaterial({ color: 0x1f2a24 }));
  ground.rotation.x = -Math.PI / 2;
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(2 * court.halfWidth, 2 * court.halfLength), new THREE.MeshLambertMaterial({ color: 0x2f4a3a }));
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = 0.5;
  const grid = new THREE.GridHelper(20000, 20, 0x334155, 0x273340);
  grid.position.y = 0.2;
  group.add(ground, grid, surface, courtLines(court));
  return group;
}

function net(court: CourtConfig): THREE.Group {
  const { halfWidth: w, netHeight: h, netThickness: t } = court;
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2 * w, h, t),
    new THREE.MeshLambertMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  body.position.y = h / 2;
  const band = new THREE.Mesh(new THREE.BoxGeometry(2 * w, 30, t + 4), new THREE.MeshLambertMaterial({ color: 0xffffff }));
  band.position.y = h - 15;
  group.add(body, band);
  for (const x of [-w, w]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, h), new THREE.MeshLambertMaterial({ color: 0x94a3b8 }));
    post.position.set(x, h / 2, 0);
    group.add(post);
  }
  return group;
}

/** A wedge-ish body the size of the hitbox, a cabin, and four wheels. Local axes: x forward, y up, z right. */
function car(team: Team): THREE.Group {
  const [length, width, height] = HITBOX_SIZE;
  const [ox, , oz] = HITBOX_OFFSET;
  const group = new THREE.Group();
  group.matrixAutoUpdate = false;
  const paint = new THREE.MeshLambertMaterial({ color: TEAM_COLORS[team] });
  const body = new THREE.Mesh(new THREE.BoxGeometry(length, height * 0.6, width), paint);
  body.position.set(ox, oz - height * 0.2, 0);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(length * 0.45, height * 0.4, width * 0.8), new THREE.MeshLambertMaterial({ color: 0x0f172a }));
  cabin.position.set(ox - length * 0.1, oz + height * 0.3, 0);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(6, height * 0.3, width * 0.9), new THREE.MeshLambertMaterial({ color: 0xf8fafc }));
  nose.position.set(ox + length / 2, oz - height * 0.2, 0);
  group.add(body, cabin, nose);
  const tyre = new THREE.MeshLambertMaterial({ color: 0x111827 });
  for (const x of [ox + length * 0.32, ox - length * 0.32]) {
    for (const z of [-width / 2, width / 2]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 10, 16), tyre);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, WHEEL_RADIUS - CAR_REST_HEIGHT, z);
      group.add(wheel);
    }
  }
  return group;
}

function setCarPose(mesh: THREE.Object3D, s: SimCarState) {
  const forward = toScene(s.rot_mat[0]).normalize();
  const right = toScene(s.rot_mat[1]);
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  right.crossVectors(forward, up);
  mesh.matrix.makeBasis(forward, up, right).setPosition(toScene(s.pos));
}

export interface CourtScene {
  /**
   * Draws this state, with the camera following the player's car. swivel
   * points the camera that many radians from the car's heading (positive to
   * its right) and overrides ball cam; null follows normally. dt in seconds
   * since the last frame.
   */
  render(ball: SimBallState, cars: Record<Team, SimCarState>, player: Team, ballCam: boolean, swivel: number | null, dt: number): void;
}

export function createCourtScene(canvas: HTMLCanvasElement, court: CourtConfig): CourtScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f172a);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(3000, 8000, -2000);
  scene.add(sun, floor(court), net(court));

  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 32, 16), new THREE.MeshLambertMaterial({ color: 0xe5e7eb }));
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false });
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(BALL_RADIUS, 32), shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  scene.add(ball, shadow);
  const cars: Record<Team, THREE.Group> = { 0: car(BLUE), 1: car(ORANGE) };
  scene.add(cars[BLUE], cars[ORANGE]);

  const camera = new THREE.PerspectiveCamera(70, 1, 10, 200000);
  let cameraReady = false;

  function resize() {
    const { clientWidth: width, clientHeight: height } = canvas;
    const pixelRatio = renderer.getPixelRatio();
    if (canvas.width === Math.floor(width * pixelRatio) && canvas.height === Math.floor(height * pixelRatio)) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // The FOV setting is horizontal, as the genre states it; three.js takes vertical.
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV_HORIZONTAL / 2)) / camera.aspect));
    camera.updateProjectionMatrix();
  }

  function flat(v: THREE.Vector3): THREE.Vector3 {
    v.y = 0;
    return v.lengthSq() < 1e-6 ? v.set(0, 0, 1) : v.normalize();
  }

  // The camera circles the car: its angle around the car eases towards the
  // target the short way round, and it always looks along that angle, so
  // turning, ball cam and the stick swing it round rather than across. Only
  // how high it looks eases separately, which keeps ball cam on the ball.
  let cameraYaw = 0;
  let cameraHeight = CAMERA_HEIGHT;
  let lookRise = 0;
  const LOOK_AHEAD = 200;

  function yawOf(v: THREE.Vector3): number {
    return Math.atan2(v.x, v.z);
  }

  // Car cam in the air looks where the car is going, not where its nose
  // points, once it moves fast enough across the ground for that to mean
  // something. On the ground it keeps to the nose, which already points the
  // way the car drives and stays put when reversing.
  const CAR_CAM_FOLLOWS_TRAVEL_FROM = 500;
  function carCamHeading(carState: SimCarState): THREE.Vector3 {
    const nose = flat(toScene(carState.rot_mat[0]));
    if (carState.is_on_ground) return nose;
    const travel = toScene(carState.vel);
    travel.y = 0;
    const w = Math.min(1, travel.length() / CAR_CAM_FOLLOWS_TRAVEL_FROM);
    if (w === 0) return nose;
    // Between the two angles the short way round, so opposite directions never cancel.
    const a = yawOf(nose);
    const b = yawOf(travel);
    const yaw = a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * w;
    return new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  }

  function placeCamera(carState: SimCarState, ballPos: THREE.Vector3, ballCam: boolean, swivel: number | null, dt: number) {
    const carPos = toScene(carState.pos);
    // Behind the car along where it looks: its heading, swivelled by the
    // stick, or the line from the car to the ball.
    let heading: THREE.Vector3;
    if (swivel !== null) {
      const forward = flat(toScene(carState.rot_mat[0]));
      const right = flat(toScene(carState.rot_mat[1]));
      heading = forward.multiplyScalar(Math.cos(swivel)).addScaledVector(right, Math.sin(swivel)).normalize();
    } else if (ballCam) {
      heading = flat(new THREE.Vector3().subVectors(ballPos, carPos));
    } else {
      heading = carCamHeading(carState);
    }
    ballCam &&= swivel === null;

    // How far above the car the look point sits, LOOK_AHEAD out: towards the
    // midpoint of car and ball in ball cam, just above the car otherwise.
    let riseTarget = 30;
    if (ballCam) {
      const mid = carPos.clone().lerp(ballPos, 0.5);
      const across = Math.hypot(mid.x - carPos.x, mid.z - carPos.z);
      riseTarget = Math.max(30, ((mid.y - carPos.y) * LOOK_AHEAD) / Math.max(across, LOOK_AHEAD));
    }

    const target = yawOf(heading);
    if (!cameraReady) {
      cameraYaw = target;
      lookRise = riseTarget;
      cameraReady = true;
    }
    const t = 1 - Math.exp(-CAMERA_FOLLOW * dt);
    cameraYaw += Math.atan2(Math.sin(target - cameraYaw), Math.cos(target - cameraYaw)) * t;
    cameraHeight += (Math.max(carPos.y + CAMERA_HEIGHT, 40) - carPos.y - cameraHeight) * t;
    lookRise += (riseTarget - lookRise) * t;

    const dx = Math.sin(cameraYaw);
    const dz = Math.cos(cameraYaw);
    camera.position.set(carPos.x - dx * CAMERA_DISTANCE, carPos.y + cameraHeight, carPos.z - dz * CAMERA_DISTANCE);
    camera.lookAt(carPos.x + dx * LOOK_AHEAD, carPos.y + lookRise, carPos.z + dz * LOOK_AHEAD);
  }

  return {
    render(ballState, carStates, player, ballCam, swivel, dt) {
      resize();
      const b = toScene(ballState.pos);
      ball.position.copy(b);
      shadow.position.set(b.x, 2, b.z);
      shadowMaterial.opacity = Math.max(0.15, 0.55 - b.y / 6000);
      setCarPose(cars[BLUE], carStates[BLUE]);
      setCarPose(cars[ORANGE], carStates[ORANGE]);
      placeCamera(carStates[player], b, ballCam, swivel, dt);
      renderer.render(scene, camera);
    },
  };
}
