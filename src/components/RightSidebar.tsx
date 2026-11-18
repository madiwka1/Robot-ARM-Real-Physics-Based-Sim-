import React from 'react';
import {
  Crosshair,
  GripHorizontal,
  Home,
  Minus,
  Move,
  Plus,
  RotateCw,
  Sliders,
} from 'lucide-react';
import {
  AXIS6_ROBOT_CONFIG,
  GRIPPER_MAX_WIDTH_MM,
  GRIPPER_MIN_WIDTH_MM,
} from '../robotics/robotModel';
import type { JointTelemetry } from '../robotics/telemetry';
import type {
  ControlMode,
  GizmoMode,
  GripperState,
  JointTuple,
  Vec3Tuple,
} from '../robotics/types';

interface RightSidebarProps {
  controlMode: ControlMode;
  gizmoMode: GizmoMode;
  jointAnglesDeg: JointTuple;
  jointTelemetry: JointTelemetry[] | null;
  actualTcpPosition: Vec3Tuple;
  actualTcpEulerDeg: Vec3Tuple;
  ikTargetPosition: Vec3Tuple;
  ikTargetEulerDeg: Vec3Tuple;
  ikPositionErrorMm: number;
  ikConverged: boolean;
  gripper: GripperState;
  graspedObjectName: string | null;
  onChangeControlMode: (mode: ControlMode) => void;
  onChangeGizmoMode: (mode: GizmoMode) => void;
  onChangeJointAngle: (jointIndex: number, angleDeg: number) => void;
  onHomeArm: () => void;
  onZeroArm: () => void;
  onChangeIkTargetPos: (axisIndex: 0 | 1 | 2, valueMeters: number) => void;
  onChangeIkTargetEuler: (axisIndex: 0 | 1 | 2, valueDeg: number) => void;
  onChangeGripperWidth: (widthMm: number) => void;
  onOpenGripper: () => void;
  onCloseGripper: () => void;
}

export const RightSidebar: React.FC<RightSidebarProps> = ({
  controlMode,
  gizmoMode,
  jointAnglesDeg,
  jointTelemetry,
  actualTcpPosition,
  actualTcpEulerDeg,
  ikTargetPosition,
  ikTargetEulerDeg,
  ikPositionErrorMm,
  ikConverged,
  gripper,
  graspedObjectName,
  onChangeControlMode,
  onChangeGizmoMode,
  onChangeJointAngle,
  onHomeArm,
  onZeroArm,
  onChangeIkTargetPos,
  onChangeIkTargetEuler,
  onChangeGripperWidth,
  onOpenGripper,
  onCloseGripper,
}) => {
  return (
    <aside
      aria-label="Robot Joint, IK, and Gripper Controls"
      className="flex h-full w-80 shrink-0 flex-col border-l border-white/10 bg-[#12161d] overflow-y-auto ide-scroll"
    >
      {/* Control Mode Segmented Switcher */}
      <div className="border-b border-white/10 p-2.5">
        <div className="grid grid-cols-2 gap-1 rounded bg-[#0d1015] p-1 border border-white/10">
          <button
            type="button"
            onClick={() => onChangeControlMode('joint')}
            className={`flex items-center justify-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              controlMode === 'joint'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>Joint Control</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeControlMode('ik')}
            className={`flex items-center justify-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              controlMode === 'ik'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Crosshair className="h-3.5 w-3.5" />
            <span>Direct IK</span>
          </button>
        </div>
      </div>

      {/* Direct Manipulation / End Effector Coordinates */}
      <div className="border-b border-white/10 p-2.5 space-y-1.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-wide text-slate-200">
            End Effector Pose
          </h2>
          {controlMode === 'ik' ? (
            <span
              className={`text-[11px] font-mono-tabular ${
                ikConverged ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              err {ikPositionErrorMm.toFixed(1)} mm
            </span>
          ) : (
            <span className="text-[11px] text-slate-400">FK Readout</span>
          )}
        </div>

        {/* Gizmo Mode Toggle in IK mode */}
        {controlMode === 'ik' && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onChangeGizmoMode('translate')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                gizmoMode === 'translate'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40'
                  : 'bg-[#1a202b] text-slate-300 border border-white/5 hover:bg-[#232b3a]'
              }`}
            >
              <Move className="h-3.5 w-3.5" />
              <span>Translate (G)</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeGizmoMode('rotate')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                gizmoMode === 'rotate'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40'
                  : 'bg-[#1a202b] text-slate-300 border border-white/5 hover:bg-[#232b3a]'
              }`}
            >
              <RotateCw className="h-3.5 w-3.5" />
              <span>Rotate (R)</span>
            </button>
          </div>
        )}

        {/* Actual vs Target XYZ */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Actual Position (m)</span>
            <span className="font-mono-tabular text-slate-200">
              {actualTcpPosition[0].toFixed(3)}, {actualTcpPosition[1].toFixed(3)},{' '}
              {actualTcpPosition[2].toFixed(3)}
            </span>
          </div>

          {controlMode === 'ik' && (
            <div className="grid grid-cols-3 gap-1.5 pt-0.5">
              {(['X', 'Y', 'Z'] as const).map((axis, idx) => (
                <label key={axis} className="block space-y-0.5">
                  <span className="block text-[10px] text-slate-400">
                    Target {axis}
                  </span>
                  <input
                    type="number"
                    step={0.01}
                    value={Number(ikTargetPosition[idx].toFixed(3))}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (Number.isFinite(val)) {
                        onChangeIkTargetPos(idx as 0 | 1 | 2, val);
                      }
                    }}
                    className="w-full rounded border border-white/10 bg-[#0d1015] px-1.5 py-0.5 font-mono-tabular text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </label>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Actual RPY (°)</span>
            <span className="font-mono-tabular text-slate-300">
              {actualTcpEulerDeg[0].toFixed(1)}°, {actualTcpEulerDeg[1].toFixed(1)}°,{' '}
              {actualTcpEulerDeg[2].toFixed(1)}°
            </span>
          </div>

          {controlMode === 'ik' && (
            <div className="grid grid-cols-3 gap-1.5 pt-0.5">
              {(['R', 'P', 'Y'] as const).map((axis, idx) => (
                <label key={axis} className="block space-y-0.5">
                  <span className="block text-[10px] text-slate-400">
                    {axis} (°)
                  </span>
                  <input
                    type="number"
                    step={5}
                    value={Number(ikTargetEulerDeg[idx].toFixed(1))}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (Number.isFinite(val)) {
                        onChangeIkTargetEuler(idx as 0 | 1 | 2, val);
                      }
                    }}
                    className="w-full rounded border border-white/10 bg-[#0d1015] px-1.5 py-0.5 font-mono-tabular text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Joint Control J1-J6 */}
      <div className="border-b border-white/10 p-2.5 space-y-1.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-wide text-slate-200">
            Joint Angles (J1–J6)
          </h2>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onHomeArm}
              aria-label="Move Arm to Home Position"
              className="flex items-center gap-1 rounded border border-white/10 bg-[#1a202b] px-2 py-0.5 text-[11px] font-medium text-slate-200 hover:bg-[#232b3a] cursor-pointer"
            >
              <Home className="h-3 w-3 text-amber-400" />
              <span>Home</span>
            </button>
            <button
              type="button"
              onClick={onZeroArm}
              aria-label="Zero All Joints"
              className="rounded border border-white/10 bg-[#1a202b] px-2 py-0.5 text-[11px] font-medium text-slate-300 hover:bg-[#232b3a] cursor-pointer"
            >
              Zero
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          {AXIS6_ROBOT_CONFIG.joints.map((joint, idx) => {
            const val = jointAnglesDeg[idx];
            const jTel = jointTelemetry?.[idx];
            const watts = jTel?.powerWatts ?? 2.4;
            const loadPct = jTel?.loadPct ?? 0;
            const loadBarColor =
              loadPct > 75
                ? 'bg-red-500'
                : loadPct > 45
                  ? 'bg-amber-400'
                  : 'bg-sky-400';

            return (
              <div key={joint.id} className="space-y-0.5">
                <div className="flex items-center justify-between text-xs">
                  <label
                    htmlFor={`joint-slider-${joint.id}`}
                    className="text-slate-300 font-medium flex items-center gap-1.5"
                  >
                    <span>{joint.id}</span>
                    <span className="text-slate-500 font-normal">
                      {joint.name}
                    </span>
                  </label>
                  <div className="flex items-center gap-1">
                    <span
                      title={`Load ${loadPct.toFixed(0)}%`}
                      className="font-mono-tabular text-[10px] text-amber-300/90 mr-0.5"
                    >
                      {watts.toFixed(1)}W
                    </span>
                    <button
                      type="button"
                      aria-label={`Decrease ${joint.id} by 1 degree`}
                      onClick={() => onChangeJointAngle(idx, val - 1)}
                      className="flex h-4 w-4 items-center justify-center rounded bg-[#1a202b] text-slate-300 hover:bg-[#273040] cursor-pointer"
                    >
                      <Minus className="h-2.5 w-2.5" />
                    </button>
                    <span className="w-12 text-right font-mono-tabular text-xs text-slate-100">
                      {val.toFixed(1)}°
                    </span>
                    <button
                      type="button"
                      aria-label={`Increase ${joint.id} by 1 degree`}
                      onClick={() => onChangeJointAngle(idx, val + 1)}
                      className="flex h-4 w-4 items-center justify-center rounded bg-[#1a202b] text-slate-300 hover:bg-[#273040] cursor-pointer"
                    >
                      <Plus className="h-2.5 w-2.5" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    id={`joint-slider-${joint.id}`}
                    type="range"
                    min={joint.minDeg}
                    max={joint.maxDeg}
                    step={0.5}
                    value={val}
                    onChange={(e) =>
                      onChangeJointAngle(idx, parseFloat(e.target.value))
                    }
                    className="robotics-slider flex-1"
                  />
                  <div className="h-1.5 w-7 overflow-hidden rounded-xs bg-slate-800 shrink-0">
                    <div
                      className={`h-full ${loadBarColor}`}
                      style={{ width: `${Math.min(100, Math.max(8, loadPct))}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Gripper Controls */}
      <div className="p-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-200">
            <GripHorizontal className="h-3.5 w-3.5 text-slate-400" />
            <span>Parallel Gripper</span>
          </h2>
          <span className="font-mono-tabular text-xs text-slate-200">
            {gripper.widthMm.toFixed(0)} mm
          </span>
        </div>

        <input
          aria-label="Gripper Opening Width Millimeters"
          type="range"
          min={GRIPPER_MIN_WIDTH_MM}
          max={GRIPPER_MAX_WIDTH_MM}
          step={1}
          value={gripper.targetWidthMm}
          onChange={(e) => onChangeGripperWidth(parseFloat(e.target.value))}
          className="robotics-slider w-full"
        />

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onOpenGripper}
            className="rounded border border-white/10 bg-[#1a202b] px-3 py-1 text-xs font-medium text-slate-200 hover:bg-[#232b3a] cursor-pointer"
          >
            Open Jaw
          </button>
          <button
            type="button"
            onClick={onCloseGripper}
            className="rounded bg-amber-500 px-3 py-1 text-xs font-medium text-slate-950 hover:bg-amber-400 cursor-pointer"
          >
            Close / Grasp
          </button>
        </div>

        <div className="rounded border border-white/10 bg-[#0d1015] px-2.5 py-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Contact State</span>
            <span
              className={`font-medium ${
                gripper.isGrasping ? 'text-emerald-400' : 'text-slate-300'
              }`}
            >
              {gripper.isGrasping
                ? `Holding ${graspedObjectName ?? 'Object'}`
                : 'Open · No Contact'}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
