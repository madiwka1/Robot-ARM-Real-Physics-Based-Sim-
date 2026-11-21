import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { JointTuple, RobotModelConfig } from '../robotics/types';
import { SERVO_ARM_GEOS, SERVO_ARM_MATERIALS } from './servoArmGeometry';

interface ServoArmMeshProps {
  config: RobotModelConfig;
  jointAnglesDeg: JointTuple;
  gripperWidthMm: number;
  isGrasping?: boolean;
  showGripper: boolean;
  showJointAxes?: boolean;
  showWorkspace: boolean;
  selectedNodeId: string | null;
  onSelectEndEffector: () => void;
  onSelectJoint: (jointId: string) => void;
}

const DEG_TO_RAD = Math.PI / 180;

const MiniAxesTriad: React.FC<{ size?: number; visible?: boolean }> = ({
  size = 0.055,
  visible = false,
}) => {
  if (!visible) return null;
  const r = 0.0016;
  return (
    <group>
      <mesh position={[size / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <cylinderGeometry args={[r, r, size, 8]} />
        <meshBasicMaterial color="#ef4444" />
      </mesh>
      <mesh position={[size, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[r * 2.3, size * 0.22, 8]} />
        <meshBasicMaterial color="#ef4444" />
      </mesh>
      <mesh position={[0, size / 2, 0]}>
        <cylinderGeometry args={[r, r, size, 8]} />
        <meshBasicMaterial color="#22c55e" />
      </mesh>
      <mesh position={[0, size, 0]}>
        <coneGeometry args={[r * 2.3, size * 0.22, 8]} />
        <meshBasicMaterial color="#22c55e" />
      </mesh>
      <mesh position={[0, 0, size / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[r, r, size, 8]} />
        <meshBasicMaterial color="#3b82f6" />
      </mesh>
      <mesh position={[0, 0, size]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[r * 2.3, size * 0.22, 8]} />
        <meshBasicMaterial color="#3b82f6" />
      </mesh>
    </group>
  );
};

/**
 * Brushed aluminum circular servo horn + 4 micro stainless steel mounting bolts.
 * Oriented with face normal along +Z by default.
 */
const CircularServoHorn: React.FC<{
  radius?: number;
  thickness?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  selected?: boolean;
}> = ({
  radius = 0.011,
  thickness = 0.0032,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  selected = false,
}) => {
  const boltR = radius * 0.64;
  return (
    <group position={position} rotation={rotation}>
      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        material={selected ? SERVO_ARM_MATERIALS.selectedAmber : SERVO_ARM_MATERIALS.aluminumHorn}
        castShadow
      >
        <cylinderGeometry args={[radius, radius, thickness, 20]} />
      </mesh>
      {/* Center spline bolt */}
      <mesh
        position={[0, 0, thickness * 0.55]}
        rotation={[Math.PI / 2, 0, 0]}
        material={SERVO_ARM_MATERIALS.steelFastener}
      >
        <cylinderGeometry args={[radius * 0.24, radius * 0.24, 0.002, 8]} />
      </mesh>
      {/* 4 perimeter mounting screws */}
      {[0, 1, 2, 3].map((k) => {
        const a = (k * Math.PI) / 2 + Math.PI / 4;
        return (
          <mesh
            key={k}
            position={[Math.cos(a) * boltR, Math.sin(a) * boltR, thickness * 0.52]}
            rotation={[Math.PI / 2, 0, 0]}
            material={SERVO_ARM_MATERIALS.steelFastener}
          >
            <cylinderGeometry args={[0.0012, 0.0012, 0.0016, 6]} />
          </mesh>
        );
      })}
    </group>
  );
};

/**
 * Feetech STS3215 Serial Bus Servo (45.2 × 24.7 × 35.0 mm).
 * Shaft axis runs along Z (`+Z` output spline, `-Z` rear idler boss); body offset along -Y so
 * the output spline sits cleanly at local [0, 0, 0].
 */
const FeetechSTS3215: React.FC<{
  position?: [number, number, number];
  rotation?: [number, number, number];
  selected?: boolean;
  bodyShiftY?: number;
  onClick?: () => void;
}> = ({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  selected = false,
  bodyShiftY = -0.01,
  onClick,
}) => {
  const bodyMat = selected ? SERVO_ARM_MATERIALS.selectedAmber : SERVO_ARM_MATERIALS.feetechBody;
  return (
    <group
      position={position}
      rotation={rotation}
      onClick={
        onClick
          ? (e) => {
              e.stopPropagation();
              onClick();
            }
          : undefined
      }
    >
      {/* Main beveled Feetech servo case */}
      <mesh
        position={[0, bodyShiftY, 0]}
        geometry={SERVO_ARM_GEOS.sts3215Body}
        material={bodyMat}
        castShadow
        receiveShadow
      />
      {/* Top & bottom side mounting flange ears characteristic of STS3215 */}
      <mesh position={[0, bodyShiftY + 0.023, 0.007]} material={bodyMat} castShadow>
        <boxGeometry args={[0.0245, 0.004, 0.009]} />
      </mesh>
      <mesh position={[0, bodyShiftY - 0.023, 0.007]} material={bodyMat} castShadow>
        <boxGeometry args={[0.0245, 0.004, 0.009]} />
      </mesh>
      {/* Signature Feetech cyan-blue spec sticker band on side */}
      <mesh position={[0.0126, bodyShiftY - 0.002, 0]} material={SERVO_ARM_MATERIALS.feetechLabel}>
        <boxGeometry args={[0.0008, 0.024, 0.016]} />
      </mesh>
      <mesh position={[-0.0126, bodyShiftY - 0.002, 0]} material={SERVO_ARM_MATERIALS.feetechLabel}>
        <boxGeometry args={[0.0008, 0.024, 0.016]} />
      </mesh>
      {/* Front output boss collar (+Z) */}
      <mesh
        position={[0, 0, 0.0185]}
        rotation={[Math.PI / 2, 0, 0]}
        material={SERVO_ARM_MATERIALS.aluminumHorn}
      >
        <cylinderGeometry args={[0.0072, 0.0082, 0.003, 18]} />
      </mesh>
      {/* Rear idler boss (-Z) */}
      <mesh
        position={[0, 0, -0.0185]}
        rotation={[Math.PI / 2, 0, 0]}
        material={SERVO_ARM_MATERIALS.aluminumHorn}
      >
        <cylinderGeometry args={[0.006, 0.0065, 0.003, 16]} />
      </mesh>
    </group>
  );
};

/**
 * ROBOTIS Dynamixel XL430-W250-T (28.5 × 46.5 × 34.0 mm) or XL330-M288-T (20.0 × 34.0 × 26.0 mm).
 * Shaft axis runs along Z (`+Z` output horn, `-Z` hollow idler ring); shaft centered at [0, 0, 0].
 */
const DynamixelServo: React.FC<{
  model: 'xl430' | 'xl330';
  position?: [number, number, number];
  rotation?: [number, number, number];
  selected?: boolean;
  bodyShiftY?: number;
  onClick?: () => void;
}> = ({
  model,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  selected = false,
  bodyShiftY,
  onClick,
}) => {
  const isLarge = model === 'xl430';
  const shiftY = bodyShiftY ?? (isLarge ? -0.0105 : -0.0075);
  const w = isLarge ? 0.0285 : 0.02;
  const d = isLarge ? 0.034 : 0.026;
  const bodyGeo = isLarge ? SERVO_ARM_GEOS.xl430Body : SERVO_ARM_GEOS.xl330Body;
  const bodyMat = selected ? SERVO_ARM_MATERIALS.selectedAmber : SERVO_ARM_MATERIALS.dynamixelBody;

  return (
    <group
      position={position}
      rotation={rotation}
      onClick={
        onClick
          ? (e) => {
              e.stopPropagation();
              onClick();
            }
          : undefined
      }
    >
      {/* Beveled Dynamixel engineering-polymer body */}
      <mesh position={[0, shiftY, 0]} geometry={bodyGeo} material={bodyMat} castShadow receiveShadow />

      {/* Silver-gray ROBOTIS Dynamixel side branding strip */}
      <mesh position={[w / 2 + 0.0004, shiftY - 0.002, 0]} material={SERVO_ARM_MATERIALS.dynamixelLabel}>
        <boxGeometry args={[0.0008, isLarge ? 0.024 : 0.016, isLarge ? 0.014 : 0.01]} />
      </mesh>
      <mesh position={[-w / 2 - 0.0004, shiftY - 0.002, 0]} material={SERVO_ARM_MATERIALS.dynamixelLabel}>
        <boxGeometry args={[0.0008, isLarge ? 0.024 : 0.016, isLarge ? 0.014 : 0.01]} />
      </mesh>

      {/* Recessed rear status LED dot (classic Dynamixel detail) */}
      <mesh
        position={[-w * 0.28, shiftY - (isLarge ? 0.015 : 0.011), -d / 2 - 0.0004]}
        material={SERVO_ARM_MATERIALS.dynamixelLed}
      >
        <boxGeometry args={[0.0032, 0.0022, 0.001]} />
      </mesh>

      {/* Front spline hub (+Z) */}
      <mesh
        position={[0, 0, d / 2 + 0.0014]}
        rotation={[Math.PI / 2, 0, 0]}
        material={SERVO_ARM_MATERIALS.aluminumHorn}
      >
        <cylinderGeometry args={[isLarge ? 0.0085 : 0.0062, isLarge ? 0.0095 : 0.007, 0.0028, 18]} />
      </mesh>
      {/* Rear hollow idler ring (-Z) */}
      <mesh
        position={[0, 0, -d / 2 - 0.0014]}
        rotation={[Math.PI / 2, 0, 0]}
        material={SERVO_ARM_MATERIALS.aluminumHorn}
      >
        <cylinderGeometry args={[isLarge ? 0.007 : 0.0052, isLarge ? 0.0076 : 0.0056, 0.0026, 16]} />
      </mesh>
    </group>
  );
};

/* ============================================================================
 * 1. SO-101 (TheRobotStudio / Hugging Face LeRobot SO-ARM101)
 *    Matte off-white 3D-printed PLA+ shells, 6× Feetech STS3215 serial servos,
 *    Waveshare blue adapter board on rear base, swept curved upper arm & forearm,
 *    and integrated servo-shroud tapered claw gripper.
 * ============================================================================ */
const SO101ArmMesh: React.FC<ServoArmMeshProps> = ({
  config,
  jointAnglesDeg,
  gripperWidthMm,
  isGrasping = false,
  showGripper,
  showJointAxes = false,
  showWorkspace,
  selectedNodeId,
  onSelectEndEffector,
  onSelectJoint,
}) => {
  const jointQuats = useMemo(() => {
    return config.joints.map((spec, i) => {
      const axis = new THREE.Vector3(...spec.axis).normalize();
      return new THREE.Quaternion().setFromAxisAngle(axis, jointAnglesDeg[i] * DEG_TO_RAD);
    });
  }, [jointAnglesDeg, config]);

  const fingerHalfOffset = (gripperWidthMm / 1000) * 0.5 + 0.006;
  const eeSelected = selectedNodeId === 'TCP' || selectedNodeId === 'gripper';
  const shoulderY = config.joints[0].offsetFromParent[1] + config.joints[1].offsetFromParent[1];

  const pla = SERVO_ARM_MATERIALS.so101PlaWhite;
  const plaSub = SERVO_ARM_MATERIALS.so101PlaAccent;
  const hornMat = SERVO_ARM_MATERIALS.aluminumHorn;
  const boltMat = SERVO_ARM_MATERIALS.steelFastener;

  return (
    <group position={config.baseOffset}>
      {/* ================= SO-101 DESKTOP BASE (y = 0 -> 0.0624 m) ================= */}
      <group
        onClick={(e) => {
          e.stopPropagation();
          onSelectJoint('BASE');
        }}
      >
        {/* Contoured horseshoe white PLA+ base flange sitting flush at y = 0 */}
        <mesh geometry={SERVO_ARM_GEOS.so101BaseFlange} material={pla} castShadow receiveShadow />

        {/* Twin desk-clamp side wings + stainless steel clamp bolts */}
        {[-0.049, 0.049].map((z) => (
          <group key={z} position={[0.004, 0.008, z]}>
            <mesh material={plaSub} castShadow>
              <boxGeometry args={[0.03, 0.01, 0.012]} />
            </mesh>
            <mesh position={[0, 0.007, 0]} material={boltMat} castShadow>
              <cylinderGeometry args={[0.0038, 0.0038, 0.005, 6]} />
            </mesh>
          </group>
        ))}

        {/* 4 corner base hex bolts */}
        {[
          [-0.044, -0.032],
          [-0.044, 0.032],
          [0.038, -0.03],
          [0.038, 0.03],
        ].map(([bx, bz], idx) => (
          <mesh key={idx} position={[bx, 0.0125, bz]} material={boltMat} castShadow>
            <cylinderGeometry args={[0.0028, 0.0028, 0.003, 6]} />
          </mesh>
        ))}

        {/* Cylindrical sculpted motor-holder turret base (split shells leaving front STS3215 window) */}
        <mesh position={[-0.004, 0.034, 0]} material={pla} castShadow receiveShadow>
          <cylinderGeometry args={[0.036, 0.041, 0.046, 24, 1, false, Math.PI * 0.25, Math.PI * 1.5]} />
        </mesh>
        {/* Top bearing race collar */}
        <mesh position={[0, 0.058, 0]} material={plaSub} castShadow>
          <cylinderGeometry args={[0.035, 0.037, 0.007, 28]} />
        </mesh>
        <mesh position={[0, 0.0615, 0]} material={hornMat}>
          <cylinderGeometry args={[0.031, 0.031, 0.0022, 28]} />
        </mesh>

        {/* J1 Vertical Feetech STS3215 Base Pan Servo inside pedestal */}
        <FeetechSTS3215
          position={[0, 0.042, 0]}
          rotation={[-Math.PI / 2, 0, Math.PI / 2]}
          bodyShiftY={-0.008}
          selected={selectedNodeId === 'J1'}
          onClick={() => onSelectJoint('J1')}
        />

        {/* Rear Waveshare Serial Bus Servo Driver PCB mounted on angled cradle */}
        <group position={[-0.046, 0.025, 0]} rotation={[0, 0, 0.34]}>
          <mesh material={plaSub} castShadow>
            <boxGeometry args={[0.006, 0.038, 0.046]} />
          </mesh>
          <mesh position={[-0.0045, 0, 0]} material={SERVO_ARM_MATERIALS.wavesharePcbBlue} castShadow>
            <boxGeometry args={[0.0026, 0.033, 0.04]} />
          </mesh>
          {/* Silver USB-C port & 12V barrel jack */}
          <mesh position={[-0.0075, 0.008, -0.01]} material={boltMat}>
            <boxGeometry args={[0.005, 0.008, 0.01]} />
          </mesh>
          <mesh position={[-0.008, -0.008, 0.009]} rotation={[0, 0, Math.PI / 2]} material={SERVO_ARM_MATERIALS.feetechBody}>
            <cylinderGeometry args={[0.0045, 0.0045, 0.008, 12]} />
          </mesh>
        </group>
      </group>

      {/* Workspace Envelope */}
      {showWorkspace && (
        <group position={[0, shoulderY, 0]}>
          <mesh>
            <sphereGeometry args={[config.maxReachMeters, 28, 18]} />
            <meshBasicMaterial color="#38bdf8" wireframe transparent opacity={0.1} depthWrite={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -shoulderY + 0.004, 0]}>
            <ringGeometry args={[config.minReachMeters, config.maxReachMeters * 0.94, 48]} />
            <meshBasicMaterial
              color="#38bdf8"
              transparent
              opacity={0.07}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}

      {/* ================= J1: SHOULDER PAN (Yaw, +0.0624 m -> J2 at +0.0542 m) ================= */}
      <group
        position={config.joints[0].offsetFromParent}
        quaternion={jointQuats[0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelectJoint('J1');
        }}
      >
        <MiniAxesTriad visible={showJointAxes} size={0.06} />

        {/* Rotating circular turntable plate */}
        <mesh position={[0, 0.0045, 0]} material={pla} castShadow receiveShadow>
          <cylinderGeometry args={[0.036, 0.036, 0.008, 28]} />
        </mesh>
        {/* Turntable perimeter detail ring */}
        <mesh position={[0, 0.009, 0]} material={plaSub}>
          <cylinderGeometry args={[0.03, 0.033, 0.003, 24]} />
        </mesh>

        {/* Sculpted white SO-101 Shoulder Turret cheeks cradling the J2 servo */}
        <mesh
          position={[0, 0.006, 0.022]}
          geometry={SERVO_ARM_GEOS.so101TurretCheek}
          material={pla}
          castShadow
          receiveShadow
        />
        <mesh
          position={[0, 0.006, -0.022]}
          geometry={SERVO_ARM_GEOS.so101TurretCheek}
          material={pla}
          castShadow
          receiveShadow
        />
        {/* Turret rear structural spine */}
        <mesh position={[-0.018, 0.029, 0]} material={pla} castShadow>
          <boxGeometry args={[0.009, 0.042, 0.04]} />
        </mesh>
        {/* Orange LeRobot cable clip on turret back */}
        <mesh position={[-0.024, 0.024, 0]} material={SERVO_ARM_MATERIALS.so101OrangeClip}>
          <boxGeometry args={[0.005, 0.008, 0.014]} />
        </mesh>

        {/* Horizontal J2 Shoulder Lift Feetech STS3215 Servo mounted in J1 turret at y = 0.0542 */}
        <FeetechSTS3215
          position={[0, config.joints[1].offsetFromParent[1], 0]}
          bodyShiftY={-0.011}
          selected={selectedNodeId === 'J2'}
          onClick={() => onSelectJoint('J2')}
        />

        {/* ================= J2: SHOULDER LIFT (Pitch, Upper Arm 0.1126 m -> J3) ================= */}
        <group
          position={config.joints[1].offsetFromParent}
          quaternion={jointQuats[1]}
          onClick={(e) => {
            e.stopPropagation();
            onSelectJoint('J2');
          }}
        >
          <MiniAxesTriad visible={showJointAxes} size={0.06} />

          {/* Machined circular servo horn (+Z) & rear idler hub (-Z) */}
          <CircularServoHorn position={[0, 0, 0.021]} radius={0.012} selected={selectedNodeId === 'J2'} />
          <CircularServoHorn
            position={[0, 0, -0.021]}
            rotation={[0, Math.PI, 0]}
            radius={0.011}
            selected={selectedNodeId === 'J2'}
          />

          {/* SO-101 Sculpted Swept Upper Arm Twin Shells (z = ±0.0245) */}
          <mesh
            position={[0, 0, 0.0245]}
            geometry={SERVO_ARM_GEOS.so101UpperArmRail}
            material={pla}
            castShadow
            receiveShadow
          />
          <mesh
            position={[0, 0, -0.0245]}
            geometry={SERVO_ARM_GEOS.so101UpperArmRail}
            material={pla}
            castShadow
            receiveShadow
          />
          {/* Contoured solid front/back bridge webs uniting the upper arm box-channel */}
          <mesh position={[0.014, 0.056, 0]} material={plaSub} castShadow>
            <boxGeometry args={[0.006, 0.066, 0.044]} />
          </mesh>
          <mesh position={[-0.008, 0.056, 0]} material={pla} castShadow>
            <boxGeometry args={[0.007, 0.07, 0.044]} />
          </mesh>
          {/* Mid-span orange bus cable retaining clip */}
          <mesh position={[-0.015, 0.056, -0.012]} material={SERVO_ARM_MATERIALS.so101OrangeClip}>
            <boxGeometry args={[0.008, 0.007, 0.01]} />
          </mesh>
          {/* Daisy-chained serial bus cable along upper arm spine */}
          <mesh geometry={SERVO_ARM_GEOS.so101UpperCable} material={SERVO_ARM_MATERIALS.busCable} />

          {/* Horizontal J3 Elbow Flex Feetech STS3215 Servo mounted at top of Upper Arm */}
          <FeetechSTS3215
            position={[0, config.joints[2].offsetFromParent[1], 0]}
            bodyShiftY={-0.01}
            selected={selectedNodeId === 'J3'}
            onClick={() => onSelectJoint('J3')}
          />

          {/* ================= J3: ELBOW FLEX (Pitch, Forearm 0.1349 m -> J4/J5) ================= */}
          <group
            position={config.joints[2].offsetFromParent}
            quaternion={jointQuats[2]}
            onClick={(e) => {
              e.stopPropagation();
              onSelectJoint('J3');
            }}
          >
            <MiniAxesTriad visible={showJointAxes} size={0.055} />

            {/* Elbow output horn (+Z) & rear idler (-Z) */}
            <CircularServoHorn position={[0, 0, 0.0205]} radius={0.0115} selected={selectedNodeId === 'J3'} />
            <CircularServoHorn
              position={[0, 0, -0.0205]}
              rotation={[0, Math.PI, 0]}
              radius={0.0105}
              selected={selectedNodeId === 'J3'}
            />

            {/* SO-101 Tapered Swept Forearm Twin Shells */}
            <mesh
              position={[0, 0, 0.0235]}
              geometry={SERVO_ARM_GEOS.so101ForearmRail}
              material={pla}
              castShadow
              receiveShadow
            />
            <mesh
              position={[0, 0, -0.0235]}
              geometry={SERVO_ARM_GEOS.so101ForearmRail}
              material={pla}
              castShadow
              receiveShadow
            />
            {/* Forearm structural spine bridge & mid cross-brace */}
            <mesh position={[-0.012, 0.068, 0]} material={pla} castShadow>
              <boxGeometry args={[0.006, 0.088, 0.042]} />
            </mesh>
            <mesh position={[0.006, 0.068, 0]} material={plaSub} castShadow>
              <boxGeometry args={[0.005, 0.072, 0.04]} />
            </mesh>
            {/* Routed forearm serial bus wire */}
            <mesh geometry={SERVO_ARM_GEOS.so101ForearmCable} material={SERVO_ARM_MATERIALS.busCable} />

            {/* ================= J4: LOCKED FOREARM END (+0.1349 m) ================= */}
            <group position={config.joints[3].offsetFromParent} quaternion={jointQuats[3]}>
              {/* Horizontal J5 Wrist Flex Feetech STS3215 Servo mounted at forearm tip */}
              <FeetechSTS3215
                position={[0, 0, 0]}
                bodyShiftY={-0.01}
                selected={selectedNodeId === 'J5'}
                onClick={() => onSelectJoint('J5')}
              />

              {/* ================= J5: WRIST FLEX (Pitch -> J6 at +0.0611 m) ================= */}
              <group
                position={config.joints[4].offsetFromParent}
                quaternion={jointQuats[4]}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectJoint('J5');
                }}
              >
                <MiniAxesTriad visible={showJointAxes} size={0.05} />

                <CircularServoHorn position={[0, 0, 0.0205]} radius={0.0105} selected={selectedNodeId === 'J5'} />
                <CircularServoHorn
                  position={[0, 0, -0.0205]}
                  rotation={[0, Math.PI, 0]}
                  radius={0.0095}
                  selected={selectedNodeId === 'J5'}
                />

                {/* SO-101 Wrist-Roll-Pitch U-Cradle */}
                <mesh
                  position={[0, 0, 0.022]}
                  geometry={SERVO_ARM_GEOS.so101WristCheek}
                  material={pla}
                  castShadow
                />
                <mesh
                  position={[0, 0, -0.022]}
                  geometry={SERVO_ARM_GEOS.so101WristCheek}
                  material={pla}
                  castShadow
                />
                {/* Wrist bridge plate & servo collar supporting vertical J6 */}
                <mesh position={[0, 0.023, 0]} material={pla} castShadow>
                  <boxGeometry args={[0.03, 0.008, 0.046]} />
                </mesh>
                <mesh position={[0, 0.044, 0]} material={plaSub} castShadow>
                  <cylinderGeometry args={[0.019, 0.021, 0.022, 20]} />
                </mesh>

                {/* Vertical J6 Wrist Roll Feetech STS3215 Servo */}
                <FeetechSTS3215
                  position={[0, 0.042, 0]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  bodyShiftY={-0.004}
                  selected={selectedNodeId === 'J6'}
                  onClick={() => onSelectJoint('J6')}
                />

                {/* ================= J6: WRIST ROLL + SO-101 GRIPPER (TCP at +0.0981 m) ================= */}
                <group
                  position={config.joints[5].offsetFromParent}
                  quaternion={jointQuats[5]}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectEndEffector();
                  }}
                >
                  <MiniAxesTriad visible={showJointAxes} size={0.045} />

                  {/* Wrist Roll output hub */}
                  <mesh
                    position={[0, 0.003, 0]}
                    material={eeSelected ? SERVO_ARM_MATERIALS.selectedAmber : hornMat}
                    castShadow
                  >
                    <cylinderGeometry args={[0.015, 0.016, 0.006, 20]} />
                  </mesh>

                  {showGripper && (
                    <>
                      {/* SO-101 Sculpted Gripper Body & Integrated Servo Shroud */}
                      <mesh
                        position={[0, 0.029, 0]}
                        geometry={SERVO_ARM_GEOS.so101GripperBody}
                        material={pla}
                        castShadow
                        receiveShadow
                      />
                      {/* Embedded 6th STS3215 Gripper Actuator peeking cleanly out of shroud */}
                      <mesh position={[-0.012, 0.028, 0.002]} material={SERVO_ARM_MATERIALS.feetechBody} castShadow>
                        <boxGeometry args={[0.025, 0.036, 0.026]} />
                      </mesh>
                      {/* Characteristic SO-101 front wrist-camera mount tab & mini lens bezel */}
                      <group position={[0, 0.032, 0.019]}>
                        <mesh material={plaSub} castShadow>
                          <boxGeometry args={[0.024, 0.018, 0.007]} />
                        </mesh>
                        <mesh position={[0, 0, 0.0045]} rotation={[Math.PI / 2, 0, 0]} material={SERVO_ARM_MATERIALS.feetechBody}>
                          <cylinderGeometry args={[0.0055, 0.0062, 0.004, 16]} />
                        </mesh>
                      </group>
                      {/* Grasp / selection status LED indicator */}
                      <mesh position={[0.013, 0.041, 0.0165]}>
                        <boxGeometry args={[0.012, 0.004, 0.0025]} />
                        <meshStandardMaterial
                          color={isGrasping ? '#22c55e' : eeSelected ? '#f59e0b' : '#0ea5e9'}
                          emissive={isGrasping ? '#16a34a' : eeSelected ? '#d97706' : '#0284c7'}
                          emissiveIntensity={0.75}
                          roughness={0.25}
                        />
                      </mesh>

                      {/* Dual meshing drive spur gears + full-span linear carriage bridge so jaws never float */}
                      <mesh position={[-0.011, 0.052, 0]} rotation={[Math.PI / 2, 0, 0]} material={plaSub} castShadow>
                        <cylinderGeometry args={[0.01, 0.01, 0.011, 14]} />
                      </mesh>
                      <mesh position={[0.011, 0.052, 0]} rotation={[Math.PI / 2, 0, 0]} material={plaSub} castShadow>
                        <cylinderGeometry args={[0.01, 0.01, 0.011, 14]} />
                      </mesh>
                      {/* Sculpted PLA+ linear bridge rail spanning full jaw width */}
                      <mesh position={[0, 0.052, 0]} material={plaSub} castShadow>
                        <boxGeometry args={[Math.max(0.052, fingerHalfOffset * 2 + 0.014), 0.0085, 0.015]} />
                      </mesh>
                      {/* Dual stainless guide rods */}
                      {[-0.0055, 0.0055].map((gz) => (
                        <mesh key={gz} position={[0, 0.057, gz]} rotation={[0, 0, Math.PI / 2]} material={hornMat}>
                          <cylinderGeometry args={[0.002, 0.002, Math.max(0.054, fingerHalfOffset * 2 + 0.012), 10]} />
                        </mesh>
                      ))}

                      {/* Left Sculpted SO-101 Jaw + Carriage Sled + TPU Grip Pad (aligned to TCP y = 0.0981) */}
                      <group position={[-fingerHalfOffset, 0.052, 0]}>
                        <mesh position={[-0.002, 0.003, 0]} material={plaSub} castShadow>
                          <boxGeometry args={[0.014, 0.012, 0.022]} />
                        </mesh>
                        <mesh
                          position={[0.0025, 0, 0]}
                          geometry={SERVO_ARM_GEOS.so101Jaw}
                          material={pla}
                          castShadow
                          receiveShadow
                        />
                        {/* High-friction matte black TPU inner grip pad */}
                        <mesh position={[0.0052, 0.04, 0]} material={SERVO_ARM_MATERIALS.tpuGripPad}>
                          <boxGeometry args={[0.0028, 0.032, 0.016]} />
                        </mesh>
                      </group>

                      {/* Right Sculpted SO-101 Jaw (mirrored) + Carriage Sled + TPU Grip Pad */}
                      <group position={[fingerHalfOffset, 0.052, 0]}>
                        <mesh position={[0.002, 0.003, 0]} material={plaSub} castShadow>
                          <boxGeometry args={[0.014, 0.012, 0.022]} />
                        </mesh>
                        <mesh
                          position={[-0.0025, 0, 0]}
                          scale={[-1, 1, 1]}
                          geometry={SERVO_ARM_GEOS.so101Jaw}
                          material={pla}
                          castShadow
                          receiveShadow
                        />
                        <mesh position={[-0.0052, 0.04, 0]} material={SERVO_ARM_MATERIALS.tpuGripPad}>
                          <boxGeometry args={[0.0028, 0.032, 0.016]} />
                        </mesh>
                      </group>
                    </>
                  )}

                  {/* TCP Frame Origin Marker */}
                  <group position={config.tcpOffsetFromJ6}>
                    <MiniAxesTriad visible={showJointAxes || eeSelected} size={0.05} />
                    {eeSelected && (
                      <mesh>
                        <sphereGeometry args={[0.007, 14, 14]} />
                        <meshBasicMaterial color="#f59e0b" transparent opacity={0.85} />
                      </mesh>
                    )}
                  </group>
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
};

/* ============================================================================
 * 2. Koch v1.1 (Alexander Koch / Jess Moss Follower Arm)
 *    Matte charcoal-graphite PETG open-frame skeletal twin-plate links,
 *    mixed ROBOTIS Dynamixel XL430-W250-T (base/shoulder/elbow) & ultra-compact
 *    XL330-M288-T (wrist flex/roll/gripper) servos, low-slung shoulder saddle,
 *    and slender orange-padded pinch gripper.
 * ============================================================================ */
const KochArmMesh: React.FC<ServoArmMeshProps> = ({
  config,
  jointAnglesDeg,
  gripperWidthMm,
  isGrasping = false,
  showGripper,
  showJointAxes = false,
  showWorkspace,
  selectedNodeId,
  onSelectEndEffector,
  onSelectJoint,
}) => {
  const jointQuats = useMemo(() => {
    return config.joints.map((spec, i) => {
      const axis = new THREE.Vector3(...spec.axis).normalize();
      return new THREE.Quaternion().setFromAxisAngle(axis, jointAnglesDeg[i] * DEG_TO_RAD);
    });
  }, [jointAnglesDeg, config]);

  const fingerHalfOffset = (gripperWidthMm / 1000) * 0.5 + 0.006;
  const eeSelected = selectedNodeId === 'TCP' || selectedNodeId === 'gripper';
  const shoulderY = config.joints[0].offsetFromParent[1] + config.joints[1].offsetFromParent[1];

  const petg = SERVO_ARM_MATERIALS.kochPetgCharcoal;
  const petgDark = SERVO_ARM_MATERIALS.kochPetgDark;
  const orange = SERVO_ARM_MATERIALS.kochAccentOrange;
  const hornMat = SERVO_ARM_MATERIALS.aluminumHorn;
  const boltMat = SERVO_ARM_MATERIALS.steelFastener;

  return (
    <group position={config.baseOffset}>
      {/* ================= KOCH v1.1 LOW-PROFILE BASE (y = 0 -> 0.041 m) ================= */}
      <group
        onClick={(e) => {
          e.stopPropagation();
          onSelectJoint('BASE');
        }}
      >
        {/* Chamfered octagonal matte-charcoal PETG desk-clamp base sitting flush at y = 0 */}
        <mesh geometry={SERVO_ARM_GEOS.kochBasePlate} material={petg} castShadow receiveShadow />

        {/* 4 corner M3 stainless steel socket cap mounting screws */}
        {[
          [-0.032, -0.032],
          [-0.032, 0.032],
          [0.032, -0.032],
          [0.032, 0.032],
        ].map(([bx, bz], idx) => (
          <mesh key={idx} position={[bx, 0.0115, bz]} material={boltMat} castShadow>
            <cylinderGeometry args={[0.0028, 0.0028, 0.0032, 6]} />
          </mesh>
        ))}

        {/* Compact beveled base servo shroud housing vertical XL430 */}
        <mesh
          position={[-0.004, 0.023, 0]}
          geometry={SERVO_ARM_GEOS.kochBaseBlock}
          material={petgDark}
          castShadow
          receiveShadow
        />
        {/* Top thrust collar */}
        <mesh position={[0, 0.0395, 0]} material={hornMat}>
          <cylinderGeometry args={[0.021, 0.023, 0.0026, 24]} />
        </mesh>

        {/* J1 Base Yaw Dynamixel XL430-W250-T inside base housing */}
        <DynamixelServo
          model="xl430"
          position={[0, 0.022, 0]}
          rotation={[-Math.PI / 2, 0, Math.PI / 2]}
          bodyShiftY={-0.005}
          selected={selectedNodeId === 'J1'}
          onClick={() => onSelectJoint('J1')}
        />

        {/* Rear compact Dynamixel U2D2 / OpenRB controller hub + orange strain relief */}
        <group position={[-0.046, 0.013, 0]}>
          <mesh material={petgDark} castShadow>
            <boxGeometry args={[0.022, 0.012, 0.038]} />
          </mesh>
          <mesh position={[0, 0.0068, 0]} material={SERVO_ARM_MATERIALS.dynamixelPcbGreen}>
            <boxGeometry args={[0.018, 0.002, 0.032]} />
          </mesh>
          <mesh position={[0.009, 0.012, 0]} material={orange}>
            <boxGeometry args={[0.006, 0.006, 0.012]} />
          </mesh>
        </group>
      </group>

      {/* Workspace Envelope */}
      {showWorkspace && (
        <group position={[0, shoulderY, 0]}>
          <mesh>
            <sphereGeometry args={[config.maxReachMeters, 28, 18]} />
            <meshBasicMaterial color="#38bdf8" wireframe transparent opacity={0.1} depthWrite={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -shoulderY + 0.004, 0]}>
            <ringGeometry args={[config.minReachMeters, config.maxReachMeters * 0.94, 48]} />
            <meshBasicMaterial
              color="#38bdf8"
              transparent
              opacity={0.07}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}

      {/* ================= J1: BASE YAW (+0.041 m -> ultra-low-slung J2 at +0.0154 m) ================= */}
      <group
        position={config.joints[0].offsetFromParent}
        quaternion={jointQuats[0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelectJoint('J1');
        }}
      >
        <MiniAxesTriad visible={showJointAxes} size={0.05} />

        {/* Low-profile circular turntable plate (Follower_Shoulder_Rotation.STL) + signature orange collar */}
        <mesh position={[0, 0.003, 0]} material={petg} castShadow receiveShadow>
          <cylinderGeometry args={[0.027, 0.028, 0.006, 24]} />
        </mesh>
        <mesh position={[0, 0.0008, 0]} material={orange}>
          <cylinderGeometry args={[0.0286, 0.0286, 0.002, 24]} />
        </mesh>
        {/* Minimalist low-slung U-saddle cheeks cradling horizontal J2 XL430 */}
        <mesh position={[-0.017, 0.014, 0]} material={petg} castShadow>
          <boxGeometry args={[0.008, 0.022, 0.038]} />
        </mesh>
        <mesh position={[0.017, 0.012, 0]} material={petg} castShadow>
          <boxGeometry args={[0.007, 0.018, 0.038]} />
        </mesh>

        {/* Horizontal J2 Shoulder Dynamixel XL430-W250-T (offset backward along -X so it clears turntable) */}
        <DynamixelServo
          model="xl430"
          position={[0, config.joints[1].offsetFromParent[1], 0]}
          rotation={[0, 0, -Math.PI / 2]}
          bodyShiftY={-0.01}
          selected={selectedNodeId === 'J2'}
          onClick={() => onSelectJoint('J2')}
        />

        {/* ================= J2: SHOULDER (Pitch, Open-Frame Skeletal Upper Arm 0.1084 m -> J3) ================= */}
        <group
          position={config.joints[1].offsetFromParent}
          quaternion={jointQuats[1]}
          onClick={(e) => {
            e.stopPropagation();
            onSelectJoint('J2');
          }}
        >
          <MiniAxesTriad visible={showJointAxes} size={0.05} />

          {/* Brushed aluminum Dynamixel HN12 4-bolt horn (+Z) & hollow idler (-Z) */}
          <CircularServoHorn position={[0, 0, 0.019]} radius={0.011} selected={selectedNodeId === 'J2'} />
          <CircularServoHorn
            position={[0, 0, -0.019]}
            rotation={[0, Math.PI, 0]}
            radius={0.01}
            selected={selectedNodeId === 'J2'}
          />

          {/* Koch v1.1 Open-Frame Twin Skeletal Side Plates (Follower_Shoulder_To_Elbow.STL) */}
          <mesh
            position={[0, 0, 0.022]}
            geometry={SERVO_ARM_GEOS.kochUpperRail}
            material={petg}
            castShadow
            receiveShadow
          />
          <mesh
            position={[0, 0, -0.022]}
            geometry={SERVO_ARM_GEOS.kochUpperRail}
            material={petg}
            castShadow
            receiveShadow
          />
          {/* Minimalist open-frame cross-spacer ribs (distinctive skeletal silhouette) */}
          {[0.032, 0.056, 0.08].map((yPos) => (
            <mesh key={yPos} position={[-0.008, yPos, 0]} material={petgDark} castShadow>
              <boxGeometry args={[0.007, 0.007, 0.04]} />
            </mesh>
          ))}
          {/* Stainless steel tie-rod standoffs */}
          <mesh position={[0.008, 0.054, 0]} rotation={[Math.PI / 2, 0, 0]} material={boltMat}>
            <cylinderGeometry args={[0.0022, 0.0022, 0.044, 10]} />
          </mesh>
          {/* Orange Koch cable clip & routed Dynamixel 3-wire bus cable */}
          <mesh position={[-0.014, 0.054, -0.012]} material={orange}>
            <boxGeometry args={[0.006, 0.006, 0.009]} />
          </mesh>
          <mesh geometry={SERVO_ARM_GEOS.kochUpperCable} material={SERVO_ARM_MATERIALS.busCable} />

          {/* Horizontal J3 Elbow Dynamixel XL430-W250-T at top of Upper Arm */}
          <DynamixelServo
            model="xl430"
            position={[0, config.joints[2].offsetFromParent[1], 0]}
            bodyShiftY={-0.0105}
            selected={selectedNodeId === 'J3'}
            onClick={() => onSelectJoint('J3')}
          />

          {/* ================= J3: ELBOW (Pitch, Converging Skeletal Forearm 0.1005 m -> J4/J5) ================= */}
          <group
            position={config.joints[2].offsetFromParent}
            quaternion={jointQuats[2]}
            onClick={(e) => {
              e.stopPropagation();
              onSelectJoint('J3');
            }}
          >
            <MiniAxesTriad visible={showJointAxes} size={0.045} />

            <CircularServoHorn position={[0, 0, 0.019]} radius={0.0105} selected={selectedNodeId === 'J3'} />
            <CircularServoHorn
              position={[0, 0, -0.019]}
              rotation={[0, Math.PI, 0]}
              radius={0.0095}
              selected={selectedNodeId === 'J3'}
            />

            {/* Twin skeletal forearm rails stepping inward cleanly from XL430 elbow to compact XL330 wrist */}
            <mesh
              position={[0, 0, 0.018]}
              rotation={[-0.045, 0, 0]}
              geometry={SERVO_ARM_GEOS.kochForearmRail}
              material={petg}
              castShadow
              receiveShadow
            />
            <mesh
              position={[0, 0, -0.018]}
              rotation={[0.045, 0, 0]}
              geometry={SERVO_ARM_GEOS.kochForearmRail}
              material={petg}
              castShadow
              receiveShadow
            />
            {/* Forearm cross-spacers & extension collar */}
            <mesh position={[-0.007, 0.034, 0]} material={petgDark} castShadow>
              <boxGeometry args={[0.006, 0.007, 0.034]} />
            </mesh>
            <mesh position={[-0.006, 0.068, 0]} material={petgDark} castShadow>
              <boxGeometry args={[0.006, 0.007, 0.03]} />
            </mesh>
            <mesh position={[-0.012, 0.052, -0.01]} material={orange}>
              <boxGeometry args={[0.005, 0.006, 0.008]} />
            </mesh>
            <mesh geometry={SERVO_ARM_GEOS.kochForearmCable} material={SERVO_ARM_MATERIALS.busCable} />

            {/* ================= J4: LOCKED FOREARM END (+0.1005 m) ================= */}
            <group position={config.joints[3].offsetFromParent} quaternion={jointQuats[3]}>
              {/* Compact Dynamixel XL330-M288-T Wrist Flex Servo (visibly smaller than XL430!) */}
              <DynamixelServo
                model="xl330"
                position={[0, 0, 0]}
                bodyShiftY={-0.0075}
                selected={selectedNodeId === 'J5'}
                onClick={() => onSelectJoint('J5')}
              />

              {/* ================= J5: WRIST FLEX (Pitch -> compact XL330 J6 at +0.0448 m) ================= */}
              <group
                position={config.joints[4].offsetFromParent}
                quaternion={jointQuats[4]}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectJoint('J5');
                }}
              >
                <MiniAxesTriad visible={showJointAxes} size={0.042} />

                <CircularServoHorn position={[0, 0, 0.0148]} radius={0.0082} selected={selectedNodeId === 'J5'} />
                <CircularServoHorn
                  position={[0, 0, -0.0148]}
                  rotation={[0, Math.PI, 0]}
                  radius={0.0075}
                  selected={selectedNodeId === 'J5'}
                />

                {/* Minimalist FR12-style C-Bracket holding compact vertical J6 XL330 */}
                <mesh
                  position={[0, 0, 0.0165]}
                  geometry={SERVO_ARM_GEOS.kochWristCheek}
                  material={petg}
                  castShadow
                />
                <mesh
                  position={[0, 0, -0.0165]}
                  geometry={SERVO_ARM_GEOS.kochWristCheek}
                  material={petg}
                  castShadow
                />
                <mesh position={[0, 0.016, 0]} material={petgDark} castShadow>
                  <boxGeometry args={[0.022, 0.005, 0.034]} />
                </mesh>

                {/* Compact Vertical Dynamixel XL330-M288-T Wrist Roll Servo */}
                <DynamixelServo
                  model="xl330"
                  position={[0, 0.03, 0]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  bodyShiftY={-0.003}
                  selected={selectedNodeId === 'J6'}
                  onClick={() => onSelectJoint('J6')}
                />

                {/* ================= J6: WRIST ROLL + KOCH v1.1 COMPACT GRIPPER (TCP at +0.065 m) ================= */}
                <group
                  position={config.joints[5].offsetFromParent}
                  quaternion={jointQuats[5]}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectEndEffector();
                  }}
                >
                  <MiniAxesTriad visible={showJointAxes} size={0.04} />

                  {/* Compact XL330 Wrist Roll Flange */}
                  <mesh
                    position={[0, 0.0025, 0]}
                    material={eeSelected ? SERVO_ARM_MATERIALS.selectedAmber : hornMat}
                    castShadow
                  >
                    <cylinderGeometry args={[0.011, 0.012, 0.005, 18]} />
                  </mesh>

                  {showGripper && (
                    <>
                      {/* Koch v1.1 Sleek Charcoal XL330 Gripper Shroud (Follower_Gripper_Static_Part) */}
                      <mesh
                        position={[0, 0.019, 0]}
                        geometry={SERVO_ARM_GEOS.kochGripperBody}
                        material={petg}
                        castShadow
                        receiveShadow
                      />
                      {/* Embedded compact XL330 Gripper Motor */}
                      <mesh position={[-0.007, 0.018, 0]} material={SERVO_ARM_MATERIALS.dynamixelBody} castShadow>
                        <boxGeometry args={[0.02, 0.024, 0.022]} />
                      </mesh>
                      {/* Grasp / selection status LED */}
                      <mesh position={[0.009, 0.026, 0.013]}>
                        <boxGeometry args={[0.009, 0.0032, 0.002]} />
                        <meshStandardMaterial
                          color={isGrasping ? '#22c55e' : eeSelected ? '#f59e0b' : '#ea580c'}
                          emissive={isGrasping ? '#16a34a' : eeSelected ? '#d97706' : '#c2410c'}
                          emissiveIntensity={0.75}
                          roughness={0.25}
                        />
                      </mesh>

                      {/* Exposed meshing mini drive gears + full-span linear carriage bridge */}
                      <mesh position={[-0.0085, 0.033, 0]} rotation={[Math.PI / 2, 0, 0]} material={hornMat} castShadow>
                        <cylinderGeometry args={[0.0072, 0.0072, 0.009, 12]} />
                      </mesh>
                      <mesh position={[0.0085, 0.033, 0]} rotation={[Math.PI / 2, 0, 0]} material={hornMat} castShadow>
                        <cylinderGeometry args={[0.0072, 0.0072, 0.009, 12]} />
                      </mesh>
                      {/* Slim dark-PETG bridge beam spanning full jaw opening */}
                      <mesh position={[0, 0.033, 0]} material={petgDark} castShadow>
                        <boxGeometry args={[Math.max(0.042, fingerHalfOffset * 2 + 0.012), 0.007, 0.012]} />
                      </mesh>
                      {/* Dual stainless guide rods */}
                      {[-0.0045, 0.0045].map((gz) => (
                        <mesh key={gz} position={[0, 0.037, gz]} rotation={[0, 0, Math.PI / 2]} material={boltMat}>
                          <cylinderGeometry args={[0.0016, 0.0016, Math.max(0.044, fingerHalfOffset * 2 + 0.01), 10]} />
                        </mesh>
                      ))}

                      {/* Left Koch Pinch Finger + Carriage Block + high-contrast orange TPU pad (aligned to TCP y = 0.065) */}
                      <group position={[-fingerHalfOffset, 0.032, 0]}>
                        <mesh position={[-0.0018, 0.0025, 0]} material={petgDark} castShadow>
                          <boxGeometry args={[0.011, 0.01, 0.018]} />
                        </mesh>
                        <mesh
                          position={[0.0022, 0, 0]}
                          geometry={SERVO_ARM_GEOS.kochJaw}
                          material={petg}
                          castShadow
                          receiveShadow
                        />
                        <mesh position={[0.0048, 0.029, 0]} material={orange}>
                          <boxGeometry args={[0.0024, 0.024, 0.013]} />
                        </mesh>
                      </group>

                      {/* Right Koch Pinch Finger (mirrored) + Carriage Block + orange TPU pad */}
                      <group position={[fingerHalfOffset, 0.032, 0]}>
                        <mesh position={[0.0018, 0.0025, 0]} material={petgDark} castShadow>
                          <boxGeometry args={[0.011, 0.01, 0.018]} />
                        </mesh>
                        <mesh
                          position={[-0.0022, 0, 0]}
                          scale={[-1, 1, 1]}
                          geometry={SERVO_ARM_GEOS.kochJaw}
                          material={petg}
                          castShadow
                          receiveShadow
                        />
                        <mesh position={[-0.0048, 0.029, 0]} material={orange}>
                          <boxGeometry args={[0.0024, 0.024, 0.013]} />
                        </mesh>
                      </group>
                    </>
                  )}

                  {/* TCP Frame Origin Marker */}
                  <group position={config.tcpOffsetFromJ6}>
                    <MiniAxesTriad visible={showJointAxes || eeSelected} size={0.042} />
                    {eeSelected && (
                      <mesh>
                        <sphereGeometry args={[0.006, 14, 14]} />
                        <meshBasicMaterial color="#f59e0b" transparent opacity={0.85} />
                      </mesh>
                    )}
                  </group>
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
};

export const ServoArmMesh: React.FC<ServoArmMeshProps> = (props) =>
  props.config.id === 'koch-v1.1' ? <KochArmMesh {...props} /> : <SO101ArmMesh {...props} />;
