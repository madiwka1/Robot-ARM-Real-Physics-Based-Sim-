/**
 * Lab item inventory: catalog of common lab props with real dimensions and materials. Mass is
 * density x volume (or an explicit mass for hollow items), so physics behaves like the real thing.
 * Pure logic (no DOM except guarded localStorage) so it runs under node:test.
 */
import { DEFAULT_SCENE_OBJECTS } from './robotModel';
import type { SceneObjectKind, SceneObjectSpec, Vec3Tuple } from './types';

export interface InventoryItem {
  templateId: string;
  name: string;
  kind: Exclude<SceneObjectKind, 'container'>;
  color: string;
  /** cube: [w, h, d]; cylinder: [radius, height, radius]; sphere: [r, r, r]; bottle: fixed size. */
  dimensions: Vec3Tuple;
  material: string;
  /** kg/m^3; ignored when massKg is given. */
  densityKgM3?: number;
  /** Explicit mass for hollow / composite items. */
  massKg?: number;
  note?: string;
}

export const LAB_INVENTORY: InventoryItem[] = [
  { templateId: 'cube_pla_40', name: 'PLA Calibration Cube 40 mm', kind: 'cube', color: '#22c55e', dimensions: [0.04, 0.04, 0.04], material: 'PLA', densityKgM3: 1240 },
  { templateId: 'cube_alu_50', name: 'Aluminium Cube 50 mm', kind: 'cube', color: '#ef4444', dimensions: [0.05, 0.05, 0.05], material: 'Al 6061 (anodized)', densityKgM3: 2700 },
  { templateId: 'gauge_steel_30', name: 'Steel Gauge Block 30 mm', kind: 'cube', color: '#94a3b8', dimensions: [0.03, 0.03, 0.03], material: 'Tool steel', densityKgM3: 7850 },
  { templateId: 'block_wood', name: 'Wooden Stacking Block 75×15×25', kind: 'cube', color: '#d4a373', dimensions: [0.075, 0.015, 0.025], material: 'Beech wood', densityKgM3: 700 },
  { templateId: 'peg_alu', name: 'Aluminium Peg Ø20×80 mm', kind: 'cylinder', color: '#cbd5e1', dimensions: [0.01, 0.08, 0.01], material: 'Al 6061', densityKgM3: 2700 },
  { templateId: 'weight_brass_100', name: 'Brass Calibration Weight 100 g', kind: 'cylinder', color: '#d97706', dimensions: [0.0125, 0.024, 0.0125], material: 'Brass', densityKgM3: 8500 },
  { templateId: 'beaker_100', name: 'Glass Beaker 100 ml (empty)', kind: 'cylinder', color: '#bae6fd', dimensions: [0.025, 0.07, 0.025], material: 'Borosilicate glass', massKg: 0.065, note: 'Hollow' },
  { templateId: 'petri_90', name: 'Petri Dish Ø90 mm', kind: 'cylinder', color: '#e0f2fe', dimensions: [0.045, 0.015, 0.045], material: 'Polystyrene', massKg: 0.018, note: 'Wider than the 80 mm gripper: push only' },
  { templateId: 'ball_steel_40', name: 'Steel Ball Bearing Ø40 mm', kind: 'sphere', color: '#e2e8f0', dimensions: [0.02, 0.02, 0.02], material: 'Chrome steel', densityKgM3: 7850 },
  { templateId: 'ball_rubber_50', name: 'Rubber Ball Ø50 mm', kind: 'sphere', color: '#f472b6', dimensions: [0.025, 0.025, 0.025], material: 'Natural rubber', densityKgM3: 1100 },
  { templateId: 'bottle_500', name: 'Water Bottle (half full)', kind: 'bottle', color: '#0284c7', dimensions: [0.024, 0.128, 0.024], material: 'PET + water', massKg: 0.25 },
];

export function inventoryMassKg(item: InventoryItem): number {
  if (item.massKg !== undefined) return item.massKg;
  const [a, b, c] = item.dimensions;
  const volume =
    item.kind === 'cube' ? a * b * c
    : item.kind === 'sphere' ? (4 / 3) * Math.PI * a ** 3
    : Math.PI * a * a * b; // cylinder / bottle
  return volume * (item.densityKgM3 ?? 1000);
}

/** Radius of the object's footprint on the bench (m). */
function footprintRadius(spec: Pick<SceneObjectSpec, 'kind' | 'dimensions'>): number {
  const [a, , c] = spec.dimensions;
  return spec.kind === 'cube' || spec.kind === 'container' ? Math.hypot(a, c) / 2 : a;
}

/** Center height when resting upright on the bench. */
function restHeight(item: InventoryItem): number {
  const [a, b] = item.dimensions;
  if (item.kind === 'sphere') return a;
  if (item.kind === 'bottle') return 0.0625; // composite collider bottom sits 62 mm below center
  return b / 2;
}

/**
 * Build a scene spec for an inventory item at the first free reachable spot on the bench
 * (polar grid in front of the robot, nearest to the usual work area first). Null if full.
 */
export function createSpecFromInventory(
  item: InventoryItem,
  existing: SceneObjectSpec[],
  /** Robot reach (m): spots are searched within ~35-72% of it (0.92 m = Axis-6R). */
  reachM = 0.92,
): SceneObjectSpec | null {
  // Count existing copies (incl. an original whose id is the bare template id, e.g. 'cube_red')
  const n =
    existing.filter((o) => o.id === item.templateId || o.id.startsWith(`${item.templateId}_`)).length + 1;
  let id = `${item.templateId}_${n}`;
  for (let k = n; existing.some((o) => o.id === id); k++) id = `${item.templateId}_${k + 1}`;

  const r = footprintRadius(item);
  const candidates: Vec3Tuple[] = [];
  const s = reachM / 0.92;
  for (let radius = 0.3 * s; radius <= 0.66 * s + 1e-9; radius += 0.06 * Math.max(s, 0.5)) {
    for (let deg = -70; deg <= 70; deg += 10) {
      const t = (deg * Math.PI) / 180;
      candidates.push([radius * Math.cos(t), restHeight(item), radius * Math.sin(t)]);
    }
  }
  candidates.sort((p, q) => Math.hypot(p[0] - 0.45 * s, p[2]) - Math.hypot(q[0] - 0.45 * s, q[2]));
  const free = candidates.find((p) =>
    existing.every(
      (o) => Math.hypot(o.initialPosition[0] - p[0], o.initialPosition[2] - p[2]) > footprintRadius(o) + r + 0.015,
    ),
  );
  if (!free) return null;

  return {
    id,
    name: n > 1 ? `${item.name} #${n}` : item.name,
    kind: item.kind,
    color: item.color,
    graspable: true,
    dimensions: [...item.dimensions] as Vec3Tuple,
    mass: Number(inventoryMassKg(item).toFixed(4)),
    initialPosition: free,
    initialQuaternion: [0, 0, 0, 1],
  };
}

/** Spawn a copy of an existing prop (same size, mass, color) at the next free reachable spot. */
export function duplicateSpec(spec: SceneObjectSpec, existing: SceneObjectSpec[], reachM = 0.92): SceneObjectSpec | null {
  if (spec.kind === 'container') return null;
  return createSpecFromInventory(
    {
      templateId: spec.id.replace(/_\d+$/, ''),
      name: spec.name.replace(/ #\d+$/, ''),
      kind: spec.kind,
      color: spec.color,
      dimensions: spec.dimensions,
      material: '',
      massKg: spec.mass,
    },
    existing,
    reachM,
  );
}

export const SCENE_STORAGE_KEY = 'axislab_scene_objects_v1';

export function loadSceneObjects(): SceneObjectSpec[] {
  if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_SCENE_OBJECTS;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SCENE_STORAGE_KEY) ?? 'null');
    const valid =
      Array.isArray(parsed) &&
      parsed.every(
        (o) => typeof o?.id === 'string' && Array.isArray(o.initialPosition) && Array.isArray(o.dimensions) && typeof o.mass === 'number',
      );
    return valid && parsed.length > 0 ? (parsed as SceneObjectSpec[]) : DEFAULT_SCENE_OBJECTS;
  } catch {
    return DEFAULT_SCENE_OBJECTS;
  }
}

export function saveSceneObjects(objects: SceneObjectSpec[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(SCENE_STORAGE_KEY, JSON.stringify(objects));
  } catch {
    // Ignore storage quota errors
  }
}
