// The emotional centerpiece: the lock opens, light spills out, and the story unfolds line by line.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { REACTIONS, REACTION_EMOJI, type Reaction } from '../../shared/catalog.ts';
import type { LockSummary, Story } from '../../shared/types.ts';
import { LockArt } from './LockArt.tsx';
import { Button } from './ui.tsx';
import { post } from '../lib/api.ts';
import { track } from '../lib/analytics.ts';
import { getSettings, prefersReducedMotion } from '../lib/settings.ts';
import { useSession } from '../lib/session.tsx';

function chime() {
  try {
    const ctx = new AudioContext();
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const t = ctx.currentTime + i * 0.12;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 1.5);
    });
    setTimeout(() => void ctx.close(), 2500);
  } catch { /* audio unavailable */ }
}

export function StoryReveal({ lock, story }: { lock: LockSummary; story: Story }) {
  const reduced = prefersReducedMotion();
  const [stage, setStage] = useState(reduced ? 3 : 0); // 0 closed → 1 opening → 2 light → 3 story
  const [reacted, setReacted] = useState<Reaction | null>(null);
  const [counts, setCounts] = useState(lock.reactions);
  const { toast } = useSession();

  useEffect(() => {
    track('story_revealed', { lockId: lock.id });
    if (reduced) return;
    if (getSettings().sound) chime();
    const t1 = setTimeout(() => setStage(1), 250);
    const t2 = setTimeout(() => setStage(2), 1100);
    const t3 = setTimeout(() => setStage(3), 1700);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [lock.id, reduced]);

  const react = async (r: Reaction) => {
    try {
      const res = await post<{ reactions: LockSummary['reactions'] }>(`/api/locks/${lock.id}/react`, { reaction: r });
      setReacted(r);
      setCounts(res.reactions);
      track('reaction_added', { reaction: r });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const paragraphs = story.body.split(/\n+/).filter(Boolean);

  return (
    <div className="relative mx-auto max-w-xl">
      <div className="relative flex justify-center py-4">
        <div className={`absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brass-300/40 blur-3xl transition-opacity duration-1000 ${stage >= 2 ? 'opacity-100' : 'opacity-0'}`} />
        {!reduced && stage >= 2 && (
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            {Array.from({ length: 14 }).map((_, i) => (
              <span key={i} className="animate-float-up absolute h-1.5 w-1.5 rounded-full bg-brass-300"
                style={{ left: `${30 + ((i * 37) % 40)}%`, top: '55%', animationDelay: `${(i % 7) * 0.18}s`, opacity: 0.8 }} />
            ))}
          </div>
        )}
        <LockArt lock={lock} size={180} open={stage >= 1} animate={!reduced} className="relative drop-shadow-[0_10px_30px_rgba(0,0,0,.5)]" />
      </div>

      <article aria-live="polite" className={`relative rounded-[2rem] border border-brass-400/30 bg-gradient-to-b from-ivory to-[#f1e6cf] p-7 text-night-900 shadow-2xl transition-all duration-1000 ${stage >= 3 ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'}`}>
        {stage >= 3 && (
          <>
            {story.title && <h2 className="font-display text-3xl font-semibold leading-tight text-night-900">{story.title}</h2>}
            <div className="mt-4 space-y-4 font-display text-xl leading-relaxed">
              {paragraphs.map((p, i) => (
                <p key={i} className={reduced ? '' : 'animate-fade-in opacity-0'} style={reduced ? undefined : { animationDelay: `${0.15 + i * 0.45}s` }}>{p}</p>
              ))}
            </div>
            <p className={`mt-6 text-right font-display text-lg italic text-night-700 ${reduced ? '' : 'animate-fade-in opacity-0'}`} style={reduced ? undefined : { animationDelay: `${0.3 + paragraphs.length * 0.45}s` }}>
              — {story.signature || story.creatorName || 'Someone who cares'}
            </p>
          </>
        )}
      </article>

      {stage >= 3 && (
        <div className="mt-6 space-y-5 text-center">
          {!lock.isOwn && (
            <div>
              <p className="text-xs uppercase tracking-wider text-ivory/50">Leave a reaction</p>
              <div className="mt-2 flex justify-center gap-2">
                {REACTIONS.map((r) => (
                  <button key={r} onClick={() => react(r)} aria-pressed={reacted === r} aria-label={r}
                    className={`flex h-12 min-w-12 items-center justify-center gap-1 rounded-full border px-3 text-xl transition ${reacted === r ? 'border-brass-400 bg-brass-400/20' : 'border-white/10 hover:border-white/30'}`}>
                    {REACTION_EMOJI[r]}{counts[r] ? <span className="text-xs text-ivory/60">{counts[r]}</span> : null}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
            <Link to="/create"><Button>Create your own lock</Button></Link>
            <Link to="/bridge"><Button variant="ghost">Walk the bridge</Button></Link>
          </div>
        </div>
      )}
    </div>
  );
}
