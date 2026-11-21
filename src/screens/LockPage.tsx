import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { REPORT_REASONS, VISIBILITY_INFO, REACTION_EMOJI, type Reaction } from '../../shared/catalog.ts';
import type { LockDetail, Story, UnlockResult } from '../../shared/types.ts';
import { LockArt } from '../components/LockArt.tsx';
import { PuzzleSolver } from '../components/PuzzleSolver.tsx';
import { SharePanel } from '../components/SharePanel.tsx';
import { StoryReveal } from '../components/StoryReveal.tsx';
import { Button, Card, ErrorState, Field, inputCls, Spinner } from '../components/ui.tsx';
import { ApiRequestError, del, get, post } from '../lib/api.ts';
import { track } from '../lib/analytics.ts';
import { useSession } from '../lib/session.tsx';

export function LockPage() {
  const { id = '' } = useParams();
  const [lock, setLock] = useState<LockDetail | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [story, setStory] = useState<Story | null>(null);
  const [reporting, setReporting] = useState(false);
  const { celebrate, toast } = useSession();
  const navigate = useNavigate();

  const load = useCallback(() => {
    setError(null);
    get<LockDetail>(`/api/locks/${id}`).then(setLock).catch((e: ApiRequestError) => setError({ status: e.status, message: e.message }));
  }, [id]);
  useEffect(load, [load]);

  const readStory = async () => {
    try { setStory(await get<Story>(`/api/locks/${id}/story`)); } catch (e) { toast((e as Error).message, 'error'); }
  };

  const onSolved = (r: UnlockResult) => {
    celebrate(r.xpAwarded, r.newAchievements);
    if (r.story) setStory(r.story);
    if (lock) setLock({ ...lock, solvedByMe: true });
  };

  if (error) {
    return (
      <main className="mx-auto max-w-lg px-4 pb-nav pt-10">
        <ErrorState message={error.status === 403 ? 'This lock can only be opened with its invitation link. Ask its creator to send it to you.' : error.message} onRetry={error.status >= 500 || error.status === 0 ? load : undefined} />
        <div className="mt-4 text-center"><Link to="/bridge" className="text-brass-300 underline">Back to the bridge</Link></div>
      </main>
    );
  }
  if (!lock) return <Spinner label="Finding the lock" />;
  if (story) return <main className="px-4 pb-nav pt-6"><StoryReveal lock={lock} story={story} /></main>;

  return (
    <main className="mx-auto max-w-lg px-4 pb-nav pt-6">
      <button onClick={() => navigate(-1)} className="mb-2 text-sm text-ivory/60 hover:text-ivory">‹ Back</button>
      <div className="text-center">
        <LockArt lock={lock} size={180} className="mx-auto drop-shadow-[0_10px_30px_rgba(0,0,0,.5)]" />
        <p className="mt-3 text-[11px] uppercase tracking-[0.25em] text-brass-300">{lock.category} · {VISIBILITY_INFO[lock.visibility].label}{lock.isDemo ? ' · Demo lock' : ''}</p>
        <h1 className="mt-1 font-display text-4xl">{lock.title || `“${lock.engraving}”`}</h1>
        <p className="mt-1 text-sm text-ivory/60">
          Left by {lock.creatorName ?? 'an anonymous wanderer'} on {new Date(lock.createdAt).toLocaleDateString()} · opened {lock.unlockCount}×
          {Object.entries(lock.reactions).map(([k, v]) => <span key={k} className="ml-1.5">{REACTION_EMOJI[k as Reaction]}{v}</span>)}
        </p>
      </div>

      <Card className="mt-6">
        {lock.isOwn || lock.solvedByMe
          ? <Button className="w-full" onClick={readStory}>📜 Read the story</Button>
          : <PuzzleSolver detail={lock} onSolved={onSolved} />}
      </Card>

      {lock.isOwn ? <OwnerTools lock={lock} /> : (
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="quiet" onClick={() => navigate(`/bridge?lock=${lock.id}`)}>View on bridge</Button>
          <Button variant="quiet" onClick={() => setReporting(true)}>Report or block</Button>
        </div>
      )}
      {reporting && <ReportDialog lockId={lock.id} onClose={() => setReporting(false)} onBlocked={() => navigate('/bridge')} />}
    </main>
  );
}

interface InvitationRow { id: string; label: string; maxUses: number | null; useCount: number; openCount: number; expiresAt: string | null; revoked: number; createdAt: string }

function OwnerTools({ lock }: { lock: LockDetail }) {
  const [invs, setInvs] = useState<InvitationRow[]>([]);
  const [fresh, setFresh] = useState<string | null>(null);
  const [maxUses, setMaxUses] = useState('1');
  const [days, setDays] = useState('30');
  const { toast } = useSession();
  const navigate = useNavigate();
  const load = useCallback(() => { get<InvitationRow[]>(`/api/locks/${lock.id}/invitations`).then(setInvs).catch(() => undefined); }, [lock.id]);
  useEffect(load, [load]);

  const create = async () => {
    try {
      const r = await post<{ path: string }>(`/api/locks/${lock.id}/invitations`, { maxUses: Number(maxUses) || null, expiresInDays: Number(days) || null });
      setFresh(r.path);
      load();
    } catch (e) { toast((e as Error).message, 'error'); }
  };
  const revoke = async (id: string) => { await del(`/api/invitations/${id}`); load(); };
  const remove = async () => {
    if (!confirm('Remove this lock from the bridge forever? Its story will be deleted and cannot be recovered.')) return;
    await del(`/api/locks/${lock.id}`);
    toast('Lock removed', 'info');
    navigate('/profile');
  };

  return (
    <div className="mt-6 space-y-4">
      {lock.visibility !== 'private' && (
        <Card>
          <h2 className="font-display text-2xl text-brass-300">Invitation links</h2>
          <p className="mt-1 text-xs text-ivory/50">For your safety links are shown only once, when created. Make a new one any time.</p>
          {fresh && <div className="mt-3"><SharePanel path={fresh} title={lock.title || 'A lock for you'} /></div>}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Field label="Uses"><select className={inputCls} value={maxUses} onChange={(e) => setMaxUses(e.target.value)}><option value="1">1 person</option><option value="5">5 people</option><option value="0">Unlimited</option></select></Field>
            <Field label="Expires"><select className={inputCls} value={days} onChange={(e) => setDays(e.target.value)}><option value="7">7 days</option><option value="30">30 days</option><option value="0">Never</option></select></Field>
          </div>
          <Button className="mt-3 w-full" variant="ghost" onClick={create}>Create a new invitation link</Button>
          {invs.length > 0 && (
            <ul className="mt-4 divide-y divide-white/5 text-sm">
              {invs.map((i) => (
                <li key={i.id} className="flex items-center justify-between py-2">
                  <span className={i.revoked ? 'text-ivory/30 line-through' : ''}>
                    {i.label || 'Invitation'} · opened {i.openCount}× · used {i.useCount}{i.maxUses ? `/${i.maxUses}` : ''}
                    {i.expiresAt ? ` · until ${new Date(i.expiresAt).toLocaleDateString()}` : ''}
                  </span>
                  {!i.revoked && <button onClick={() => revoke(i.id)} className="text-xs text-rose-300 hover:underline">Revoke</button>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      <div className="flex justify-center gap-2">
        <Button variant="ghost" onClick={() => navigate(`/create?edit=${lock.id}`)}>Edit lock</Button>
        <Button variant="danger" onClick={remove}>Delete</Button>
      </div>
    </div>
  );
}

export function ReportDialog({ lockId, onClose, onBlocked }: { lockId: string; onClose: () => void; onBlocked: () => void }) {
  const [reason, setReason] = useState<string>('spam');
  const [details, setDetails] = useState('');
  const { toast } = useSession();
  const submit = async () => {
    try {
      await post(`/api/locks/${lockId}/report`, { reason, details });
      track('report_submitted', { reason });
      toast('Thank you. Our moderators will review this lock.', 'success');
      onClose();
    } catch (e) { toast((e as Error).message, 'error'); }
  };
  const block = async () => {
    if (!confirm('Block this creator? You will no longer see any of their locks.')) return;
    try { await post(`/api/locks/${lockId}/block-owner`); toast('Creator blocked', 'info'); onClose(); onBlocked(); }
    catch (e) { toast((e as Error).message, 'error'); }
  };
  return (
    <div role="dialog" aria-modal="true" aria-label="Report lock" className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={onClose}>
      <Card className="w-full max-w-md space-y-4" >
        <div onClick={(e) => e.stopPropagation()} className="space-y-4">
          <h2 className="font-display text-2xl">Report this lock</h2>
          <Field label="Reason">
            <select className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)}>
              {REPORT_REASONS.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
            </select>
          </Field>
          <Field label="Details (optional)"><textarea className={inputCls} maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} /></Field>
          <div className="flex justify-between gap-2">
            <Button variant="danger" onClick={block}>Block creator</Button>
            <div className="flex gap-2"><Button variant="quiet" onClick={onClose}>Cancel</Button><Button onClick={submit}>Send report</Button></div>
          </div>
        </div>
      </Card>
    </div>
  );
}
