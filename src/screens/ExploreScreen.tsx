import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CATEGORIES, REACTION_EMOJI, type Reaction } from '../../shared/catalog.ts';
import type { LockSummary } from '../../shared/types.ts';
import { LockArt } from '../components/LockArt.tsx';
import { Chip, EmptyState, ErrorState, PageHeader, Spinner, inputCls, Button } from '../components/ui.tsx';
import { get } from '../lib/api.ts';

const SORTS = [{ id: 'featured', label: 'Featured' }, { id: 'recent', label: 'Newest' }, { id: 'popular', label: 'Most opened' }];

export function ExploreScreen() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState('featured');
  const [locks, setLocks] = useState<LockSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const load = () => {
    setLocks(null); setError(null);
    const p = new URLSearchParams({ sort, limit: '48' });
    if (debounced) p.set('q', debounced);
    if (category) p.set('category', category);
    get<LockSummary[]>(`/api/locks?${p}`).then(setLocks).catch((e) => setError(e.message));
  };
  useEffect(load, [debounced, category, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="mx-auto max-w-4xl px-4 pb-nav pt-6">
      <PageHeader title="Explore" subtitle="Public locks from wanderers around the world" />
      <input type="search" className={inputCls} placeholder="Search titles and engravings…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search locks" />
      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
        {SORTS.map((s) => <Chip key={s.id} active={sort === s.id} onClick={() => setSort(s.id)}>{s.label}</Chip>)}
        <span className="mx-1 w-px shrink-0 bg-white/10" />
        <Chip active={!category} onClick={() => setCategory(null)}>All</Chip>
        {CATEGORIES.map((c) => <Chip key={c} active={category === c} onClick={() => setCategory(c)}>{c}</Chip>)}
      </div>

      <div className="mt-5">
        {error ? <ErrorState message={error} onRetry={load} />
          : !locks ? <Spinner label="Walking the bridge" />
          : locks.length === 0 ? <EmptyState title="No locks here yet" body={debounced || category ? 'Try another search or category.' : 'Be the first to leave a public lock.'} action={<Link to="/create"><Button>Create a lock</Button></Link>} />
          : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {locks.map((l) => (
                <li key={l.id}>
                  <Link to={`/lock/${l.id}`} className="group flex h-full flex-col items-center rounded-3xl border border-white/10 bg-night-900/60 p-3 text-center transition hover:border-brass-400/40">
                    <LockArt lock={l} size={110} animate={false} />
                    <span className="mt-2 line-clamp-2 font-display text-lg leading-tight text-ivory">{l.title || `“${l.engraving}”`}</span>
                    <span className="mt-1 text-[11px] text-ivory/50">{l.category}{l.isDemo ? ' · demo' : ''}{l.solvedByMe ? ' · opened ✓' : ''}</span>
                    <span className="mt-1 text-xs text-ivory/60">
                      🔓 {l.unlockCount}
                      {Object.entries(l.reactions).slice(0, 3).map(([k, v]) => <span key={k} className="ml-1.5">{REACTION_EMOJI[k as Reaction]}{v}</span>)}
                    </span>
                    {l.visibility === 'scheduled' && l.availableAt && new Date(l.availableAt) > new Date() && (
                      <span className="mt-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-ivory/60">Opens {new Date(l.availableAt).toLocaleDateString()}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
      </div>
    </main>
  );
}
