import { useEffect, useState } from 'react';
import { ACHIEVEMENTS, XP_RULES } from '../../shared/progression.ts';
import type { ChallengeProgress } from '../../shared/types.ts';
import { Button, Card, ErrorState, PageHeader, Spinner } from '../components/ui.tsx';
import { get, post } from '../lib/api.ts';
import { useSession } from '../lib/session.tsx';

export function ChallengesScreen() {
  const [list, setList] = useState<ChallengeProgress[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { me, celebrate, toast } = useSession();
  const load = () => { setError(null); get<ChallengeProgress[]>('/api/challenges').then(setList).catch((e) => setError(e.message)); };
  useEffect(load, []);

  const claim = async (id: string) => {
    try {
      const r = await post<{ xpAwarded: number; newAchievements: string[] }>(`/api/challenges/${id}/claim`);
      celebrate(r.xpAwarded, r.newAchievements);
      load();
    } catch (e) { toast((e as Error).message, 'error'); }
  };
  const unlocked = new Set(me?.achievements.map((a) => a.id));

  return (
    <main className="mx-auto max-w-2xl px-4 pb-nav pt-6">
      <PageHeader title="Challenges" subtitle="New ones every day at midnight (UTC)" />
      {error ? <ErrorState message={error} onRetry={load} /> : !list ? <Spinner /> : (
        <ul className="space-y-3">
          {list.map((c) => (
            <li key={c.id}>
              <Card className="flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-display text-2xl">{c.title}</p>
                  <p className="text-sm text-ivory/60">{c.description}</p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={c.progress} aria-valuemax={c.target}>
                    <div className="h-full rounded-full bg-gradient-to-r from-brass-500 to-brass-300 transition-all" style={{ width: `${(c.progress / c.target) * 100}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-ivory/50">{c.progress} / {c.target}</p>
                </div>
                {c.claimed ? <span className="text-sm text-brass-300">✓ Claimed</span>
                  : <Button disabled={!c.completed} onClick={() => claim(c.id)}>+{XP_RULES.daily_challenge.xp} XP</Button>}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-3 mt-10 font-display text-3xl">Achievements</h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ACHIEVEMENTS.map((a) => (
          <li key={a.id} className={`rounded-3xl border p-4 ${unlocked.has(a.id) ? 'border-brass-400/50 bg-brass-400/10' : 'border-white/10 bg-night-900/50 opacity-60'}`}>
            <span className={`text-3xl ${unlocked.has(a.id) ? '' : 'grayscale'}`}>{a.icon}</span>
            <p className="mt-1 font-semibold">{a.title}</p>
            <p className="text-xs text-ivory/60">{a.description}</p>
          </li>
        ))}
      </ul>

      <Card className="mt-8 text-sm text-ivory/70">
        <p className="font-semibold text-ivory">How XP works</p>
        <ul className="mt-2 space-y-1">
          <li>Create a lock: +{XP_RULES.create_lock.xp} (up to {XP_RULES.create_lock.dailyCap}/day)</li>
          <li>Solve someone’s lock: +{XP_RULES.solve_lock.xp} (once per lock)</li>
          <li>Inspect a new lock on the bridge: +{XP_RULES.inspect_lock.xp} (up to {XP_RULES.inspect_lock.dailyCap}/day)</li>
          <li>Someone with an account opens your lock: +{XP_RULES.receive_unlock.xp}</li>
        </ul>
        <p className="mt-2 text-xs text-ivory/50">Levels unlock cosmetic materials and engraving styles. Puzzles and stories are never pay- or level-gated.</p>
      </Card>
    </main>
  );
}
