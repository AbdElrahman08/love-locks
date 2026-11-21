// Close-up 3D preview of a single lock for the workshop, with engraving and the opening animation.
import {
  Animation, ArcRotateCamera, Color3, Color4, CubicEase, DirectionalLight, DynamicTexture, EasingFunction, Engine,
  GlowLayer, HemisphericLight, MeshBuilder, ParticleSystem, Scene, StandardMaterial, Vector3,
  type Mesh, type PBRMaterial,
} from '@babylonjs/core';
import { ENGRAVING_STYLES, materialById } from '../../shared/catalog.ts';
import type { LockAppearance } from '../../shared/types.ts';
import { BODY_DEPTH, createLockParts, lockMaterial, instanceColor, type LockParts } from './lockGeometry.ts';
import { duskEnvironment, glowDotTexture } from './textures.ts';

export class LockPreview {
  private engine: Engine;
  private scene: Scene;
  private camera: ArcRotateCamera;
  private parts: LockParts | null = null;
  private engravePlane: Mesh | null = null;
  private sparkle: ParticleSystem | null = null;
  private glow: GlowLayer;
  private current: LockAppearance | null = null;
  private reducedMotion: boolean;

  constructor(canvas: HTMLCanvasElement, opts: { reducedMotion: boolean; autoRotate: boolean }) {
    this.reducedMotion = opts.reducedMotion;
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, true);
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0, 0, 0, 0);
    this.camera = new ArcRotateCamera('cam', -Math.PI / 2 - 0.35, 1.38, 2.6, new Vector3(0, 0.15, 0), this.scene);
    this.camera.lowerRadiusLimit = 1.6;
    this.camera.upperRadiusLimit = 4;
    this.camera.wheelDeltaPercentage = 0.01;
    this.camera.minZ = 0.05;
    this.camera.attachControl(canvas, true);
    this.camera.useAutoRotationBehavior = opts.autoRotate && !opts.reducedMotion;
    if (this.camera.autoRotationBehavior) this.camera.autoRotationBehavior.idleRotationSpeed = 0.35;

    const hemi = new HemisphericLight('h', new Vector3(0, 1, -0.3), this.scene);
    hemi.intensity = 0.7;
    const key = new DirectionalLight('k', new Vector3(-0.5, -0.6, 0.8), this.scene);
    key.intensity = 2.2;
    key.diffuse = new Color3(1, 0.85, 0.7);

    this.scene.environmentTexture = duskEnvironment(this.scene, 32, true);

    this.glow = new GlowLayer('g', this.scene, { mainTextureSamples: 2 });
    this.glow.intensity = 0;

    this.engine.runRenderLoop(() => this.scene.render());
  }

  resize() { this.engine.resize(); }

  setAppearance(a: LockAppearance) {
    const prev = this.current;
    this.current = a;
    if (!this.parts || prev?.shape !== a.shape) {
      this.parts?.body.dispose();
      this.parts?.shackle.dispose();
      this.engravePlane?.dispose();
      this.parts = createLockParts(this.scene, a.shape, 'preview');
      this.engravePlane = MeshBuilder.CreatePlane('engrave', { width: 0.62, height: 0.4 }, this.scene);
      this.engravePlane.position = new Vector3(0, a.shape === 'heart' ? 0.03 : -0.02, -BODY_DEPTH / 2 - 0.004);
      this.engravePlane.isPickable = false;
    }
    const def = materialById(a.material);
    const bodyMat = lockMaterial(this.scene, a.material, 'bodyMat');
    const [r, g, b] = instanceColor(a.color, a.material);
    bodyMat.albedoColor = new Color3(r, g, b);
    if (a.effect === 'glow') { bodyMat.emissiveColor = new Color3(r * 0.25, g * 0.25, b * 0.25); }
    const oldBody = this.parts.body.material as PBRMaterial | null;
    this.parts.body.material = bodyMat;
    oldBody?.dispose();
    const oldShackle = this.parts.shackle.material as PBRMaterial | null;
    this.parts.shackle.material = lockMaterial(this.scene, a.material === 'crystal' || a.material === 'enamel' ? 'silver' : a.material, 'shackleMat');
    oldShackle?.dispose();
    this.drawEngraving(a, def.metallic > 0.5);
    this.glow.intensity = a.effect === 'glow' ? 0.6 : 0;
    this.setSparkle(a.effect === 'sparkle');
  }

  private drawEngraving(a: LockAppearance, metallic: boolean) {
    const tex = new DynamicTexture('engr', { width: 512, height: 330 }, this.scene, true);
    const c = tex.getContext() as unknown as CanvasRenderingContext2D;
    c.clearRect(0, 0, 512, 330);
    const style = ENGRAVING_STYLES.find((s) => s.id === a.engravingStyle) ?? ENGRAVING_STYLES[0];
    const ink = metallic ? 'rgba(40,25,10,0.78)' : 'rgba(255,250,240,0.9)';
    c.fillStyle = ink;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    let text = a.engraving || ' ';
    if (style.id === 'block') text = text.toUpperCase();
    let size = 64;
    c.font = style.font;
    while (c.measureText(text).width > 440 && size > 26) { size -= 4; c.font = style.font.replace(/\d+px/, `${size}px`); }
    c.fillText(text, 256, 150);
    c.font = '500 30px Inter, Arial, sans-serif';
    c.globalAlpha = 0.8;
    c.fillText(a.lockDate ?? '', 256, 225);
    c.globalAlpha = 1;
    const deco: Record<string, string> = { hearts: '♥', stars: '✦', vines: '❦', ribbon: '❀' };
    if (deco[a.decoration]) {
      c.font = '40px serif';
      c.fillText(deco[a.decoration], 90, 70); c.fillText(deco[a.decoration], 422, 70);
    }
    tex.hasAlpha = true;
    tex.update(true);
    const m = new StandardMaterial('engrMat', this.scene);
    m.diffuseTexture = tex;
    m.useAlphaFromDiffuseTexture = true;
    m.specularColor = new Color3(0.2, 0.2, 0.2);
    m.emissiveColor = metallic ? Color3.Black() : new Color3(0.3, 0.3, 0.3);
    const old = this.engravePlane!.material;
    this.engravePlane!.material = m;
    (old as StandardMaterial | null)?.diffuseTexture?.dispose();
    old?.dispose();
    this.engravePlane!.parent = this.parts!.body;
  }

  private setSparkle(on: boolean) {
    if (on && !this.sparkle && !this.reducedMotion) {
      const ps = new ParticleSystem('sp', 80, this.scene);
      ps.particleTexture = glowDotTexture(this.scene);
      ps.emitter = new Vector3(0, 0.1, 0);
      ps.minEmitBox = new Vector3(-0.5, -0.5, -0.3);
      ps.maxEmitBox = new Vector3(0.5, 0.7, 0.3);
      ps.minSize = 0.02; ps.maxSize = 0.06;
      ps.minLifeTime = 0.6; ps.maxLifeTime = 1.6;
      ps.emitRate = 40;
      ps.blendMode = ParticleSystem.BLENDMODE_ADD;
      ps.minEmitPower = 0; ps.maxEmitPower = 0.05;
      ps.start();
      this.sparkle = ps;
    } else if (!on && this.sparkle) {
      this.sparkle.dispose();
      this.sparkle = null;
    }
  }

  /** Shackle lifts and swings open. Resolves when finished. */
  playUnlock(): Promise<void> {
    const sh = this.parts?.shackle;
    if (!sh) return Promise.resolve();
    if (this.reducedMotion) { sh.position.y = 0.2; return Promise.resolve(); }
    sh.setPivotPoint(new Vector3(this.parts!.shackleHalfWidth, 0, 0));
    const ease = new CubicEase();
    ease.setEasingMode(EasingFunction.EASINGMODE_EASEOUT);
    return new Promise((resolve) => {
      Animation.CreateAndStartAnimation('lift', sh, 'position.y', 60, 30, 0, 0.2, 0, ease, () => {
        Animation.CreateAndStartAnimation('swing', sh, 'rotation.y', 60, 40, 0, Math.PI * 0.8, 0, ease, () => resolve());
      });
    });
  }

  dispose() {
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }
}
