# AGENTS.md — AI Coding Agent Guide for AxisLab 6

This file defines repository conventions, architectural invariants, commands, and safety checks for AI coding agents working on **AxisLab 6** (a browser-native 6-DOF robotic arm simulation, physics manipulation, and demonstration collection platform).

---

## 1. Tech Stack & Runtime Boundaries

- **Frontend**: React 19, TypeScript 7 (`tsc --noEmit`), Vite 8, Tailwind CSS v4 (`@tailwindcss/vite`), Lucide React (`lucide-react`).
- **3D & Physics**: Three.js (`three`), React Three Fiber (`@react-three/fiber`), Drei (`@react-three/drei`), Rapier3D WASM (`@dimforge/rapier3d-compat`).
- **Persistence & Optional Backend Client**: Browser `localStorage` primary persistence for demonstrations (`axislab_robotics_demonstrations_v1`), registrations, profiles, and feedback; optional `@supabase/supabase-js` integration in `src/lib/supabaseClient.ts` + `src/data/platformStore.ts`.
- **Runtime**: Client-side SPA served on port `3000`. Avoid `window.alert` and `window.open` (app may run inside an iframe).

---

## 2. Essential Commands

| Task | Command | Notes |
| :--- | :--- | :--- |
| **Dev server** | `npm run dev` | Runs Vite on `http://localhost:3000` (`--host=0.0.0.0`). Append `?autostart=1` to bypass `LandingPage` and load the 3D simulator directly. |
| **Typecheck / Lint** | `npm run lint` | Runs `tsc --noEmit`. Always run alongside builds. |
| **Production build** | `npm run build` | Builds `dist/` via `vite build` and copies `src/assets/` into `dist/src/assets/`. |
| **Unit tests** | `npx --yes tsx --test src/robotics/kinematics.test.ts src/robotics/dataset.test.ts src/robotics/telemetry.test.ts src/data/platformStore.test.ts` | Uses Node's built-in `node:test` + `node:assert/strict` via `tsx`. |

> **Important**: `package.json` uses `@tailwindcss/vite` and Vite 8; keep dependency additions minimal and batched. TypeScript path alias `@/*` resolves to the repo root (`./*`), though existing `src/` modules prefer relative imports (`../robotics/...`).

---

## 3. Repository Architecture & Module Boundaries

```text
src/
├── App.tsx                  # Central orchestrator: view routing, physics loop, IK/FK sync, recording/playback
├── main.tsx                 # React entry point
├── index.css                # Tailwind v4 (@import "tailwindcss";) + slider/scrollbar rules
├── robotics/                # PURE LOGIC ONLY (no React/DOM dependencies — must run under node:test)
│   ├── types.ts             # Shared interfaces (JointTuple, ForwardKinematicsResult, DemoFrame, etc.)
│   ├── robotModel.ts        # AXIS6_ROBOT_CONFIG (J1-J6 limits/offsets) & DEFAULT_SCENE_OBJECTS
│   ├── kinematics.ts        # FK chaining, 6-DOF Damped Least-Squares IK, Euler/Quaternion conversions
│   ├── dataset.ts           # Frame creation, linear interpolation, localStorage CRUD, JSON/CSV export
│   ├── telemetry.ts         # Quasi-static torque, 48V bus power estimation, bottle upright detection
│   └── bridge.ts            # WebSocketRobotBridge (ROS 2 rosbridge_suite & generic JSON)
├── physics/
│   └── rapierWorld.ts       # Imperative Rapier3D WASM world, static bench/tray, gripper jaws, grasp/release
├── scene/
│   ├── RoboticsViewport.tsx # R3F Canvas, OrbitControls, TransformControls gizmo, SwiftShader demand loop
│   ├── RobotArmMesh.tsx     # Procedural PBR 6-DOF arm geometry matching AXIS6_ROBOT_CONFIG
│   ├── LabEnvironment.tsx   # Lighting rig, optical breadboard table, shadows, dynamic prop meshes
│   └── materials.ts         # Software WebGL detector (isSoftwareGl), procedural textures, PBR presets
├── data/
│   └── platformStore.ts     # Public registration (email + displayName), profiles, feedback + memory test reset
├── lib/
│   └── supabaseClient.ts    # Optional singleton client (returns null cleanly when env vars are unset)
└── components/              # React UI panels, landing showcase, telemetry oscilloscope, modals
```

### Critical Boundary Rules
1. **Keep `src/robotics/` DOM-free and React-free**: All modules in `src/robotics/` must execute cleanly in Node.js via `tsx --test` without browser globals (`window`, `document`). `dataset.ts` guards `localStorage` access safely.
2. **Keep `src/App.tsx` as state coordinator, not math/physics engine**: Put kinematic math in `src/robotics/kinematics.ts`, physics state/grasping in `src/physics/rapierWorld.ts`, and telemetry formulas in `src/robotics/telemetry.ts`.

---

## 4. Domain & Engineering Invariants

### Coordinate System & Units
- **World Frame**: Right-handed **Y-up** (`+Y` vertical, workbench top plane at `y = 0.0`, robot base at `[0, 0, 0]`).
- **Dimensions & Reach**: Linear units in **meters** (`m`), except gripper jaw opening in **millimeters** (`0–80 mm`). Zero-pose vertical stack height is `1.185 m`; `maxReachMeters` is `0.92 m`.
- **Angles & Rotations**:
  - `JointTuple`: `[J1, J2, J3, J4, J5, J6]` in **degrees**, always clamped with `clampJointAnglesDeg()`.
  - `QuatTuple`: `[x, y, z, w]`.
  - Euler angles: **XYZ intrinsic order** (`tcpEulerRad` / `tcpEulerDeg`).
- **FK / Visual Mesh Alignment**: Every joint `axis`, `offsetFromParent`, and `tcpOffsetFromJ6` in `src/robotics/robotModel.ts` must stay strictly synchronized with the procedural transforms in `src/scene/RobotArmMesh.tsx`.

### Rapier3D Physics (`src/physics/rapierWorld.ts`)
- Always await `ensureRapierInitialized()` before instantiating `RoboticsPhysicsWorld`.
- Keep per-frame `step()` allocations near zero by reusing the class's scratch `THREE.Vector3` / `THREE.Quaternion` fields.
- Gripper jaws (`palmBody`, `leftFingerBody`, `rightFingerBody`) are **kinematic position-based** rigid bodies positioned from the current FK TCP pose before stepping physics.
- Do not break the `bottle_flip` prop's composite two-collider asymmetric ballast or release velocity clamping (`3.6 m/s` linear, `16 rad/s` angular).

### Rendering & Headless/Software WebGL (`src/scene/RoboticsViewport.tsx`)
- `isSoftwareGl` (`src/scene/materials.ts`) detects software WebGL (e.g., SwiftShader in headless Chromium). Under software GL, `RoboticsViewport.tsx` switches `<Canvas>` to `frameloop="demand"` and drives frames with an ~85 ms `fenceSync` polling timer so the main thread does not starve. **Never remove this pacing or force unconditional 60 FPS continuous rendering under software GL.**

### Vite & Build Constraints (`vite.config.ts`)
- **Do not remove** the `copy-unbundled-src-assets` Vite plugin: root-relative asset paths like `/src/assets/images/...` must be copied into `dist/src/assets/` for production builds.
- **Do not alter** `server.hmr` / `server.watch` `DISABLE_HMR` guards in `vite.config.ts`.

---

## 5. UI, Product & Documentation Conventions

- **Styling**: Use Tailwind CSS v4 utility classes (`src/index.css`). Keep telemetry/joint numerical displays in monospace with `tabular-nums` alignment (`IBM Plex Mono`).
- **Public Registration**: Keep registration/auth public-facing requiring only `email` and `displayName` (do not re-introduce role/job-title gating fields).
- **Documentation (`README.md`)**: `README.md` intentionally omits backend/Supabase setup details and focuses on robotics architecture, kinematics, physics, and local browser persistence; do not re-add Supabase references to `README.md` unless explicitly requested.

---

## 6. Verification Checklist Before Finishing Tasks

1. If you modified `src/robotics/*` or `src/data/platformStore.ts`, add or update corresponding `*.test.ts` cases.
2. Run unit tests:
   ```bash
   npx --yes tsx --test src/robotics/kinematics.test.ts src/robotics/dataset.test.ts src/robotics/telemetry.test.ts src/data/platformStore.test.ts
   ```
3. Run TypeScript typechecking and production build:
   ```bash
   npm run lint && npm run build
   ```
4. For UI or 3D viewport changes, verify in a headless browser (`?autostart=1` for simulator view) that there are zero runtime console errors and WebGL/Rapier initialize cleanly.
