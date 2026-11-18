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

  // Tracked release velocity for throwing / bottle flipping
  private hasPrevGraspPose = false;
  private readonly _prevGraspPos = new THREE.Vector3();
  private readonly _prevGraspQuat = new THREE.Quaternion();
  private readonly _deltaQuat = new THREE.Quaternion();
  private readonly _trackedLinVel = new THREE.Vector3();
  private readonly _trackedAngVel = new THREE.Vector3();

  constructor(objectSpecs: SceneObjectSpec[] = DEFAULT_SCENE_OBJECTS) {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

    // Workbench static table surface (top face at y = 0.0)
    const benchBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0.32, -0.025, 0));
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.85, 0.025, 0.62).setFriction(0.9).setRestitution(0.05),
      benchBody,
    );

    // Safety floor below workbench so fallen items do not fall infinitely
    const floorBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.82, 0));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(4, 0.05, 4), floorBody);

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
      .setLinearDamping(0.45)
      .setAngularDamping(0.65)
      .setCanSleep(true);

    const body = this.world.createRigidBody(bodyDesc);

    if (spec.kind === 'bottle') {
      // Weighted two-section bottle: heavy bottom liquid ballast + lighter upper neck
      const r = spec.dimensions[0];
      const lowerCollider = RAPIER.ColliderDesc.cylinder(0.026, r)
        .setTranslation(0, -0.036, 0)
        .setMass(spec.mass * 0.8)
        .setFriction(0.95)
        .setRestitution(0.05);
      const upperCollider = RAPIER.ColliderDesc.cylinder(0.036, r * 0.85)
        .setTranslation(0, 0.026, 0)
        .setMass(spec.mass * 0.2)
        .setFriction(0.75)
        .setRestitution(0.05);
      const collider = this.world.createCollider(lowerCollider, body);
      this.world.createCollider(upperCollider, body);

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

  public updateGripperPose(
    tcpPosition: Vec3Tuple,
    tcpQuaternion: QuatTuple,
    gripperWidthMm: number,
    dtSec = 0.016,
  ): void {
    this._tcpPos.set(...tcpPosition);
    this._tcpQuat.set(...tcpQuaternion).normalize();

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

    // Update attached grasped object if any and track its linear/angular velocity
    if (this.graspedId) {
      const item = this.objects.get(this.graspedId);
      if (item && item.isGrasped) {
        this._targetWorldPos
          .copy(item.graspLocalOffset)
          .applyQuaternion(this._tcpQuat)
          .add(this._tcpPos);
        this._targetWorldQuat.copy(this._tcpQuat).multiply(item.graspLocalQuat).normalize();
        const clampedY = Math.max(item.spec.dimensions[1] / 2, this._targetWorldPos.y);
        this._targetWorldPos.y = clampedY;

        const safeDt = Math.max(0.008, dtSec);
        if (this.hasPrevGraspPose) {
          this._trackedLinVel
            .copy(this._targetWorldPos)
            .sub(this._prevGraspPos)
            .divideScalar(safeDt);
          // Clamp max throw velocity to keep collision stepping clean
          if (this._trackedLinVel.length() > 3.6) {
            this._trackedLinVel.setLength(3.6);
          }

          this._deltaQuat
            .copy(this._targetWorldQuat)
            .multiply(this._prevGraspQuat.clone().invert())
            .normalize();
          if (this._deltaQuat.w < 0) {
            this._deltaQuat.set(
              -this._deltaQuat.x,
              -this._deltaQuat.y,
              -this._deltaQuat.z,
              -this._deltaQuat.w,
            );
          }
          const angle = 2 * Math.acos(THREE.MathUtils.clamp(this._deltaQuat.w, -1, 1));
          const s = Math.sqrt(Math.max(0, 1 - this._deltaQuat.w * this._deltaQuat.w));
          if (s > 1e-5 && angle > 1e-5) {
            const angSpeed = Math.min(16, angle / safeDt);
            this._trackedAngVel.set(
              (this._deltaQuat.x / s) * angSpeed,
              (this._deltaQuat.y / s) * angSpeed,
              (this._deltaQuat.z / s) * angSpeed,
            );
          } else {
            this._trackedAngVel.set(0, 0, 0);
          }
        } else {
          this._trackedLinVel.set(0, 0, 0);
          this._trackedAngVel.set(0, 0, 0);
          this.hasPrevGraspPose = true;
        }
        this._prevGraspPos.copy(this._targetWorldPos);
        this._prevGraspQuat.copy(this._targetWorldQuat);

        item.body.setNextKinematicTranslation({
          x: this._targetWorldPos.x,
          y: clampedY,
          z: this._targetWorldPos.z,
        });
        item.body.setNextKinematicRotation({
          x: this._targetWorldQuat.x,
          y: this._targetWorldQuat.y,
          z: this._targetWorldQuat.z,
          w: this._targetWorldQuat.w,
        });
      }
    } else {
      this.hasPrevGraspPose = false;
      this._trackedLinVel.set(0, 0, 0);
      this._trackedAngVel.set(0, 0, 0);
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
        effectiveWidthMm: Math.max(gripperWidthMm, Math.min(objWidthMm - 2, objWidthMm)),
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
      if (!item.spec.graspable) continue;
      if (forcedObjectId && item.spec.id !== forcedObjectId) continue;

      const t = item.body.translation();
      this._objPos.set(t.x, t.y, t.z);
      this._localPos.copy(this._objPos).sub(this._tcpPos).applyQuaternion(this._invTcpQuat);

      const objWidthMm = this.getObjectWidthMm(item.spec);
      const dist = this._localPos.length();
      const insidePinch =
        Math.abs(this._localPos.x) < 0.042 &&
        Math.abs(this._localPos.y) < 0.05 &&
        Math.abs(this._localPos.z) < 0.042;

      const closeEnoughForForced = forcedObjectId === item.spec.id && dist < 0.085;

      if (
        (insidePinch && gripperWidthMm <= objWidthMm + 14) ||
        closeEnoughForForced
      ) {
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

      // Compute relative offset in TCP frame (clamped nicely near pinch center)
      bestCandidate.graspLocalOffset
        .copy(this._objPos)
        .sub(this._tcpPos)
        .applyQuaternion(this._invTcpQuat);
      bestCandidate.graspLocalOffset.x = THREE.MathUtils.clamp(
        bestCandidate.graspLocalOffset.x,
        -0.008,
        0.008,
      );
      bestCandidate.graspLocalOffset.y = THREE.MathUtils.clamp(
        bestCandidate.graspLocalOffset.y,
        -0.015,
        0.015,
      );
      bestCandidate.graspLocalOffset.z = THREE.MathUtils.clamp(
        bestCandidate.graspLocalOffset.z,
        -0.012,
        0.012,
      );
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
        effectiveWidthMm: Math.min(gripperWidthMm, objWidthMm - 2),
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
      item.body.setLinvel(
        {
          x: this._trackedLinVel.x,
          y: this._trackedLinVel.y,
          z: this._trackedLinVel.z,
        },
        true,
      );
      item.body.setAngvel(
        {
          x: this._trackedAngVel.x,
          y: this._trackedAngVel.y,
          z: this._trackedAngVel.z,
        },
        true,
      );
      item.body.wakeUp();
    }
    this.graspedId = null;
    this.hasPrevGraspPose = false;
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

  public step(dtSeconds: number): void {
    const clampedDt = Math.min(0.05, Math.max(0.001, dtSeconds));
    this.world.timestep = clampedDt;
    this.world.step();
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

  public resetObjects(): void {
    this.releaseGrasp();
    for (const item of this.objects.values()) {
      const [px, py, pz] = item.spec.initialPosition;
      const [qx, qy, qz, qw] = item.spec.initialQuaternion;
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
