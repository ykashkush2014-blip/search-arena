// Player movement + AABB/voxel collision. Pure JS so the physics can be tested in node.
import { ID, isSolid } from './blocks.js';

export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
export const EYE_HEIGHT = 1.62;

const EPS = 1e-4;

export class Player {
  constructor(world, spawn) {
    this.world = world;
    this.pos = { x: spawn.x, y: spawn.y + 0.01, z: spawn.z }; // feet centre
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.inWater = false;
    this.flying = false;
    this.walkSpeed = 4.4;
    this.sprintSpeed = 7.2;
    this.flySpeed = 12;
    this.jumpSpeed = 8.4;
    this.gravity = 26;
    this.eyeSmooth = 0;
    this.bob = 0;
  }

  get eyeY() {
    return this.pos.y + EYE_HEIGHT - this.eyeSmooth;
  }

  /** Forward vector on the XZ plane from yaw. */
  forward() {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
  }

  right() {
    return { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
  }

  lookDir() {
    const cp = Math.cos(this.pitch);
    return {
      x: -Math.sin(this.yaw) * cp,
      y: Math.sin(this.pitch),
      z: -Math.cos(this.yaw) * cp,
    };
  }

  /** Does the player's AABB intersect a solid block at position? */
  collides(px, py, pz) {
    const half = PLAYER_WIDTH / 2;
    const minX = Math.floor(px - half + EPS);
    const maxX = Math.floor(px + half - EPS);
    const minY = Math.floor(py + EPS);
    const maxY = Math.floor(py + PLAYER_HEIGHT - EPS);
    const minZ = Math.floor(pz - half + EPS);
    const maxZ = Math.floor(pz + half - EPS);
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          const b = this.world.getBlock(x, y, z);
          if (isSolid(b)) return true;
        }
      }
    }
    return false;
  }

  inWaterAt(px, py, pz) {
    const half = PLAYER_WIDTH / 2;
    const checks = [
      [px, py + 0.2, pz],
      [px, py + PLAYER_HEIGHT * 0.5, pz],
      [px + half * 0.9, py + 0.6, pz + half * 0.9],
      [px - half * 0.9, py + 0.6, pz - half * 0.9],
    ];
    return checks.some(([x, y, z]) => this.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) === ID.WATER);
  }

  /**
   * Advance the simulation.
   * @param {number} dt seconds
   * @param {{forward:number, strafe:number, jump:boolean, sprint:boolean}} input
   */
  update(dt, input) {
    dt = Math.min(dt, 0.05); // never tunnel on a slow frame
    const wasInWater = this.inWater;
    this.inWater = this.inWaterAt(this.pos.x, this.pos.y + 0.1, this.pos.z);

    const f = this.forward();
    const r = this.right();
    let wishX = f.x * input.forward + r.x * input.strafe;
    let wishZ = f.z * input.forward + r.z * input.strafe;
    const len = Math.hypot(wishX, wishZ);
    if (len > 1) { wishX /= len; wishZ /= len; }

    let speed = this.flying ? this.flySpeed : input.sprint ? this.sprintSpeed : this.walkSpeed;
    if (this.inWater && !this.flying) speed *= 0.62;

    // Horizontal acceleration with ground / air friction.
    const accel = this.flying ? 14 : this.onGround ? 22 : this.inWater ? 8 : 8;
    const targetVX = wishX * speed;
    const targetVZ = wishZ * speed;
    const k = 1 - Math.exp(-accel * dt);
    this.vel.x += (targetVX - this.vel.x) * k;
    this.vel.z += (targetVZ - this.vel.z) * k;

    if (this.flying) {
      const vertical = (input.jump ? 1 : 0) - (input.down ? 1 : 0);
      this.vel.y += (vertical * this.flySpeed - this.vel.y) * (1 - Math.exp(-14 * dt));
    } else if (this.inWater) {
      this.vel.y -= this.gravity * 0.22 * dt;
      if (input.jump) this.vel.y = 4.2;
      this.vel.y = Math.max(this.vel.y, -4);
      this.vel.y *= 1 - 2.2 * dt;
    } else {
      this.vel.y -= this.gravity * dt;
      if (input.jump && this.onGround) {
        this.vel.y = this.jumpSpeed;
        this.onGround = false;
      }
      this.vel.y = Math.max(this.vel.y, -55);
    }

    this.moveAndCollide(dt);

    this.bob += Math.hypot(this.vel.x, this.vel.z) * dt * (this.onGround ? 2.2 : 0.6);
    const targetSmooth = this.onGround ? 0 : wasInWater || this.inWater ? 0.08 : 0.0;
    this.eyeSmooth += (targetSmooth - this.eyeSmooth) * Math.min(1, dt * 8);
    return this;
  }

  moveAndCollide(dt) {
    const { pos, vel } = this;
    // X axis
    let nx = pos.x + vel.x * dt;
    if (!this.collides(nx, pos.y, pos.z)) pos.x = nx;
    else {
      // Step up a single block when walking on the ground (nice-to-have).
      const stepY = this.onGround || this.inWater ? 1.02 : 0;
      if (stepY && !this.collides(nx, pos.y + stepY, pos.z) && !this.collides(pos.x, pos.y + stepY, pos.z)) {
        pos.y += stepY; pos.x = nx;
      } else vel.x = 0;
    }
    // Z axis
    let nz = pos.z + vel.z * dt;
    if (!this.collides(pos.x, pos.y, nz)) pos.z = nz;
    else {
      const stepY = this.onGround || this.inWater ? 1.02 : 0;
      if (stepY && !this.collides(pos.x, pos.y + stepY, nz) && !this.collides(pos.x, pos.y + stepY, pos.z)) {
        pos.y += stepY; pos.z = nz;
      } else vel.z = 0;
    }
    // Y axis
    let ny = pos.y + vel.y * dt;
    if (!this.collides(pos.x, ny, pos.z)) {
      pos.y = ny;
    } else {
      if (vel.y < 0) {
        // Move down in small steps until the feet touch a surface (handles
        // arbitrarily fast falls without tunnelling).
        const step = 0.04;
        let y = pos.y;
        while (y - step > ny && !this.collides(pos.x, y - step, pos.z)) y -= step;
        pos.y = y;
        this.onGround = true;
      } else {
        pos.y = Math.floor(pos.y + PLAYER_HEIGHT) - PLAYER_HEIGHT - EPS;
      }
      vel.y = 0;
    }
    // Ground probe just under the feet (also catches standing still on a surface).
    this.onGround = this.vel.y <= 0 && this.collides(pos.x, pos.y - 0.05, pos.z);
  }
}
