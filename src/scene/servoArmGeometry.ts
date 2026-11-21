import * as THREE from 'three';

/**
 * Shared procedural geometries & PBR materials for real-form hobby robot arms:
 *  - SO-101 (TheRobotStudio / Hugging Face LeRobot, Feetech STS3215 servos, matte off-white PLA+)
 *  - Koch v1.1 (Alexander Koch / Jess Moss, ROBOTIS Dynamixel XL430 & XL330 servos, charcoal PETG)
 *
 * All geometries and materials are created once at module load (zero per-frame allocations).
 */

function roundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const hw = w / 2;
  const hh = h / 2;
  const cr = Math.min(r, hw * 0.9, hh * 0.9);
  s.moveTo(-hw + cr, -hh);
  s.lineTo(hw - cr, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + cr);
  s.lineTo(hw, hh - cr);
  s.quadraticCurveTo(hw, hh, hw - cr, hh);
  s.lineTo(-hw + cr, hh);
  s.quadraticCurveTo(-hw, hh, -hw, hh - cr);
  s.lineTo(-hw, -hh + cr);
  s.quadraticCurveTo(-hw, -hh, -hw + cr, -hh);
  return s;
}

/**
 * Centered beveled rounded-rectangle extrusion along Z.
 */
export function makeRoundedBlockGeo(
  w: number,
  h: number,
  depth: number,
  radius: number,
  bevel = 0.0014,
): THREE.ExtrudeGeometry {
  const shape = roundedRectShape(w - bevel * 2, h - bevel * 2, Math.max(0.0005, radius - bevel));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, depth - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 10,
  });
  geo.center();
  return geo;
}

/**
 * Contoured horseshoe / clamp-wing desktop base for SO-101.
 * Extruded along Y so bottom rests cleanly at y = 0.
 */
function makeSO101BaseFlangeGeo(): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  // Footprint in X (front +X, rear -X) and Z (side clamp wings ±Z)
  s.moveTo(-0.048, -0.044);
  s.lineTo(0.036, -0.044);
  s.quadraticCurveTo(0.052, -0.044, 0.052, -0.026);
  s.lineTo(0.052, 0.026);
  s.quadraticCurveTo(0.052, 0.044, 0.036, 0.044);
  s.lineTo(-0.048, 0.044);
  s.quadraticCurveTo(-0.058, 0.044, -0.058, 0.032);
  s.lineTo(-0.058, -0.032);
  s.quadraticCurveTo(-0.058, -0.044, -0.048, -0.044);

  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.01,
    bevelEnabled: true,
    bevelThickness: 0.0015,
    bevelSize: 0.0015,
    bevelSegments: 2,
    curveSegments: 12,
  });
  // Extrude is along +Z in shape space; rotateX(-PI/2) puts shape-Y onto -Z and depth onto +Y.
  geo.rotateX(-Math.PI / 2);
  geo.computeBoundingBox();
  if (geo.boundingBox) {
    geo.translate(0, -geo.boundingBox.min.y, 0);
  }
  return geo;
}

/**
 * Chamfered octagonal/square desk-clamp base for Koch v1.1 (Follower_Base.STL).
 * Bottom sits cleanly at y = 0.
 */
function makeKochBasePlateGeo(): THREE.ExtrudeGeometry {
  const hw = 0.044;
  const c = 0.012;
  const s = new THREE.Shape();
  s.moveTo(-hw + c, -hw);
  s.lineTo(hw - c, -hw);
  s.lineTo(hw, -hw + c);
  s.lineTo(hw, hw - c);
  s.lineTo(hw - c, hw);
  s.lineTo(-hw + c, hw);
  s.lineTo(-hw, hw - c);
  s.lineTo(-hw, -hw + c);
  s.closePath();

  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.009,
    bevelEnabled: true,
    bevelThickness: 0.0014,
    bevelSize: 0.0014,
    bevelSegments: 2,
    curveSegments: 8,
  });
  geo.rotateX(-Math.PI / 2);
  geo.computeBoundingBox();
  if (geo.boundingBox) {
    geo.translate(0, -geo.boundingBox.min.y, 0);
  }
  return geo;
}

/**
 * Sculpted curved 3D-printed link profile (in X-Y plane, extruded along Z centered at 0).
 * Captures SO-101's distinctive organic swept upper arm & tapered forearm with recessed side ribs.
 */
function makeSweptArmLinkGeo(
  length: number,
  bottomW: number,
  topW: number,
  thicknessZ: number,
  bowX: number,
  cutoutCount: number,
): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  const r0 = bottomW / 2;
  const r1 = topW / 2;

  // Outline from bottom-left up to top-left, rounded cap, down to bottom-right, rounded base
  s.moveTo(-r0, 0);
  s.quadraticCurveTo(bowX - (r0 + r1) * 0.52, length * 0.5, -r1, length);
  s.absarc(0, length, r1, Math.PI, 0, true);
  s.quadraticCurveTo(bowX + (r0 + r1) * 0.52, length * 0.5, r0, 0);
  s.absarc(0, 0, r0, 0, Math.PI, true);

  // Lightening truss cutouts along the spine
  if (cutoutCount > 0) {
    const startY = length * 0.23;
    const endY = length * 0.77;
    const span = endY - startY;
    const slotGap = 0.007;
    const slotH = (span - slotGap * (cutoutCount - 1)) / cutoutCount;

    for (let i = 0; i < cutoutCount; i++) {
      const y0 = startY + i * (slotH + slotGap);
      const y1 = y0 + slotH;
      const tMid = ((y0 + y1) * 0.5) / length;
      const cx = bowX * 4 * tMid * (1 - tMid) * 0.65;
      const localW = THREE.MathUtils.lerp(bottomW, topW, tMid);
      const hw = Math.max(0.0025, localW * 0.24);
      const cr = Math.min(hw * 0.7, slotH * 0.3);

      const hole = new THREE.Path();
      hole.moveTo(cx - hw + cr, y0);
      hole.lineTo(cx + hw - cr, y0);
      hole.quadraticCurveTo(cx + hw, y0, cx + hw, y0 + cr);
      hole.lineTo(cx + hw, y1 - cr);
      hole.quadraticCurveTo(cx + hw, y1, cx + hw - cr, y1);
      hole.lineTo(cx - hw + cr, y1);
      hole.quadraticCurveTo(cx - hw, y1, cx - hw, y1 - cr);
      hole.lineTo(cx - hw, y0 + cr);
      hole.quadraticCurveTo(cx - hw, y0, cx - hw + cr, y0);
      s.holes.push(hole);
    }
  }

  const bevel = 0.0014;
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.002, thicknessZ - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 12,
  });
  geo.translate(0, 0, -(thicknessZ - bevel * 2) / 2);
  return geo;
}

/**
 * Open-frame skeletal side rail with tapered silhouette & truss cutouts for Koch v1.1.
 */
function makeKochRailGeo(
  length: number,
  bottomW: number,
  topW: number,
  thicknessZ: number,
  cutoutCount: number,
): THREE.ExtrudeGeometry {
  return makeSweptArmLinkGeo(length, bottomW, topW, thicknessZ, 0.002, cutoutCount);
}

/**
 * Sculpted 3D-printed gripper jaw profile (in X-Y plane, extruded along Z centered at 0).
 * Local origin at jaw root (y = 0); extends along +Y up to `height`.
 * Designed for the LEFT jaw (inner gripping face on +X); mirror with scale={[-1, 1, 1]} for RIGHT jaw.
 */
function makeSculptedJawGeo(
  height: number,
  rootWidthX: number,
  tipWidthX: number,
  depthZ: number,
  inwardStepX: number,
): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  // Inner face (+X side) steps inward slightly to form a clean parallel gripping pad zone
  s.moveTo(-rootWidthX, 0);
  s.lineTo(0.001, 0);
  s.lineTo(inwardStepX, height * 0.38);
  s.lineTo(inwardStepX, height);
  s.lineTo(inwardStepX - tipWidthX, height);
  // Sculpted outer angled back rib
  s.quadraticCurveTo(-rootWidthX * 0.92, height * 0.56, -rootWidthX, height * 0.14);
  s.closePath();

  const bevel = 0.0009;
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.002, depthZ - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 8,
  });
  geo.translate(0, 0, -(depthZ - bevel * 2) / 2);
  return geo;
}

/**
 * Smooth 3-pin serial bus cable tube routed along a CatmullRomCurve3.
 */
function makeCableTubeGeo(points: Array<[number, number, number]>, radius = 0.0021): THREE.TubeGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.TubeGeometry(curve, 18, radius, 8, false);
}

/**
 * Shared PBR Materials — distinct roughness/metalness contrast between 3D-printed PLA/PETG,
 * molded servo shells, machined aluminum horns, PCB substrates, and TPU grip pads.
 */
export const SERVO_ARM_MATERIALS = {
  // SO-101 signature matte cool-white PLA+ (high roughness, low metalness)
  so101PlaWhite: new THREE.MeshStandardMaterial({
    color: '#edf2f7',
    roughness: 0.62,
    metalness: 0.03,
  }),
  // SO-101 slightly shaded inner / recess PLA for crisp edge contrast
  so101PlaAccent: new THREE.MeshStandardMaterial({
    color: '#cbd5e1',
    roughness: 0.58,
    metalness: 0.06,
  }),
  // SO-101 LeRobot subtle amber-orange highlight clip / clamp pad
  so101OrangeClip: new THREE.MeshStandardMaterial({
    color: '#f59e0b',
    roughness: 0.45,
    metalness: 0.05,
  }),

  // Koch v1.1 matte carbon-graphite PETG brackets (crisp contrast against satin-black Dynamixel servos)
  kochPetgCharcoal: new THREE.MeshStandardMaterial({
    color: '#3b4759',
    roughness: 0.64,
    metalness: 0.08,
  }),
  // Koch v1.1 darker secondary structural spacer / clamp
  kochPetgDark: new THREE.MeshStandardMaterial({
    color: '#252e3d',
    roughness: 0.6,
    metalness: 0.12,
  }),
  // Koch v1.1 vivid orange-amber accent clips & TPU grip pads (iconic LeRobot / Koch contrast)
  kochAccentOrange: new THREE.MeshStandardMaterial({
    color: '#ea580c',
    roughness: 0.46,
    metalness: 0.04,
  }),

  // Feetech STS3215 satin black molded servo body
  feetechBody: new THREE.MeshStandardMaterial({
    color: '#141820',
    roughness: 0.4,
    metalness: 0.16,
  }),
  // Feetech blue/cyan spec decal band
  feetechLabel: new THREE.MeshStandardMaterial({
    color: '#0ea5e9',
    roughness: 0.35,
    metalness: 0.12,
  }),

  // ROBOTIS Dynamixel XL430 / XL330 satin engineering polymer body
  dynamixelBody: new THREE.MeshStandardMaterial({
    color: '#11161f',
    roughness: 0.36,
    metalness: 0.22,
  }),
  // Dynamixel silver-white spec band
  dynamixelLabel: new THREE.MeshStandardMaterial({
    color: '#94a3b8',
    roughness: 0.3,
    metalness: 0.45,
  }),
  // Dynamixel subtle glowing red/orange status LED dot
  dynamixelLed: new THREE.MeshStandardMaterial({
    color: '#ef4444',
    emissive: '#dc2626',
    emissiveIntensity: 0.9,
    roughness: 0.2,
  }),

  // Selected joint highlight material
  selectedAmber: new THREE.MeshStandardMaterial({
    color: '#f59e0b',
    emissive: '#b45309',
    emissiveIntensity: 0.45,
    roughness: 0.36,
    metalness: 0.2,
  }),

  // Brushed aluminum circular servo horns & bearings
  aluminumHorn: new THREE.MeshStandardMaterial({
    color: '#cbd5e1',
    roughness: 0.24,
    metalness: 0.88,
  }),
  // Stainless steel M2.5 / M3 socket cap screws
  steelFastener: new THREE.MeshStandardMaterial({
    color: '#e2e8f0',
    roughness: 0.18,
    metalness: 0.94,
  }),
  // Matte black TPU / silicone gripping pads
  tpuGripPad: new THREE.MeshStandardMaterial({
    color: '#181c24',
    roughness: 0.92,
    metalness: 0.02,
  }),
  // Braided / ribbon 3-pin serial bus cable
  busCable: new THREE.MeshStandardMaterial({
    color: '#0f172a',
    roughness: 0.78,
    metalness: 0.08,
  }),
  // Waveshare blue controller PCB
  wavesharePcbBlue: new THREE.MeshStandardMaterial({
    color: '#1d4ed8',
    roughness: 0.42,
    metalness: 0.18,
  }),
  // Dynamixel U2D2 / OpenRB dark green PCB
  dynamixelPcbGreen: new THREE.MeshStandardMaterial({
    color: '#15803d',
    roughness: 0.44,
    metalness: 0.15,
  }),
};

/**
 * Pre-built, cached custom geometries for SO-101 and Koch v1.1.
 */
export const SERVO_ARM_GEOS = {
  // SO-101 custom geometries
  so101BaseFlange: makeSO101BaseFlangeGeo(),
  so101TurretCheek: makeSweptArmLinkGeo(0.052, 0.036, 0.032, 0.007, -0.002, 0),
  so101UpperArmRail: makeSweptArmLinkGeo(0.1126, 0.032, 0.028, 0.0065, 0.007, 2),
  so101ForearmRail: makeSweptArmLinkGeo(0.1349, 0.028, 0.023, 0.006, -0.004, 3),
  so101WristCheek: makeSweptArmLinkGeo(0.044, 0.024, 0.024, 0.0055, 0, 0),
  so101GripperBody: makeRoundedBlockGeo(0.046, 0.044, 0.032, 0.006, 0.0014),
  so101Jaw: makeSculptedJawGeo(0.056, 0.011, 0.0055, 0.019, 0.002),
  so101UpperCable: makeCableTubeGeo([
    [-0.014, 0.008, -0.012],
    [-0.022, 0.042, -0.015],
    [-0.021, 0.078, -0.014],
    [-0.014, 0.106, -0.01],
  ]),
  so101ForearmCable: makeCableTubeGeo([
    [-0.015, 0.01, -0.012],
    [-0.023, 0.05, -0.014],
    [-0.02, 0.098, -0.012],
    [-0.012, 0.128, -0.008],
  ]),

  // Koch v1.1 custom geometries
  kochBasePlate: makeKochBasePlateGeo(),
  kochBaseBlock: makeRoundedBlockGeo(0.058, 0.032, 0.058, 0.008, 0.0014),
  kochUpperRail: makeKochRailGeo(0.1084, 0.028, 0.024, 0.0052, 3),
  kochForearmRail: makeKochRailGeo(0.1005, 0.024, 0.019, 0.0048, 3),
  kochWristCheek: makeKochRailGeo(0.036, 0.019, 0.018, 0.0045, 0),
  kochGripperBody: makeRoundedBlockGeo(0.036, 0.028, 0.025, 0.0045, 0.0012),
  kochJaw: makeSculptedJawGeo(0.042, 0.009, 0.0045, 0.015, 0.0018),
  kochUpperCable: makeCableTubeGeo(
    [
      [-0.012, 0.006, -0.01],
      [-0.02, 0.04, -0.013],
      [-0.019, 0.074, -0.012],
      [-0.011, 0.102, -0.008],
    ],
    0.0018,
  ),
  kochForearmCable: makeCableTubeGeo(
    [
      [-0.012, 0.008, -0.009],
      [-0.018, 0.042, -0.011],
      [-0.016, 0.074, -0.01],
      [-0.009, 0.095, -0.006],
    ],
    0.0016,
  ),

  // Shared detailed servo block geometries (beveled)
  sts3215Body: makeRoundedBlockGeo(0.0247, 0.0452, 0.035, 0.0028, 0.0012),
  xl430Body: makeRoundedBlockGeo(0.0285, 0.0465, 0.034, 0.0032, 0.0014),
  xl330Body: makeRoundedBlockGeo(0.02, 0.034, 0.026, 0.0024, 0.001),
};
