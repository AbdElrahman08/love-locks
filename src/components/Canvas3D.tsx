// React wrappers around the Babylon scenes. Imported lazily so routes like the invitation page
// never download the 3D engine.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { BridgeLock, LockAppearance } from '../../shared/types.ts';
import { BridgeWorld, webglAvailable } from '../three/BridgeWorld.ts';
import { LockPreview } from '../three/LockPreview.ts';
import { lowerTier, prefersReducedMotion, resolveQuality, setMeasuredTier, useSettings } from '../lib/settings.ts';

export interface BridgeHandle {
  focusSlot: (slot: number) => void;
  focusSpan: (span: number) => void;
  overview: () => void;
  clearSelection: () => void;
}

export const BridgeCanvas = forwardRef<BridgeHandle, {
  locks: BridgeLock[];
  interactive?: boolean;
  onSelect?: (id: string | null) => void;
  onUnsupported?: () => void;
  className?: string;
}>(function BridgeCanvas({ locks, interactive = true, onSelect, onUnsupported, className = '' }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const world = useRef<BridgeWorld | null>(null);
  const [settings] = useSettings();
  const [ready, setReady] = useState(false);
  const [tier, setTier] = useState(() => resolveQuality(settings.quality));
  useEffect(() => setTier(resolveQuality(settings.quality)), [settings.quality]);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    if (!canvas.current) return;
    if (!webglAvailable()) { onUnsupported?.(); return; }
    let w: BridgeWorld;
    try {
      w = new BridgeWorld(canvas.current, {
        quality: tier,
        reducedMotion: prefersReducedMotion(settings),
        cameraMode: interactive ? settings.cameraMode : 'orbit',
        interactive,
        onSelect: (id) => selectRef.current?.(id),
        // On "auto", step down a tier if this device can't hold a smooth frame rate.
        onPerformance: settings.quality === 'auto' ? (fps) => {
          // Background tabs throttle rendering, so only trust measurements taken while visible and focused.
          const lower = fps < 28 && document.visibilityState === 'visible' && document.hasFocus() ? lowerTier(tier) : null;
          if (lower) { setMeasuredTier(lower); setTier(lower); }
        } : undefined,
      });
    } catch (e) {
      console.error('3D init failed', e);
      onUnsupported?.();
      return;
    }
    world.current = w;
    w.scene.executeWhenReady(() => setReady(true));
    return () => { w.dispose(); world.current = null; setReady(false); };
    // Rebuild the world when quality/motion change; camera mode is applied live below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier, settings.motion, interactive]);

  useEffect(() => { world.current?.setLocks(locks); }, [locks, ready]);
  useEffect(() => { if (interactive) world.current?.setCameraMode(settings.cameraMode); }, [settings.cameraMode, interactive]);

  useImperativeHandle(ref, () => ({
    focusSlot: (s) => world.current?.focusSlot(s),
    focusSpan: (s) => world.current?.focusSpan(s),
    overview: () => { world.current?.clearSelection(); world.current?.overview(); },
    clearSelection: () => world.current?.clearSelection(),
  }), []);

  return (
    <div className={className.includes('absolute') ? className : `relative ${className}`}>
      <canvas ref={canvas} className="h-full w-full touch-none outline-none" aria-label="3D view of the bridge of locks" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-night-950">
          <div className="text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-brass-400 border-t-transparent" />
            <p className="mt-3 font-display text-lg italic text-ivory/70">The lamps are being lit…</p>
          </div>
        </div>
      )}
    </div>
  );
});

export interface PreviewHandle { playUnlock: () => Promise<void> }

export const LockPreviewCanvas = forwardRef<PreviewHandle, { appearance: LockAppearance; className?: string; onUnsupported?: () => void }>(
  function LockPreviewCanvas({ appearance, className = '', onUnsupported }, ref) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const preview = useRef<LockPreview | null>(null);
    const [settings] = useSettings();

    useEffect(() => {
      if (!canvas.current) return;
      if (!webglAvailable()) { onUnsupported?.(); return; }
      try {
        preview.current = new LockPreview(canvas.current, { reducedMotion: prefersReducedMotion(settings), autoRotate: true });
        preview.current.setAppearance(appearance);
      } catch (e) {
        console.error(e);
        onUnsupported?.();
      }
      const ro = new ResizeObserver(() => preview.current?.resize());
      ro.observe(canvas.current);
      return () => { ro.disconnect(); preview.current?.dispose(); preview.current = null; };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      // Fonts may finish loading after the first draw; redraw so engravings use the right typeface.
      preview.current?.setAppearance(appearance);
      void document.fonts?.ready.then(() => preview.current?.setAppearance(appearance));
    }, [appearance]);

    useImperativeHandle(ref, () => ({ playUnlock: () => preview.current?.playUnlock() ?? Promise.resolve() }), []);

    return <canvas ref={canvas} className={`h-full w-full touch-none outline-none ${className}`} aria-label="3D preview of your lock" />;
  },
);
