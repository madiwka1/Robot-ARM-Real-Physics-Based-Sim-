// Runs ARS training off the main thread so the 3D viewer stays responsive.
// (No `lib="webworker"` reference: it clashes with the project's DOM lib; DOM typings cover this.)
import { ensureRapierInitialized } from '../physics/rapierWorld';
import type { Demonstration } from '../robotics/types';
import { rolloutToDemonstration, trainArs, type ArsConfig, type ArsProgress } from './ars';
import { NO_RANDOMIZATION } from './env';

/** Fixed seed for live previews, so each iteration attempts the same goal and progress is visible. */
export const PREVIEW_SEED = 1_000_000;

export type TrainerRequest = { type: 'start'; config: ArsConfig; preview: boolean } | { type: 'stop' };
export type TrainerResponse =
  | { type: 'progress'; progress: ArsProgress; preview: Demonstration | null }
  | { type: 'done'; stopped: boolean }
  | { type: 'error'; message: string };

let stopRequested = false;
const post = (msg: TrainerResponse) => self.postMessage(msg);

self.onmessage = async (e: MessageEvent<TrainerRequest>) => {
  if (e.data.type === 'stop') {
    stopRequested = true;
    return;
  }
  const { config, preview } = e.data;
  stopRequested = false;
  try {
    await ensureRapierInitialized();
    for (const progress of trainArs(config)) {
      // One extra episode per iteration: the current policy on the default scene, for the viewer
      const demo = preview
        ? rolloutToDemonstration(progress.policy, PREVIEW_SEED, NO_RANDOMIZATION, `live · it ${progress.iteration}`).demo
        : null;
      post({ type: 'progress', progress, preview: demo });
      // Yield to the event loop so a 'stop' message can be received between iterations
      await new Promise((r) => setTimeout(r, 0));
      if (stopRequested) break;
    }
    post({ type: 'done', stopped: stopRequested });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
