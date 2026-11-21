// Headless smoke-test for the gameplay simulation.
// Run: node turball/tests/sim.mjs
import { FIELD, Car, Ball, collideCarBall, collideCars, computeAIInput, assignRoles, BOOST_PADS } from '../src/engine.js';

const dt = 1 / 120;
const ball = new Ball();
const cars = [
  new Car('blue', false, 0.9),
  new Car('blue', true, 0.85),
  new Car('orange', true, 0.8),
  new Car('orange', true, 0.8),
];
cars[0].reset(-6, -26, Math.PI);
cars[1].reset(6, -26, Math.PI);
cars[2].reset(6, 26, 0);
cars[3].reset(-6, 26, 0);
ball.reset();

const pads = BOOST_PADS.map((p) => ({ ...p, timer: 0 }));
let goals = { blue: 0, orange: 0 };
const touches = { blue: 0, orange: 0 };
let maxBall = 0;
let bad = false;
const seen = new Set();

for (let step = 0; step < 120 * 120; step++) {
  assignRoles(cars.filter((c) => c.team === 'blue'), ball);
  assignRoles(cars.filter((c) => c.team === 'orange'), ball);
  for (const car of cars) {
    const input = computeAIInput(car, ball, cars, dt);
    car.step(dt, input);
    // sanity: no NaN, stays inside the arena
    if (!Number.isFinite(car.pos.x + car.pos.y + car.pos.z + car.yaw)) { console.error('nan car', step); bad = true; }
    if (Math.abs(car.pos.x) > FIELD.halfW || Math.abs(car.pos.z) > FIELD.halfL || car.pos.y < 0 || car.pos.y > FIELD.height) {
      console.error('car out', car.team, car.pos.toArray().map((v) => v.toFixed(2)).join(','), 'step', step);
      bad = true;
    }
  }
  collideCars(cars);
  for (const car of cars) {
    const before = ball.lastTouchTeam;
    const hit = collideCarBall(car, ball);
    if (hit > 3 && before !== car.team) touches[car.team]++;
  }
  const goal = ball.step(dt);
  if (!Number.isFinite(ball.pos.x + ball.pos.y + ball.pos.z)) { console.error('nan ball', step); bad = true; }
  if (Math.abs(ball.pos.x) > FIELD.halfW + 1 || Math.abs(ball.pos.z) > FIELD.halfL + FIELD.goalDepth + 1) {
    console.error('ball out', ball.pos.toArray().map((v) => v.toFixed(2)).join(','), 'step', step);
    bad = true;
  }
  maxBall = Math.max(maxBall, ball.vel.length());
  seen.add(`${Math.round(ball.pos.x / 8)},${Math.round(ball.pos.z / 8)}`);

  for (const pad of pads) {
    if (pad.timer > 0) pad.timer -= dt;
    for (const car of cars) {
      const d = Math.hypot(car.pos.x - pad.x, car.pos.z - pad.z);
      if (pad.timer <= 0 && d < 3 && car.pos.y < 3) {
        car.boost = Math.min(100, car.boost + (pad.big ? 100 : 14));
        pad.timer = pad.big ? 9 : 4;
      }
    }
  }

  if (goal) {
    goals[goal]++;
    ball.reset();
    cars[0].reset(-6, -26, Math.PI);
    cars[1].reset(6, -26, Math.PI);
    cars[2].reset(6, 26, 0);
    cars[3].reset(-6, 26, 0);
  }
}

console.log('goals', goals, 'touches', touches, 'maxBallSpeed', maxBall.toFixed(1), 'cells', seen.size);
console.log('boost', cars.map((c) => c.boost.toFixed(0)).join(' '));
if (bad) {
  console.error('FAIL: simulation produced invalid state');
  process.exit(1);
}
if (goals.blue + goals.orange < 1) {
  console.error('FAIL: bots never score in 120s');
  process.exit(1);
}
console.log('OK: simulation stable, bots score');

