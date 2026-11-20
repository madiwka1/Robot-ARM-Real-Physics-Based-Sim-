import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpecFromInventory, duplicateSpec, inventoryMassKg, LAB_INVENTORY } from './labInventory';
import { DEFAULT_SCENE_OBJECTS } from './robotModel';
import type { SceneObjectSpec } from './types';

const item = (id: string) => LAB_INVENTORY.find((i) => i.templateId === id)!;

test('inventory mass = density x volume (or explicit mass)', () => {
  // 50 mm aluminium cube: 0.05^3 m^3 x 2700 kg/m^3 = 0.3375 kg
  assert.ok(Math.abs(inventoryMassKg(item('cube_alu_50')) - 0.3375) < 1e-9);
  // Brass weight is sized to be ~100 g
  assert.ok(Math.abs(inventoryMassKg(item('weight_brass_100')) - 0.1) < 0.01);
  assert.equal(inventoryMassKg(item('beaker_100')), 0.065);
});

test('duplicating a prop spawns a distinct copy with the same physical properties', () => {
  const red = DEFAULT_SCENE_OBJECTS.find((o) => o.id === 'cube_red')!;
  const copy = duplicateSpec(red, DEFAULT_SCENE_OBJECTS)!;
  assert.equal(copy.id, 'cube_red_2');
  assert.equal(copy.name, 'Red Calibration Cube #2');
  assert.equal(copy.mass, red.mass);
  assert.deepEqual(copy.dimensions, red.dimensions);
  const tray = DEFAULT_SCENE_OBJECTS.find((o) => o.kind === 'container')!;
  assert.equal(duplicateSpec(tray, DEFAULT_SCENE_OBJECTS), null);
});

test('added items get unique ids and free, reachable, non-overlapping spots', () => {
  let scene: SceneObjectSpec[] = [...DEFAULT_SCENE_OBJECTS];
  for (let i = 0; i < 12; i++) {
    const spec = createSpecFromInventory(item('cube_pla_40'), scene);
    assert.ok(spec, `no spot for item ${i}`);
    assert.ok(!scene.some((o) => o.id === spec.id), `duplicate id ${spec.id}`);
    const [x, y, z] = spec.initialPosition;
    assert.ok(Math.hypot(x, z) <= 0.7 && x > 0, 'within reach in front of the robot');
    assert.ok(Math.abs(y - 0.02) < 1e-9, 'rests on the bench');
    for (const o of scene) {
      assert.ok(Math.hypot(o.initialPosition[0] - x, o.initialPosition[2] - z) > 0.04, `overlaps ${o.id}`);
    }
    scene = [...scene, spec];
  }
});
