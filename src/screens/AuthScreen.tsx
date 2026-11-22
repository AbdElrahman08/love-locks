import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { Profile } from '../../shared/types.ts';
import { Button, Card, Field, inputCls } from '../components/ui.tsx';
import { ApiRequestError, post } from '../lib/api.ts';
import { track } from '../lib/analytics.ts';
import { useSession } from '../lib/session.tsx';

export function AuthScreen() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState<'register' | 'login'>(params.get('mode') === 'register' ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { me, signInWith, toast } = useSession();
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErrors({}); setMsg(null);
    if (mode === 'register') track('register_start');
    try {
      const r = await post<{ token: string; profile: Profile; upgradedGuest?: boolean }>(`/api/auth/${mode}`, mode === 'register' ? { email, password, displayName } : { email, password });
      await signInWith(r.token);
      if (mode === 'register') { track('register_complete'); if (r.upgradedGuest) track('guest_converted'); }
      toast(mode === 'register' ? 'Welcome to the bridge!' : `Welcome back, ${r.profile.displayName}`, 'success');
      navigate('/profile');
    } catch (err) {
      const e2 = err as ApiRequestError;
      setErrors(e2.details ?? {});
      setMsg(e2.message);
    } finally { setBusy(false); }
  };

  return (
    <main className="mx-auto max-w-md px-4 pb-nav pt-10">
      <h1 className="text-center font-display text-4xl">{mode === 'register' ? 'Keep your memories' : 'Welcome back'}</h1>
      <p className="mt-2 text-center text-sm text-ivory/60">
        {mode === 'register'
          ? me?.profile.isGuest ? 'Your guest locks, XP and opened stories will move into your new account.' : 'Create a free account.'
          : 'Sign in to find your locks on this device.'}
      </p>
      <Card className="mt-6">
        <form onSubmit={submit} className="space-y-4" noValidate>
          {mode === 'register' && (
            <Field label="Display name" error={errors.displayName}><input className={inputCls} value={displayName} maxLength={32} onChange={(e) => setDisplayName(e.target.value)} autoComplete="nickname" /></Field>
          )}
          <Field label="Email" error={errors.email}><input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
          <Field label="Password" error={errors.password} hint={mode === 'register' ? 'At least 8 characters.' : undefined}>
            <input type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
          </Field>
          {msg && <p className="text-sm text-rose-300" role="alert">{msg}</p>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? 'One moment…' : mode === 'register' ? 'Create account' : 'Sign in'}</Button>
          {mode === 'register' && (
            <p className="text-center text-xs text-ivory/50">
              By creating an account you agree to the <Link to="/terms" className="underline">terms</Link> and <Link to="/privacy" className="underline">privacy policy</Link>.
            </p>
          )}
        </form>
        {mode === 'login' && me?.profile.isGuest && me.stats.locksCreated > 0 && (
          <p className="mt-3 text-xs text-ivory/50">Note: signing in to an existing account switches away from this guest session. To keep guest locks, create a new account instead.</p>
        )}
        <p className="mt-4 text-center text-sm text-ivory/60">
          {mode === 'register' ? 'Already have an account?' : 'New here?'}{' '}
          <button className="text-brass-300 underline" onClick={() => setMode(mode === 'register' ? 'login' : 'register')}>{mode === 'register' ? 'Sign in' : 'Create an account'}</button>
        </p>
        <p className="mt-3 text-center text-[11px] text-ivory/40">Google / Apple sign-in arrives with the Supabase backend.</p>
      </Card>
    </main>
  );
}
