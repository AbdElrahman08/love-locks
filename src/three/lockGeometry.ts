// Lock models built from code: an extruded body outline plus a tube shackle.
// Model space: ~1 unit tall, front face (engraving side) faces -Z, body centered at the origin.
import { Color3, Mesh, MeshBuilder, PBRMaterial, Vector3, type Scene } from '@babylonjs/core';
import type { LockShape } from '../../shared/catalog.ts';
import { materialById } from '../../shared/catalog.ts';

export const BODY_DEPTH = 0.22;

function outline(shape: LockShape): Vector3[] {
  const pts: Vector3[] = [];
  if (shape === 'heart') {
    for (let i = 0; i < 64; i++) {
      const t = (i / 64) * Math.PI * 2;
      const x = 16 * Math.sin(t) ** 3;
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      pts.push(new Vector3(x / 30, y / 30 + 0.04, 0));
    }
  } else if (shape === 'round') {
    for (let i = 0; i < 48; i++) {
      const t = (i / 48) * Math.PI * 2;
      pts.push(new Vector3(Math.cos(t) * 0.42, Math.sin(t) * 0.42, 0));
    }
  } else if (shape === 'shield') {
    const top = 0.38, w = 0.4;
    pts.push(new Vector3(-w, top, 0), new Vector3(w, top, 0));
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      pts.push(new Vector3(w * (1 - t * t), top - t * 0.85 - Math.sin(t * Math.PI) * 0.0, 0));
    }
    for (let i = 15; i >= 1; i--) {
      const t = i / 16;
      pts.push(new Vector3(-w * (1 - t * t), top - t * 0.85, 0));
    }
  } else {
    // classic: rounded rectangle
    const w = 0.38, h = 0.42, r = 0.1;
    const corner = (cx: number, cy: number, a0: number) => {
      for (let i = 0; i <= 6; i++) {
        const a = a0 + (i / 6) * (Math.PI / 2);
        pts.push(new Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0));
      }
    };
    corner(w - r, h - r, 0);
    corner(-w + r, h - r, Math.PI / 2);
    corner(-w + r, -h + r, Math.PI);
    corner(w - r, -h + r, (3 * Math.PI) / 2);
  }
  return pts;
}

function bodyTop(shape: LockShape) {
  return shape === 'heart' ? 0.36 : shape === 'round' ? 0.4 : shape === 'shield' ? 0.38 : 0.42;
}

export interface LockParts {
  body: Mesh;
  shackle: Mesh;
  bodyTop: number;
  shackleHalfWidth: number;
}

export function createLockParts(scene: Scene, shape: LockShape, name = 'lock'): LockParts {
  const body = MeshBuilder.ExtrudeShape(`${name}-body`, {
    shape: outline(shape),
    path: [new Vector3(0, 0, -BODY_DEPTH / 2), new Vector3(0, 0, BODY_DEPTH / 2)],
    cap: Mesh.CAP_ALL,
    closeShape: true,
    sideOrientation: Mesh.DOUBLESIDE,
  }, scene);
  const top = bodyTop(shape) - 0.04;
  const hw = shape === 'round' ? 0.2 : 0.22;
  const path: Vector3[] = [];
  const legs = 0.16;
  path.push(new Vector3(-hw, top - 0.02, 0), new Vector3(-hw, top + legs, 0));
  for (let i = 1; i < 16; i++) {
    const a = Math.PI - (i / 16) * Math.PI;
    path.push(new Vector3(Math.cos(a) * hw, top + legs + Math.sin(a) * hw, 0));
  }
  path.push(new Vector3(hw, top + legs, 0), new Vector3(hw, top - 0.02, 0));
  const shackle = MeshBuilder.CreateTube(`${name}-shackle`, { path, radius: 0.045, tessellation: 12, cap: Mesh.CAP_ALL }, scene);
  return { body, shackle, bodyTop: top, shackleHalfWidth: hw };
}

/** Single merged mesh (body + shackle) used as the thin-instance source on the bridge. */
export function createMergedLock(scene: Scene, shape: LockShape, name: string): Mesh {
  const { body, shackle } = createLockParts(scene, shape, name);
  const merged = Mesh.MergeMeshes([body, shackle], true, true)!;
  merged.name = name;
  return merged;
}

export function lockMaterial(scene: Scene, materialId: string, name: string, tintWhite = false): PBRMaterial {
  const def = materialById(materialId);
  const m = new PBRMaterial(name, scene);
  m.albedoColor = tintWhite ? Color3.White() : Color3.FromHexString(def.baseColor).toLinearSpace();
  m.metallic = def.metallic;
  m.roughness = def.roughness;
  m.alpha = def.alpha;
  if (def.alpha < 1) {
    m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    m.subSurface.isRefractionEnabled = false;
  }
  m.environmentIntensity = 1.1;
  return m;
}

/** Final instance tint: the player's color, nudged toward the material's natural hue. */
export function instanceColor(hex: string, materialId: string): [number, number, number] {
  const a = Color3.FromHexString(hex);
  const b = Color3.FromHexString(materialById(materialId).baseColor);
  const mix = materialId === 'enamel' ? 0.05 : 0.3;
  const c = Color3.Lerp(a, b, mix).toLinearSpace();
  return [c.r, c.g, c.b];
}
