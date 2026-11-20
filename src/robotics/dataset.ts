import * as THREE from 'three';
import {
  computeForwardKinematics,
  quaternionToEulerDeg,
  solveInverseKinematics,
} from './kinematics';
import {
  AXIS6_ROBOT_CONFIG,
  DEFAULT_SCENE_OBJECTS,
  GRIPPER_DEFAULT_WIDTH_MM,
  HOME_JOINT_ANGLES_DEG,
} from './robotModel';
import type {
  ActionType,
  DemoFrame,
  DemoObjectSnapshot,
  Demonstration,
  JointTuple,
  QuatTuple,
  Vec3Tuple,
} from './types';

export const DEMO_STORAGE_KEY = 'axislab_robotics_demonstrations_v1';

export function createDemoFrame(params: {
  timestampMs: number;
  jointAnglesDeg: JointTuple;
  gripperWidthMm: number;
  isGrasping: boolean;
  graspedObjectId: string | null;
  objects: DemoObjectSnapshot[];
  action: ActionType;
}): DemoFrame {
  const fk = computeForwardKinematics(params.jointAnglesDeg, AXIS6_ROBOT_CONFIG);
  const eulerDeg = quaternionToEulerDeg(fk.tcpQuaternion);
  return {
    id: `frame_${Math.round(params.timestampMs)}_${Math.random().toString(36).slice(2, 7)}`,
    timestampMs: Math.round(params.timestampMs),
    jointAnglesDeg: [...params.jointAnglesDeg] as JointTuple,
    tcpPosition: [...fk.tcpPosition] as Vec3Tuple,
    tcpEulerDeg: [
      Number(eulerDeg[0].toFixed(2)),
      Number(eulerDeg[1].toFixed(2)),
      Number(eulerDeg[2].toFixed(2)),
    ],
    tcpQuaternion: [...fk.tcpQuaternion] as QuatTuple,
    gripperWidthMm: Number(params.gripperWidthMm.toFixed(1)),
    isGrasping: params.isGrasping,
    graspedObjectId: params.graspedObjectId,
    objects: params.objects.map((o) => ({
      id: o.id,
      position: [...o.position] as Vec3Tuple,
      quaternion: [...o.quaternion] as QuatTuple,
    })),
    action: params.action,
  };
}

export interface InterpolatedDemoState {
  jointAnglesDeg: JointTuple;
  gripperWidthMm: number;
  isGrasping: boolean;
  graspedObjectId: string | null;
  action: ActionType;
  frameIndex: number;
}

/**
 * Recorded prop poses at `timeMs`: positions lerped between the surrounding frames, rotations
 * normalized-lerped (fine at 20 Hz frame spacing). Props missing from either frame are skipped.
 */
export function interpolateObjectsAtTime(demo: Demonstration, timeMs: number): DemoObjectSnapshot[] {
  const frames = demo.frames;
  if (frames.length === 0) return [];
  let i = 0;
  while (i < frames.length - 1 && frames[i + 1].timestampMs <= timeMs) i++;
  const a = frames[i];
  const b = frames[Math.min(i + 1, frames.length - 1)];
  const t = b === a ? 0 : Math.min(1, Math.max(0, (timeMs - a.timestampMs) / Math.max(1, b.timestampMs - a.timestampMs)));
  return a.objects.flatMap((oa) => {
    const ob = b.objects.find((o) => o.id === oa.id) ?? oa;
    const sign = oa.quaternion.reduce((s, v, k) => s + v * ob.quaternion[k], 0) < 0 ? -1 : 1;
    const q = oa.quaternion.map((v, k) => v + (sign * ob.quaternion[k] - v) * t);
    const n = Math.hypot(...q) || 1;
    return [{
      id: oa.id,
      position: oa.position.map((v, k) => v + (ob.position[k] - v) * t) as Vec3Tuple,
      quaternion: q.map((v) => v / n) as QuatTuple,
    }];
  });
}

export function interpolateDemoAtTime(
  demo: Demonstration,
  timeMs: number,
): InterpolatedDemoState | null {
  const frames = demo.frames;
  if (frames.length === 0) return null;
  if (frames.length === 1 || timeMs <= frames[0].timestampMs) {
    const f = frames[0];
    return {
      jointAnglesDeg: [...f.jointAnglesDeg] as JointTuple,
      gripperWidthMm: f.gripperWidthMm,
      isGrasping: f.isGrasping,
      graspedObjectId: f.graspedObjectId,
      action: f.action,
      frameIndex: 0,
    };
  }
  const lastIdx = frames.length - 1;
  if (timeMs >= frames[lastIdx].timestampMs) {
    const f = frames[lastIdx];
    return {
      jointAnglesDeg: [...f.jointAnglesDeg] as JointTuple,
      gripperWidthMm: f.gripperWidthMm,
      isGrasping: f.isGrasping,
      graspedObjectId: f.graspedObjectId,
      action: f.action,
      frameIndex: lastIdx,
    };
  }

  // Find surrounding frames
  let idx = 0;
  for (let i = 0; i < lastIdx; i++) {
    if (frames[i + 1].timestampMs >= timeMs) {
      idx = i;
      break;
    }
  }
  const a = frames[idx];
  const b = frames[idx + 1];
  const span = Math.max(1, b.timestampMs - a.timestampMs);
  const t = THREE.MathUtils.clamp((timeMs - a.timestampMs) / span, 0, 1);

  const jointAnglesDeg: JointTuple = [
    THREE.MathUtils.lerp(a.jointAnglesDeg[0], b.jointAnglesDeg[0], t),
    THREE.MathUtils.lerp(a.jointAnglesDeg[1], b.jointAnglesDeg[1], t),
    THREE.MathUtils.lerp(a.jointAnglesDeg[2], b.jointAnglesDeg[2], t),
    THREE.MathUtils.lerp(a.jointAnglesDeg[3], b.jointAnglesDeg[3], t),
    THREE.MathUtils.lerp(a.jointAnglesDeg[4], b.jointAnglesDeg[4], t),
    THREE.MathUtils.lerp(a.jointAnglesDeg[5], b.jointAnglesDeg[5], t),
  ];

  const gripperWidthMm = THREE.MathUtils.lerp(a.gripperWidthMm, b.gripperWidthMm, t);
  const activeFrame = t < 0.5 ? a : b;

  return {
    jointAnglesDeg,
    gripperWidthMm,
    isGrasping: a.isGrasping && b.isGrasping ? true : activeFrame.isGrasping,
    graspedObjectId:
      a.graspedObjectId === b.graspedObjectId
        ? a.graspedObjectId
        : activeFrame.graspedObjectId,
    action: activeFrame.action,
    frameIndex: t < 0.5 ? idx : idx + 1,
  };
}

export function serializeDemoToJSON(demo: Demonstration): string {
  return JSON.stringify(
    {
      schema: 'axislab.demonstration.v1',
      robotModel: AXIS6_ROBOT_CONFIG.id,
      exportedAt: new Date().toISOString(),
      demonstration: demo,
    },
    null,
    2,
  );
}

function escapeCsvCell(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function serializeDemoToCSV(demo: Demonstration): string {
  const headers = [
    'timestamp_ms',
    'action',
    'j1_deg',
    'j2_deg',
    'j3_deg',
    'j4_deg',
    'j5_deg',
    'j6_deg',
    'ee_x_m',
    'ee_y_m',
    'ee_z_m',
    'ee_roll_deg',
    'ee_pitch_deg',
    'ee_yaw_deg',
    'gripper_width_mm',
    'gripper_is_grasping',
    'grasped_object_id',
    'objects_json',
  ];

  const rows = demo.frames.map((frame) => {
    const cells = [
      frame.timestampMs,
      frame.action,
      ...frame.jointAnglesDeg.map((a) => a.toFixed(3)),
      ...frame.tcpPosition.map((p) => p.toFixed(5)),
      ...frame.tcpEulerDeg.map((e) => e.toFixed(3)),
      frame.gripperWidthMm.toFixed(2),
      frame.isGrasping,
      frame.graspedObjectId ?? '',
      JSON.stringify(
        frame.objects.map((o) => ({
          id: o.id,
          pos: o.position.map((v) => Number(v.toFixed(4))),
        })),
      ),
    ];
    return cells.map(escapeCsvCell).join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

export function updateDemoTiming(demo: Demonstration): Demonstration {
  if (demo.frames.length === 0) {
    return { ...demo, durationMs: 0, updatedAt: new Date().toISOString() };
  }
  const sorted = [...demo.frames].sort((a, b) => a.timestampMs - b.timestampMs);
  const t0 = sorted[0].timestampMs;
  const normalized = sorted.map((f) => ({
    ...f,
    timestampMs: f.timestampMs - t0,
  }));
  const durationMs = normalized[normalized.length - 1].timestampMs;
  return {
    ...demo,
    frames: normalized,
    durationMs,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Generates a realistic, physically calibrated Pick & Place demonstration using the real IK solver
 * so the user can inspect, replay, modify, or export a working pick-and-place task right away.
 */
export function buildSamplePickAndPlaceDemo(): Demonstration {
  const homeFk = computeForwardKinematics(HOME_JOINT_ANGLES_DEG, AXIS6_ROBOT_CONFIG);
  const downQuat = homeFk.tcpQuaternion;

  const baseObjects: DemoObjectSnapshot[] = DEFAULT_SCENE_OBJECTS.map((obj) => ({
    id: obj.id,
    position: [...obj.initialPosition] as Vec3Tuple,
    quaternion: [...obj.initialQuaternion] as QuatTuple,
  }));

  const cubePos = DEFAULT_SCENE_OBJECTS.find((o) => o.id === 'cube_red')!.initialPosition;
  const binPos = DEFAULT_SCENE_OBJECTS.find((o) => o.id === 'bin_target')!.initialPosition;

  const waypoints: Array<{
    t: number;
    pos: Vec3Tuple | null;
    angles?: JointTuple;
    gripper: number;
    grasping: boolean;
    graspedId: string | null;
    action: ActionType;
  }> = [
    {
      t: 0,
      pos: null,
      angles: HOME_JOINT_ANGLES_DEG,
      gripper: GRIPPER_DEFAULT_WIDTH_MM,
      grasping: false,
      graspedId: null,
      action: 'Home',
    },
    {
      t: 900,
      pos: [cubePos[0], 0.19, cubePos[2]],
      gripper: 72,
      grasping: false,
      graspedId: null,
      action: 'Move Linear',
    },
    {
      t: 1700,
      pos: [cubePos[0], 0.036, cubePos[2]],
      gripper: 72,
      grasping: false,
      graspedId: null,
      action: 'Pick Object',
    },
    {
      t: 2300,
      pos: [cubePos[0], 0.036, cubePos[2]],
      gripper: 48,
      grasping: true,
      graspedId: 'cube_red',
      action: 'Close Gripper',
    },
    {
      t: 3100,
      pos: [cubePos[0], 0.24, cubePos[2]],
      gripper: 48,
      grasping: true,
      graspedId: 'cube_red',
      action: 'Move Object',
    },
    {
      t: 4300,
      pos: [binPos[0], 0.24, binPos[2]],
      gripper: 48,
      grasping: true,
      graspedId: 'cube_red',
      action: 'Move Object',
    },
    {
      t: 5100,
      pos: [binPos[0], 0.11, binPos[2]],
      gripper: 48,
      grasping: true,
      graspedId: 'cube_red',
      action: 'Place Object',
    },
    {
      t: 5700,
      pos: [binPos[0], 0.11, binPos[2]],
      gripper: 74,
      grasping: false,
      graspedId: null,
      action: 'Open Gripper',
    },
    {
      t: 6500,
      pos: [binPos[0], 0.24, binPos[2]],
      gripper: 74,
      grasping: false,
      graspedId: null,
      action: 'Move Linear',
    },
    {
      t: 7400,
      pos: null,
      angles: HOME_JOINT_ANGLES_DEG,
      gripper: GRIPPER_DEFAULT_WIDTH_MM,
      grasping: false,
      graspedId: null,
      action: 'Home',
    },
  ];

  let seed: JointTuple = [...HOME_JOINT_ANGLES_DEG] as JointTuple;
  const frames: DemoFrame[] = [];

  for (const wp of waypoints) {
    let angles: JointTuple;
    if (wp.angles) {
      angles = [...wp.angles] as JointTuple;
    } else if (wp.pos) {
      const ik = solveInverseKinematics(wp.pos, downQuat, seed, AXIS6_ROBOT_CONFIG, {
        maxIterations: 72,
      });
      angles = ik.anglesDeg;
    } else {
      angles = seed;
    }
    seed = angles;

    const fk = computeForwardKinematics(angles, AXIS6_ROBOT_CONFIG);
    const snapshotObjects = baseObjects.map((o) => {
      if (o.id === 'cube_red') {
        if (wp.grasping) {
          return {
            ...o,
            position: [...fk.tcpPosition] as Vec3Tuple,
            quaternion: [...fk.tcpQuaternion] as QuatTuple,
          };
        }
        if (wp.t >= 5700) {
          return {
            ...o,
            position: [binPos[0], 0.042, binPos[2]] as Vec3Tuple,
            quaternion: [0, 0, 0, 1] as QuatTuple,
          };
        }
      }
      return o;
    });

    frames.push(
      createDemoFrame({
        timestampMs: wp.t,
        jointAnglesDeg: angles,
        gripperWidthMm: wp.gripper,
        isGrasping: wp.grasping,
        graspedObjectId: wp.graspedId,
        objects: snapshotObjects,
        action: wp.action,
      }),
    );
  }

  return {
    id: 'demo_sample_pick_place',
    name: 'Pick & Place Red Cube',
    taskType: 'Pick Object',
    createdAt: '2026-11-17T12:00:00.000Z',
    updatedAt: '2026-11-17T12:00:00.000Z',
    durationMs: 7400,
    frames,
  };
}

/**
 * Generates a Bottle Flip Challenge demonstration: picks up the weighted bottle,
 * winds back, executes a fast wrist-pitch flick, and releases mid-arc.
 */
export function buildSampleBottleFlipDemo(): Demonstration {
  const homeFk = computeForwardKinematics(HOME_JOINT_ANGLES_DEG, AXIS6_ROBOT_CONFIG);
  const downQuat = homeFk.tcpQuaternion;

  const baseObjects: DemoObjectSnapshot[] = DEFAULT_SCENE_OBJECTS.map((obj) => ({
    id: obj.id,
    position: [...obj.initialPosition] as Vec3Tuple,
    quaternion: [...obj.initialQuaternion] as QuatTuple,
  }));

  const bottlePos = DEFAULT_SCENE_OBJECTS.find((o) => o.id === 'bottle_flip')!.initialPosition;
  const approachIk = solveInverseKinematics(
    [bottlePos[0], 0.22, bottlePos[2]],
    downQuat,
    HOME_JOINT_ANGLES_DEG,
    AXIS6_ROBOT_CONFIG,
    { maxIterations: 72 },
  );
  // TCP 0.098 m: palm underside (TCP + 30 mm) clears the 0.124 m bottle cap; at 0.088 it
  // crushed the bottle into the bench before the grasp.
  const graspIk = solveInverseKinematics(
    [bottlePos[0], 0.098, bottlePos[2]],
    downQuat,
    approachIk.anglesDeg,
    AXIS6_ROBOT_CONFIG,
    { maxIterations: 72 },
  );
  // Throw found by a headless Rapier search: an upward toss (release ~0.55 m, ~2.6 m/s up,
  // ~8.4 rad/s) that turns ~330 deg in the air and lands upright, with no gripper contact after
  // release and every joint within its rated speed. J2/J3/J5 share the pitch axis, so the flick
  // moves them together to sum their spin.
  const offset = (q: JointTuple, d2: number, d3: number, d5: number): JointTuple =>
    [q[0], q[1] + d2, q[2] + d3, q[3], q[4] + d5, q[5]];
  const grasp = graspIk.anglesDeg;
  const lift = offset(grasp, -41.7, -5.2, 31.3);
  const windup = offset(lift, 11.5, 53.5, 6.9);
  const flickDelta = [-32.5, -20.5, -44.4] as const;
  const flick = offset(windup, ...flickDelta);
  const flickMs = segmentMsWithinSpeedLimits(windup, flick, 1);
  // Release happens mid-segment while the arm keeps its flick velocity (23.5 ms past the flick
  // keyframe), then it decelerates at half speed instead of stopping dead under the bottle.
  const releaseMs = 2 * 23.5;
  const scaled = (k: number) => flickDelta.map((d) => d * k) as [number, number, number];
  const followThrough = offset(flick, ...scaled(releaseMs / flickMs));
  const slowDown = offset(followThrough, ...scaled(120 / flickMs));

  const keyframes: Array<{
    dt: number;
    angles: JointTuple;
    gripper: number;
    grasping: boolean;
    action: ActionType;
  }> = [
    { dt: 0, angles: HOME_JOINT_ANGLES_DEG, gripper: GRIPPER_DEFAULT_WIDTH_MM, grasping: false, action: 'Home' },
    { dt: 750, angles: approachIk.anglesDeg, gripper: 74, grasping: false, action: 'Move Linear' },
    { dt: 600, angles: grasp, gripper: 74, grasping: false, action: 'Pick Object' },
    { dt: 400, angles: grasp, gripper: 44, grasping: true, action: 'Close Gripper' },
    { dt: segmentMsWithinSpeedLimits(grasp, lift, 0.6), angles: lift, gripper: 44, grasping: true, action: 'Move Object' },
    { dt: segmentMsWithinSpeedLimits(lift, windup, 0.6), angles: windup, gripper: 44, grasping: true, action: 'Move Object' },
    { dt: flickMs, angles: flick, gripper: 44, grasping: true, action: 'Bottle Flip' },
    { dt: releaseMs, angles: followThrough, gripper: 76, grasping: false, action: 'Open Gripper' },
    { dt: 240, angles: slowDown, gripper: 76, grasping: false, action: 'Idle' },
    { dt: 1160, angles: slowDown, gripper: 76, grasping: false, action: 'Idle' },
    { dt: 900, angles: HOME_JOINT_ANGLES_DEG, gripper: GRIPPER_DEFAULT_WIDTH_MM, grasping: false, action: 'Home' },
  ];

  let t = 0;
  const frames = keyframes.map((kf) => {
    t += kf.dt;
    return createDemoFrame({
      timestampMs: Math.round(t),
      jointAnglesDeg: kf.angles,
      gripperWidthMm: kf.gripper,
      isGrasping: kf.grasping,
      graspedObjectId: kf.grasping ? 'bottle_flip' : null,
      objects: baseObjects,
      action: kf.action,
    });
  });

  return {
    id: 'demo_sample_bottle_flip',
    name: 'Bottle Flip Challenge',
    taskType: 'Bottle Flip',
    createdAt: '2026-11-17T22:00:00.000Z',
    updatedAt: BOTTLE_FLIP_SEED_VERSION,
    durationMs: frames[frames.length - 1].timestampMs,
    frames,
  };
}

/** Shortest segment time (ms, >= 60) in which no joint exceeds `speedFraction` of its rated speed. */
export function segmentMsWithinSpeedLimits(from: JointTuple, to: JointTuple, speedFraction: number): number {
  return Math.max(
    60,
    ...from.map(
      (q, i) =>
        (Math.abs(to[i] - q) / (AXIS6_ROBOT_CONFIG.joints[i].maxSpeedDegPerSec * speedFraction)) * 1000,
    ),
  );
}

const SEEDED_BOTTLE_KEY = 'axislab_seeded_bottle_v1';
const BOTTLE_FLIP_SEED_VERSION = '2026-11-20T00:00:00.000Z';

export function loadDemonstrationsFromStorage(): Demonstration[] {
  const defaults = () => [buildSampleBottleFlipDemo(), buildSamplePickAndPlaceDemo()];
  if (typeof window === 'undefined' || !window.localStorage) {
    return defaults();
  }
  try {
    const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) {
      const initial = defaults();
      window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(initial));
      window.localStorage.setItem(SEEDED_BOTTLE_KEY, '1');
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const initial = defaults();
      window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(initial));
      window.localStorage.setItem(SEEDED_BOTTLE_KEY, '1');
      return initial;
    }
    const demos = parsed as Demonstration[];
    // Upgrade an unedited copy of the old seeded flip (pre-physics-fix choreography that never
    // landed). Any edit stamps a new updatedAt, so user-modified copies are left alone.
    const stale = demos.findIndex(
      (d) => d.id === 'demo_sample_bottle_flip' && d.updatedAt === '2026-11-17T22:00:00.000Z',
    );
    if (stale >= 0) {
      demos[stale] = buildSampleBottleFlipDemo();
      window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(demos));
    }
    if (
      !window.localStorage.getItem(SEEDED_BOTTLE_KEY) &&
      !demos.some((d) => d.id === 'demo_sample_bottle_flip')
    ) {
      const withBottle = [buildSampleBottleFlipDemo(), ...demos];
      window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(withBottle));
      window.localStorage.setItem(SEEDED_BOTTLE_KEY, '1');
      return withBottle;
    }
    return demos;
  } catch {
    return defaults();
  }
}

export function saveDemonstrationsToStorage(demos: Demonstration[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(demos));
  } catch {
    // Ignore storage quota errors cleanly
  }
}
