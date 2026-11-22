// The viral entry point. Must stay light: no 3D engine, works on any mobile browser, no install or signup.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { LockDetail, Story, UnlockResult } from '../../shared/types.ts';
import { LockArt } from '../components/LockArt.tsx';
import { PuzzleSolver } from '../components/PuzzleSolver.tsx';
import { StoryReveal } from '../components/StoryReveal.tsx';
import { Button, Card, Spinner } from '../components/ui.tsx';
import { ApiRequestError, get } from '../lib/api.ts';
import { track } from '../lib/analytics.ts';
import { useSession } from '../lib/session.tsx';

export function InvitePage() {
  const { token = '' } = useParams();
  const [lock, setLock] = useState<LockDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [story, setStory] = useState<Story | null>(null);
  const [started, setStarted] = useState(false);
  const { me, celebrate, refresh } = useSession();

  useEffect(() => {
    get<LockDetail>(`/api/invitations/${encodeURIComponent(token)}`)
      .then((l) => { setLock(l); track('invite_opened', { puzzle: l.puzzle.type }); })
      .catch((e: ApiRequestError) => setError(e.message));
  }, [token]);

  const onSolved = (r: UnlockResult) => {
    celebrate(r.xpAwarded, r.newAchievements);
    if (r.story) setStory(r.story);
    void refresh();
  };

  const openAgain = async () => {
    if (!lock) return;
    try { setStory(await get<Story>(`/api/locks/${lock.id}/story`)); } catch (e) { setError((e as Error).message); }
  };

  return (
    <main className="min-h-[100dvh] px-4 pb-12 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="mx-auto flex max-w-lg items-center justify-between">
        <Link to="/" className="font-display text-xl text-brass-300">Love Locks</Link>
        <span className="text-xs text-ivory/50">The Bridge of Memories</span>
      </header>

      {error && (
        <Card className="mx-auto mt-16 max-w-md text-center">
          <p className="font-display text-3xl">This key no longer fits</p>
          <p className="mt-2 text-sm text-ivory/60">{error}</p>
          <Link to="/create"><Button className="mt-5">Create your own lock</Button></Link>
        </Card>
      )}
      {!error && !lock && <Spinner label="Finding your lock" />}

      {lock && story && (
        <div className="mt-6">
          <StoryReveal lock={lock} story={story} />
          {me?.profile.isGuest && (
            <Card className="mx-auto mt-8 max-w-xl text-center">
              <p className="font-display text-2xl">Keep this story</p>
              <p className="mt-1 text-sm text-ivory/60">Create a free account to find it again on any device and leave your own lock on the bridge.</p>
              <Link to="/auth?mode=register"><Button className="mt-4">Create my account</Button></Link>
            </Card>
          )}
        </div>
      )}

      {lock && !story && (
        <div className="mx-auto mt-8 max-w-md text-center">
          <p className="text-[11px] uppercase tracking-[0.3em] text-brass-300">Someone left a lock for you</p>
          <h1 className="mt-2 font-display text-4xl leading-tight">{lock.title || 'A memory, sealed for you'}</h1>
          <p className="mt-2 text-sm text-ivory/60">{lock.creatorName ? `From ${lock.creatorName}. ` : ''}It hangs on a bridge of memories over the Seine. Only the right answer opens it.</p>
          <div className="relative my-6 flex justify-center">
            <div className="absolute inset-0 m-auto h-48 w-48 rounded-full bg-brass-400/20 blur-3xl" />
            <LockArt lock={lock} size={200} className="relative" />
          </div>
          {lock.solvedByMe ? (
            <Button onClick={openAgain}>📜 Read the story again</Button>
          ) : !started && lock.canAttempt ? (
            <Button onClick={() => setStarted(true)} className="w-64">{lock.puzzle.type === 'pin' ? '🔢 Enter the secret code' : '🧩 Answer the riddle'}</Button>
          ) : (
            <Card className="text-left"><PuzzleSolver detail={lock} token={token} onSolved={onSolved} /></Card>
          )}
          <p className="mt-8 text-xs text-ivory/40">No app, no account needed. <Link to="/community" className="underline">Guidelines</Link> · <Link to="/privacy" className="underline">Privacy</Link> · <Link to="/terms" className="underline">Terms</Link></p>
        </div>
      )}
    </main>
  );
}
