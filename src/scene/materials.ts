import * as THREE from 'three';

export const isSoftwareGl: boolean = (() => {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
})();

export function createWorkbenchTexture(maxAnisotropy = 4): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Dark anodized optical breadboard base
  ctx.fillStyle = '#181d26';
  ctx.fillRect(0, 0, size, size);

  // Subtle brushed texture noise
  ctx.fillStyle = 'rgba(255,255,255,0.015)';
  for (let y = 0; y < size; y += 2) {
    if (y % 4 === 0) ctx.fillRect(0, y, size, 1);
  }

  // Major 64px (5cm equivalent) grid lines
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
  ctx.lineWidth = 1.5;
  const step = 64;
  for (let i = 0; i <= size; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }

  // Minor 32px grid lines
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
  ctx.lineWidth = 1;
  for (let i = 32; i < size; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }

  // Optical breadboard M6 tapped holes at intersections
  for (let x = 32; x < size; x += 64) {
    for (let y = 32; y < size; y += 64) {
      ctx.fillStyle = '#0c0f14';
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(203, 213, 225, 0.18)';
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.arc(x, y, 3.1, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 4.4);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    4,
    size / 2,
    size / 2,
    size / 2,
  );
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.52)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.22)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export const ROBOT_MATERIALS = {
  castIronDark: new THREE.MeshStandardMaterial({
    color: '#1f2630',
    roughness: 0.58,
    metalness: 0.65,
  }),
  anodizedSlate: new THREE.MeshStandardMaterial({
    color: '#2d3748',
    roughness: 0.42,
    metalness: 0.72,
  }),
  machinedAluminum: new THREE.MeshStandardMaterial({
    color: '#94a3b8',
    roughness: 0.25,
    metalness: 0.88,
  }),
  chromeShaft: new THREE.MeshStandardMaterial({
    color: '#cbd5e1',
    roughness: 0.14,
    metalness: 0.94,
  }),
  industrialAmber: new THREE.MeshStandardMaterial({
    color: '#d97706',
    roughness: 0.34,
    metalness: 0.25,
  }),
  rubberGrip: new THREE.MeshStandardMaterial({
    color: '#111827',
    roughness: 0.92,
    metalness: 0.04,
  }),
  servoRingBlue: new THREE.MeshStandardMaterial({
    color: '#0284c7',
    roughness: 0.35,
    metalness: 0.45,
  }),
};
