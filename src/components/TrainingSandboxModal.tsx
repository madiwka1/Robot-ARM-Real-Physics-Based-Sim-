import React, { useEffect, useRef, useState } from 'react';
import { Download, Eye, Play, Square, X } from 'lucide-react';
import { DEFAULT_ARS_CONFIG, rolloutToDemonstration, type ArsConfig, type ArsProgress } from '../sim/ars';
import {
  DEFAULT_RANDOMIZATION,
  NO_RANDOMIZATION,
  TASKS,
  type ActionMode,
  type DomainRandomization,
  type TaskId,
} from '../sim/env';
import type { TrainerRequest, TrainerResponse } from '../sim/trainer.worker';
import type { Demonstration, RobotModelConfig } from '../robotics/types';

interface TrainingSandboxModalProps {
  open: boolean;
  onClose: () => void;
  /** Adds a recorded policy rollout to the demonstration library (replay / JSON / CSV export). */
  onAddDemonstration: (demo: Demonstration) => void;
  /** Live preview of the current policy in the viewer while training (null = stop preview). */
  onPreview: (demo: Demonstration | null) => void;
  /** Robot the policy is trained on (the one selected in the toolbar). */
  robot: RobotModelConfig;
}

type Hyper = Omit<ArsConfig, 'taskId' | 'actionMode' | 'randomization' | 'robotId'>;

const HYPER_FIELDS: Array<{ key: keyof Hyper; label: string; step: number; hint: string }> = [
  { key: 'iterations', label: 'Iterations', step: 1, hint: 'ARS updates' },
  { key: 'directions', label: 'Directions N', step: 1, hint: 'random perturbations / iter' },
  { key: 'topDirections', label: 'Top b', step: 1, hint: 'best directions used' },
  { key: 'stepSize', label: 'Step size α', step: 0.01, hint: 'learning rate' },
  { key: 'explorationNoise', label: 'Noise ν', step: 0.01, hint: 'weight perturbation std' },
  { key: 'evalEpisodes', label: 'Eval episodes', step: 1, hint: 'per iteration' },
  { key: 'seed', label: 'Seed', step: 1, hint: 'reproducible run' },
];

const DR_FIELDS: Array<{ key: keyof DomainRandomization; label: string; step: number }> = [
  { key: 'objectPosJitterM', label: 'Object pos ± (m)', step: 0.005 },
  { key: 'massScale', label: 'Mass ± (frac)', step: 0.05 },
  { key: 'frictionScale', label: 'Friction ± (frac)', step: 0.05 },
  { key: 'initialJointJitterDeg', label: 'Start joints ± (°)', step: 0.5 },
  { key: 'actionNoise', label: 'Action noise σ', step: 0.01 },
  { key: 'obsNoise', label: 'Obs noise σ', step: 0.001 },
];

const inputClass =
  'w-full rounded border border-white/10 bg-[#0d1117] px-2 py-1 font-mono-tabular text-xs text-slate-100 tabular-nums focus:border-sky-500 focus:outline-none';

function downloadJson(filename: string, data: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Learning curve: mean eval return (sky) and success rate (emerald, 0-100% on the right axis). */
const LearningCurve: React.FC<{ history: ArsProgress[] }> = ({ history }) => {
  const W = 560;
  const H = 150;
  const P = 28;
  if (history.length < 2) {
    return (
      <div className="flex h-[150px] items-center justify-center rounded border border-white/10 bg-[#0d1117] text-xs text-slate-500">
        Learning curve appears after 2 iterations
      </div>
    );
  }
  const returns = history.map((h) => h.meanReturn);
  const lo = Math.min(...returns);
  const hi = Math.max(...returns);
  const span = hi - lo || 1;
  const x = (i: number) => P + (i / (history.length - 1)) * (W - 2 * P);
  const yR = (v: number) => H - P / 2 - ((v - lo) / span) * (H - P);
  const yS = (v: number) => H - P / 2 - v * (H - P);
  const path = (pts: Array<[number, number]>) => pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded border border-white/10 bg-[#0d1117]" role="img" aria-label="Training learning curve">
      <path d={path(history.map((h, i) => [x(i), yS(h.successRate)]))} fill="none" stroke="#34d399" strokeWidth={1.5} strokeDasharray="4 3" />
      <path d={path(history.map((h, i) => [x(i), yR(h.meanReturn)]))} fill="none" stroke="#38bdf8" strokeWidth={2} />
      <text x={4} y={12} className="fill-slate-400" fontSize={10}>{hi.toFixed(1)}</text>
      <text x={4} y={H - 4} className="fill-slate-400" fontSize={10}>{lo.toFixed(1)}</text>
      <text x={W - 34} y={12} className="fill-emerald-400" fontSize={10}>100%</text>
      <text x={W - 26} y={H - 4} className="fill-emerald-400" fontSize={10}>0%</text>
    </svg>
  );
};

export const TrainingSandboxModal: React.FC<TrainingSandboxModalProps> = ({ open, onClose, onAddDemonstration, onPreview, robot }) => {
  const [livePreview, setLivePreview] = useState(true);
  const livePreviewRef = useRef(livePreview);
  livePreviewRef.current = livePreview;
  const [taskId, setTaskId] = useState<TaskId>('reach');
  const [actionMode, setActionMode] = useState<ActionMode>('ee_delta');
  const [hyper, setHyper] = useState<Hyper>({ ...DEFAULT_ARS_CONFIG });
  const [randomize, setRandomize] = useState(false);
  const [dr, setDr] = useState<DomainRandomization>({ ...DEFAULT_RANDOMIZATION });
  const [history, setHistory] = useState<ArsProgress[]>([]);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => () => workerRef.current?.terminate(), []);

  if (!open) return null;

  const latest = history[history.length - 1];
  const best = latest?.best;
  const task = TASKS[taskId];

  const start = () => {
    workerRef.current?.terminate();
    const worker = new Worker(new URL('../sim/trainer.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    setHistory([]);
    setStatus('Starting worker…');
    setRunning(true);
    worker.onmessage = (e: MessageEvent<TrainerResponse>) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        setHistory((h) => [...h, msg.progress]);
        setStatus(null);
        if (msg.preview && livePreviewRef.current) onPreview(msg.preview);
      } else {
        setRunning(false);
        setStatus(msg.type === 'error' ? `Error: ${msg.message}` : msg.stopped ? 'Stopped' : 'Training complete');
        worker.terminate();
        workerRef.current = null;
      }
    };
    const config: ArsConfig = {
      ...hyper,
      taskId,
      actionMode,
      robotId: robot.id,
      randomization: randomize ? dr : NO_RANDOMIZATION,
    };
    worker.postMessage({ type: 'start', config, preview: true } satisfies TrainerRequest);
  };

  const stop = () => workerRef.current?.postMessage({ type: 'stop' } satisfies TrainerRequest);

  const watchBest = () => {
    if (!best) return;
    // Default scene + no randomization so the replay in the viewer matches the recorded rollout
    const seed = 1_000_000 + Math.floor(Math.random() * 1000);
    const r = rolloutToDemonstration(best.policy, seed, NO_RANDOMIZATION, `ARS it ${best.iteration}`);
    onAddDemonstration(r.demo);
    setStatus(`Added rollout (seed ${seed}, return ${r.return.toFixed(2)}${r.success ? ', success' : ''}) to Demonstrations`);
  };

  const numberField = <T extends object>(obj: T, set: (v: T) => void, key: keyof T, step: number, disabled: boolean) => (
    <input
      type="number"
      step={step}
      value={Number(obj[key])}
      disabled={disabled}
      onChange={(e) => set({ ...obj, [key]: Number(e.target.value) })}
      className={inputClass}
    />
  );

  const close = () => {
    onPreview(null);
    onClose();
  };

  // Docked side panel (no backdrop) so the 3D viewer stays visible for the live preview
  return (
    <div role="dialog" aria-label="Training Sandbox" className="fixed bottom-0 right-0 top-12 z-40 flex w-[460px] max-w-full flex-col border-l border-white/15 bg-[#141820] shadow-2xl">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Training Sandbox · ARS</h2>
            <p className="text-[11px] text-slate-500">Gym-style env on Rapier3D · linear policy · Web Worker</p>
          </div>
          <button type="button" onClick={close} aria-label="Close Training Sandbox" className="cursor-pointer rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="mt-3 flex items-center gap-2 rounded border border-violet-500/30 bg-violet-500/10 px-2 py-1.5 text-xs text-violet-200">
          <input
            type="checkbox"
            checked={livePreview}
            onChange={(e) => {
              setLivePreview(e.target.checked);
              if (!e.target.checked) onPreview(null);
            }}
          />
          Live preview: the viewer loops the current policy each iteration (same goal, so you see it improve)
        </label>

        <div className="mt-4 space-y-5">
          {/* Configuration */}
          <div className="space-y-3 text-xs">
            <label className="block space-y-1">
              <span className="font-medium text-slate-300">Task</span>
              <select value={taskId} disabled={running} onChange={(e) => setTaskId(e.target.value as TaskId)} className={inputClass}>
                {Object.values(TASKS).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <span className="block leading-relaxed text-slate-500">{task.description} Episode: {task.episodeSteps} steps @ 20 Hz.</span>
            </label>

            <div className="rounded border border-white/10 bg-[#0d1117] px-2 py-1.5 text-slate-400">
              Robot: <span className="font-medium text-slate-200">{robot.name}</span>
              <span className="block text-[11px] text-slate-500">Change it in the toolbar. {robot.actuators.label}.</span>
            </div>

            <label className="block space-y-1">
              <span className="font-medium text-slate-300">Action space</span>
              <select
                value={taskId === 'balance' ? 'balance' : actionMode}
                disabled={running || taskId === 'balance'}
                onChange={(e) => setActionMode(e.target.value as ActionMode)}
                className={inputClass}
              >
                {taskId === 'balance' && <option value="balance">Wrist tilt rates J5 / J6 (2) · ±60°/s</option>}
                <option value="ee_delta">End-effector Δxyz + gripper (4) · IK, like Gymnasium Fetch</option>
                <option value="joint_velocity">Joint velocities J1–J6 + gripper (7)</option>
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2">
              {HYPER_FIELDS.map((f) => (
                <label key={f.key} className="block space-y-0.5" title={f.hint}>
                  <span className="text-slate-400">{f.label}</span>
                  {numberField(hyper, setHyper, f.key, f.step, running)}
                </label>
              ))}
            </div>

            <label className="flex items-center gap-2 pt-1 text-slate-300">
              <input type="checkbox" checked={randomize} disabled={running} onChange={(e) => setRandomize(e.target.checked)} />
              Domain randomization (sim-to-real robustness)
            </label>
            {randomize && (
              <div className="grid grid-cols-2 gap-2">
                {DR_FIELDS.map((f) => (
                  <label key={f.key} className="block space-y-0.5">
                    <span className="text-slate-400">{f.label}</span>
                    {numberField(dr, setDr, f.key, f.step, running)}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Training run */}
          <div className="space-y-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              {running ? (
                <button type="button" onClick={stop} className="flex cursor-pointer items-center gap-1.5 rounded bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-500">
                  <Square className="h-3.5 w-3.5" /> Stop
                </button>
              ) : (
                <button type="button" onClick={start} className="flex cursor-pointer items-center gap-1.5 rounded bg-sky-600 px-3 py-1.5 font-medium text-white hover:bg-sky-500">
                  <Play className="h-3.5 w-3.5" /> Train
                </button>
              )}
              <button type="button" onClick={watchBest} disabled={!best || running} className="flex cursor-pointer items-center gap-1.5 rounded border border-white/10 bg-[#1a202b] px-3 py-1.5 text-slate-200 hover:bg-[#232b3a] disabled:cursor-not-allowed disabled:opacity-40">
                <Eye className="h-3.5 w-3.5" /> Watch best in viewer
              </button>
              <button
                type="button"
                onClick={() => best && downloadJson(`axislab_policy_${taskId}_it${best.iteration}.json`, best.policy)}
                disabled={!best}
                className="flex cursor-pointer items-center gap-1.5 rounded border border-white/10 bg-[#1a202b] px-3 py-1.5 text-slate-200 hover:bg-[#232b3a] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" /> Export policy
              </button>
            </div>

            <LearningCurve history={history} />

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono-tabular tabular-nums text-slate-300">
              <span>Iteration</span><span className="text-right">{latest ? `${latest.iteration} / ${hyper.iterations}` : '—'}</span>
              <span className="text-sky-400">Eval return</span><span className="text-right">{latest ? latest.meanReturn.toFixed(2) : '—'}</span>
              <span className="text-emerald-400">Success rate</span><span className="text-right">{latest ? `${(latest.successRate * 100).toFixed(0)}%` : '—'}</span>
              <span>Best checkpoint</span><span className="text-right">{best ? `it ${best.iteration} · ${best.meanReturn.toFixed(2)} · ${(best.successRate * 100).toFixed(0)}%` : '—'}</span>
              <span>Episodes</span><span className="text-right">{latest ? latest.episodes : '—'}</span>
              <span>Throughput</span><span className="text-right">{latest ? `${((latest.episodes * task.episodeSteps) / (latest.elapsedMs / 1000)).toFixed(0)} steps/s` : '—'}</span>
            </div>
            {status && <p className="text-slate-400">{status}</p>}

            <details className="rounded border border-white/10 bg-[#0d1117] p-2 text-slate-400">
              <summary className="cursor-pointer text-slate-300">Env API & spaces</summary>
              <pre className="mt-2 whitespace-pre-wrap font-mono-tabular text-[11px] leading-relaxed">{`env = new RobotArmEnv(task, randomization, actionMode, robot)   // src/sim/env.ts
obs = env.reset(seed)
{ obs, reward, terminated, truncated, info } = env.step(action)

obs (20): q/180 (6) | q̇/rated (6) | TCP xyz (3) | goal−TCP (3) | grip/80 | grasped
action:   ee_delta → Δxyz ∈[-1,1]·0.5 m/s (3) + grip | joint_velocity → q̇ ∈[-1,1]·rated (6) + grip
grip ∈[-1,1] → 0–80 mm target (150 mm/s servo) · control 20 Hz · physics 120 Hz fixed step

balance obs (10): ball−plate xyz ×10 (3) | ball vel (3) | J5,J6 tilt/30° (2) | J5,J6 rate/60 (2)
balance action (2): J5 (fore/aft), J6 (side) tilt rate ∈[-1,1]·60°/s · plate starts ±4° tilted
policy:   a = clip(W·(obs−μ)/σ, −1, 1)   (exported as axislab.linear-policy.v1)`}</pre>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
};
