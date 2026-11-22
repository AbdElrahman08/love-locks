import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BridgeLock } from '../../shared/types.ts';
import { BridgeCanvas } from '../components/Canvas3D.tsx';
import { Button } from '../components/ui.tsx';
import { get } from '../lib/api.ts';
import { track } from '../lib/analytics.ts';
import { useSession } from '../lib/session.tsx';

export default function LandingScreen() {
  const [locks, setLocks] = useState<BridgeLock[]>([]);
  const [no3d, setNo3d] = useState(false);
  const { me } = useSession();
  useEffect(() => { get<BridgeLock[]>('/api/bridge').then(setLocks).catch(() => undefined); }, []);

  return (
    <main className="relative min-h-[100dvh] overflow-hidden">
      {!no3d && <BridgeCanvas locks={locks} interactive={false} onUnsupported={() => setNo3d(true)} className="absolute inset-0 h-full" />}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-night-950/70 via-transparent to-night-950" />
      <div className="relative z-10 flex min-h-[100dvh] flex-col justify-between px-6 pb-10 pt-[max(2rem,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between">
          <span className="font-display text-xl tracking-wide text-brass-300">Love Locks</span>
          {me && !me.profile.isGuest
            ? <Link to="/profile" className="pointer-events-auto text-sm text-ivory/80">{me.profile.avatar} {me.profile.displayName}</Link>
            : <Link to="/auth" className="pointer-events-auto rounded-full border border-white/20 px-4 py-1.5 text-sm text-ivory/80 backdrop-blur hover:bg-white/10">Sign in</Link>}
        </header>

        <section className="mx-auto w-full max-w-xl text-center">
          <p className="text-xs uppercase tracking-[0.35em] text-brass-300/90">The Bridge of Memories</p>
          <h1 className="mt-3 font-display text-6xl font-semibold leading-[0.95] text-ivory drop-shadow-lg sm:text-7xl">
            Every lock<br /><span className="italic text-brass-300">holds a story.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-md text-base text-ivory/80">
            Craft a lock, hide a memory inside it behind a puzzle, and hang it on a virtual bridge over the Seine.
            Send the key to someone who matters.
          </p>
          <div className="pointer-events-auto mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link to="/create" onClick={() => track('landing_cta', { cta: 'create' })}><Button className="w-64 sm:w-auto">Create a lock</Button></Link>
            <Link to="/bridge" onClick={() => track('landing_cta', { cta: 'explore' })}><Button variant="ghost" className="w-64 bg-night-950/40 backdrop-blur sm:w-auto">Explore the bridge</Button></Link>
          </div>
        </section>

        <footer className="mx-auto max-w-md text-center text-xs text-ivory/50">
          A virtual bridge — please never attach physical locks to real bridges or monuments.{' '}
          <Link to="/community" className="pointer-events-auto underline">Community guidelines</Link>{' · '}
          <Link to="/privacy" className="pointer-events-auto underline">Privacy</Link>{' · '}
          <Link to="/terms" className="pointer-events-auto underline">Terms</Link>
        </footer>
      </div>
    </main>
  );
}
