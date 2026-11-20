import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { DEFAULT_SCENE_OBJECTS } from '../robotics/robotModel';
import type {
  DemoObjectSnapshot,
  QuatTuple,
  SceneObjectRuntimeState,
  SceneObjectSpec,
  Vec3Tuple,
} from '../robotics/types';

let rapierInitPromise: Promise<typeof RAPIER> | null = null;

export function ensureRapierInitialized(): Promise<typeof RAPIER> {
  if (!rapierInitPromise) {
    rapierInitPromise = RAPIER.init().then(() => RAPIER);
  }
  return rapierInitPromise;
}

// Weighted two-section bottle (local Y up): heavy liquid ballast bottom + lighter neck.
const BOTTLE_PARTS = [
  { y: -0.036, halfHeight: 0.026, radiusScale: 1, massFraction: 0.8, friction: 0.95 },
  { y: 0.026, halfHeight: 0.036, radiusScale: 0.85, massFraction: 0.2, friction: 0.75 },
] as const;

// Fixed physics substep: Rapier is most stable/deterministic with small constant timesteps.
export const PHYSICS_SUBSTEP_SEC = 1 / 120;
const MAX_FRAME_SEC = 0.1;
const MAX_RELEASE_LIN_SPEED = 3.6;
const MAX_RELEASE_ANG_SPEED = 16;

export const PLATE_HALF_THICKNESS_M = 0.004;
/** Rotates the plate's cylinder axis (local +Y) onto the TCP's local -X axis. */
const PLATE_ALIGN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);

/** Extent of a cylinder (local Y axis) along world up, given up's local Y component. */
function cylinderExtent(halfHeight: number, radius: number, upY: number): number {
  return halfHeight * Math.abs(upY) + radius * Math.sqrt(Math.max(0, 1 - upY * upY));
}

interface ManagedDynamicObject {
  spec: SceneObjectSpec;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  isGrasped: boolean;
  graspLocalOffset: THREE.Vector3;
  graspLocalQuat: THREE.Quaternion;
}

export class RoboticsPhysicsWorld {
  public readonly world: RAPIER.World;
  private objects = new Map<string, ManagedDynamicObject>();
  private leftFingerBody: RAPIER.RigidBody;
  private rightFingerBody: RAPIER.RigidBody;
  private palmBody: RAPIER.RigidBody;
  private graspedId: string | null = null;

  // Scratch math objects to keep step() allocation-free
  private readonly _tcpPos = new THREE.Vector3();
  private readonly _tcpQuat = new THREE.Quaternion();
  private readonly _invTcpQuat = new THREE.Quaternion();
  private readonly _objPos = new THREE.Vector3();
  private readonly _objQuat = new THREE.Quaternion();
  private readonly _localPos = new THREE.Vector3();
  private readonly _targetWorldPos = new THREE.Vector3();
  private readonly _targetWorldQuat = new THREE.Quaternion();
  private readonly _fingerOffset = new THREE.Vector3();
  private readonly _up = new THREE.Vector3();
  private readonly _deltaQuat = new THREE.Quaternion();

  // Kinematic bodies (palm, fingers, grasped object) are interpolated across physics substeps
  private readonly kinematicBodies: RAPIER.RigidBody[] = [];
  private accumulator = 0;
  private draggedId: string | null = null;
  private plateBody: RAPIER.RigidBody | null = null;
  private readonly baseMaterial = new Map<number, { mass: number; friction: number }>();
  private readonly _kinStartPos = [0, 1, 2, 3, 4].map(() => new THREE.Vector3());
  private readonly _kinStartQuat = [0, 1, 2, 3, 4].map(() => new THREE.Quaternion());
  private readonly _kinEndPos = [0, 1, 2, 3, 4].map(() => new THREE.Vector3());
  private readonly _kinEndQuat = [0, 1, 2, 3, 4].map(() => new THREE.Quaternion());

  // Grasped-object velocity over the last physics frame, applied on release (throwing / flipping)
  private readonly _trackedLinVel = new THREE.Vector3();
  private readonly _trackedAngVel = new THREE.Vector3();

  constructor(objectSpecs: SceneObjectSpec[] = DEFAULT_SCENE_OBJECTS) {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    // Props are ~5 cm, not human-sized: scales contact tolerance (stops ~1 mm sinking) and sleep thresholds.
    this.world.lengthUnit = 0.1;

    // Workbench static table surface (top face at y = 0.0)
    const benchBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0.32, -0.025, 0));
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.85, 0.025, 0.62).setFriction(0.9).setRestitution(0.05),
      benchBody,
    );

    // Safety floor below workbench so fallen items do not fall infinitely
    const floorBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.82, 0));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(4, 0.05, 4), floorBody);

    // Robot pedestal + J1 turret (axisymmetric about the yaw axis, so static regardless of J1),
    // matching RobotArmMesh base flange and column. Props used to pass through the robot base.
    // ponytail: arm links J2-J6 still have no colliders; add per-link kinematic capsules if needed.
    const robotBase = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.world.createCollider(
      RAPIER.ColliderDesc.cylinder(0.012, 0.142).setTranslation(0, 0.012, 0).setFriction(0.6),
      robotBase,
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cylinder(0.1325, 0.1).setTranslation(0, 0.1325, 0).setFriction(0.6),
      robotBase,
    );

    // Create kinematic colliders for the parallel-jaw gripper
    this.palmBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0.45, 0.4, 0),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.038, 0.018, 0.022).setFriction(0.9),
      this.palmBody,
    );

    this.leftFingerBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0.45, 0.35, 0),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.006, 0.026, 0.013).setFriction(1.0),
      this.leftFingerBody,
    );

    this.rightFingerBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0.45, 0.35, 0),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.006, 0.026, 0.013).setFriction(1.0),
      this.rightFingerBody,
    );

    // Build scene objects
    for (const spec of objectSpecs) {
      if (spec.kind === 'container') {
        this.createStaticContainer(spec);
      } else {
        this.createDynamicObject(spec);
      }
    }
  }

  private createStaticContainer(spec: SceneObjectSpec): void {
    const [cx, , cz] = spec.initialPosition;
    const [w, h, d] = spec.dimensions;
    const wallThick = 0.01;
    const floorThick = 0.008;

    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(cx, 0, cz),
    );

    // Bottom plate
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(w / 2, floorThick / 2, d / 2)
        .setTranslation(0, floorThick / 2, 0)
        .setFriction(0.9),
      body,
    );
    // +X wall
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(wallThick / 2, h / 2, d / 2)
        .setTranslation(w / 2 - wallThick / 2, h / 2, 0)
        .setFriction(0.8),
      body,
    );
    // -X wall
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(wallThick / 2, h / 2, d / 2)
        .setTranslation(-w / 2 + wallThick / 2, h / 2, 0)
        .setFriction(0.8),
      body,
    );
    // +Z wall
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(w / 2, h / 2, wallThick / 2)
        .setTranslation(0, h / 2, d / 2 - wallThick / 2)
        .setFriction(0.8),
      body,
    );
    // -Z wall
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(w / 2, h / 2, wallThick / 2)
        .setTranslation(0, h / 2, -d / 2 + wallThick / 2)
        .setFriction(0.8),
      body,
    );
  }

  private createDynamicObject(spec: SceneObjectSpec): void {
    const [px, py, pz] = spec.initialPosition;
    const [qx, qy, qz, qw] = spec.initialQuaternion;

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(px, py, pz)
      .setRotation({ x: qx, y: qy, z: qz, w: qw })
      // Small objects in still air: drag is tiny, so keep damping near zero (was 0.45/0.65,
      // which bled ~40% of a thrown bottle's spin per second).
      .setLinearDamping(0.02)
      .setAngularDamping(0.1)
      // Thrown props reach 3.6 m/s; CCD stops them tunnelling through the 8-10 mm tray walls.
      .setCcdEnabled(true)
      .setCanSleep(true);

    const body = this.world.createRigidBody(bodyDesc);

    if (spec.kind === 'bottle') {
      const r = spec.dimensions[0];
      const [collider] = BOTTLE_PARTS.map((p) =>
        this.world.createCollider(
          RAPIER.ColliderDesc.cylinder(p.halfHeight, r * p.radiusScale)
            .setTranslation(0, p.y, 0)
            .setMass(spec.mass * p.massFraction)
            .setFriction(p.friction)
            .setRestitution(0.05),
          body,
        ),
      );

      this.objects.set(spec.id, {
        spec,
        body,
        collider,
        isGrasped: false,
        graspLocalOffset: new THREE.Vector3(),
        graspLocalQuat: new THREE.Quaternion(),
      });
      return;
    }

    let colliderDesc: RAPIER.ColliderDesc;
    if (spec.kind === 'cylinder') {
      colliderDesc = RAPIER.ColliderDesc.cylinder(spec.dimensions[1] / 2, spec.dimensions[0]);
    } else if (spec.kind === 'sphere') {
      colliderDesc = RAPIER.ColliderDesc.ball(spec.dimensions[0]);
    } else {
      colliderDesc = RAPIER.ColliderDesc.cuboid(
        spec.dimensions[0] / 2,
        spec.dimensions[1] / 2,
        spec.dimensions[2] / 2,
      );
    }

    colliderDesc
      .setMass(spec.mass)
      .setFriction(0.9)
      .setRestitution(0.1);

    const collider = this.world.createCollider(colliderDesc, body);

    this.objects.set(spec.id, {
      spec,
      body,
      collider,
      isGrasped: false,
      graspLocalOffset: new THREE.Vector3(),
      graspLocalQuat: new THREE.Quaternion(),
    });
  }

  public getObjectWidthMm(spec: SceneObjectSpec): number {
    if (spec.kind === 'cylinder' || spec.kind === 'sphere' || spec.kind === 'bottle') {
      return spec.dimensions[0] * 2 * 1000;
    }
    return Math.min(spec.dimensions[0], spec.dimensions[2]) * 1000;
  }

  /** How far the object's lowest point sits below its center at orientation `quat` (meters). */
  private depthBelowCenter(spec: SceneObjectSpec, quat: THREE.Quaternion): number {
    // World up expressed in the object's local frame
    const up = this._up.set(0, 1, 0).applyQuaternion(this._deltaQuat.copy(quat).invert());
    const [a, b, c] = spec.dimensions;
    if (spec.kind === 'sphere') return a;
    if (spec.kind === 'cylinder') return cylinderExtent(b / 2, a, up.y);
    if (spec.kind === 'bottle') {
      return Math.max(
        ...BOTTLE_PARTS.map((p) => cylinderExtent(p.halfHeight, a * p.radiusScale, up.y) - p.y * up.y),
      );
    }
    return (a / 2) * Math.abs(up.x) + (b / 2) * Math.abs(up.y) + (c / 2) * Math.abs(up.z);
  }

  /**
   * Swap the end effector: a round plate (balance experiment) instead of the parallel gripper.
   * The plate's normal is the TCP's local -X axis, so with the tool pointing horizontally the
   * plate faces up; wrist flex (J5) then tilts it fore/aft and wrist roll (J6) side to side.
   * Pass null to go back to the gripper.
   */
  public setPlateTool(radiusM: number | null): void {
    if (this.plateBody) {
      this.world.removeRigidBody(this.plateBody);
      this.plateBody = null;
    }
    if (radiusM === null) return;
    this.releaseGrasp();
    this.plateBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -5, 0));
    this.world.createCollider(
      RAPIER.ColliderDesc.cylinder(PLATE_HALF_THICKNESS_M, radiusM).setFriction(0.6).setRestitution(0.15),
      this.plateBody,
    );
  }

  public get hasPlateTool(): boolean {
    return this.plateBody !== null;
  }

  /** World pose of the plate tool (for rendering), or null in gripper mode. */
  public getPlatePose(): { position: Vec3Tuple; quaternion: QuatTuple } | null {
    if (!this.plateBody) return null;
    const t = this.plateBody.translation();
    const r = this.plateBody.rotation();
    return { position: [t.x, t.y, t.z], quaternion: [r.x, r.y, r.z, r.w] };
  }

  /** Teleport a prop (replaying recorded poses); velocities are zeroed. */
  public setObjectPose(id: string, position: Vec3Tuple, quaternion: QuatTuple): void {
    const item = this.objects.get(id);
    if (!item || item.isGrasped) return;
    item.body.setTranslation({ x: position[0], y: position[1], z: position[2] }, true);
    item.body.setRotation({ x: quaternion[0], y: quaternion[1], z: quaternion[2], w: quaternion[3] }, true);
    item.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    item.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  public getObjectVelocity(id: string): Vec3Tuple {
    const v = this.objects.get(id)?.body.linvel();
    return v ? [v.x, v.y, v.z] : [0, 0, 0];
  }

  /**
   * Pose the end-effector bodies from the TCP. `teleport` jumps there immediately (episode
   * resets) instead of sweeping through the scene during the next physics step.
   */
  public updateGripperPose(
    tcpPosition: Vec3Tuple,
    tcpQuaternion: QuatTuple,
    gripperWidthMm: number,
    teleport = false,
  ): void {
    this.poseEndEffector(tcpPosition, tcpQuaternion, gripperWidthMm);
    if (teleport) {
      for (const b of [this.palmBody, this.leftFingerBody, this.rightFingerBody, this.plateBody]) {
        if (!b) continue;
        b.setTranslation(b.nextTranslation(), true);
        b.setRotation(b.nextRotation(), true);
      }
    }
  }

  private poseEndEffector(
    tcpPosition: Vec3Tuple,
    tcpQuaternion: QuatTuple,
    gripperWidthMm: number,
  ): void {
    this._tcpPos.set(...tcpPosition);
    this._tcpQuat.set(...tcpQuaternion).normalize();

    if (this.plateBody) {
      // Plate centered on the TCP; park the unused gripper colliders far below the floor
      this.plateBody.setNextKinematicTranslation(this._tcpPos);
      this.plateBody.setNextKinematicRotation(this._targetWorldQuat.copy(this._tcpQuat).multiply(PLATE_ALIGN));
      for (const b of [this.palmBody, this.leftFingerBody, this.rightFingerBody]) {
        b.setNextKinematicTranslation({ x: 0, y: -5, z: 0 });
      }
      return;
    }

    const halfWidthM = (gripperWidthMm / 1000) * 0.5 + 0.006;

    // Palm sits slightly behind TCP along -Y in TCP frame
    this._fingerOffset.set(0, -0.048, 0).applyQuaternion(this._tcpQuat).add(this._tcpPos);
    this.palmBody.setNextKinematicTranslation({
      x: this._fingerOffset.x,
      y: this._fingerOffset.y,
      z: this._fingerOffset.z,
    });
    this.palmBody.setNextKinematicRotation({
      x: this._tcpQuat.x,
      y: this._tcpQuat.y,
      z: this._tcpQuat.z,
      w: this._tcpQuat.w,
    });

    // Left finger (-X in TCP local frame)
    this._fingerOffset.set(-halfWidthM, -0.004, 0).applyQuaternion(this._tcpQuat).add(this._tcpPos);
    this.leftFingerBody.setNextKinematicTranslation({
      x: this._fingerOffset.x,
      y: this._fingerOffset.y,
      z: this._fingerOffset.z,
    });
    this.leftFingerBody.setNextKinematicRotation({
      x: this._tcpQuat.x,
      y: this._tcpQuat.y,
      z: this._tcpQuat.z,
      w: this._tcpQuat.w,
    });

    // Right finger (+X in TCP local frame)
    this._fingerOffset.set(halfWidthM, -0.004, 0).applyQuaternion(this._tcpQuat).add(this._tcpPos);
    this.rightFingerBody.setNextKinematicTranslation({
      x: this._fingerOffset.x,
      y: this._fingerOffset.y,
      z: this._fingerOffset.z,
    });
    this.rightFingerBody.setNextKinematicRotation({
      x: this._tcpQuat.x,
      y: this._tcpQuat.y,
      z: this._tcpQuat.z,
      w: this._tcpQuat.w,
    });

    // Carry the grasped object rigidly with the TCP (release velocity is measured in step())
    const item = this.graspedId ? this.objects.get(this.graspedId) : undefined;
    if (item && item.isGrasped) {
      this._targetWorldPos.copy(item.graspLocalOffset).applyQuaternion(this._tcpQuat).add(this._tcpPos);
      this._targetWorldQuat.copy(this._tcpQuat).multiply(item.graspLocalQuat).normalize();
      // Kinematic bodies ignore the static bench, so keep the object's lowest point above it
      this._targetWorldPos.y = Math.max(
        this.depthBelowCenter(item.spec, this._targetWorldQuat),
        this._targetWorldPos.y,
      );
      item.body.setNextKinematicTranslation(this._targetWorldPos);
      item.body.setNextKinematicRotation(this._targetWorldQuat);
    }
  }

  /**
   * Collision-aware grasp check: if gripper is closed enough around a nearby graspable object,
   * attaches it cleanly to the TCP so it moves with the robotic arm.
   */
  public evaluateGrasp(
    tcpPosition: Vec3Tuple,
    tcpQuaternion: QuatTuple,
    gripperWidthMm: number,
    targetGripperWidthMm: number,
    forcedObjectId?: string | null,
  ): { isGrasping: boolean; graspedObjectId: string | null; effectiveWidthMm: number } {
    // The plate tool has no jaws
    if (this.plateBody) return { isGrasping: false, graspedObjectId: null, effectiveWidthMm: gripperWidthMm };
    this._tcpPos.set(...tcpPosition);
    this._tcpQuat.set(...tcpQuaternion).normalize();
    this._invTcpQuat.copy(this._tcpQuat).invert();

    // If currently grasping, check if gripper opened beyond release threshold
    if (this.graspedId) {
      const current = this.objects.get(this.graspedId);
      if (!current) {
        this.graspedId = null;
        return { isGrasping: false, graspedObjectId: null, effectiveWidthMm: gripperWidthMm };
      }
      const objWidthMm = this.getObjectWidthMm(current.spec);
      const shouldRelease =
        forcedObjectId === null || targetGripperWidthMm > objWidthMm + 10;

      if (shouldRelease) {
        this.releaseGrasp();
        return { isGrasping: false, graspedObjectId: null, effectiveWidthMm: gripperWidthMm };
      }
      return {
        isGrasping: true,
        graspedObjectId: this.graspedId,
        // Jaws stop at the object surface; overlapping it caused a depenetration kick on release
        effectiveWidthMm: Math.max(gripperWidthMm, objWidthMm),
      };
    }

    // Attempt new grasp when gripper is closing below threshold (or forced during replay)
    const isClosing = targetGripperWidthMm <= 54 || Boolean(forcedObjectId);
    if (!isClosing) {
      return { isGrasping: false, graspedObjectId: null, effectiveWidthMm: gripperWidthMm };
    }

    let bestCandidate: ManagedDynamicObject | null = null;
    let bestDist = Infinity;

    for (const item of this.objects.values()) {
      if (!item.spec.graspable || item.spec.id === this.draggedId) continue;
      if (forcedObjectId && item.spec.id !== forcedObjectId) continue;

      const t = item.body.translation();
      this._objPos.set(t.x, t.y, t.z);
      this._localPos.copy(this._objPos).sub(this._tcpPos).applyQuaternion(this._invTcpQuat);

      const objWidthMm = this.getObjectWidthMm(item.spec);
      const dist = this._localPos.length();
      // The object must actually sit between the jaws: jaw opening near its width (closing onto
      // it, not already shut) and centered so its sides fit inside the gap (6 mm compliance).
      // Previously any opening <= width + 14 mm counted, so fully closed jaws "grasped" a cube
      // just by touching it and teleported it into the hand.
      const gapSlackM = (gripperWidthMm - objWidthMm) / 2000 + 0.006;
      const betweenJaws =
        gripperWidthMm >= objWidthMm - 4 &&
        gripperWidthMm <= objWidthMm + 14 &&
        Math.abs(this._localPos.x) <= gapSlackM &&
        Math.abs(this._localPos.y) < 0.05 &&
        Math.abs(this._localPos.z) < 0.042;

      const closeEnoughForForced = forcedObjectId === item.spec.id && dist < 0.085;

      if (betweenJaws || closeEnoughForForced) {
        if (dist < bestDist) {
          bestDist = dist;
          bestCandidate = item;
        }
      }
    }

    if (bestCandidate) {
      const t = bestCandidate.body.translation();
      const r = bestCandidate.body.rotation();
      this._objPos.set(t.x, t.y, t.z);
      this._objQuat.set(r.x, r.y, r.z, r.w);

      // Relative offset in TCP frame. Closing jaws center the object along the jaw (X) axis; along
      // Y/Z it stays where it was held (was clamped to +-15/12 mm, visibly teleporting the object).
      // Only replay-forced grasps from outside the pinch zone get pulled in to its edge.
      const offset = bestCandidate.graspLocalOffset
        .copy(this._objPos)
        .sub(this._tcpPos)
        .applyQuaternion(this._invTcpQuat);
      offset.x = THREE.MathUtils.clamp(offset.x, -0.008, 0.008);
      offset.y = THREE.MathUtils.clamp(offset.y, -0.05, 0.05);
      offset.z = THREE.MathUtils.clamp(offset.z, -0.042, 0.042);
      bestCandidate.graspLocalQuat
        .copy(this._invTcpQuat)
        .multiply(this._objQuat)
        .normalize();

      bestCandidate.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
      bestCandidate.isGrasped = true;
      this.graspedId = bestCandidate.spec.id;

      const objWidthMm = this.getObjectWidthMm(bestCandidate.spec);
      return {
        isGrasping: true,
        graspedObjectId: bestCandidate.spec.id,
        effectiveWidthMm: objWidthMm,
      };
    }

    return { isGrasping: false, graspedObjectId: null, effectiveWidthMm: gripperWidthMm };
  }

  public releaseGrasp(): void {
    if (!this.graspedId) return;
    const item = this.objects.get(this.graspedId);
    if (item) {
      item.isGrasped = false;
      item.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      item.body.setLinvel(this._trackedLinVel, true);
      item.body.setAngvel(this._trackedAngVel, true);
      item.body.wakeUp();
    }
    this.graspedId = null;
    this._trackedLinVel.set(0, 0, 0);
    this._trackedAngVel.set(0, 0, 0);
  }

  public getBottleTelemetry(): {
    position: Vec3Tuple;
    quaternion: QuatTuple;
    linearSpeed: number;
    angularSpeed: number;
    isGrasped: boolean;
  } | null {
    const item = this.objects.get('bottle_flip');
    if (!item) return null;
    const t = item.body.translation();
    const r = item.body.rotation();
    const lv = item.body.linvel();
    const av = item.body.angvel();
    return {
      position: [t.x, t.y, t.z],
      quaternion: [r.x, r.y, r.z, r.w],
      linearSpeed: Math.sqrt(lv.x * lv.x + lv.y * lv.y + lv.z * lv.z),
      angularSpeed: Math.sqrt(av.x * av.x + av.y * av.y + av.z * av.z),
      isGrasped: item.isGrasped,
    };
  }

  /**
   * Advance physics by `dtSeconds` in exact PHYSICS_SUBSTEP_SEC steps; the remainder carries over to
   * the next call (fixed-timestep accumulator), so results are identical at any frame rate.
   * Kinematic targets set by updateGripperPose() are interpolated across the steps; otherwise the
   * jaws would reach their target in the first step (N x too fast, hitting props too hard) and then
   * freeze. Returns the number of steps taken (0 if less than one step has accumulated).
   */
  public step(dtSeconds: number): number {
    this.accumulator += Math.min(MAX_FRAME_SEC, Math.max(0, dtSeconds));
    const n = Math.floor(this.accumulator / PHYSICS_SUBSTEP_SEC + 1e-9);
    if (n === 0) return 0;
    this.accumulator = Math.max(0, this.accumulator - n * PHYSICS_SUBSTEP_SEC);
    const dt = n * PHYSICS_SUBSTEP_SEC;
    this.world.timestep = PHYSICS_SUBSTEP_SEC;

    const kin = this.kinematicBodies;
    kin.length = 0;
    kin.push(this.palmBody, this.leftFingerBody, this.rightFingerBody);
    if (this.plateBody) kin.push(this.plateBody);
    // The carried body (held by the gripper, or dragged with the mouse) also moves kinematically
    const graspedItem = this.graspedId ? this.objects.get(this.graspedId) : undefined;
    const grasped = graspedItem?.isGrasped
      ? graspedItem
      : this.draggedId
        ? this.objects.get(this.draggedId)
        : undefined;
    if (grasped) kin.push(grasped.body);

    for (let k = 0; k < kin.length; k++) {
      const t0 = kin[k].translation(), r0 = kin[k].rotation();
      const t1 = kin[k].nextTranslation(), r1 = kin[k].nextRotation();
      this._kinStartPos[k].set(t0.x, t0.y, t0.z);
      this._kinStartQuat[k].set(r0.x, r0.y, r0.z, r0.w);
      this._kinEndPos[k].set(t1.x, t1.y, t1.z);
      this._kinEndQuat[k].set(r1.x, r1.y, r1.z, r1.w);
    }

    if (grasped) {
      // Carried object's velocity over this frame becomes its release (throw) velocity
      const g = kin.length - 1;
      this._trackedLinVel.copy(this._kinEndPos[g]).sub(this._kinStartPos[g]).divideScalar(dt);
      if (this._trackedLinVel.length() > MAX_RELEASE_LIN_SPEED) {
        this._trackedLinVel.setLength(MAX_RELEASE_LIN_SPEED);
      }
      const dq = this._deltaQuat.copy(this._kinStartQuat[g]).invert().premultiply(this._kinEndQuat[g]);
      if (dq.w < 0) dq.set(-dq.x, -dq.y, -dq.z, -dq.w);
      const s = Math.sqrt(Math.max(0, 1 - dq.w * dq.w));
      const angle = 2 * Math.atan2(s, dq.w);
      if (s > 1e-6) {
        const speed = Math.min(MAX_RELEASE_ANG_SPEED, angle / dt) / s;
        this._trackedAngVel.set(dq.x * speed, dq.y * speed, dq.z * speed);
      } else {
        this._trackedAngVel.set(0, 0, 0);
      }
    }

    for (let i = 1; i <= n; i++) {
      if (n > 1) {
        const a = i / n;
        for (let k = 0; k < kin.length; k++) {
          kin[k].setNextKinematicTranslation(this._tcpPos.lerpVectors(this._kinStartPos[k], this._kinEndPos[k], a));
          kin[k].setNextKinematicRotation(this._tcpQuat.slerpQuaternions(this._kinStartQuat[k], this._kinEndQuat[k], a));
        }
      }
      this.world.step();
    }
    return n;
  }

  public getObjectStates(): SceneObjectRuntimeState[] {
    const states: SceneObjectRuntimeState[] = [];
    for (const item of this.objects.values()) {
      const t = item.body.translation();
      const r = item.body.rotation();
      states.push({
        id: item.spec.id,
        name: item.spec.name,
        kind: item.spec.kind,
        position: [t.x, t.y, t.z],
        quaternion: [r.x, r.y, r.z, r.w],
        isGrasped: item.isGrasped,
      });
    }
    return states;
  }

  public getObjectSnapshots(): DemoObjectSnapshot[] {
    const snaps: DemoObjectSnapshot[] = [];
    for (const item of this.objects.values()) {
      const t = item.body.translation();
      const r = item.body.rotation();
      snaps.push({
        id: item.spec.id,
        position: [t.x, t.y, t.z],
        quaternion: [r.x, r.y, r.z, r.w],
      });
    }
    return snaps;
  }

  /** Add a dynamic prop at runtime (inventory). Containers are static and only built at startup. */
  public addObject(spec: SceneObjectSpec): void {
    if (spec.kind === 'container' || this.objects.has(spec.id)) return;
    this.createDynamicObject(spec);
  }

  /**
   * Mouse drag: the prop becomes kinematic and follows dragTo() targets (interpolated like the
   * gripper, so it pushes neighbours realistically). Fails for props held by the gripper.
   */
  public beginDrag(id: string): boolean {
    const item = this.objects.get(id);
    if (!item || item.isGrasped || this.draggedId) return false;
    this.draggedId = id;
    item.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    this._trackedLinVel.set(0, 0, 0);
    this._trackedAngVel.set(0, 0, 0);
    return true;
  }

  /** Move the dragged prop so it hovers `liftM` above the bench at bench point (x, z). */
  public dragTo(x: number, z: number, liftM = 0.02): void {
    const item = this.draggedId ? this.objects.get(this.draggedId) : undefined;
    if (!item) return;
    const r = item.body.rotation();
    this._objQuat.set(r.x, r.y, r.z, r.w);
    const y = this.depthBelowCenter(item.spec, this._objQuat) + liftM;
    // Keep it on the bench top (x -0.53..1.17, z -0.62..0.62)
    item.body.setNextKinematicTranslation({
      x: THREE.MathUtils.clamp(x, -0.5, 1.14),
      y,
      z: THREE.MathUtils.clamp(z, -0.59, 0.59),
    });
  }

  /** Drop the dragged prop; it keeps the mouse's velocity (throw), clamped like gripper releases. */
  public endDrag(): void {
    const item = this.draggedId ? this.objects.get(this.draggedId) : undefined;
    this.draggedId = null;
    if (!item) return;
    // Commit the last cursor target even if no physics step ran since (very fast flick)
    item.body.setTranslation(item.body.nextTranslation(), true);
    item.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    item.body.setLinvel(this._trackedLinVel, true);
    item.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    item.body.wakeUp();
    this._trackedLinVel.set(0, 0, 0);
  }

  /** Remove a prop at runtime (inventory), releasing it first if it is held. */
  public removeObject(id: string): void {
    const item = this.objects.get(id);
    if (!item) return;
    if (this.graspedId === id) this.releaseGrasp();
    if (this.draggedId === id) this.draggedId = null;
    for (let i = 0; i < item.body.numColliders(); i++) this.baseMaterial.delete(item.body.collider(i).handle);
    this.world.removeRigidBody(item.body);
    this.objects.delete(id);
  }

  /**
   * Scale an object's mass and friction relative to its spec (domain randomization).
   * Scales of 1 restore the original values.
   */
  public setObjectMaterialScale(id: string, massScale: number, frictionScale: number): void {
    const item = this.objects.get(id);
    if (!item) return;
    for (let i = 0; i < item.body.numColliders(); i++) {
      const c = item.body.collider(i);
      let base = this.baseMaterial.get(c.handle);
      if (!base) {
        base = { mass: c.mass(), friction: c.friction() };
        this.baseMaterial.set(c.handle, base);
      }
      c.setMass(base.mass * massScale);
      c.setFriction(base.friction * frictionScale);
    }
  }

  /** Reset props to their spec pose, or to `placeOf(spec)` when given (randomized layouts). */
  public resetObjects(
    placeOf?: (spec: SceneObjectSpec) => { position: Vec3Tuple; quaternion: QuatTuple },
  ): void {
    this.releaseGrasp();
    this.draggedId = null;
    this.accumulator = 0;
    for (const item of this.objects.values()) {
      const pose = placeOf?.(item.spec);
      const [px, py, pz] = pose?.position ?? item.spec.initialPosition;
      const [qx, qy, qz, qw] = pose?.quaternion ?? item.spec.initialQuaternion;
      item.isGrasped = false;
      item.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      item.body.setTranslation({ x: px, y: py, z: pz }, true);
      item.body.setRotation({ x: qx, y: qy, z: qz, w: qw }, true);
      item.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      item.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      item.body.wakeUp();
    }
  }

  public dispose(): void {
    this.world.free();
  }
}
