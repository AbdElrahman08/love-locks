import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ACHIEVEMENTS } from '../../shared/progression.ts';
import { VISIBILITY_INFO } from '../../shared/catalog.ts';
import type { LockSummary, OwnLock } from '../../shared/types.ts';
import { LockArt } from '../components/LockArt.tsx';
import { Button, Card, Chip, EmptyState, Field, inputCls, Spinner } from '../components/ui.tsx';
import { del, get, patch } from '../lib/api.ts';
import { track } from '../lib/analytics.ts';
import { useSession } from '../lib/session.tsx';
import { useSettings, type Quality } from '../lib/settings.ts';

const AVATARS = ['🗝️', '🌹', '🌙', '⭐', '🕊️', '🎻', '🥐', '🗼', '💌', '🦋'];

export function ProfileScreen() {
  const { me, loading, refresh, signOut, toast } = useSession();
  const [tab, setTab] = useState<'locks' | 'unlocked' | 'settings'>('locks');
  const [mine, setMine] = useState<OwnLock[] | null>(null);
  const [unlocked, setUnlocked] = useState<LockSummary[] | null>(null);
  const [name, setName] = useState('');
  const [settings, setSettings] = useSettings();
  const [blocks, setBlocks] = useState<{ id: string; displayName: string }[]>([]);
  const navigate = useNavigate();

  useEffect(() => { if (me) setName(me.profile.displayName); }, [me]);
  useEffect(() => {
    get<OwnLock[]>('/api/me/locks').then(setMine).catch(() => setMine([]));
    get<LockSummary[]>('/api/me/unlocked').then(setUnlocked).catch(() => setUnlocked([]));
    get<{ id: string; displayName: string }[]>('/api/me/blocks').then(setBlocks).catch(() => undefined);
  }, [me?.profile.id]);

  if (loading || !me) return <Spinner />;
  const p = me.profile;
  const pct = Math.min(100, ((p.xp - me.currentLevelXp) / Math.max(1, me.nextLevelXp - me.currentLevelXp)) * 100);

  const save = async (body: Record<string, unknown>) => {
    try { await patch('/api/me', body); await refresh(); toast('Saved', 'success'); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const deleteAccount = async () => {
    const typed = prompt('This permanently deletes your profile, your locks and their stories. Type DELETE to confirm.');
    if (typed !== 'DELETE') return;
    await del('/api/me');
    await signOut();
    navigate('/');
  };

  return (
    <main className="mx-auto max-w-2xl px-4 pb-nav pt-6">
      <Card className="flex items-center gap-4">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-night-700 text-4xl">{p.avatar}</span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-3xl">{p.displayName}</h1>
          <p className="text-xs text-ivory/60">{p.isGuest ? 'Guest explorer' : p.email} · Level {p.level}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-gradient-to-r from-brass-500 to-brass-300" style={{ width: `${pct}%` }} /></div>
          <p className="mt-1 text-[11px] text-ivory/50">{p.xp} XP · {me.nextLevelXp - p.xp} to level {p.level + 1}</p>
        </div>
      </Card>

      {p.isGuest && (
        <Card className="mt-3 flex items-center justify-between gap-3 border-brass-400/30">
          <p className="text-sm text-ivory/80">You’re exploring as a guest. Create an account to keep your locks and stories on every device.</p>
          <Link to="/auth?mode=register"><Button className="shrink-0">Save progress</Button></Link>
        </Card>
      )}

      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        {[['Locks', me.stats.locksCreated], ['Opened', me.stats.locksSolved], ['Inspected', me.stats.locksInspected], ['Badges', me.achievements.length]].map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-white/5 py-3"><p className="font-display text-2xl text-brass-300">{v}</p><p className="text-[11px] text-ivory/50">{k}</p></div>
        ))}
      </div>
      <div className="no-scrollbar mt-3 flex gap-1 overflow-x-auto">
        {me.achievements.map((a) => { const d = ACHIEVEMENTS.find((x) => x.id === a.id); return d ? <span key={a.id} title={d.title} className="rounded-full bg-brass-400/10 px-2 py-1 text-sm">{d.icon} {d.title}</span> : null; })}
      </div>

      <div className="mt-6 flex gap-2">
        <Chip active={tab === 'locks'} onClick={() => setTab('locks')}>My locks</Chip>
        <Chip active={tab === 'unlocked'} onClick={() => setTab('unlocked')}>Stories I opened</Chip>
        <Chip active={tab === 'settings'} onClick={() => setTab('settings')}>Settings</Chip>
      </div>

      <section className="mt-4">
        {tab === 'locks' && (!mine ? <Spinner /> : mine.length === 0
          ? <EmptyState title="No locks yet" body="Your first lock is waiting to be made." action={<Link to="/create"><Button>Create a lock</Button></Link>} />
          : (
            <ul className="space-y-2">
              {mine.map((l) => (
                <li key={l.id}>
                  <Link to={`/lock/${l.id}`} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-night-900/60 p-2 pr-4 hover:border-brass-400/40">
                    <LockArt lock={l} size={56} animate={false} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{l.title || l.engraving}</p>
                      <p className="text-xs text-ivory/50">{VISIBILITY_INFO[l.visibility].label}{l.status !== 'active' ? ` · ${l.status === 'hidden' ? 'Under review' : 'Expired'}` : ''} · {l.unlockCount} opened · {l.attemptCount} attempts</p>
                    </div>
                    <span className="text-ivory/40">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          ))}

        {tab === 'unlocked' && (!unlocked ? <Spinner /> : unlocked.length === 0
          ? <EmptyState title="No stories opened yet" body="Solve a lock on the bridge or open an invitation someone sent you." action={<Link to="/explore"><Button variant="ghost">Explore locks</Button></Link>} />
          : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {unlocked.map((l) => (
                <li key={l.id}><Link to={`/lock/${l.id}`} className="flex flex-col items-center rounded-2xl border border-white/10 bg-night-900/60 p-3 text-center"><LockArt lock={l} size={80} open animate={false} /><span className="mt-1 truncate text-sm">{l.title || l.engraving}</span></Link></li>
              ))}
            </ul>
          ))}

        {tab === 'settings' && (
          <div className="space-y-4">
            <Card className="space-y-4">
              <h2 className="font-display text-2xl">Profile</h2>
              <Field label="Display name">
                <div className="flex gap-2"><input className={inputCls} value={name} maxLength={32} onChange={(e) => setName(e.target.value)} /><Button variant="ghost" onClick={() => save({ displayName: name })}>Save</Button></div>
              </Field>
              <Field label="Avatar">
                <div className="flex flex-wrap gap-2">{AVATARS.map((a) => <button key={a} onClick={() => save({ avatar: a })} aria-pressed={p.avatar === a} className={`h-11 w-11 rounded-full text-2xl ${p.avatar === a ? 'bg-brass-400/30 ring-2 ring-brass-400' : 'bg-white/5'}`}>{a}</button>)}</div>
              </Field>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Show my name on my locks<span className="block text-xs text-ivory/50">Off = your locks are signed “an anonymous wanderer”.</span></span>
                <input type="checkbox" className="h-5 w-5 accent-brass-400" checked={p.showNameOnLocks} onChange={(e) => save({ showNameOnLocks: e.target.checked })} />
              </label>
            </Card>

            <Card className="space-y-4">
              <h2 className="font-display text-2xl">Experience</h2>
              <Field label="3D quality" hint="Lower quality saves battery on phones.">
                <div className="flex flex-wrap gap-2">{(['auto', 'low', 'medium', 'high'] as Quality[]).map((q) => <Chip key={q} active={settings.quality === q} onClick={() => { setSettings({ quality: q }); track('quality_changed', { q }); }}>{q}</Chip>)}</div>
              </Field>
              <Field label="Motion">
                <div className="flex flex-wrap gap-2">{(['system', 'reduced', 'full'] as const).map((m) => <Chip key={m} active={settings.motion === m} onClick={() => setSettings({ motion: m })}>{m}</Chip>)}</div>
              </Field>
              <Field label="Camera on the bridge">
                <div className="flex gap-2"><Chip active={settings.cameraMode === 'orbit'} onClick={() => setSettings({ cameraMode: 'orbit' })}>Orbit</Chip><Chip active={settings.cameraMode === 'free'} onClick={() => setSettings({ cameraMode: 'free' })}>Walk (WASD)</Chip></div>
              </Field>
              <label className="flex items-center justify-between text-sm">Sound effects<input type="checkbox" className="h-5 w-5 accent-brass-400" checked={settings.sound} onChange={(e) => setSettings({ sound: e.target.checked })} /></label>
            </Card>

            {blocks.length > 0 && (
              <Card>
                <h2 className="font-display text-2xl">Blocked creators</h2>
                <ul className="mt-2 divide-y divide-white/5 text-sm">
                  {blocks.map((b) => <li key={b.id} className="flex justify-between py-2">{b.displayName}<button className="text-brass-300" onClick={async () => { await del(`/api/me/blocks/${b.id}`); setBlocks(blocks.filter((x) => x.id !== b.id)); }}>Unblock</button></li>)}
                </ul>
              </Card>
            )}

            <Card className="space-y-3">
              <h2 className="font-display text-2xl">Account</h2>
              <div className="flex flex-wrap gap-2">
                {p.isGuest ? <Link to="/auth"><Button variant="ghost">Sign in / Register</Button></Link> : <Button variant="ghost" onClick={signOut}>Sign out</Button>}
                <Link to="/community"><Button variant="quiet">Community guidelines</Button></Link>
                {p.isAdmin && <Link to="/admin"><Button variant="quiet">Moderation</Button></Link>}
              </div>
              <Button variant="danger" onClick={deleteAccount}>Delete my account and data</Button>
            </Card>
          </div>
        )}
      </section>
    </main>
  );
}
