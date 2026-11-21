import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BRIDGE, CATEGORIES, VISIBILITY_INFO } from '../../shared/catalog.ts';
import { REACTION_EMOJI, type Reaction } from '../../shared/catalog.ts';
import type { BridgeLock, ChallengeProgress, LockDetail, LockSummary } from '../../shared/types.ts';
import { BridgeCanvas, type BridgeHandle } from '../components/Canvas3D.tsx';
import { LockArt } from '../components/LockArt.tsx';
import { Button, Chip } from '../components/ui.tsx';
import { ApiRequestError, get, post } from '../lib/api.ts';
import { useSession } from '../lib/session.tsx';
import { useSettings } from '../lib/settings.ts';
import { GAME_CONFIG } from '../config/gameConfig.ts';
import { ReportDialog } from './LockPage.tsx';

type Panel = { kind: 'detail'; lock: LockDetail } | { kind: 'restricted'; lock: BridgeLock } | null;

export default function BridgeScreen() {
  const [locks, setLocks] = useState<BridgeLock[]>([]);
  const [feed, setFeed] = useState<{ featured: LockSummary[]; recent: LockSummary[] }>({ featured: [], recent: [] });
  const [tab, setTab] = useState<'featured' | 'recent'>('featured');
  const [panel, setPanel] = useState<Panel>(null);
  const [challenges, setChallenges] = useState<ChallengeProgress[]>([]);
  const [no3d, setNo3d] = useState(false);
  const [span, setSpan] = useState(3);
  const [reporting, setReporting] = useState(false);
  const bridge = useRef<BridgeHandle>(null);
  const { me, celebrate, toast } = useSession();
  const [settings, setSettings] = useSettings();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const load = useCallback(() => {
    get<BridgeLock[]>('/api/bridge').then(setLocks).catch((e) => toast(e.message, 'error'));
    Promise.all([get<LockSummary[]>('/api/locks?sort=featured&limit=12'), get<LockSummary[]>('/api/locks?sort=recent&limit=12')])
      .then(([featured, recent]) => setFeed({ featured, recent }))
      .catch(() => undefined);
    get<ChallengeProgress[]>('/api/challenges').then(setChallenges).catch(() => undefined);
  }, [toast]);
  useEffect(load, [load]);

  const byId = useMemo(() => new Map(locks.map((l) => [l.id, l])), [locks]);

  const select = useCallback(async (id: string | null) => {
    if (!id) { setPanel(null); return; }
    const l = byId.get(id);
    if (l) bridge.current?.focusSlot(l.slot);
    try {
      const detail = await get<LockDetail>(`/api/locks/${id}`);
      setPanel({ kind: 'detail', lock: detail });
      if (!detail.isOwn) {
        const r = await post<{ xpAwarded: number; newAchievements?: string[] }>(`/api/locks/${id}/inspect`);
        if (r.xpAwarded) celebrate(r.xpAwarded, r.newAchievements);
      }
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 403 && l) setPanel({ kind: 'restricted', lock: l });
      else toast((e as Error).message, 'error');
    }
  }, [byId, celebrate, toast]);

  // Deep link: /bridge?lock=<id>
  useEffect(() => {
    const id = params.get('lock');
    if (id && byId.has(id)) { void select(id); setParams({}, { replace: true }); }
  }, [params, byId, select, setParams]);

  const goSpan = (d: number) => {
    const next = Math.max(0, Math.min(BRIDGE.spans - 1, span + d));
    setSpan(next);
    setPanel(null);
    bridge.current?.focusSpan(next);
  };

  const openChallenge = challenges.find((c) => !c.claimed);
  const list = feed[tab];

  if (no3d) return <FallbackBridge feed={[...feed.featured, ...feed.recent]} />;

  return (
    <main className="relative h-[100dvh] overflow-hidden">
      <BridgeCanvas ref={bridge} locks={locks} onSelect={select} onUnsupported={() => setNo3d(true)} className="absolute inset-0 h-full" />

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-3 pt-[max(.75rem,env(safe-area-inset-top))]">
        <Link to="/profile" className="pointer-events-auto flex items-center gap-2 rounded-full bg-night-950/70 py-1.5 pl-1.5 pr-3 backdrop-blur">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-night-700 text-lg">{me?.profile.avatar ?? '🗝️'}</span>
          <span className="text-xs leading-tight">
            <span className="block font-semibold text-ivory">{me?.profile.displayName ?? '…'}</span>
            <span className="text-brass-300">Lv {me?.profile.level ?? 1} · {me?.profile.xp ?? 0} XP</span>
          </span>
        </Link>
        <div className="pointer-events-auto flex gap-2">
          {GAME_CONFIG.camera.allowFreeCamera && (
            <button onClick={() => setSettings({ cameraMode: settings.cameraMode === 'orbit' ? 'free' : 'orbit' })}
              className="rounded-full bg-night-950/70 px-3 py-2 text-xs text-ivory/80 backdrop-blur hover:text-ivory"
              title={settings.cameraMode === 'orbit' ? 'Switch to walking camera (WASD / drag)' : 'Switch to orbit camera'}>
              {settings.cameraMode === 'orbit' ? '🚶 Walk' : '🛰️ Orbit'}
            </button>
          )}
          <button onClick={() => { setPanel(null); bridge.current?.overview(); }} className="rounded-full bg-night-950/70 px-3 py-2 text-xs text-ivory/80 backdrop-blur hover:text-ivory">⤢ Overview</button>
        </div>
      </div>

      {openChallenge && !panel && (
        <Link to="/challenges" className="absolute left-3 top-20 z-10 max-w-[70%] rounded-2xl bg-night-950/70 px-3 py-2 text-xs backdrop-blur">
          <span className="text-brass-300">Daily · {openChallenge.title}</span>
          <span className="ml-2 text-ivory/70">{openChallenge.progress}/{openChallenge.target}</span>
        </Link>
      )}

      {/* span navigation */}
      {!panel && (
        <div className="absolute inset-x-0 top-1/2 z-10 flex -translate-y-1/2 justify-between px-2">
          <button aria-label="Previous span" onClick={() => goSpan(-1)} className="h-11 w-11 rounded-full bg-night-950/60 text-xl backdrop-blur">‹</button>
          <button aria-label="Next span" onClick={() => goSpan(1)} className="h-11 w-11 rounded-full bg-night-950/60 text-xl backdrop-blur">›</button>
        </div>
      )}

      {/* bottom sheet */}
      <section className="absolute inset-x-0 bottom-0 z-20 pb-nav">
        {panel ? (
          <div className="mx-auto max-w-lg px-3">
            <div className="rounded-3xl border border-white/10 bg-night-900/90 p-4 shadow-2xl backdrop-blur-xl">
              <button onClick={() => { setPanel(null); bridge.current?.clearSelection(); }} aria-label="Close" className="float-right -mr-1 -mt-1 h-9 w-9 rounded-full text-ivory/60 hover:bg-white/10">✕</button>
              {panel.kind === 'detail' ? (
                <div className="flex gap-4">
                  <LockArt lock={panel.lock} size={96} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] uppercase tracking-wider text-brass-300">{panel.lock.category} · {VISIBILITY_INFO[panel.lock.visibility].label}{panel.lock.isDemo ? ' · Demo' : ''}</p>
                    <h2 className="truncate font-display text-2xl text-ivory">{panel.lock.title || panel.lock.engraving}</h2>
                    <p className="text-xs text-ivory/60">by {panel.lock.creatorName ?? 'an anonymous wanderer'} · {panel.lock.unlockCount} opened
                      {Object.entries(panel.lock.reactions).map(([k, v]) => <span key={k} className="ml-1.5">{REACTION_EMOJI[k as Reaction]}{v}</span>)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {panel.lock.isOwn || panel.lock.solvedByMe
                        ? <Button onClick={() => navigate(`/lock/${panel.lock.id}`)}>Read the story</Button>
                        : <Button onClick={() => navigate(`/lock/${panel.lock.id}`)} disabled={!panel.lock.canAttempt}>{panel.lock.puzzle.type === 'pin' ? '🔢 Try the PIN' : '🧩 Solve the riddle'}</Button>}
                      {!panel.lock.isOwn && <Button variant="quiet" onClick={() => setReporting(true)}>Report</Button>}
                    </div>
                    {!panel.lock.canAttempt && !panel.lock.isOwn && !panel.lock.solvedByMe && <p className="mt-2 text-xs text-ivory/50">{panel.lock.attemptBlockedReason}</p>}
                  </div>
                </div>
              ) : (
                <div className="flex gap-4">
                  <LockArt lock={{ ...panel.lock, engraving: '', engravingStyle: 'serif', decoration: 'none' }} size={80} showText={false} />
                  <div>
                    <h2 className="font-display text-2xl text-ivory">{panel.lock.isOwn ? 'Your lock' : 'A private promise'}</h2>
                    <p className="mt-1 text-sm text-ivory/60">This lock can only be opened with its invitation link. Its story belongs to someone else.</p>
                  </div>
                </div>
              )}
            </div>
            {reporting && panel.kind === 'detail' && <ReportDialog lockId={panel.lock.id} onClose={() => setReporting(false)} onBlocked={() => { setPanel(null); load(); }} />}
          </div>
        ) : (
          <div className="bg-gradient-to-t from-night-950 via-night-950/85 to-transparent pt-10">
            <div className="mx-auto max-w-3xl px-3">
              <div className="mb-2 flex items-center gap-2">
                <Chip active={tab === 'featured'} onClick={() => setTab('featured')}>Featured</Chip>
                <Chip active={tab === 'recent'} onClick={() => setTab('recent')}>Recent</Chip>
                <span className="ml-auto text-xs text-ivory/40">Span {span + 1} of {BRIDGE.spans} · {locks.length} locks</span>
              </div>
              {list.length === 0 ? (
                <p className="rounded-2xl bg-white/5 p-4 text-sm text-ivory/60">No public locks yet — <Link to="/create" className="text-brass-300 underline">be the first to leave one</Link>.</p>
              ) : (
                <ul className="no-scrollbar flex gap-3 overflow-x-auto pb-2">
                  {list.map((l) => (
                    <li key={l.id}>
                      <button onClick={() => select(l.id)} className="flex w-40 shrink-0 flex-col items-center rounded-2xl border border-white/10 bg-night-900/80 p-2 text-center backdrop-blur hover:border-brass-400/50">
                        <LockArt lock={l} size={64} animate={false} />
                        <span className="mt-1 w-full truncate text-sm text-ivory">{l.title || l.engraving}</span>
                        <span className="text-[11px] text-ivory/50">{l.category}{l.isDemo ? ' · demo' : ''}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

/** Used when the device cannot render WebGL: the same content, as a list. */
function FallbackBridge({ feed }: { feed: LockSummary[] }) {
  const unique = [...new Map(feed.map((l) => [l.id, l])).values()];
  const [cat, setCat] = useState<string | null>(null);
  return (
    <main className="mx-auto max-w-3xl px-4 pb-nav pt-6">
      <h1 className="font-display text-4xl">The Bridge</h1>
      <p className="mt-1 text-sm text-ivory/60">Your device can’t display the 3D bridge, so here are its locks as a gallery.</p>
      <div className="no-scrollbar my-4 flex gap-2 overflow-x-auto">
        <Chip active={!cat} onClick={() => setCat(null)}>All</Chip>
        {CATEGORIES.map((c) => <Chip key={c} active={cat === c} onClick={() => setCat(c)}>{c}</Chip>)}
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {unique.filter((l) => !cat || l.category === cat).map((l) => (
          <li key={l.id}>
            <Link to={`/lock/${l.id}`} className="flex flex-col items-center rounded-2xl border border-white/10 bg-night-900/70 p-3 text-center">
              <LockArt lock={l} size={90} />
              <span className="mt-1 truncate text-sm">{l.title || l.engraving}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
