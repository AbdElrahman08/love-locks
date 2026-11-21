import { useEffect, useRef, useState } from 'react';
import type { LockDetail, UnlockResult } from '../../shared/types.ts';
import { ApiRequestError, post } from '../lib/api.ts';
import { track } from '../lib/analytics.ts';
import { Button, inputCls } from './ui.tsx';

export function PuzzleSolver({ detail, token, onSolved }: { detail: LockDetail; token?: string; onSolved: (r: UnlockResult) => void }) {
  const p = detail.puzzle;
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [remaining, setRemaining] = useState(detail.attemptsRemaining);
  const [hints, setHints] = useState<string[]>([]);
  const [shake, setShake] = useState(false);
  const [blockedFor, setBlockedFor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (blockedFor <= 0) return;
    const t = setInterval(() => setBlockedFor((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [blockedFor]);

  if (!detail.canAttempt) {
    return <p className="rounded-2xl bg-white/5 p-4 text-center text-sm text-ivory/70">{detail.attemptBlockedReason}</p>;
  }

  const submit = async () => {
    if (busy || blockedFor > 0) return;
    setBusy(true);
    setFeedback(null);
    track('puzzle_attempt', { type: p.type, via: token ? 'invite' : 'bridge' });
    try {
      const r = await post<UnlockResult>('/api/unlock', { ...(token ? { token } : { lockId: detail.id }), answer, hintsUsed: hints.length });
      if (r.success) {
        track('puzzle_solved', { type: p.type, hints: hints.length });
        onSolved(r);
        return;
      }
      setRemaining(r.attemptsRemaining ?? null);
      setFeedback({ tone: 'error', text: r.message ?? 'Not quite.' });
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setAnswer('');
      inputRef.current?.focus();
    } catch (e) {
      const err = e as ApiRequestError;
      if (err.retryAfterSeconds) setBlockedFor(err.retryAfterSeconds);
      setFeedback({ tone: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const revealHint = async () => {
    try {
      const r = await post<{ hint: string }>('/api/hint', { ...(token ? { token } : { lockId: detail.id }), index: hints.length });
      setHints((h) => [...h, r.hint]);
    } catch (e) {
      setFeedback({ tone: 'error', text: (e as Error).message });
    }
  };

  const fmt = (s: number) => (s >= 3600 ? `${Math.ceil(s / 3600)}h` : s >= 60 ? `${Math.ceil(s / 60)} min` : `${s}s`);

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      {p.type === 'pin' ? (
        <PinPad length={p.pinLength ?? 4} value={answer} onChange={setAnswer} shake={shake} onComplete={() => undefined} />
      ) : (
        <div className="space-y-3">
          <p className="text-center font-display text-2xl italic leading-snug text-ivory">“{p.question}”</p>
          <input ref={inputRef} className={`${inputCls} text-center ${shake ? 'animate-shake' : ''}`} value={answer} maxLength={200}
            onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer" aria-label="Your answer" autoComplete="off" autoCapitalize="off" />
        </div>
      )}

      {hints.length > 0 && (
        <ul className="space-y-1.5">
          {hints.map((h, i) => <li key={i} className="rounded-xl bg-brass-400/10 px-3 py-2 text-sm text-brass-300">💡 {h}</li>)}
        </ul>
      )}

      {feedback && <p role="alert" className={`text-center text-sm ${feedback.tone === 'error' ? 'text-rose-300' : 'text-ivory/70'}`}>{feedback.text}</p>}
      {blockedFor > 0 && <p className="text-center text-xs text-ivory/50">You can try again in {fmt(blockedFor)}.</p>}

      <Button type="submit" className="w-full" disabled={busy || blockedFor > 0 || (p.type === 'pin' ? answer.length !== p.pinLength : !answer.trim())}>
        {busy ? 'Turning the key…' : 'Unlock'}
      </Button>
      <div className="flex items-center justify-between text-xs text-ivory/50">
        <span>{remaining !== null ? `${remaining} attempt${remaining === 1 ? '' : 's'} left today` : ''}</span>
        {p.hintCount > hints.length && (
          <button type="button" onClick={revealHint} className="text-brass-300 underline-offset-4 hover:underline">
            Need a hint? ({p.hintCount - hints.length} left)
          </button>
        )}
      </div>
    </form>
  );
}

function PinPad({ length, value, onChange, shake }: { length: number; value: string; onChange: (v: string) => void; shake: boolean; onComplete: () => void }) {
  const press = (d: string) => { if (value.length < length) onChange(value + d); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') onChange(value.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <div className="space-y-4">
      <div className={`flex justify-center gap-2 ${shake ? 'animate-shake' : ''}`} aria-label={`PIN, ${value.length} of ${length} digits entered`} role="status">
        {Array.from({ length }).map((_, i) => (
          <span key={i} className={`flex h-12 w-10 items-center justify-center rounded-xl border text-xl ${i < value.length ? 'border-brass-400 bg-brass-400/15 text-brass-300' : 'border-white/15 bg-night-950/60'}`}>
            {i < value.length ? '•' : ''}
          </span>
        ))}
      </div>
      <div className="mx-auto grid max-w-[260px] grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button type="button" key={d} onClick={() => press(d)} className="h-14 rounded-2xl bg-white/5 font-display text-2xl text-ivory transition active:scale-95 hover:bg-white/10">{d}</button>
        ))}
        <button type="button" onClick={() => onChange('')} className="h-14 rounded-2xl text-xs text-ivory/50 hover:bg-white/5">Clear</button>
        <button type="button" onClick={() => press('0')} className="h-14 rounded-2xl bg-white/5 font-display text-2xl text-ivory active:scale-95 hover:bg-white/10">0</button>
        <button type="button" onClick={() => onChange(value.slice(0, -1))} aria-label="Delete digit" className="h-14 rounded-2xl text-xl text-ivory/60 hover:bg-white/5">⌫</button>
      </div>
    </div>
  );
}
