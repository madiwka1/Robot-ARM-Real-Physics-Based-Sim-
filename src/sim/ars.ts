/**
 * Augmented Random Search (ARS V2-t, Mania et al. 2018): a linear policy with observation
 * normalization, trained by finite-difference random search. A standard MuJoCo baseline that is
 * small enough to run in a browser worker.
 */
import { createDemoFrame } from '../robotics/dataset';
import { getRobotModel } from '../robotics/robotModel';
import { BALANCE_BALL_ID } from './balance';
import type { ActionType, DemoFrame, Demonstration, Vec3Tuple } from '../robotics/types';
import {
  CONTROL_DT,
  gaussian,
  makeRng,
  NO_RANDOMIZATION,
  RobotArmEnv,
  type ActionMode,
  type DomainRandomization,
  type TaskId,
} from './env';

export interface ArsConfig {
  taskId: TaskId;
  actionMode: ActionMode;
  /** Robot model id (see ROBOT_MODELS). */
  robotId: string;
  iterations: number;
  /** Random directions sampled per iteration (N). */
  directions: number;
  /** Best directions used for the update (b <= N). */
  topDirections: number;
  /** Learning rate (alpha). */
  stepSize: number;
  /** Exploration noise std on the weights (nu). */
  explorationNoise: number;
  /** Episodes used to evaluate the current policy each iteration. */
  evalEpisodes: number;
  seed: number;
  randomization: DomainRandomization;
}

export const DEFAULT_ARS_CONFIG: Omit<ArsConfig, 'taskId' | 'randomization' | 'robotId'> = {
  actionMode: 'ee_delta',
  // Tuned on 'reach' (ee_delta): ~100% success at the best checkpoint within ~100 iterations
  iterations: 100,
  directions: 32,
  topDirections: 16,
  stepSize: 0.3,
  explorationNoise: 0.2,
  evalEpisodes: 8,
  seed: 1,
};

/** Serializable linear policy: action = clip(W * (obs - mean) / std, -1, 1). */
export interface LinearPolicy {
  schema: 'axislab.linear-policy.v1';
  taskId: TaskId;
  actionMode: ActionMode;
  robotId: string;
  obsSize: number;
  actionSize: number;
  /** Row-major actionSize x obsSize. */
  weights: number[];
  obsMean: number[];
  obsStd: number[];
}

export interface ArsProgress {
  iteration: number;
  meanReturn: number;
  successRate: number;
  episodes: number;
  elapsedMs: number;
  policy: LinearPolicy;
  /** Best checkpoint so far by eval return (ARS is noisy between iterations). */
  best: { iteration: number; meanReturn: number; successRate: number; policy: LinearPolicy };
}

export function createPolicy(env: RobotArmEnv): LinearPolicy {
  const { obsSize, actionSize } = env;
  return {
    schema: 'axislab.linear-policy.v1',
    taskId: env.task.id,
    robotId: env.robot.id,
    actionMode: env.actionMode,
    obsSize,
    actionSize,
    weights: new Array(obsSize * actionSize).fill(0),
    obsMean: new Array(obsSize).fill(0),
    obsStd: new Array(obsSize).fill(1),
  };
}

export function policyAct(p: LinearPolicy, obs: number[], weights = p.weights): number[] {
  const x = obs.map((v, j) => (v - p.obsMean[j]) / p.obsStd[j]);
  const action = new Array(p.actionSize);
  for (let i = 0; i < p.actionSize; i++) {
    let s = 0;
    for (let j = 0; j < p.obsSize; j++) s += weights[i * p.obsSize + j] * x[j];
    action[i] = Math.max(-1, Math.min(1, s));
  }
  return action;
}

/** Run one episode; `onStep` sees every step (used to record demos and normalization stats). */
export function rollout(
  env: RobotArmEnv,
  policy: LinearPolicy,
  seed: number,
  weights = policy.weights,
  onStep?: (obs: number[], action: number[]) => void,
): { return: number; success: boolean; steps: number } {
  let obs = env.reset(seed);
  let total = 0;
  let success = false;
  for (;;) {
    const action = policyAct(policy, obs, weights);
    onStep?.(obs, action);
    const r = env.step(action);
    total += r.reward;
    success ||= r.info.success;
    obs = r.obs;
    if (r.terminated || r.truncated) return { return: total, success, steps: r.info.step };
  }
}

/**
 * Roll a policy out once and record it as a regular Demonstration (one frame per control step),
 * so it replays in the viewer and exports through the existing JSON/CSV dataset pipeline.
 */
export function rolloutToDemonstration(
  policy: LinearPolicy,
  seed: number,
  randomization: DomainRandomization = NO_RANDOMIZATION,
  label = 'ARS policy',
): { demo: Demonstration; return: number; success: boolean } {
  const env = new RobotArmEnv(policy.taskId, randomization, policy.actionMode, getRobotModel(policy.robotId));
  try {
    const frames: DemoFrame[] = [];
    const snap = (step: number, action: ActionType) =>
      frames.push(
        createDemoFrame({
          timestampMs: step * CONTROL_DT * 1000,
          jointAnglesDeg: env.jointAnglesDeg,
          gripperWidthMm: env.gripperWidthMm,
          isGrasping: env.graspedObjectId !== null,
          graspedObjectId: env.graspedObjectId,
          // Balance only involves the ball; replaying the rest would move the viewer's bench props
          objects: env.physics
            .getObjectSnapshots()
            .filter((o) => env.task.tool !== 'plate' || o.id === BALANCE_BALL_ID),
          action,
        }),
      );
    let obs = env.reset(seed);
    snap(0, 'Home');
    let total = 0;
    let success = false;
    for (;;) {
      const wasGrasping = env.graspedObjectId !== null;
      const r = env.step(policyAct(policy, obs));
      total += r.reward;
      success ||= r.info.success;
      obs = r.obs;
      const grasping = env.graspedObjectId !== null;
      snap(
        r.info.step,
        grasping !== wasGrasping
          ? grasping ? 'Close Gripper' : 'Open Gripper'
          : grasping ? 'Move Object' : policy.actionMode === 'ee_delta' ? 'Move Linear' : 'Move Joint',
      );
      if (r.terminated || r.truncated) break;
    }
    const now = new Date().toISOString();
    const demo: Demonstration = {
      id: `demo_policy_${Date.now()}`,
      name: `${env.task.name} · ${label}${success ? ' ✓' : ''}`,
      ...(env.task.id === 'reach' ? { goal: [...env.goal] as Vec3Tuple } : {}),
      robotId: env.robot.id,
      experiment: env.task.tool === 'plate' ? 'balance' : 'workbench',
      replayObjects: true,
      taskType: env.task.name,
      createdAt: now,
      updatedAt: now,
      durationMs: frames[frames.length - 1].timestampMs,
      frames,
    };
    return { demo, return: total, success };
  } finally {
    env.dispose();
  }
}

/** Yields progress after every iteration; the caller can stop at any time. */
export function* trainArs(cfg: ArsConfig): Generator<ArsProgress> {
  const env = new RobotArmEnv(cfg.taskId, cfg.randomization, cfg.actionMode, getRobotModel(cfg.robotId));
  const policy = createPolicy(env);
  const rng = makeRng(cfg.seed);
  const n = policy.weights.length;
  const start = Date.now();
  let episodes = 0;
  let best: ArsProgress['best'] | null = null;

  // Running observation statistics (Welford) for ARS V2 state normalization
  let count = 0;
  const mean = new Array(policy.obsSize).fill(0);
  const m2 = new Array(policy.obsSize).fill(0);
  const record = (obs: number[]) => {
    count++;
    obs.forEach((v, j) => {
      const d = v - mean[j];
      mean[j] += d / count;
      m2[j] += d * (v - mean[j]);
    });
  };

  try {
    for (let it = 1; it <= cfg.iterations; it++) {
      const results: Array<{ delta: number[]; plus: number; minus: number }> = [];
      for (let k = 0; k < cfg.directions; k++) {
        const delta = Array.from({ length: n }, () => gaussian(rng));
        const seed = Math.floor(rng() * 2 ** 31); // same episode for +/- (common random numbers)
        const w = (sign: number) => policy.weights.map((v, i) => v + sign * cfg.explorationNoise * delta[i]);
        const plus = rollout(env, policy, seed, w(1), record).return;
        const minus = rollout(env, policy, seed, w(-1), record).return;
        episodes += 2;
        results.push({ delta, plus, minus });
      }

      // Update with the top-b directions, scaled by the std of their returns
      results.sort((a, b) => Math.max(b.plus, b.minus) - Math.max(a.plus, a.minus));
      const top = results.slice(0, Math.min(cfg.topDirections, results.length));
      const returns = top.flatMap((r) => [r.plus, r.minus]);
      const mu = returns.reduce((s, v) => s + v, 0) / returns.length;
      const sigma = Math.sqrt(returns.reduce((s, v) => s + (v - mu) ** 2, 0) / returns.length) || 1;
      for (const r of top) {
        const scale = (cfg.stepSize / (top.length * sigma)) * (r.plus - r.minus);
        for (let i = 0; i < n; i++) policy.weights[i] += scale * r.delta[i];
      }
      policy.obsMean = [...mean];
      // Floor the std: near-constant inputs (e.g. J4/J6 held still by IK) would otherwise have
      // their numerical noise amplified ~10^4x and swamp the policy.
      policy.obsStd = m2.map((v) => Math.max(0.01, Math.sqrt(v / Math.max(1, count))));

      // Evaluate the updated policy on fixed seeds so the learning curve is comparable
      let total = 0;
      let successes = 0;
      for (let e = 0; e < cfg.evalEpisodes; e++) {
        const r = rollout(env, policy, 1_000_000 + e);
        total += r.return;
        if (r.success) successes++;
      }
      episodes += cfg.evalEpisodes;

      const snapshot = { ...policy, weights: [...policy.weights], obsMean: [...policy.obsMean], obsStd: [...policy.obsStd] };
      const meanReturn = total / cfg.evalEpisodes;
      const successRate = successes / cfg.evalEpisodes;
      if (!best || meanReturn > best.meanReturn) best = { iteration: it, meanReturn, successRate, policy: snapshot };
      yield { iteration: it, meanReturn, successRate, episodes, elapsedMs: Date.now() - start, policy: snapshot, best };
    }
  } finally {
    env.dispose();
  }
}
