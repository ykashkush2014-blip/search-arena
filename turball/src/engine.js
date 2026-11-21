// Boostball Arena - pure gameplay simulation (no DOM, no rendering).
// Everything in this file can run headless (see tests/sim.mjs).
import * as THREE from '../vendor/three.module.min.js';

export const FIELD = Object.freeze({
  halfW: 32,
  halfL: 44,
  height: 24,
  goalHalfW: 9,
  goalHeight: 7,
  goalDepth: 8,
  ballRadius: 2.2,
  gravity: 26,
});

export const CAR = Object.freeze({
  rideHeight: 0.62,
  hitRadius: 1.35,
  maxSpeed: 27,
  boostSpeed: 42,
  accel: 36,
  brake: 50,
  reverseAccel: 22,
  airGravity: 26,
  jump: 12,
  doubleJump: 10,
  flip: 16,
  boostAccel: 40,
  boostDrain: 33,
  flipWindow: 1.5,
  maxBallSpeed: 78,
});

export const TEAM_COLORS = Object.freeze({
  blue: 0x27a8ff,
  orange: 0xff7b1c,
});

export const BOOST_PADS = Object.freeze([
  { x: 0, z: 0, big: true },
  { x: -24, z: -30, big: true },
  { x: 24, z: -30, big: true },
  { x: -24, z: 30, big: true },
  { x: 24, z: 30, big: true },
  { x: -15, z: -16, big: false },
  { x: 15, z: -16, big: false },
  { x: -15, z: 16, big: false },
  { x: 15, z: 16, big: false },
  { x: 0, z: -36, big: false },
  { x: 0, z: 36, big: false },
  { x: -27, z: -7, big: false },
  { x: 27, z: -7, big: false },
  { x: -27, z: 7, big: false },
  { x: 27, z: 7, big: false },
  { x: 0, z: -18, big: false },
  { x: 0, z: 18, big: false },
]);

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export const damp = (current, target, lambda, dt) =>
  current + (target - current) * (1 - Math.exp(-lambda * dt));

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

/** A rocket-powered car. Position is the centre of the chassis. */
export class Car {
  constructor(team, isBot = false, skill = 0.8) {
    this.team = team;
    this.isBot = isBot;
    this.skill = skill;
    this.pos = new THREE.Vector3(0, CAR.rideHeight, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.grounded = true;
    this.boost = 34;
    this.boosting = false;
    this.drifting = false;
    this.canDoubleJump = false;
    this.doubleJumpTimer = 0;
    this.prevJump = false;
    this.justJumped = false;
    this.justFlipped = false;
    this.flipTime = 0;
    this.flipAxis = 'x';
    this.flipSign = 1;
    this.speed = 0;
    this.steerVisual = 0;
    this.wheelSpin = 0;
    this.hitCooldown = 0;
    this.time = 0;
    this.aiRole = 'attack';
    this.aiJumpPhase = false;
    this.aiTarget = new THREE.Vector3();
    this.lastTouch = 0;
  }

  reset(x, z, yaw) {
    this.pos.set(x, CAR.rideHeight, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.roll = 0;
    this.grounded = true;
    this.boost = 34;
    this.boosting = false;
    this.drifting = false;
    this.canDoubleJump = false;
    this.doubleJumpTimer = 0;
    this.prevJump = false;
    this.flipTime = 0;
    this.speed = 0;
    this.steerVisual = 0;
    this.flipTime = 0;
  }

  forward(target = new THREE.Vector3()) {
    return target.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  right(target = new THREE.Vector3()) {
    const f = this.forward(_v1);
    return target.set(-f.z, 0, f.x);
  }

  /** Orientation used for rendering (includes the flip animation). */
  visualQuaternion(target = new THREE.Quaternion()) {
    let spin = 0;
    if (this.flipTime > 0) {
      const t = 1 - this.flipTime / 0.45;
      spin = t * Math.PI * 2 * this.flipSign;
    }
    const pitch = this.pitch + (this.flipAxis === 'x' ? spin : 0);
    const roll = this.roll + (this.flipAxis === 'z' ? spin : 0);
    return target.setFromEuler(_e.set(pitch, this.yaw, roll, 'YXZ'));
  }

  upVector(target = new THREE.Vector3()) {
    return target.set(0, 1, 0).applyQuaternion(this.visualQuaternion(_q));
  }

  step(dt, input) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);
    if (this.flipTime > 0) this.flipTime = Math.max(0, this.flipTime - dt);

    const steer = clamp(input.steer || 0, -1, 1);
    const throttle = clamp(input.throttle || 0, -1, 1);
    const drift = !!input.drift;
    const jumpPressed = !!input.jump && !this.prevJump;
    this.prevJump = !!input.jump;
    this.justJumped = false;
    this.justFlipped = false;

    const fwd = this.forward(_v1);
    const right = this.right(_v2);
    this.drifting = drift && this.grounded;

    const boostActive = !!input.boost && this.boost > 0.5;
    this.boosting = boostActive;
    if (boostActive) this.boost = Math.max(0, this.boost - CAR.boostDrain * dt);

    if (this.grounded) {
      const speedAlong = this.vel.dot(fwd);
      const turnSign = speedAlong < -0.6 ? -1 : 1;
      const steerRate = 2.9 * (0.35 + 0.65 * Math.min(1, Math.abs(speedAlong) / 12));
      const driftBoost = drift ? 1.4 : 1;
      if (Math.abs(speedAlong) > 0.4 || throttle !== 0) {
        this.yaw -= steer * steerRate * turnSign * driftBoost * dt;
      }

      if (throttle > 0) {
        this.vel.addScaledVector(fwd, CAR.accel * throttle * dt);
      } else if (throttle < 0) {
        if (speedAlong > 1) this.vel.addScaledVector(fwd, -CAR.brake * dt);
        else this.vel.addScaledVector(fwd, CAR.reverseAccel * throttle * dt);
      }
      if (boostActive) this.vel.addScaledVector(fwd, CAR.boostAccel * dt);

      // sideways grip (drifting lets the tail slide)
      const longV = this.vel.dot(fwd);
      let latV = this.vel.dot(right);
      latV *= Math.exp(-(drift ? 2.3 : 10) * dt);
      this.vel.copy(fwd).multiplyScalar(longV).addScaledVector(right, latV);

      // rolling resistance
      this.vel.multiplyScalar(Math.exp(-(throttle === 0 && Math.abs(steer) < 0.1 ? 0.9 : 0.12) * dt));

      const max = (boostActive ? CAR.boostSpeed : CAR.maxSpeed) * (this.isBot ? 0.74 + 0.26 * this.skill : 1);
      const sp = this.vel.length();
      if (sp > max) this.vel.multiplyScalar(max / sp);

      this.pitch = damp(this.pitch, 0, 10, dt);
      this.roll = damp(this.roll, 0, 10, dt);

      if (jumpPressed) {
        this.grounded = false;
        this.vel.y = CAR.jump;
        this.canDoubleJump = true;
        this.doubleJumpTimer = CAR.flipWindow;
        this.justJumped = true;
        this.pitch = -0.1;
      }
    } else {
      // ---- airborne ----
      if (this.doubleJumpTimer > 0) this.doubleJumpTimer -= dt;
      else this.canDoubleJump = false;

      if (jumpPressed && this.canDoubleJump) {
        const hasDir = Math.abs(throttle) > 0.15 || Math.abs(steer) > 0.15;
        if (hasDir) {
          const dir = _v3.copy(fwd).multiplyScalar(throttle).addScaledVector(right, steer);
          if (dir.lengthSq() < 1e-4) dir.copy(fwd);
          dir.normalize();
          this.vel.addScaledVector(dir, CAR.flip);
          this.vel.y = Math.max(this.vel.y, 3.5);
          this.flipTime = 0.45;
          this.flipAxis = Math.abs(steer) > Math.abs(throttle) ? 'z' : 'x';
          this.flipSign = this.flipAxis === 'z' ? -Math.sign(steer || 1) : -Math.sign(throttle || 1);
          this.justFlipped = true;
        } else {
          this.vel.y = Math.max(this.vel.y, CAR.doubleJump);
          this.pitch -= 0.22;
          this.justJumped = true;
        }
        this.canDoubleJump = false;
        this.doubleJumpTimer = 0;
      }

      this.yaw -= steer * (drift ? 0.5 : 1.5) * dt;
      this.pitch -= throttle * 2.6 * dt;
      if (drift) this.roll += steer * 3.6 * dt;
      this.pitch = clamp(this.pitch, -1.45, 1.45);
      this.roll = clamp(this.roll, -1.6, 1.6);

      if (boostActive) {
        const q = this.visualQuaternion(_q);
        const f3 = _v4.set(0, 0, -1).applyQuaternion(q);
        this.vel.addScaledVector(f3, CAR.boostAccel * dt);
        this.vel.y += CAR.airGravity * 0.28 * dt; // boost slightly offsets gravity
      }
      this.vel.y -= CAR.airGravity * dt;
      this.vel.multiplyScalar(Math.exp(-0.06 * dt));

      if (this.isBot) {
        // bots self-right so they stay fun to play against
        this.pitch = damp(this.pitch, 0, 2.4, dt);
        this.roll = damp(this.roll, 0, 2.4, dt);
      }
    }

    // ---- integrate ----
    this.pos.addScaledVector(this.vel, dt);

    // ceiling
    if (this.pos.y > FIELD.height - 1.4) {
      this.pos.y = FIELD.height - 1.4;
      if (this.vel.y > 0) this.vel.y *= -0.35;
    }

    // ground / landing
    if (this.pos.y <= CAR.rideHeight) {
      this.pos.y = CAR.rideHeight;
      if (this.vel.y < -20) {
        this.vel.y = -this.vel.y * 0.2;
        this.pitch *= 0.5;
        this.roll *= 0.5;
      } else {
        if (!this.grounded) {
          // flatten out on touchdown
          this.pitch *= 0.35;
          this.roll *= 0.35;
        }
        this.vel.y = 0;
        this.grounded = true;
        this.canDoubleJump = false;
        this.doubleJumpTimer = 0;
      }
    } else {
      this.grounded = false;
    }

    // arena bounds (cars stay on the pitch)
    const bx = FIELD.halfW - 1.7;
    const bz = FIELD.halfL - 2.1;
    // slide along the walls instead of bouncing off them
    if (this.pos.x > bx) {
      this.pos.x = bx;
      if (this.vel.x > 0) this.vel.x = 0;
    } else if (this.pos.x < -bx) {
      this.pos.x = -bx;
      if (this.vel.x < 0) this.vel.x = 0;
    }
    if (this.pos.z > bz) {
      this.pos.z = bz;
      if (this.vel.z > 0) this.vel.z = 0;
    } else if (this.pos.z < -bz) {
      this.pos.z = -bz;
      if (this.vel.z < 0) this.vel.z = 0;
    }

    this.speed = this.grounded ? this.vel.dot(fwd) : this.vel.length();
    this.wheelSpin += (this.speed * dt) / 0.42;
    this.steerVisual = damp(this.steerVisual, steer, 12, dt);
  }
}

/** The ball. */
export class Ball {
  constructor() {
    this.radius = FIELD.ballRadius;
    this.pos = new THREE.Vector3(0, this.radius, 0);
    this.vel = new THREE.Vector3();
    this.spinAxis = new THREE.Vector3(1, 0, 0);
    this.spinSpeed = 0;
    this.lastTouchTeam = null;
    this.lastTouchTime = 0;
    this.impact = 0;
  }

  reset(x = 0, z = 0) {
    this.pos.set(x, this.radius, z);
    this.vel.set(0, 0, 0);
    this.spinSpeed = 0;
    this.impact = 0;
    this.lastTouchTeam = null;
  }

  /** Advances the ball; returns 'blue' / 'orange' when a goal is scored. */
  step(dt) {
    const r = this.radius;
    this.impact = Math.max(0, this.impact - dt * 6);
    const pz = this.pos.z;

    this.vel.y -= FIELD.gravity * dt;
    this.vel.multiplyScalar(Math.exp(-0.055 * dt));
    this.pos.addScaledVector(this.vel, dt);

    // floor
    if (this.pos.y < r) {
      this.pos.y = r;
      if (this.vel.y < 0) {
        const impact = -this.vel.y;
        this.vel.y = impact > 2.5 ? impact * 0.58 : 0;
        this.impact = Math.max(this.impact, impact * 0.06);
      }
      const roll = Math.exp(-1.0 * dt);
      this.vel.x *= roll;
      this.vel.z *= roll;
    }

    // ceiling
    if (this.pos.y > FIELD.height - r) {
      this.pos.y = FIELD.height - r;
      if (this.vel.y > 0) this.vel.y *= -0.6;
    }

    // side walls
    if (this.pos.x > FIELD.halfW - r) {
      this.pos.x = FIELD.halfW - r;
      if (this.vel.x > 0) this.vel.x *= -0.72;
    } else if (this.pos.x < -FIELD.halfW + r) {
      this.pos.x = -FIELD.halfW + r;
      if (this.vel.x < 0) this.vel.x *= -0.72;
    }

    // goals / end walls
    let goal = null;
    const inMouth = Math.abs(this.pos.x) < FIELD.goalHalfW - 0.25 && this.pos.y < FIELD.goalHeight - 0.25;
    for (const side of [1, -1]) {
      const wallZ = FIELD.halfL * side;
      const crossing = side > 0 ? this.pos.z > wallZ - r : this.pos.z < wallZ + r;
      if (!crossing) continue;
      if (!inMouth) {
        this.pos.z = wallZ - r * side;
        if (Math.sign(this.vel.z) === side) this.vel.z *= -0.7;
      } else {
        const backZ = FIELD.halfL + FIELD.goalDepth - r;
        if (side > 0 && this.pos.z > backZ) {
          this.pos.z = backZ;
          if (this.vel.z > 0) this.vel.z *= -0.45;
        } else if (side < 0 && this.pos.z < -backZ) {
          this.pos.z = -backZ;
          if (this.vel.z < 0) this.vel.z *= -0.45;
        }
        // inside the net, keep the ball within the goal box
        const gx = FIELD.goalHalfW - r;
        if (this.pos.x > gx) {
          this.pos.x = gx;
          if (this.vel.x > 0) this.vel.x *= -0.5;
        } else if (this.pos.x < -gx) {
          this.pos.x = -gx;
          if (this.vel.x < 0) this.vel.x *= -0.5;
        }
        const gy = FIELD.goalHeight - r;
        if (this.pos.y > gy) {
          this.pos.y = gy;
          if (this.vel.y > 0) this.vel.y *= -0.5;
        }
        if (side > 0 && pz <= wallZ && this.pos.z > wallZ) goal = 'blue';
        if (side < 0 && pz >= wallZ && this.pos.z < wallZ) goal = 'orange';
      }
    }

    // posts (simple cylinders)
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const postX = sx * FIELD.goalHalfW;
        const postZ = sz * FIELD.halfL;
        const dx = this.pos.x - postX;
        const dz = this.pos.z - postZ;
        const d = Math.hypot(dx, dz);
        const min = r + 0.45;
        if (d < min && d > 1e-4 && this.pos.y < FIELD.goalHeight + 1) {
          const nx = dx / d;
          const nz = dz / d;
          this.pos.x = postX + nx * min;
          this.pos.z = postZ + nz * min;
          const vn = this.vel.x * nx + this.vel.z * nz;
          if (vn < 0) {
            this.vel.x -= vn * nx * 1.6;
            this.vel.z -= vn * nz * 1.6;
            this.impact = Math.max(this.impact, Math.abs(vn) * 0.08);
          }
        }
      }
    }

    // visual spin
    const horizontal = Math.hypot(this.vel.x, this.vel.z);
    if (horizontal > 0.2) {
      this.spinAxis.set(-this.vel.z / horizontal, 0, this.vel.x / horizontal);
      this.spinSpeed = horizontal / r;
    } else {
      this.spinSpeed *= 0.96;
    }

    if (this.pos.y < r - 0.01) this.pos.y = r;
    return goal;
  }
}

/** Sphere-ish car -> ball collision. Returns impact strength (0 when no hit). */
export function collideCarBall(car, ball) {
  const cy = car.pos.y + 0.35;
  _n.set(ball.pos.x - car.pos.x, ball.pos.y - cy, ball.pos.z - car.pos.z);
  const dist = _n.length();
  const minDist = ball.radius + CAR.hitRadius;
  if (dist >= minDist) return 0;
  if (dist < 1e-4) _n.set(0, 0, -1);
  else _n.multiplyScalar(1 / dist);

  const penetration = minDist - dist;
  ball.pos.addScaledVector(_n, penetration);

  const rel = _v1.copy(ball.vel).sub(car.vel);
  const vn = rel.dot(_n);
  if (vn < 0) {
    ball.vel.addScaledVector(_n, -vn * 1.7);
  }
  const carPush = Math.max(0, car.vel.dot(_n));
  ball.vel.addScaledVector(_n, carPush * 0.6 + (car.boosting ? 8 : 0) + 1.6);
  ball.vel.y += clamp(carPush * 0.12, 0, 4);

  const sp = ball.vel.length();
  if (sp > CAR.maxBallSpeed) ball.vel.multiplyScalar(CAR.maxBallSpeed / sp);
  ball.lastTouchTeam = car.team;
  ball.lastTouchTime = 0;
  ball.impact = Math.max(ball.impact, Math.min(1.4, (Math.abs(vn) + carPush) * 0.05));
  car.hitCooldown = 0.25;
  return Math.abs(vn) + carPush;
}

/** Pushes overlapping cars apart and exchanges a bit of momentum. */
export function collideCars(cars) {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const dy = Math.abs(b.pos.y - a.pos.y);
      if (dy > 2.2) continue;
      const d = Math.hypot(dx, dz);
      const min = CAR.hitRadius * 2.05;
      if (d >= min || d < 1e-4) continue;
      const nx = dx / d;
      const nz = dz / d;
      const push = (min - d) * 0.5;
      a.pos.x -= nx * push;
      a.pos.z -= nz * push;
      b.pos.x += nx * push;
      b.pos.z += nz * push;
      const rel = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
      if (rel < 0) {
        const imp = rel * 0.65;
        a.vel.x += nx * imp;
        a.vel.z += nz * imp;
        b.vel.x -= nx * imp;
        b.vel.z -= nz * imp;
      }
    }
  }
}

/** Assign attacker/defender roles inside a team (2v2), with a little hysteresis. */
export function assignRoles(teamCars, ball) {
  if (teamCars.length === 0) return;
  if (teamCars.length === 1) {
    teamCars[0].aiRole = 'attack';
    return;
  }
  const [a, b] = teamCars;
  const distToBall = (c) => Math.hypot(c.pos.x - ball.pos.x, c.pos.z - ball.pos.z);
  let attacker = a.aiRole === 'defend' ? b : a;
  let defender = attacker === a ? b : a;
  // swap only when the other car is clearly closer (avoids role flapping)
  if (distToBall(defender) + 4 < distToBall(attacker)) {
    const tmp = attacker;
    attacker = defender;
    defender = tmp;
  }
  attacker.aiRole = 'attack';
  defender.aiRole = 'defend';
}

/**
 * Simple but competent bot brain. Returns an input frame for Car.step().
 * `skill` (0..1) is stored on the car and scales aim, speed and boost usage.
 */
export function computeAIInput(car, ball, cars, dt) {
  car.aiJumpPhase = !car.aiJumpPhase;
  const skill = car.skill;
  const ownGoalZ = car.team === 'blue' ? -FIELD.halfL : FIELD.halfL;
  const oppGoalZ = -ownGoalZ;
  const ballDist = Math.hypot(ball.pos.x - car.pos.x, ball.pos.z - car.pos.z);

  const target = car.aiTarget;
  const goalDir = _v1.set(-ball.pos.x, 0, oppGoalZ - ball.pos.z);
  if (goalDir.lengthSq() < 1e-4) goalDir.set(0, 0, oppGoalZ);
  goalDir.normalize();

  // point just behind the ball, lined up with the opponent goal
  const attackX = ball.pos.x - goalDir.x * (ball.radius + 1.4);
  const attackZ = ball.pos.z - goalDir.z * (ball.radius + 1.4);

  // point between the ball and our own goal
  const backDir = _v2.set(ball.pos.x, 0, ball.pos.z - ownGoalZ);
  const backLen = backDir.length();
  if (backLen > 0.001) backDir.multiplyScalar(1 / backLen);
  const defendX = backDir.x * Math.min(11, Math.max(5, backLen * 0.55));
  const defendZ = ownGoalZ + backDir.z * Math.min(11, Math.max(5, backLen * 0.55));

  const ballThreat = Math.sign(ball.vel.z) === Math.sign(ownGoalZ) && Math.abs(ball.vel.z) > 6;
  const ballInOwnHalf = (ball.pos.z - ownGoalZ) * Math.sign(oppGoalZ - ownGoalZ) < FIELD.halfL * 0.85;

  if (car.aiRole === 'defend' || (ballThreat && ballDist > 14) || (!ballInOwnHalf && car.aiRole !== 'attack')) {
    target.set(defendX, 0, defendZ);
  } else {
    target.set(attackX, 0, attackZ);
  }

  // low on boost and far from the action? grab a big pad
  if (car.boost < 12 && ballDist > 16) {
    let best = null;
    let bestD = Infinity;
    for (const pad of BOOST_PADS) {
      if (!pad.big) continue;
      const d = Math.hypot(pad.x - car.pos.x, pad.z - car.pos.z);
      if (d < bestD) {
        bestD = d;
        best = pad;
      }
    }
    if (best && bestD < 34) target.set(best.x, 0, best.z);
  }

  // aim error at lower skill levels
  if (skill < 0.95) {
    const err = (1 - skill) * 3.2;
    target.x += Math.sin(car.time * 1.7 + car.pos.z * 0.11) * err;
    target.z += Math.cos(car.time * 1.3 + car.pos.x * 0.09) * err * 0.5;
  }

  const dx = target.x - car.pos.x;
  const dz = target.z - car.pos.z;
  const desiredYaw = Math.atan2(-dx, -dz);
  let diff = wrapAngle(desiredYaw - car.yaw);
  // positive steer input decreases yaw in Car.step, so aim with -diff
  let steer = clamp(-diff * 2.6, -1, 1);

  let throttle = Math.abs(diff) > 1.2 ? 0.7 : 1;
  // don't overshoot the ball when very close
  const targetDist = Math.hypot(dx, dz);
  if (targetDist < 3 && Math.abs(diff) < 0.6) throttle = 0.6;

  // unstick: if we are pinned against a wall with the throttle down, back up
  if (Math.abs(car.speed) < 1.5 && throttle > 0 && car.grounded) car.aiStuck = (car.aiStuck || 0) + dt;
  else car.aiStuck = 0;
  if (car.aiStuck > 0.8) {
    car.aiStuck = 0;
    car.aiReverse = 0.6;
  }
  if (car.aiReverse > 0) {
    car.aiReverse -= dt;
    throttle = -1;
    steer = clamp(diff * 2.6, -1, 1);
  }

  const distToBallLine =
    Math.abs((ball.pos.x - car.pos.x) * goalDir.z - (ball.pos.z - car.pos.z) * goalDir.x);

  let boost = false;
  if (car.boost > 12 && Math.abs(diff) < 0.4 && throttle > 0) {
    if (ballDist > 13 || (ballDist > 6 && distToBallLine < 3)) boost = true;
  }
  if (car.isBot && Math.random() > 0.35 + skill * 0.55) boost = boost && Math.random() < 0.5;

  const drift = car.grounded && Math.abs(diff) > 0.75 && Math.abs(car.speed) > 17;

  // jumping at the ball (small cooldown so a bot doesn't burn its double jump)
  let jump = false;
  car.aiJumpCooldown = Math.max(0, (car.aiJumpCooldown || 0) - dt);
  if (car.aiJumpCooldown <= 0 && car.aiJumpPhase) {
    if (car.grounded) {
      if (ball.pos.y > car.pos.y + 1.4 && ballDist < 6.5 && ball.pos.y < 8.5) {
        jump = true;
        car.aiJumpCooldown = 0.22;
      }
    } else if (car.canDoubleJump && ball.pos.y > car.pos.y + 0.2 && ballDist < 5.5) {
      jump = true;
      car.aiJumpCooldown = 0.3;
    }
  }

  if (!car.grounded && Math.abs(diff) < 0.9 && ball.pos.y > 4) throttle = 1;

  return {
    throttle: clamp(throttle, -1, 1),
    steer,
    boost,
    drift,
    jump,
  };
}
