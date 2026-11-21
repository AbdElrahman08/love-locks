import { useEffect, useState } from 'react';
import { GAME_CONFIG } from '../config/gameConfig.ts';

export type Quality = 'auto' | 'low' | 'medium' | 'high';

export interface Settings {
  quality: Quality;
  sound: boolean;
  motion: 'system' | 'reduced' | 'full';
  cameraMode: 'orbit' | 'free';
  seenIntro: boolean;
}

const KEY = 'll.settings';
const DEFAULTS: Settings = { quality: 'auto', sound: true, motion: 'system', cameraMode: GAME_CONFIG.camera.defaultMode, seenIntro: false };
const listeners = new Set<(s: Settings) => void>();

function read(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

let current = read();

export function getSettings() { return current; }

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* private mode */ }
  listeners.forEach((l) => l(current));
}

export function useSettings(): [Settings, (p: Partial<Settings>) => void] {
  const [s, set] = useState(current);
  useEffect(() => { listeners.add(set); return () => { listeners.delete(set); }; }, []);
  return [s, updateSettings];
}

export function prefersReducedMotion(s: Settings = current): boolean {
  if (s.motion === 'reduced') return true;
  if (s.motion === 'full') return false;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

let measuredTier: 'low' | 'medium' | 'high' | null = null;

/** Remember a tier chosen by the runtime FPS check (for this page session). */
export function setMeasuredTier(t: 'low' | 'medium' | 'high') { measuredTier = t; }

function gpuName(): string {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  } catch {
    return '';
  }
}

/** Pick a sensible quality for this device when the player hasn't chosen one. */
export function resolveQuality(q: Quality): 'low' | 'medium' | 'high' {
  if (q !== 'auto') return q;
  if (measuredTier) return measuredTier;
  const gpu = gpuName();
  if (/SwiftShader|llvmpipe|Software|Microsoft Basic/i.test(gpu)) return 'low';
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || matchMedia('(pointer: coarse)').matches;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  if (mobile) return /Apple GPU|Adreno \(TM\) (7|8)\d\d/i.test(gpu) && mem >= 6 ? 'medium' : 'low';
  if (/Intel|Apple M1|Radeon\(TM\) Graphics|Vega/i.test(gpu)) return 'medium';
  return (navigator.hardwareConcurrency ?? 4) >= 8 ? 'high' : 'medium';
}

/** Next tier down, used when the measured frame rate is too low. */
export function lowerTier(t: 'low' | 'medium' | 'high'): 'low' | 'medium' | null {
  return t === 'high' ? 'medium' : t === 'medium' ? 'low' : null;
}
