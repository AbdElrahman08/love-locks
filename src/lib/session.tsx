import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { MeResponse } from '../../shared/types.ts';
import { ACHIEVEMENTS } from '../../shared/progression.ts';
import { get, getToken, setToken } from './api.ts';

interface Toast { id: number; text: string; tone: 'info' | 'success' | 'error' }

interface SessionCtx {
  me: MeResponse | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signInWith: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
  toast: (text: string, tone?: Toast['tone']) => void;
  celebrate: (xp?: number, achievements?: string[]) => void;
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const refresh = useCallback(async () => {
    try {
      setMe(await get<MeResponse>('/api/me'));
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const celebrate = useCallback((xp?: number, achievements?: string[]) => {
    if (xp) toast(`+${xp} XP`, 'success');
    for (const id of achievements ?? []) {
      const a = ACHIEVEMENTS.find((x) => x.id === id);
      if (a) toast(`${a.icon} Achievement unlocked: ${a.title}`, 'success');
    }
    if (xp || achievements?.length) void refresh();
  }, [toast, refresh]);

  const signInWith = useCallback(async (token: string) => { setToken(token); await refresh(); }, [refresh]);
  const signOut = useCallback(async () => {
    try { await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${getToken() ?? ''}` } }); } catch { /* ignore */ }
    setToken(null);
    await refresh();
  }, [refresh]);

  return (
    <Ctx.Provider value={{ me, loading, refresh, signInWith, signOut, toast, celebrate }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`pointer-events-auto rounded-full px-4 py-2 text-sm shadow-lg backdrop-blur animate-toast ${
            t.tone === 'success' ? 'bg-brass-400/90 text-night-950' : t.tone === 'error' ? 'bg-rose-500/90 text-white' : 'bg-night-700/90 text-ivory'}`}>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useSession() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSession outside provider');
  return c;
}
