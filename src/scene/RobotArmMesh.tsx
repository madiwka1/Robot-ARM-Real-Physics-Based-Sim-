import React, { useMemo } from 'react';
import * as THREE from 'three';
import { AXIS6_ROBOT_CONFIG } from '../robotics/robotModel';
import type { JointTuple } from '../robotics/types';
import { ROBOT_MATERIALS } from './materials';

interface AxesTriadProps {
  size?: number;
  visible: boolean;
}

export const AxesTriad: React.FC<AxesTriadProps> = ({ size = 0.09, visible }) => {
  if (!visible) return null;
  const r = 0.0022;
  return (
    <group>
      {/* +X Red */}
      <mesh position={[size / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <cylinderGeometry args={[r, r, size, 8]} />
        <meshBasicMaterial color="#ef4444" />
      </mesh>
      <mesh position={[size, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[r * 2.4, size * 0.22, 8]} />
        <meshBasicMaterial color="#ef4444" />
      </mesh>

      {/* +Y Green */}
      <mesh position={[0, size / 2, 0]}>
        <cylinderGeometry args={[r, r, size, 8]} />
        <meshBasicMaterial color="#22c55e" />
      </mesh>
      <mesh position={[0, size, 0]}>
        <coneGeometry args={[r * 2.4, size * 0.22, 8]} />
        <meshBasicMaterial color="#22c55e" />
      </mesh>

      {/* +Z Blue */}
      <mesh position={[0, 0, size / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[r, r, size, 8]} />
        <meshBasicMaterial color="#3b82f6" />
      </mesh>
      <mesh position={[0, 0, size]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[r * 2.4, size * 0.22, 8]} />
        <meshBasicMaterial color="#3b82f6" />
      </mesh>
    </group>
  );
};

interface RobotArmMeshProps {
  jointAnglesDeg: JointTuple;
  gripperWidthMm: number;
  isGrasping: boolean;
  selectedNodeId: string | null;
  showJointAxes: boolean;
  showWorkspace: boolean;
  onSelectEndEffector: () => void;
  onSelectJoint: (jointId: string) => void;
}

const DEG_TO_RAD = Math.PI / 180;

export const RobotArmMesh: React.FC<RobotArmMeshProps> = ({
  jointAnglesDeg,
  gripperWidthMm,
  isGrasping,
  selectedNodeId,
  showJointAxes,
  showWorkspace,
  onSelectEndEffector,
  onSelectJoint,
}) => {
  const cfg = AXIS6_ROBOT_CONFIG;

  // Compute exact axis-angle quaternions matching kinematics.ts
  const jointQuats = useMemo(() => {
    return cfg.joints.map((spec, i) => {
      const axis = new THREE.Vector3(...spec.axis).normalize();
      return new THREE.Quaternion().setFromAxisAngle(axis, jointAnglesDeg[i] * DEG_TO_RAD);
    });
  }, [jointAnglesDeg, cfg]);

  const fingerHalfOffset = (gripperWidthMm / 1000) * 0.5 + 0.006;
  const eeSelected = selectedNodeId === 'TCP' || selectedNodeId === 'gripper';

  const boltPositions = useMemo(() => {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      pts.push([Math.cos(a) * 0.112, Math.sin(a) * 0.112]);
    }
    return pts;
  }, []);

  return (
    <group position={cfg.baseOffset}>
      {/* ================= BASE PEDESTAL ================= */}
      <group
        onClick={(e) => {
          e.stopPropagation();
          onSelectJoint('BASE');
        }}
      >
        {/* Heavy bolted base flange */}
        <mesh position={[0, 0.012, 0]} material={ROBOT_MATERIALS.castIronDark} castShadow receiveShadow>
          <cylinderGeometry args={[0.132, 0.142, 0.024, 32]} />
        </mesh>
        {/* 8 mounting hex bolts */}
        {boltPositions.map(([bx, bz], idx) => (
          <mesh
            key={idx}
            position={[bx, 0.028, bz]}
            material={ROBOT_MATERIALS.chromeShaft}
            castShadow
          >
            <cylinderGeometry args={[0.007, 0.007, 0.008, 6]} />
          </mesh>
        ))}
        {/* Base column */}
        <mesh position={[0, 0.08, 0]} material={ROBOT_MATERIALS.anodizedSlate} castShadow receiveShadow>
          <cylinderGeometry args={[0.088, 0.105, 0.115, 32]} />
        </mesh>
        {/* Precision bearing race ring */}
        <mesh position={[0, 0.138, 0]} material={ROBOT_MATERIALS.chromeShaft} castShadow>
          <cylinderGeometry args={[0.09, 0.09, 0.01, 32]} />
        </mesh>
        {/* Rear IO connector box */}
        <mesh position={[-0.095, 0.06, 0]} material={ROBOT_MATERIALS.castIronDark} castShadow>
          <boxGeometry args={[0.04, 0.055, 0.065]} />
        </mesh>
      </group>

      {/* Workspace Envelope Sphere (centered at shoulder J2 height 0.30m) */}
      {showWorkspace && (
        <group position={[0, 0.3, 0]}>
          <mesh>
            <sphereGeometry args={[cfg.maxReachMeters, 28, 18]} />
            <meshBasicMaterial
              color="#38bdf8"
              wireframe
              transparent
              opacity={0.1}
              depthWrite={false}
            />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.295, 0]}>
            <ringGeometry args={[cfg.minReachMeters, cfg.maxReachMeters * 0.94, 48]} />
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

      {/* ================= J1: WAIST YAW ================= */}
      <group
        position={cfg.joints[0].offsetFromParent}
        quaternion={jointQuats[0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelectJoint('J1');
        }}
      >
        <AxesTriad visible={showJointAxes} size={0.11} />
        {/* Turret housing */}
        <mesh position={[0, 0.065, 0]} material={ROBOT_MATERIALS.anodizedSlate} castShadow receiveShadow>
          <cylinderGeometry args={[0.084, 0.088, 0.125, 32]} />
        </mesh>
        {/* Yoke side cheeks */}
        <mesh position={[0, 0.135, 0.055]} material={ROBOT_MATERIALS.castIronDark} castShadow>
          <boxGeometry args={[0.11, 0.11, 0.028]} />
        </mesh>
        <mesh position={[0, 0.135, -0.055]} material={ROBOT_MATERIALS.castIronDark} castShadow>
          <boxGeometry args={[0.11, 0.11, 0.028]} />
        </mesh>
        {/* Amber accent collar */}
        <mesh position={[0, 0.012, 0]} material={ROBOT_MATERIALS.industrialAmber}>
          <cylinderGeometry args={[0.091, 0.091, 0.01, 32]} />
        </mesh>

        {/* ================= J2: SHOULDER PITCH ================= */}
        <group
          position={cfg.joints[1].offsetFromParent}
          quaternion={jointQuats[1]}
          onClick={(e) => {
            e.stopPropagation();
            onSelectJoint('J2');
          }}
        >
          <AxesTriad visible={showJointAxes} size={0.11} />
          {/* Shoulder servo drum */}
          <mesh rotation={[Math.PI / 2, 0, 0]} material={ROBOT_MATERIALS.castIronDark} castShadow>
            <cylinderGeometry args={[0.068, 0.068, 0.155, 28]} />
          </mesh>
          <mesh
            position={[0, 0, 0.082]}
            rotation={[Math.PI / 2, 0, 0]}
            material={selectedNodeId === 'J2' ? ROBOT_MATERIALS.industrialAmber : ROBOT_MATERIALS.machinedAluminum}
          >
            <cylinderGeometry args={[0.044, 0.044, 0.014, 24]} />
          </mesh>
          <mesh
            position={[0, 0, -0.082]}
            rotation={[Math.PI / 2, 0, 0]}
            material={ROBOT_MATERIALS.machinedAluminum}
          >
            <cylinderGeometry args={[0.044, 0.044, 0.014, 24]} />
          </mesh>

          {/* Upper arm twin structural rails (span 0.36m along +Y) */}
          <mesh position={[0, 0.18, 0.032]} material={ROBOT_MATERIALS.anodizedSlate} castShadow receiveShadow>
            <boxGeometry args={[0.072, 0.35, 0.022]} />
          </mesh>
          <mesh position={[0, 0.18, -0.032]} material={ROBOT_MATERIALS.anodizedSlate} castShadow receiveShadow>
            <boxGeometry args={[0.072, 0.35, 0.022]} />
          </mesh>
          {/* Central machined spine & amber trim */}
          <mesh position={[0, 0.18, 0]} material={ROBOT_MATERIALS.machinedAluminum} castShadow>
            <cylinderGeometry args={[0.026, 0.032, 0.33, 20]} />
          </mesh>
          <mesh position={[0.038, 0.18, 0]} material={ROBOT_MATERIALS.industrialAmber} castShadow>
            <boxGeometry args={[0.008, 0.27, 0.032]} />
          </mesh>

          {/* ================= J3: ELBOW PITCH ================= */}
          <group
            position={cfg.joints[2].offsetFromParent}
            quaternion={jointQuats[2]}
            onClick={(e) => {
              e.stopPropagation();
              onSelectJoint('J3');
            }}
          >
            <AxesTriad visible={showJointAxes} size={0.1} />
            {/* Elbow servo drum */}
            <mesh rotation={[Math.PI / 2, 0, 0]} material={ROBOT_MATERIALS.castIronDark} castShadow>
              <cylinderGeometry args={[0.056, 0.056, 0.125, 28]} />
            </mesh>
            <mesh
              position={[0, 0, 0.066]}
              rotation={[Math.PI / 2, 0, 0]}
              material={selectedNodeId === 'J3' ? ROBOT_MATERIALS.industrialAmber : ROBOT_MATERIALS.machinedAluminum}
            >
              <cylinderGeometry args={[0.036, 0.036, 0.012, 24]} />
            </mesh>
            {/* Elbow counterweight housing */}
            <mesh position={[-0.045, 0.015, 0]} material={ROBOT_MATERIALS.anodizedSlate} castShadow>
              <boxGeometry args={[0.065, 0.075, 0.075]} />
            </mesh>

            {/* Forearm tube (0.22m to J4) */}
            <mesh position={[0, 0.11, 0]} material={ROBOT_MATERIALS.anodizedSlate} castShadow receiveShadow>
              <cylinderGeometry args={[0.038, 0.048, 0.21, 24]} />
            </mesh>
            {/* Forearm servo collar */}
            <mesh position={[0, 0.185, 0]} material={ROBOT_MATERIALS.servoRingBlue} castShadow>
              <cylinderGeometry args={[0.042, 0.042, 0.018, 24]} />
            </mesh>

            {/* ================= J4: FOREARM ROLL ================= */}
            <group
              position={cfg.joints[3].offsetFromParent}
              quaternion={jointQuats[3]}
              onClick={(e) => {
                e.stopPropagation();
                onSelectJoint('J4');
              }}
            >
              <AxesTriad visible={showJointAxes} size={0.09} />
              <mesh position={[0, 0.035, 0]} material={ROBOT_MATERIALS.machinedAluminum} castShadow>
                <cylinderGeometry args={[0.034, 0.038, 0.07, 24]} />
              </mesh>
              {/* Wrist clevis forks */}
              <mesh position={[0, 0.08, 0.03]} material={ROBOT_MATERIALS.castIronDark} castShadow>
                <boxGeometry args={[0.05, 0.056, 0.016]} />
              </mesh>
              <mesh position={[0, 0.08, -0.03]} material={ROBOT_MATERIALS.castIronDark} castShadow>
                <boxGeometry args={[0.05, 0.056, 0.016]} />
              </mesh>

              {/* ================= J5: WRIST PITCH ================= */}
              <group
                position={cfg.joints[4].offsetFromParent}
                quaternion={jointQuats[4]}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectJoint('J5');
                }}
              >
                <AxesTriad visible={showJointAxes} size={0.085} />
                {/* Wrist pitch joint drum */}
                <mesh rotation={[Math.PI / 2, 0, 0]} material={ROBOT_MATERIALS.castIronDark} castShadow>
                  <cylinderGeometry args={[0.034, 0.034, 0.084, 24]} />
                </mesh>
                <mesh
                  position={[0, 0, 0.044]}
                  rotation={[Math.PI / 2, 0, 0]}
                  material={ROBOT_MATERIALS.industrialAmber}
                >
                  <cylinderGeometry args={[0.02, 0.02, 0.008, 20]} />
                </mesh>
                {/* Wrist output neck (0.09m to J6) */}
                <mesh position={[0, 0.045, 0]} material={ROBOT_MATERIALS.anodizedSlate} castShadow>
                  <cylinderGeometry args={[0.028, 0.032, 0.085, 22]} />
                </mesh>

                {/* ================= J6: TOOL FLANGE + PARALLEL GRIPPER ================= */}
                <group
                  position={cfg.joints[5].offsetFromParent}
                  quaternion={jointQuats[5]}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectEndEffector();
                  }}
                >
                  <AxesTriad visible={showJointAxes} size={0.08} />
                  {/* ISO Mounting Flange */}
                  <mesh position={[0, 0.008, 0]} material={ROBOT_MATERIALS.chromeShaft} castShadow>
                    <cylinderGeometry args={[0.034, 0.034, 0.016, 24]} />
                  </mesh>

                  {/* Parallel Gripper Actuator Body */}
                  <mesh position={[0, 0.038, 0]} material={ROBOT_MATERIALS.castIronDark} castShadow receiveShadow>
                    <boxGeometry args={[0.088, 0.044, 0.048]} />
                  </mesh>
                  {/* Gripper status bezel (lights up amber when grasping, cyan when selected) */}
                  <mesh position={[0, 0.038, 0.025]}>
                    <boxGeometry args={[0.048, 0.01, 0.004]} />
                    <meshStandardMaterial
                      color={isGrasping ? '#22c55e' : eeSelected ? '#f59e0b' : '#0ea5e9'}
                      emissive={isGrasping ? '#16a34a' : eeSelected ? '#d97706' : '#0284c7'}
                      emissiveIntensity={0.65}
                      roughness={0.3}
                    />
                  </mesh>

                  {/* Dual Chrome Linear Guide Rails */}
                  <mesh
                    position={[0, 0.064, 0.012]}
                    rotation={[0, 0, Math.PI / 2]}
                    material={ROBOT_MATERIALS.chromeShaft}
                  >
                    <cylinderGeometry args={[0.004, 0.004, 0.094, 12]} />
                  </mesh>
                  <mesh
                    position={[0, 0.064, -0.012]}
                    rotation={[0, 0, Math.PI / 2]}
                    material={ROBOT_MATERIALS.chromeShaft}
                  >
                    <cylinderGeometry args={[0.004, 0.004, 0.094, 12]} />
                  </mesh>

                  {/* Left Finger Assembly */}
                  <group position={[-fingerHalfOffset, 0.085, 0]}>
                    <mesh position={[0, -0.012, 0]} material={ROBOT_MATERIALS.machinedAluminum} castShadow>
                      <boxGeometry args={[0.012, 0.028, 0.028]} />
                    </mesh>
                    <mesh position={[0, 0.022, 0]} material={ROBOT_MATERIALS.machinedAluminum} castShadow>
                      <boxGeometry args={[0.01, 0.046, 0.024]} />
                    </mesh>
                    {/* High-friction rubber pad facing inward (+X) */}
                    <mesh position={[0.006, 0.028, 0]} material={ROBOT_MATERIALS.rubberGrip}>
                      <boxGeometry args={[0.004, 0.034, 0.022]} />
                    </mesh>
                  </group>

                  {/* Right Finger Assembly */}
                  <group position={[fingerHalfOffset, 0.085, 0]}>
                    <mesh position={[0, -0.012, 0]} material={ROBOT_MATERIALS.machinedAluminum} castShadow>
                      <boxGeometry args={[0.012, 0.028, 0.028]} />
                    </mesh>
                    <mesh position={[0, 0.022, 0]} material={ROBOT_MATERIALS.machinedAluminum} castShadow>
                      <boxGeometry args={[0.01, 0.046, 0.024]} />
                    </mesh>
                    {/* High-friction rubber pad facing inward (-X) */}
                    <mesh position={[-0.006, 0.028, 0]} material={ROBOT_MATERIALS.rubberGrip}>
                      <boxGeometry args={[0.004, 0.034, 0.022]} />
                    </mesh>
                  </group>

                  {/* TCP Frame Origin Marker */}
                  <group position={cfg.tcpOffsetFromJ6}>
                    <AxesTriad visible={showJointAxes || eeSelected} size={0.075} />
                    {eeSelected && (
                      <mesh>
                        <sphereGeometry args={[0.009, 14, 14]} />
                        <meshBasicMaterial color="#f59e0b" transparent opacity={0.8} />
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
