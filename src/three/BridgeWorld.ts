// The 3D world: a pedestrian iron bridge over the Seine at dusk, inspired by the Pont des Arts.
// All geometry and textures are procedural. Locks are rendered as thin instances (one draw call per
// shape × material), so thousands of locks stay cheap on mobile.
import {
  Animation, ArcRotateCamera, Color3, Color4, CubicEase, DirectionalLight, EasingFunction, Engine, GlowLayer,
  HemisphericLight, Matrix, Mesh, MeshBuilder, MirrorTexture, ParticleSystem, PBRMaterial, Plane, PointerEventTypes,
  PointLight, Quaternion, Scene, StandardMaterial, UniversalCamera, Vector3,
  type AbstractMesh, type Camera,
} from '@babylonjs/core';
import { BRIDGE, LOCK_SHAPES, MATERIALS, type LockShape } from '../../shared/catalog.ts';
import type { BridgeLock } from '../../shared/types.ts';
import { createMergedLock, instanceColor, lockMaterial } from './lockGeometry.ts';
import {
  duskEnvironment, facadeTextures, glowDotTexture, latticeTexture, plankTexture, rng, skyTexture, waterNormalTexture,
} from './textures.ts';
import type { Quality } from '../lib/settings.ts';

export const SPAN = 20;
export const BRIDGE_LENGTH = BRIDGE.spans * SPAN;
export const DECK_Y = 8;
export const DECK_W = 11;
const RIVER_HALF = BRIDGE_LENGTH / 2;

export interface WorldOptions {
  quality: Exclude<Quality, 'auto'>;
  reducedMotion: boolean;
  cameraMode: 'orbit' | 'free';
  interactive: boolean;
  onSelect?: (lockId: string | null) => void;
  /** Called once ~5s after start with the measured frame rate (used for automatic quality). */
  onPerformance?: (fps: number) => void;
}

const QUALITY = {
  low: { scaling: 1.6, decorative: 350, glow: false, mirror: false, particles: 0, probe: 64, lamps: 0 },
  medium: { scaling: 1.15, decorative: 1400, glow: true, mirror: false, particles: 120, probe: 128, lamps: 2 },
  high: { scaling: 1, decorative: 3200, glow: true, mirror: true, particles: 260, probe: 256, lamps: 4 },
} as const;

/** Deterministic world transform for a lock slot on the railing. */
export function slotTransform(slot: number) {
  const cols = BRIDGE.colsPerSpan, rows = BRIDGE.rows;
  const col = slot % cols;
  const row = Math.floor(slot / cols) % rows;
  const side = Math.floor(slot / (cols * rows)) % BRIDGE.sides;
  const span = Math.floor(slot / (cols * rows * BRIDGE.sides));
  const r = rng(slot * 7919 + 13);
  const x = -BRIDGE_LENGTH / 2 + span * SPAN + 0.6 + ((col + 0.5) / cols) * (SPAN - 1.2) + (r() - 0.5) * 0.12;
  const y = DECK_Y + 0.45 + row * 0.17 + (r() - 0.5) * 0.04;
  const z = side === 0 ? -DECK_W / 2 + 0.1 : DECK_W / 2 - 0.1;
  const yaw = side === 0 ? Math.PI : 0;
  return {
    position: new Vector3(x, y, z),
    rotation: Quaternion.RotationYawPitchRoll(yaw + (r() - 0.5) * 0.3, (r() - 0.5) * 0.25, (r() - 0.5) * 0.5),
    span,
    side,
  };
}

export class BridgeWorld {
  readonly engine: Engine;
  readonly scene: Scene;
  private opts: WorldOptions;
  private orbit!: ArcRotateCamera;
  private free!: UniversalCamera;
  private lockMeshes = new Map<string, Mesh>(); // key `${shape}:${material}` (real locks)
  private instanceIds = new Map<Mesh, string[]>();
  private selection: Mesh | null = null;
  private disposed = false;
  private onResize = () => this.engine.resize();

  constructor(canvas: HTMLCanvasElement, opts: WorldOptions) {
    this.opts = opts;
    const q = QUALITY[opts.quality];
    this.engine = new Engine(canvas, opts.quality !== 'low', { stencil: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' }, false);
    this.engine.setHardwareScalingLevel(q.scaling / Math.min(window.devicePixelRatio || 1, 2) * (opts.quality === 'high' ? 1 : 1.25));
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.05, 0.06, 0.12, 1);
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogDensity = 0.0028;
    this.scene.fogColor = new Color3(0.23, 0.2, 0.3);
    this.scene.skipPointerMovePicking = true;

    this.buildCameras(canvas);
    const staticMeshes = this.buildEnvironment();
    this.buildLockSources();
    this.buildDecorativeLocks(q.decorative);

    if (q.glow) {
      const gl = new GlowLayer('glow', this.scene, { mainTextureSamples: 2, blurKernelSize: 48 });
      gl.intensity = 0.75;
      gl.customEmissiveColorSelector = (mesh, _sub, _mat, result) => {
        if (mesh.metadata?.glow) result.copyFrom(mesh.metadata.glow);
        else result.set(0, 0, 0, 0);
      };
    }
    if (q.particles && !opts.reducedMotion) this.buildMotes(q.particles);

    this.scene.environmentTexture = duskEnvironment(this.scene, q.probe / 2);

    for (const m of staticMeshes) { m.freezeWorldMatrix(); m.doNotSyncBoundingInfo = true; }

    if (opts.interactive) this.setupPicking();
    if (opts.onPerformance) {
      const samples: number[] = [];
      const timer = setInterval(() => {
        if (this.disposed) { clearInterval(timer); return; }
        samples.push(this.engine.getFps());
        if (samples.length === 5) { clearInterval(timer); opts.onPerformance!(samples.slice(2).reduce((a, b) => a + b, 0) / 3); }
      }, 1000);
    }
    this.engine.runRenderLoop(() => { if (!this.disposed) this.scene.render(); });
    window.addEventListener('resize', this.onResize);
  }

  // ---------- cameras ----------
  private buildCameras(canvas: HTMLCanvasElement) {
    const orbit = new ArcRotateCamera('orbit', -Math.PI / 2 + 0.55, 1.22, 46, new Vector3(0, DECK_Y + 1, 0), this.scene);
    orbit.lowerRadiusLimit = 3;
    orbit.upperRadiusLimit = 160;
    orbit.lowerBetaLimit = 0.25;
    orbit.upperBetaLimit = 1.62;
    orbit.wheelDeltaPercentage = 0.01;
    orbit.pinchDeltaPercentage = 0.004;
    orbit.panningSensibility = 120;
    orbit.minZ = 0.05;
    orbit.maxZ = 4000;
    orbit.useAutoRotationBehavior = !this.opts.reducedMotion && !this.opts.interactive;
    if (orbit.autoRotationBehavior) orbit.autoRotationBehavior.idleRotationSpeed = 0.05;
    this.orbit = orbit;

    const free = new UniversalCamera('free', new Vector3(-BRIDGE_LENGTH / 2 + 4, DECK_Y + 1.7, 0), this.scene);
    free.setTarget(new Vector3(0, DECK_Y + 1.5, 0));
    free.speed = 0.35;
    free.angularSensibility = 3000;
    free.minZ = 0.05;
    free.maxZ = 4000;
    free.keysUp.push(87); free.keysDown.push(83); free.keysLeft.push(65); free.keysRight.push(68);
    this.free = free;

    this.useCamera(this.opts.cameraMode, canvas);
    orbit.radius = this.fit(46);
  }

  private useCamera(mode: 'orbit' | 'free', canvas = this.engine.getRenderingCanvas()!) {
    this.scene.activeCamera?.detachControl();
    const cam: Camera = mode === 'free' ? this.free : this.orbit;
    this.scene.activeCamera = cam;
    if (this.opts.interactive) cam.attachControl(canvas, true);
  }

  setCameraMode(mode: 'orbit' | 'free') {
    this.opts.cameraMode = mode;
    this.useCamera(mode);
  }

  private animateCamera(target: Vector3, radius: number, alpha?: number, beta?: number) {
    if (this.scene.activeCamera !== this.orbit) this.setCameraMode('orbit');
    const cam = this.orbit;
    if (this.opts.reducedMotion) {
      cam.target = target; cam.radius = radius;
      if (alpha !== undefined) cam.alpha = alpha;
      if (beta !== undefined) cam.beta = beta;
      return;
    }
    const ease = new CubicEase();
    ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);
    const frames = 60;
    Animation.CreateAndStartAnimation('camT', cam, 'target', 60, frames, cam.target.clone(), target, 0, ease);
    Animation.CreateAndStartAnimation('camR', cam, 'radius', 60, frames, cam.radius, radius, 0, ease);
    if (alpha !== undefined) {
      // take the short way around
      let from = cam.alpha;
      while (from - alpha > Math.PI) from -= Math.PI * 2;
      while (alpha - from > Math.PI) from += Math.PI * 2;
      cam.alpha = from;
      Animation.CreateAndStartAnimation('camA', cam, 'alpha', 60, frames, from, alpha, 0, ease);
    }
    if (beta !== undefined) Animation.CreateAndStartAnimation('camB', cam, 'beta', 60, frames, cam.beta, beta, 0, ease);
  }

  /** Portrait screens need the camera further back to fit the bridge. */
  private fit(r: number) {
    const aspect = this.engine.getRenderWidth() / Math.max(1, this.engine.getRenderHeight());
    return aspect < 1 ? r * Math.min(2.2, 0.85 / aspect) : r;
  }

  overview() {
    this.animateCamera(new Vector3(0, DECK_Y + 1, 0), this.fit(46), -Math.PI / 2 + 0.55, 1.22);
  }

  focusSpan(span: number) {
    const x = -BRIDGE_LENGTH / 2 + span * SPAN + SPAN / 2;
    this.animateCamera(new Vector3(x, DECK_Y + 1, 0), this.fit(14), -Math.PI / 2 + 0.25, 1.25);
  }

  focusSlot(slot: number) {
    const t = slotTransform(slot);
    const inward = t.side === 0 ? 1 : -1; // look at the inner face from the deck
    this.animateCamera(t.position.clone(), 1.6, inward > 0 ? Math.PI / 2 : -Math.PI / 2, 1.4);
    this.showSelection(t.position);
  }

  private showSelection(p: Vector3 | null) {
    if (!this.selection) {
      const ring = MeshBuilder.CreateTorus('sel', { diameter: 0.28, thickness: 0.012, tessellation: 48 }, this.scene);
      const m = new StandardMaterial('selMat', this.scene);
      m.emissiveColor = new Color3(1, 0.85, 0.5);
      m.disableLighting = true;
      ring.material = m;
      ring.isPickable = false;
      ring.metadata = { glow: new Color4(1, 0.8, 0.45, 1) };
      this.selection = ring;
      if (!this.opts.reducedMotion) this.scene.onBeforeRenderObservable.add(() => { if (this.selection) this.selection.rotation.y += 0.02; });
    }
    this.selection.setEnabled(!!p);
    if (p) this.selection.position.copyFrom(p);
  }

  clearSelection() { this.showSelection(null); }

  // ---------- environment ----------
  private buildEnvironment(): Mesh[] {
    const s = this.scene;
    const q = QUALITY[this.opts.quality];
    const out: Mesh[] = [];

    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), s);
    hemi.intensity = 0.55;
    hemi.diffuse = new Color3(0.75, 0.72, 0.95);
    hemi.groundColor = new Color3(0.2, 0.15, 0.2);
    const sun = new DirectionalLight('sun', new Vector3(0.6, -0.35, 0.7), s);
    sun.intensity = 1.6;
    sun.diffuse = new Color3(1, 0.68, 0.45);
    // Cool "moonlight" fill from the opposite side so facades facing away from the sunset still read.
    const fill = new DirectionalLight('fill', new Vector3(-0.6, -0.4, -0.5), s);
    fill.intensity = 0.6;
    fill.diffuse = new Color3(0.55, 0.6, 0.9);
    fill.specular = Color3.Black();

    // Sky dome
    const sky = MeshBuilder.CreateSphere('sky', { diameter: 3000, segments: 16, sideOrientation: Mesh.BACKSIDE }, s);
    const skyMat = new StandardMaterial('skyMat', s);
    skyMat.emissiveTexture = skyTexture(s);
    skyMat.disableLighting = true;
    skyMat.fogEnabled = false;
    skyMat.backFaceCulling = false;
    sky.material = skyMat;
    sky.isPickable = false;
    sky.infiniteDistance = true;
    out.push(sky);

    // River
    const water = MeshBuilder.CreateGround('water', { width: 3000, height: 3000 }, s);
    const wm = new StandardMaterial('waterMat', s);
    wm.diffuseColor = new Color3(0.05, 0.1, 0.16);
    wm.specularColor = new Color3(0.9, 0.7, 0.55);
    wm.specularPower = 180;
    const normal = waterNormalTexture(s);
    normal.uScale = normal.vScale = 60;
    wm.bumpTexture = normal;
    wm.bumpTexture.level = 0.35;
    if (q.mirror) {
      const mirror = new MirrorTexture('mirror', 512, s, true);
      mirror.mirrorPlane = new Plane(0, -1, 0, 0.0);
      mirror.level = 0.55;
      mirror.adaptiveBlurKernel = 24;
      wm.reflectionTexture = mirror;
      this.mirror = mirror;
    }
    water.material = wm;
    water.isPickable = false;
    if (!this.opts.reducedMotion)
      s.onBeforeRenderObservable.add(() => { normal.uOffset += 0.0004; normal.vOffset += 0.0002; });

    // Quays (stone embankments) on both banks
    const stone = new StandardMaterial('stone', s);
    stone.diffuseColor = new Color3(0.62, 0.55, 0.45);
    stone.specularColor = new Color3(0.05, 0.05, 0.05);
    for (const sign of [-1, 1]) {
      const quay = MeshBuilder.CreateBox(`quay${sign}`, { width: 120, height: DECK_Y + 1, depth: 1400 }, s);
      quay.position = new Vector3(sign * (RIVER_HALF + 60), (DECK_Y + 1) / 2 - 0.5, 0);
      quay.material = stone;
      out.push(quay);
    }

    out.push(...this.buildBridge());
    out.push(...this.buildCity());
    this.mirrorTargets(out);
    return out;
  }

  private mirror: MirrorTexture | null = null;
  private mirrorTargets(meshes: Mesh[]) {
    if (!this.mirror) return;
    for (const m of meshes) this.mirror.renderList!.push(m);
  }

  private buildBridge(): Mesh[] {
    const s = this.scene;
    const out: Mesh[] = [];
    const iron = new PBRMaterial('iron', s);
    iron.albedoColor = new Color3(0.08, 0.09, 0.11);
    iron.metallic = 0.85;
    iron.roughness = 0.45;

    // Deck
    const deck = MeshBuilder.CreateBox('deck', { width: BRIDGE_LENGTH, height: 0.35, depth: DECK_W }, s);
    deck.position.y = DECK_Y;
    const deckMat = new StandardMaterial('deckMat', s);
    const planks = plankTexture(s);
    planks.uScale = BRIDGE_LENGTH / 6;
    planks.vScale = 2;
    deckMat.diffuseTexture = planks;
    deckMat.specularColor = new Color3(0.08, 0.06, 0.04);
    deck.material = deckMat;
    deck.isPickable = false;
    out.push(deck);

    // Piers with pointed noses
    const pierMat = new StandardMaterial('pierMat', s);
    pierMat.diffuseColor = new Color3(0.66, 0.6, 0.5);
    pierMat.specularColor = new Color3(0.04, 0.04, 0.04);
    for (let i = 1; i < BRIDGE.spans; i++) {
      const x = -BRIDGE_LENGTH / 2 + i * SPAN;
      const pier = MeshBuilder.CreateCylinder(`pier${i}`, { height: DECK_Y - 1.2, diameter: 2.4, tessellation: 6 }, s);
      pier.scaling.z = DECK_W / 2.4 * 1.1;
      pier.position = new Vector3(x, (DECK_Y - 1.2) / 2, 0);
      pier.material = pierMat;
      out.push(pier);
    }

    // Cast-iron arches: 5 ribs across the width, one arch per span
    const ribs: Mesh[] = [];
    for (let i = 0; i < BRIDGE.spans; i++) {
      const x0 = -BRIDGE_LENGTH / 2 + i * SPAN + (i === 0 ? 0 : 1.2);
      const x1 = -BRIDGE_LENGTH / 2 + (i + 1) * SPAN - (i === BRIDGE.spans - 1 ? 0 : 1.2);
      for (const z of [-4.6, -2.3, 0, 2.3, 4.6]) {
        const path: Vector3[] = [];
        for (let k = 0; k <= 24; k++) {
          const t = k / 24;
          const x = x0 + (x1 - x0) * t;
          const y = DECK_Y - 1.3 - 0 + Math.sin(t * Math.PI) * 1.05 - 1.6 * (1 - Math.sin(t * Math.PI));
          path.push(new Vector3(x, Math.min(y, DECK_Y - 0.2), z));
        }
        ribs.push(MeshBuilder.CreateTube(`rib${i}${z}`, { path, radius: 0.16, tessellation: 6 }, s));
      }
    }
    const ribMesh = Mesh.MergeMeshes(ribs, true, true)!;
    ribMesh.material = iron;
    ribMesh.isPickable = false;
    out.push(ribMesh);

    // Railings: rails, posts and lattice panels
    const railParts: Mesh[] = [];
    for (const side of [-1, 1]) {
      const z = side * (DECK_W / 2 - 0.05);
      const top = MeshBuilder.CreateBox('rTop', { width: BRIDGE_LENGTH, height: 0.08, depth: 0.14 }, s);
      top.position = new Vector3(0, DECK_Y + 1.25, z);
      const bottom = MeshBuilder.CreateBox('rBot', { width: BRIDGE_LENGTH, height: 0.06, depth: 0.1 }, s);
      bottom.position = new Vector3(0, DECK_Y + 0.25, z);
      railParts.push(top, bottom);
      for (let x = -BRIDGE_LENGTH / 2; x <= BRIDGE_LENGTH / 2 + 0.01; x += 2.5) {
        const post = MeshBuilder.CreateBox('post', { width: 0.08, height: 1.1, depth: 0.08 }, s);
        post.position = new Vector3(x, DECK_Y + 0.72, z);
        railParts.push(post);
      }
    }
    const rails = Mesh.MergeMeshes(railParts, true, true)!;
    rails.material = iron;
    rails.isPickable = false;
    out.push(rails);

    const latMat = new StandardMaterial('latMat', s);
    const lat = latticeTexture(s);
    lat.uScale = BRIDGE_LENGTH / 1.2;
    latMat.diffuseTexture = lat;
    latMat.useAlphaFromDiffuseTexture = true;
    latMat.backFaceCulling = false;
    latMat.specularColor = new Color3(0.2, 0.2, 0.2);
    for (const side of [-1, 1]) {
      const panel = MeshBuilder.CreatePlane('lattice', { width: BRIDGE_LENGTH, height: 1.0, sideOrientation: Mesh.DOUBLESIDE }, s);
      panel.position = new Vector3(0, DECK_Y + 0.75, side * (DECK_W / 2 - 0.05));
      panel.material = latMat;
      panel.isPickable = false;
      out.push(panel);
    }

    // Lamps on every pier, both sides
    const lampPole: Mesh[] = [];
    const lanterns: Mesh[] = [];
    let lights = 0;
    for (let i = 0; i <= BRIDGE.spans; i++) {
      for (const side of [-1, 1]) {
        const x = -BRIDGE_LENGTH / 2 + i * SPAN;
        const z = side * (DECK_W / 2 - 0.35);
        const pole = MeshBuilder.CreateCylinder('pole', { height: 3.4, diameterTop: 0.08, diameterBottom: 0.18, tessellation: 8 }, s);
        pole.position = new Vector3(x, DECK_Y + 1.7, z);
        lampPole.push(pole);
        const lantern = MeshBuilder.CreateSphere('lantern', { diameter: 0.42, segments: 8 }, s);
        lantern.position = new Vector3(x, DECK_Y + 3.5, z);
        lanterns.push(lantern);
        if (lights < QUALITY[this.opts.quality].lamps && side === 1 && i % 3 === 1) {
          const pl = new PointLight(`lamp${i}`, lantern.position.clone(), s);
          pl.diffuse = new Color3(1, 0.75, 0.42);
          pl.intensity = 18;
          pl.range = 16;
          lights++;
        }
      }
    }
    const poles = Mesh.MergeMeshes(lampPole, true, true)!;
    poles.material = iron;
    out.push(poles);
    const lanternMesh = Mesh.MergeMeshes(lanterns, true, true)!;
    const lanternMat = new StandardMaterial('lanternMat', s);
    lanternMat.emissiveColor = new Color3(1, 0.78, 0.45);
    lanternMat.disableLighting = true;
    lanternMesh.material = lanternMat;
    lanternMesh.metadata = { glow: new Color4(1, 0.7, 0.35, 1) };
    out.push(lanternMesh);
    for (const m of out) m.isPickable = false;
    return out;
  }

  private buildCity(): Mesh[] {
    const s = this.scene;
    const out: Mesh[] = [];
    const { diffuse, emissive } = facadeTextures(s);
    const facade = new StandardMaterial('facade', s);
    facade.diffuseTexture = diffuse;
    facade.emissiveTexture = emissive;
    facade.specularColor = new Color3(0.03, 0.03, 0.03);
    facade.emissiveTexture.level = 1.4;
    const roof = new StandardMaterial('roof', s);
    roof.diffuseColor = new Color3(0.24, 0.27, 0.33);
    roof.specularColor = new Color3(0.15, 0.15, 0.18);

    const r = rng(42);
    const blocks: Mesh[] = [];
    const roofs: Mesh[] = [];
    // Rows of Haussmann buildings along both banks, leaving room for the landmarks at the bridge ends.
    for (const sign of [-1, 1]) {
      const x = sign * (RIVER_HALF + 44);
      for (let z = -520; z < 520; ) {
        const w = 18 + r() * 16;
        if (Math.abs(z + w / 2) < 46) { z += w; continue; }
        const h = 15 + r() * 7;
        const d = 22;
        const b = MeshBuilder.CreateBox('bld', { width: d, height: h, depth: w - 0.6, faceUV: undefined }, s);
        b.position = new Vector3(x + sign * (r() * 4), h / 2 + DECK_Y, z + w / 2);
        // scale facade texture to building size via UVs
        const uv = b.getVerticesData('uv')!;
        for (let i = 0; i < uv.length; i += 2) { uv[i] *= (w / 14); uv[i + 1] *= h / 24; }
        b.setVerticesData('uv', uv);
        blocks.push(b);
        const mansard = MeshBuilder.CreateCylinder('roof', { height: w - 0.6, diameter: d * 1.05, tessellation: 4 }, s);
        mansard.rotation.x = Math.PI / 2;
        mansard.rotation.y = Math.PI / 4;
        mansard.scaling.y = 1;
        mansard.scaling.x = 0.45;
        mansard.position = new Vector3(b.position.x, DECK_Y + h + 2.2, b.position.z);
        roofs.push(mansard);
        z += w;
      }
    }
    const bm = Mesh.MergeMeshes(blocks, true, true)!;
    bm.material = facade;
    const rm = Mesh.MergeMeshes(roofs, true, true)!;
    rm.material = roof;
    out.push(bm, rm);

    // Domed academy at the south end (inspired by the Institut de France)
    const domeMat = new PBRMaterial('domeMat', s);
    domeMat.albedoColor = new Color3(0.3, 0.33, 0.38);
    domeMat.metallic = 0.7;
    domeMat.roughness = 0.35;
    const stone = new StandardMaterial('academyStone', s);
    stone.diffuseColor = new Color3(0.78, 0.71, 0.58);
    stone.specularColor = new Color3(0.03, 0.03, 0.03);
    const ax = RIVER_HALF + 50;
    const base = MeshBuilder.CreateBox('academy', { width: 24, height: 16, depth: 80 }, s);
    base.position = new Vector3(ax, DECK_Y + 8, 0);
    base.material = stone;
    const drum = MeshBuilder.CreateCylinder('drum', { height: 8, diameter: 16, tessellation: 32 }, s);
    drum.position = new Vector3(ax - 4, DECK_Y + 20, 0);
    drum.material = stone;
    const dome = MeshBuilder.CreateSphere('dome', { diameter: 16, segments: 24, slice: 0.5 }, s);
    dome.position = new Vector3(ax - 4, DECK_Y + 24, 0);
    dome.scaling.y = 1.25;
    dome.material = domeMat;
    const lantern = MeshBuilder.CreateCylinder('domeLantern', { height: 4, diameter: 2.2, tessellation: 12 }, s);
    lantern.position = new Vector3(ax - 4, DECK_Y + 35.5, 0);
    const gold = new PBRMaterial('gold', s);
    gold.albedoColor = Color3.FromHexString('#e8c27a').toLinearSpace();
    gold.metallic = 1; gold.roughness = 0.25;
    lantern.material = gold;
    out.push(base, drum, dome, lantern);

    // Palace facade at the north end (inspired by the Louvre's long riverside wing)
    const px = -(RIVER_HALF + 50);
    const palace = MeshBuilder.CreateBox('palace', { width: 26, height: 22, depth: 300 }, s);
    palace.position = new Vector3(px, DECK_Y + 11, 0);
    const palaceMat = new StandardMaterial('palaceMat', s);
    palaceMat.diffuseTexture = diffuse;
    palaceMat.emissiveTexture = emissive;
    palaceMat.specularColor = new Color3(0.03, 0.03, 0.03);
    const puv = palace.getVerticesData('uv')!;
    for (let i = 0; i < puv.length; i += 2) { puv[i] *= 22; puv[i + 1] *= 1; }
    palace.setVerticesData('uv', puv);
    palace.material = palaceMat;
    const proof = MeshBuilder.CreateCylinder('palaceRoof', { height: 300, diameter: 28, tessellation: 4 }, s);
    proof.rotation.x = Math.PI / 2; proof.rotation.y = Math.PI / 4; proof.scaling.x = 0.45;
    proof.position = new Vector3(px, DECK_Y + 25, 0);
    proof.material = roof;
    for (const pz of [-40, 40]) {
      const pav = MeshBuilder.CreateBox('pavilion', { width: 30, height: 28, depth: 24 }, s);
      pav.position = new Vector3(px, DECK_Y + 14, pz);
      pav.material = stone;
      out.push(pav);
    }
    out.push(palace, proof);

    // Distant iron tower silhouette with twinkling lights
    const tower = MeshBuilder.CreateCylinder('tower', { height: 180, diameterTop: 2, diameterBottom: 70, tessellation: 4 }, s);
    tower.position = new Vector3(260, 90, 900);
    const towerMat = new StandardMaterial('towerMat', s);
    towerMat.diffuseColor = new Color3(0.12, 0.1, 0.1);
    towerMat.emissiveColor = new Color3(0.35, 0.22, 0.1);
    tower.material = towerMat;
    out.push(tower);

    // Plane trees along the quays
    const leaf = new StandardMaterial('leaf', s);
    leaf.diffuseColor = new Color3(0.16, 0.28, 0.16);
    leaf.specularColor = Color3.Black();
    const canopies: Mesh[] = [];
    for (const sign of [-1, 1]) {
      for (let z = -400; z < 400; z += 14) {
        if (Math.abs(z) < 16) continue;
        const c = MeshBuilder.CreateSphere('tree', { diameter: 7 + r() * 2, segments: 6 }, s);
        c.position = new Vector3(sign * (RIVER_HALF + 10), DECK_Y + 5 + r(), z);
        c.scaling.y = 0.8;
        canopies.push(c);
      }
    }
    const trees = Mesh.MergeMeshes(canopies, true, true)!;
    trees.material = leaf;
    out.push(trees);
    for (const m of out) m.isPickable = false;
    return out;
  }

  private buildMotes(count: number) {
    const ps = new ParticleSystem('motes', count, this.scene);
    ps.particleTexture = glowDotTexture(this.scene);
    ps.emitter = new Vector3(0, DECK_Y + 2, 0);
    ps.minEmitBox = new Vector3(-BRIDGE_LENGTH / 2, -1.5, -DECK_W / 2 - 2);
    ps.maxEmitBox = new Vector3(BRIDGE_LENGTH / 2, 3, DECK_W / 2 + 2);
    ps.color1 = new Color4(1, 0.85, 0.55, 0.9);
    ps.color2 = new Color4(1, 0.6, 0.7, 0.7);
    ps.colorDead = new Color4(1, 0.8, 0.5, 0);
    ps.minSize = 0.05; ps.maxSize = 0.14;
    ps.minLifeTime = 4; ps.maxLifeTime = 9;
    ps.emitRate = count / 6;
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.gravity = new Vector3(0, 0.02, 0);
    ps.direction1 = new Vector3(-0.1, 0.05, -0.1);
    ps.direction2 = new Vector3(0.1, 0.15, 0.1);
    ps.minEmitPower = 0.05; ps.maxEmitPower = 0.2;
    ps.start();
  }

  // ---------- locks ----------
  private buildLockSources() {
    for (const shape of LOCK_SHAPES) {
      const base = createMergedLock(this.scene, shape, `src-${shape}`);
      base.setEnabled(false);
      for (const mat of MATERIALS) {
        const m = base.clone(`real-${shape}-${mat.id}`)!;
        m.makeGeometryUnique(); // thin-instance buffers live on the geometry, so each group needs its own
        m.material = lockMaterial(this.scene, mat.id, `lm-${shape}-${mat.id}`, true);
        m.isPickable = this.opts.interactive;
        m.thinInstanceEnablePicking = this.opts.interactive;
        m.metadata = { lockGroup: true };
        m.alwaysSelectAsActiveMesh = false;
        m.setEnabled(false);
        this.lockMeshes.set(`${shape}:${mat.id}`, m);
        this.mirror?.renderList!.push(m);
      }
    }
  }

  /** Clearly decorative, non-interactive ambience: fills the railing like the real bridge once was. */
  private buildDecorativeLocks(count: number) {
    if (!count) return;
    const r = rng(2024);
    const groups = new Map<string, { m: number[]; c: number[] }>();
    const palette = ['#e8c27a', '#d9dde3', '#b9773f', '#8a929c', '#d9607d', '#c9a04a', '#9aa3ad', '#7a4a2b'];
    const mats = ['gold', 'silver', 'bronze', 'steel', 'enamel'];
    const tmp = new Matrix();
    for (let i = 0; i < count; i++) {
      const shape = LOCK_SHAPES[Math.floor(r() * (r() < 0.6 ? 2 : 4))] as LockShape;
      const mat = mats[Math.floor(r() * mats.length)];
      const side = r() < 0.5 ? 0 : 1;
      const x = -BRIDGE_LENGTH / 2 + 0.4 + r() * (BRIDGE_LENGTH - 0.8);
      const y = DECK_Y + 0.36 + r() * 0.8;
      const z = side === 0 ? -DECK_W / 2 + 0.13 + r() * 0.02 : DECK_W / 2 - 0.13 - r() * 0.02;
      const rot = Quaternion.RotationYawPitchRoll((side === 0 ? Math.PI : 0) + (r() - 0.5) * 0.5, (r() - 0.5) * 0.4, (r() - 0.5) * 0.9);
      const sc = 0.1 + r() * 0.05;
      Matrix.ComposeToRef(new Vector3(sc, sc, sc), rot, new Vector3(x, y, z), tmp);
      const key = `${shape}:${mat}`;
      if (!groups.has(key)) groups.set(key, { m: [], c: [] });
      const g = groups.get(key)!;
      g.m.push(...tmp.asArray());
      const [cr, cg, cb] = instanceColor(palette[Math.floor(r() * palette.length)], mat);
      g.c.push(cr * 0.8, cg * 0.8, cb * 0.8, 1);
    }
    for (const [key, g] of groups) {
      const [shape, mat] = key.split(':');
      const src = this.lockMeshes.get(`${shape}:${mat}`)!;
      const m = src.clone(`deco-${key}`)!;
      m.makeGeometryUnique();
      m.isPickable = false;
      m.thinInstanceEnablePicking = false;
      m.metadata = null;
      m.setEnabled(true);
      m.thinInstanceSetBuffer('matrix', new Float32Array(g.m), 16, true);
      m.thinInstanceSetBuffer('color', new Float32Array(g.c), 4, true);
      m.thinInstanceRefreshBoundingInfo(false);
      m.freezeWorldMatrix();
    }
  }

  /** Replace all real (interactive) locks. */
  setLocks(locks: BridgeLock[]) {
    const groups = new Map<string, BridgeLock[]>();
    for (const l of locks) {
      const key = `${l.shape}:${l.material}`;
      if (!this.lockMeshes.has(key)) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(l);
    }
    this.instanceIds.clear();
    const tmp = new Matrix();
    for (const [key, mesh] of this.lockMeshes) {
      const list = groups.get(key) ?? [];
      if (!list.length) { mesh.thinInstanceCount = 0; mesh.setEnabled(false); continue; }
      const mats = new Float32Array(list.length * 16);
      const cols = new Float32Array(list.length * 4);
      list.forEach((l, i) => {
        const t = slotTransform(l.slot);
        const sc = l.isOwn ? 0.17 : 0.15;
        Matrix.ComposeToRef(new Vector3(sc, sc, sc), t.rotation, t.position, tmp);
        tmp.copyToArray(mats, i * 16);
        const [r, g, b] = instanceColor(l.color, l.material);
        const boost = l.effect === 'glow' ? 1.35 : 1;
        cols.set([r * boost, g * boost, b * boost, 1], i * 4);
      });
      mesh.setEnabled(true);
      mesh.thinInstanceSetBuffer('matrix', mats, 16, true);
      mesh.thinInstanceSetBuffer('color', cols, 4, true);
      mesh.thinInstanceRefreshBoundingInfo(false);
      this.instanceIds.set(mesh, list.map((l) => l.id));
    }
  }

  private setupPicking() {
    let downAt = 0;
    this.scene.onPointerObservable.add((pi) => {
      if (pi.type === PointerEventTypes.POINTERDOWN) downAt = performance.now();
      if (pi.type !== PointerEventTypes.POINTERUP || performance.now() - downAt > 300) return;
      const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (m: AbstractMesh) => !!m.metadata?.lockGroup && m.isEnabled());
      if (pick?.hit && pick.pickedMesh && pick.thinInstanceIndex >= 0) {
        const ids = this.instanceIds.get(pick.pickedMesh as Mesh);
        const id = ids?.[pick.thinInstanceIndex];
        if (id) { this.opts.onSelect?.(id); return; }
      }
    });
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener('resize', this.onResize);
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
