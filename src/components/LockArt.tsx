// Lightweight SVG rendering of a lock — used on the invitation page, story reveal, lists and as the
// no-WebGL fallback. Mirrors the 3D shapes closely enough to feel like the same object.
import { ENGRAVING_STYLES, materialById, type LockShape } from '../../shared/catalog.ts';
import type { LockAppearance } from '../../shared/types.ts';
import { useId } from 'react';

const BODY_PATH: Record<LockShape, string> = {
  heart: 'M100 182 C 40 140 18 112 18 84 C 18 58 38 42 60 42 C 78 42 92 52 100 66 C 108 52 122 42 140 42 C 162 42 182 58 182 84 C 182 112 160 140 100 182 Z',
  classic: 'M38 66 H162 Q178 66 178 82 V166 Q178 182 162 182 H38 Q22 182 22 166 V82 Q22 66 38 66 Z',
  round: 'M100 52 A 66 66 0 1 1 99.9 52 Z',
  shield: 'M30 62 H170 V100 C170 140 140 168 100 186 C 60 168 30 140 30 100 Z',
};
const TEXT_Y: Record<LockShape, number> = { heart: 100, classic: 120, round: 120, shield: 112 };
const SHACKLE_TOP: Record<LockShape, number> = { heart: 58, classic: 70, round: 60, shield: 66 };

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

export function LockArt({
  lock, size = 160, open = false, animate = true, className = '', showText = true,
}: { lock: Pick<LockAppearance, 'shape' | 'material' | 'color' | 'engraving' | 'engravingStyle' | 'decoration' | 'effect'> & { lockDate?: string }; size?: number; open?: boolean; animate?: boolean; className?: string; showText?: boolean }) {
  const id = useId().replace(/:/g, '');
  const mat = materialById(lock.material);
  const color = lock.color || mat.baseColor;
  const metallic = mat.metallic > 0.5;
  const style = ENGRAVING_STYLES.find((s) => s.id === lock.engravingStyle) ?? ENGRAVING_STYLES[0];
  const top = SHACKLE_TOP[lock.shape];
  const deco: Record<string, string> = { hearts: '♥', stars: '✦', vines: '❦', ribbon: '❀' };
  const shackleColor = lock.material === 'enamel' || lock.material === 'crystal' ? '#cfd4db' : shade(color, 0.08);
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={className} role="img"
      aria-label={`${mat.label} ${lock.shape} lock engraved “${lock.engraving}”`}>
      <defs>
        <linearGradient id={`b${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={shade(color, metallic ? 0.28 : 0.12)} />
          <stop offset="0.45" stopColor={color} />
          <stop offset="1" stopColor={shade(color, metallic ? -0.32 : -0.18)} />
        </linearGradient>
        <linearGradient id={`s${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={shade(shackleColor === '#cfd4db' ? '#cfd4db' : color, -0.2)} />
          <stop offset="0.5" stopColor={shade(shackleColor === '#cfd4db' ? '#cfd4db' : color, 0.25)} />
          <stop offset="1" stopColor={shade(shackleColor === '#cfd4db' ? '#cfd4db' : color, -0.25)} />
        </linearGradient>
        <filter id={`g${id}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
      </defs>
      {lock.effect === 'glow' && <path d={BODY_PATH[lock.shape]} fill={color} opacity="0.55" filter={`url(#g${id})`} />}
      <g style={{
        transformOrigin: `142px ${top + 30}px`,
        transform: open ? 'translateY(-22px) rotate(28deg)' : 'none',
        transition: animate ? 'transform 900ms cubic-bezier(.2,.8,.2,1.2)' : 'none',
      }}>
        <path d={`M58 ${top + 34} V${top - 4} A42 42 0 0 1 142 ${top - 4} V${top + 34}`} fill="none" stroke={`url(#s${id})`} strokeWidth="15" strokeLinecap="round" />
      </g>
      <path d={BODY_PATH[lock.shape]} fill={`url(#b${id})`} opacity={mat.alpha < 1 ? 0.82 : 1} stroke={shade(color, -0.4)} strokeOpacity="0.35" strokeWidth="1.5" />
      <path d={BODY_PATH[lock.shape]} fill="none" stroke="white" strokeOpacity={metallic ? 0.35 : 0.15} strokeWidth="2" transform="translate(-2,-2)" />
      {showText && (
        <g fill={metallic ? 'rgba(40,25,10,.72)' : 'rgba(255,250,240,.92)'} textAnchor="middle">
          <text x="100" y={TEXT_Y[lock.shape]} fontSize={lock.engraving.length > 12 ? 15 : 22}
            style={{ font: style.font.replace(/\d+px/, `${lock.engraving.length > 12 ? 15 : 22}px`) }}>
            {style.id === 'block' ? lock.engraving.toUpperCase() : lock.engraving}
          </text>
          {lock.lockDate && <text x="100" y={TEXT_Y[lock.shape] + 22} fontSize="11" fontFamily="Inter, sans-serif" opacity=".8">{lock.lockDate}</text>}
          {deco[lock.decoration] && (
            <>
              <text x={lock.shape === 'heart' ? 62 : 48} y={TEXT_Y[lock.shape] - 24} fontSize="14">{deco[lock.decoration]}</text>
              <text x={lock.shape === 'heart' ? 138 : 152} y={TEXT_Y[lock.shape] - 24} fontSize="14">{deco[lock.decoration]}</text>
            </>
          )}
        </g>
      )}
      {lock.effect === 'sparkle' && (
        <g fill="#fff6d8" className={animate ? 'animate-twinkle' : ''}>
          <circle cx="36" cy="50" r="2" /><circle cx="168" cy="92" r="2.5" /><circle cx="150" cy="30" r="1.6" /><circle cx="52" cy="170" r="1.8" />
        </g>
      )}
    </svg>
  );
}
