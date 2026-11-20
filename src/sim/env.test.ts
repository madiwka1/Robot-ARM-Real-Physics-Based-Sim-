import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureRapierInitialized } from '../physics/rapierWorld';
import { createPolicy, DEFAULT_ARS_CONFIG, rolloutToDemonstration, trainArs } from './ars';
import { DEFAULT_RANDOMIZATION, NO_RANDOMIZATION, RobotArmEnv } from './env';
import { ROBOT_MODELS } from '../robotics/robotModel';

test('env is deterministic for a seed, with and without domain randomization', async () => {
  await ensureRapierInitialized();
  for (const dr of [NO_RANDOMIZATION, DEFAULT_RANDOMIZATION]) {
    const run = () => {
      const env = new RobotArmEnv('pick_lift', dr);
      const out = [env.reset(42)];
      for (let i = 0; i < 20; i++) out.push(env.step([Math.sin(i), Math.cos(i), -0.5, i % 2 ? 1 : -1]).obs);
      env.dispose();
      return out;
    };
    assert.deepEqual(run(), run());
  }
});

test('reach env is solvable: a proportional controller succeeds', async () => {
  await ensureRapierInitialized();
  const env = new RobotArmEnv('reach');
  assert.equal(env.reset(1).length, env.obsSize);
  for (let seed = 0; seed < 5; seed++) {
    let obs = env.reset(seed);
    let success = false;
    for (let i = 0; i < env.task.episodeSteps; i++) {
      const r = env.step([...obs.slice(15, 18).map((v) => 10 * v), 1]); // goal - TCP
      success ||= r.info.success;
      obs = r.obs;
    }
    assert.ok(success, `seed ${seed} goal ${env.goal} tcp ${env.tcpPosition}`);
  }
  env.dispose();
});

test('balance task is solvable on every robot by linear state feedback', async () => {
  await ensureRapierInitialized();
  for (const robot of ROBOT_MODELS) {
    const env = new RobotArmEnv('balance', NO_RANDOMIZATION, 'ee_delta', robot);
    assert.equal(env.obsSize, 10);
    assert.equal(env.actionSize, 2);
    for (let seed = 0; seed < 3; seed++) {
      let o = env.reset(seed);
      let success = false;
      for (;;) {
        // Poles at -3 rad/s for x'' = c*tilt, tilt' = 1.05*a (see TASKS.balance)
        const r = env.step([-(4.5 * o[6] + 3.67 * o[3] + 0.367 * o[0]), -(4.5 * o[7] + 3.67 * o[5] + 0.367 * o[2])]);
        o = r.obs;
        if (r.terminated || r.truncated) {
          success = r.info.success;
          break;
        }
      }
      assert.ok(success, `${robot.id} seed ${seed}: ball fell`);
    }
    // ...while doing nothing lets the ball roll off the tilted plate
    let o = env.reset(0);
    let fell = false;
    for (let i = 0; i < 200 && !fell; i++) fell = env.step([0, 0]).terminated;
    assert.ok(fell, `${robot.id}: passive plate should not balance`);
    void o;
    env.dispose();
  }
});

test('ARS learns to balance the ball', async () => {
  await ensureRapierInitialized();
  let best = 0;
  for (const p of trainArs({ ...DEFAULT_ARS_CONFIG, taskId: 'balance', robotId: 'so-101', iterations: 10, randomization: NO_RANDOMIZATION })) {
    best = p.best.successRate;
  }
  assert.ok(best >= 0.75, `best success ${best}`);
});

test('ARS improves the reach policy and rollouts export as demonstrations', async () => {
  await ensureRapierInitialized();
  let first = 0;
  let last: ReturnType<typeof trainArs> extends Generator<infer P> ? P : never = null!;
  for (const p of trainArs({ ...DEFAULT_ARS_CONFIG, taskId: 'reach', robotId: 'axis-6r-lab', iterations: 12, randomization: NO_RANDOMIZATION })) {
    if (p.iteration === 1) first = p.meanReturn;
    last = p;
  }
  assert.ok(last.best.meanReturn > first + 3, `best ${last.best.meanReturn} vs first ${first}`);

  const { demo } = rolloutToDemonstration(last.best.policy, 7);
  const env = new RobotArmEnv('reach');
  assert.equal(demo.frames.length, env.task.episodeSteps + 1);
  assert.equal(demo.durationMs, env.task.episodeSteps * 50);
  assert.equal(createPolicy(env).weights.length, env.obsSize * env.actionSize);
  env.dispose();
});
