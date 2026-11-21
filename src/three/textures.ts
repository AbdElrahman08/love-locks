// Procedurally generated textures — no external image assets needed, so the scene works offline
// and under a strict CSP. Each function returns a Babylon DynamicTexture.
import { Constants, CubeMapToSphericalPolynomialTools, DynamicTexture, RawCubeTexture, Texture, type Scene } from '@babylonjs/core';

function ctxOf(t: DynamicTexture) {
  return t.getContext() as unknown as CanvasRenderingContext2D;
}

/** Deterministic PRNG so the city looks the same on every visit. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    s = Math.imul(s ^ (s >>> 13), 3266489909) >>> 0;
    return ((s ^ (s >>> 16)) >>> 0) / 4294967296;
  };
}

export function skyTexture(scene: Scene) {
  const t = new DynamicTexture('skyTex', { width: 32, height: 512 }, scene, false);
  const c = ctxOf(t);
  const g = c.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.0, '#0c0f24');
  g.addColorStop(0.32, '#1d2350');
  g.addColorStop(0.44, '#4a3a6b');
  g.addColorStop(0.49, '#c9707a');
  g.addColorStop(0.52, '#f2a36b');
  g.addColorStop(0.56, '#3a3550');
  g.addColorStop(1.0, '#10121f');
  c.fillStyle = g;
  c.fillRect(0, 0, 32, 512);
  const r = rng(7);
  for (let i = 0; i < 120; i++) {
    c.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.6})`;
    c.fillRect(Math.floor(r() * 32), Math.floor(r() * 200), 1, 1);
  }
  t.update(false);
  return t;
}

export function waterNormalTexture(scene: Scene) {
  const size = 256;
  const t = new DynamicTexture('waterNormal', { width: size, height: size }, scene, true);
  const c = ctxOf(t);
  const img = c.createImageData(size, size);
  const h = (x: number, y: number) => {
    const k = (Math.PI * 2) / size;
    return Math.sin(x * k * 3 + y * k * 2) * 0.5 + Math.sin(x * k * 7 - y * k * 5) * 0.3 + Math.sin(y * k * 11 + x * k) * 0.2;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = h(x + 1, y) - h(x - 1, y);
      const dy = h(x, y + 1) - h(x, y - 1);
      const nx = -dx * 2, ny = -dy * 2, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      img.data[i] = ((nx / l) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((nz / l) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  c.putImageData(img, 0, 0);
  t.update(true);
  t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE;
  return t;
}

export function plankTexture(scene: Scene) {
  const t = new DynamicTexture('planks', { width: 512, height: 512 }, scene, true);
  const c = ctxOf(t);
  const r = rng(3);
  const rows = 16;
  for (let i = 0; i < rows; i++) {
    const shade = 90 + Math.floor(r() * 40);
    c.fillStyle = `rgb(${shade + 40},${shade},${Math.floor(shade * 0.65)})`;
    c.fillRect(0, (i * 512) / rows, 512, 512 / rows);
    c.fillStyle = 'rgba(30,18,8,.55)';
    c.fillRect(0, (i * 512) / rows, 512, 2);
    for (let k = 0; k < 6; k++) {
      c.fillStyle = `rgba(40,25,10,${0.08 + r() * 0.1})`;
      c.fillRect(0, (i * 512) / rows + 4 + r() * 22, 512, 1);
    }
  }
  t.update(true);
  t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE;
  return t;
}

export function latticeTexture(scene: Scene) {
  const t = new DynamicTexture('lattice', { width: 256, height: 256 }, scene, true);
  const c = ctxOf(t);
  c.clearRect(0, 0, 256, 256);
  c.strokeStyle = 'rgba(28,30,36,1)';
  c.lineWidth = 4;
  for (let i = -256; i <= 512; i += 64) {
    c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 256, 256); c.stroke();
    c.beginPath(); c.moveTo(i, 256); c.lineTo(i + 256, 0); c.stroke();
  }
  t.hasAlpha = true;
  t.update(true);
  t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE;
  return t;
}

/** Haussmann facade: cream stone, balconies and a grid of windows. Returns diffuse + emissive (lit windows). */
export function facadeTextures(scene: Scene) {
  const W = 256, H = 512;
  const d = new DynamicTexture('facadeD', { width: W, height: H }, scene, true);
  const e = new DynamicTexture('facadeE', { width: W, height: H }, scene, true);
  const cd = ctxOf(d), ce = ctxOf(e);
  cd.fillStyle = '#c9b99a'; cd.fillRect(0, 0, W, H);
  ce.fillStyle = '#000'; ce.fillRect(0, 0, W, H);
  const r = rng(11);
  const floors = 7, cols = 4;
  for (let f = 0; f < floors; f++) {
    const y = 20 + f * 68;
    cd.fillStyle = 'rgba(120,105,80,.35)'; cd.fillRect(0, y + 52, W, 4); // cornice / balcony line
    for (let k = 0; k < cols; k++) {
      const x = 18 + k * 60;
      const lit = r() < 0.38;
      cd.fillStyle = lit ? '#e9b765' : '#2b2f3d';
      cd.fillRect(x, y, 34, 46);
      if (lit) {
        const warm = r() < 0.5 ? '#ffcf7a' : '#ffb35c';
        ce.fillStyle = warm; ce.fillRect(x, y, 34, 46);
      }
      cd.fillStyle = 'rgba(60,50,40,.6)'; cd.fillRect(x + 16, y, 2, 46);
    }
  }
  d.update(true); e.update(true);
  d.wrapU = d.wrapV = e.wrapU = e.wrapV = Texture.WRAP_ADDRESSMODE;
  return { diffuse: d, emissive: e };
}

export function glowDotTexture(scene: Scene) {
  const t = new DynamicTexture('dot', { width: 64, height: 64 }, scene, false);
  const c = ctxOf(t);
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,240,200,1)');
  g.addColorStop(0.3, 'rgba(255,200,120,.6)');
  g.addColorStop(1, 'rgba(255,180,100,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  t.hasAlpha = true;
  t.update(false);
  return t;
}

export function gradientBackdrop(scene: Scene, top: string, bottom: string) {
  const t = new DynamicTexture('backdrop', { width: 16, height: 256 }, scene, false);
  const c = ctxOf(t);
  const g = c.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top); g.addColorStop(0.5, '#f3d9a4'); g.addColorStop(1, bottom);
  c.fillStyle = g; c.fillRect(0, 0, 16, 256);
  t.update(false);
  return t;
}

/**
 * Procedural dusk environment cube (no probe render, no network). Used for PBR reflections so metal
 * locks pick up the sunset, the sky and the dark river.
 */
export function duskEnvironment(scene: Scene, size = 32, studio = false) {
  const faces: Uint8Array[] = [];
  const dirs = (f: number, u: number, v: number): [number, number, number] => {
    switch (f) {
      case 0: return [1, -v, -u];
      case 1: return [-1, -v, u];
      case 2: return [u, 1, v];
      case 3: return [u, -1, -v];
      case 4: return [u, -v, 1];
      default: return [-u, -v, -1];
    }
  };
  const sun = [0.55, 0.12, 0.83];
  const sl = Math.hypot(sun[0], sun[1], sun[2]);
  for (let f = 0; f < 6; f++) {
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const u = ((x + 0.5) / size) * 2 - 1;
        const v = ((y + 0.5) / size) * 2 - 1;
        let [dx, dy, dz] = dirs(f, u, v);
        const l = Math.hypot(dx, dy, dz);
        dx /= l; dy /= l; dz /= l;
        let r: number, g: number, b: number;
        if (studio) {
          // soft studio: warm key from upper-front, cool rim, dark floor
          const t = Math.max(0, dy);
          const h = 1 - Math.abs(dy); // bright band around the horizon gives metals a readable highlight
          r = 60 + 150 * t + 120 * h ** 4; g = 55 + 130 * t + 100 * h ** 4; b = 75 + 120 * t + 90 * h ** 4;
          const key = Math.max(0, -dz * 0.6 + dy * 0.6 - dx * 0.3);
          r += 140 * key ** 3; g += 110 * key ** 3; b += 80 * key ** 3;
        } else if (dy >= 0) {
          const t = Math.pow(dy, 0.45);
          r = 242 * (1 - t) + 22 * t; g = 150 * (1 - t) + 26 * t; b = 110 * (1 - t) + 70 * t;
          const s = Math.max(0, (dx * sun[0] + dy * sun[1] + dz * sun[2]) / sl);
          const glow = Math.pow(s, 12) * 255 + Math.pow(s, 3) * 60;
          r += glow; g += glow * 0.7; b += glow * 0.45;
        } else {
          const t = Math.min(1, -dy * 3);
          r = 70 * (1 - t) + 10 * t; g = 55 * (1 - t) + 16 * t; b = 75 * (1 - t) + 28 * t;
        }
        const i = (y * size + x) * 4;
        data[i] = Math.min(255, r); data[i + 1] = Math.min(255, g); data[i + 2] = Math.min(255, b); data[i + 3] = 255;
      }
    faces.push(data);
  }
  const tex = new RawCubeTexture(scene, faces, size, Constants.TEXTUREFORMAT_RGBA, Constants.TEXTURETYPE_UNSIGNED_BYTE, true);
  tex.gammaSpace = true;
  // Compute the diffuse lighting harmonics now, from the same data. Otherwise Babylon reads the GPU
  // texture back asynchronously, which throws if the scene is disposed first (route changes, StrictMode).
  tex.sphericalPolynomial = CubeMapToSphericalPolynomialTools.ConvertCubeMapToSphericalPolynomial({
    size, right: faces[0], left: faces[1], up: faces[2], down: faces[3], front: faces[4], back: faces[5],
    format: Constants.TEXTUREFORMAT_RGBA, type: Constants.TEXTURETYPE_UNSIGNED_BYTE, gammaSpace: true,
  });
  return tex;
}
