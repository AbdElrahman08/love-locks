import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  CATEGORIES, DECORATIONS, EFFECTS, ENGRAVING_STYLES, LOCK_COLORS, LOCK_SHAPES, MATERIALS, SHAPE_LABELS,
  VISIBILITIES, VISIBILITY_INFO, BRIDGE, type LockShape, type Visibility,
} from '../../shared/catalog.ts';
import { LIMITS, validateCreateLock } from '../../shared/validation.ts';
import type { LockAppearance, LockDetail, LockSummary, Story } from '../../shared/types.ts';
import { LockPreviewCanvas } from '../components/Canvas3D.tsx';
import { LockArt } from '../components/LockArt.tsx';
import { SharePanel } from '../components/SharePanel.tsx';
import { Button, Card, Chip, Field, inputCls, Spinner } from '../components/ui.tsx';
import { ApiRequestError, get, patch, post } from '../lib/api.ts';
import { track } from '../lib/analytics.ts';
import { useSession } from '../lib/session.tsx';

const STEPS = ['Design', 'Engrave', 'Story', 'Puzzle', 'Privacy', 'Review'] as const;
const DRAFT_KEY = 'll.workshopDraft';

interface Draft extends LockAppearance {
  title: string;
  category: string;
  story: string;
  signature: string;
  puzzleType: 'pin' | 'riddle';
  pin: string;
  question: string;
  answers: string[];
  hints: string[];
  maxAttempts: number;
  visibility: Visibility;
  availableAt: string;
  expiresAt: string;
  preferredSpan: number | null;
  keepPuzzle: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);
const EMPTY: Draft = {
  shape: 'heart', material: 'gold', color: '#e8c27a', engraving: '', engravingStyle: 'serif', decoration: 'hearts', effect: 'none',
  lockDate: today(), title: '', category: 'love', story: '', signature: '', puzzleType: 'pin', pin: '', question: '', answers: [''],
  hints: [], maxAttempts: 10, visibility: 'invite_only', availableAt: '', expiresAt: '', preferredSpan: null, keepPuzzle: false,
};

function loadDraft(): Draft {
  try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}'), keepPuzzle: false }; } catch { return EMPTY; }
}

export default function WorkshopScreen() {
  const [params] = useSearchParams();
  const editId = params.get('edit');
  const [d, setD] = useState<Draft>(() => (editId ? EMPTY : loadDraft()));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(!!editId);
  const [done, setDone] = useState<{ lock: LockSummary; invitation: { path: string } | null } | null>(null);
  const [no3d, setNo3d] = useState(false);
  const { me, celebrate, toast } = useSession();
  const navigate = useNavigate();
  const level = me?.profile.level ?? 1;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const tracked = useRef(false);

  useEffect(() => { if (!tracked.current) { track('workshop_open', { edit: !!editId }); tracked.current = true; } }, [editId]);
  // Drafts survive a reload on this device, but puzzle answers are never written to storage.
  useEffect(() => { if (!editId) try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, pin: '', answers: [''] })); } catch { /* ignore */ } }, [d, editId]);

  useEffect(() => {
    if (!editId) return;
    Promise.all([get<LockDetail>(`/api/locks/${editId}`), get<Story>(`/api/locks/${editId}/story`)])
      .then(([l, s]) => {
        setD({
          ...EMPTY, shape: l.shape, material: l.material, color: l.color, engraving: l.engraving, engravingStyle: l.engravingStyle,
          decoration: l.decoration, effect: l.effect, lockDate: l.lockDate, title: l.title, category: l.category, story: s.body,
          signature: s.signature, visibility: l.visibility, availableAt: l.availableAt?.slice(0, 10) ?? '', puzzleType: l.puzzle.type,
          question: l.puzzle.question ?? '', keepPuzzle: true,
        });
      })
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setLoadingEdit(false));
  }, [editId, toast]);

  const appearance = useMemo<LockAppearance>(() => ({
    shape: d.shape, material: d.material, color: d.color, engraving: d.engraving || 'Your words', engravingStyle: d.engravingStyle,
    decoration: d.decoration, effect: d.effect, lockDate: d.lockDate,
  }), [d.shape, d.material, d.color, d.engraving, d.engravingStyle, d.decoration, d.effect, d.lockDate]);

  const payload = () => ({
    shape: d.shape, material: d.material, color: d.color, engraving: d.engraving, engravingStyle: d.engravingStyle,
    decoration: d.decoration, effect: d.effect, lockDate: d.lockDate, title: d.title, category: d.category, story: d.story,
    signature: d.signature, visibility: d.visibility,
    availableAt: d.visibility === 'scheduled' && d.availableAt ? new Date(d.availableAt + 'T09:00:00').toISOString() : null,
    expiresAt: d.expiresAt ? new Date(d.expiresAt + 'T23:59:00').toISOString() : null,
    preferredSpan: d.preferredSpan,
    puzzle: d.keepPuzzle ? undefined : d.puzzleType === 'pin'
      ? { type: 'pin', pin: d.pin, hints: d.hints.filter(Boolean), maxAttempts: d.maxAttempts }
      : { type: 'riddle', question: d.question, answers: d.answers.filter((a) => a.trim()), hints: d.hints.filter(Boolean), maxAttempts: d.maxAttempts },
  });

  // Fields validated on each step, for immediate feedback (the server re-validates everything).
  const STEP_FIELDS: string[][] = [['shape', 'material', 'color'], ['engraving'], ['story', 'title'], ['puzzle.pin', 'puzzle.question', 'puzzle.answers', 'puzzle.type'], ['visibility', 'availableAt', 'expiresAt'], []];
  const validateStep = (s: number) => {
    const p = payload();
    const r = validateCreateLock({ ...p, puzzle: p.puzzle ?? { type: 'pin', pin: '0000' } });
    const errs = r.ok ? {} : Object.fromEntries(Object.entries(r.errors).filter(([k]) => s === 5 || STEP_FIELDS[s].includes(k)));
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const next = () => {
    if (!validateStep(step)) return;
    track('workshop_step', { step: STEPS[step] });
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const publish = async () => {
    if (!validateStep(5)) { toast('Some details still need attention.', 'error'); return; }
    setBusy(true);
    try {
      if (editId) {
        const body: Record<string, unknown> = payload();
        if (!body.puzzle) delete body.puzzle;
        await patch(`/api/locks/${editId}`, body);
        toast('Lock updated', 'success');
        navigate(`/lock/${editId}`);
        return;
      }
      const r = await post<{ lock: LockSummary; invitation: { path: string } | null; xpAwarded: number; newAchievements: string[] }>('/api/locks', payload());
      track('lock_published', { visibility: d.visibility, puzzle: d.puzzleType, shape: d.shape });
      celebrate(r.xpAwarded, r.newAchievements);
      localStorage.removeItem(DRAFT_KEY);
      setDone({ lock: r.lock, invitation: r.invitation });
    } catch (e) {
      const err = e as ApiRequestError;
      if (err.details) setErrors(err.details);
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loadingEdit) return <Spinner label="Opening your lock" />;

  if (done) {
    return (
      <main className="mx-auto max-w-lg px-4 pb-nav pt-8 text-center">
        <LockArt lock={done.lock} size={170} className="mx-auto" />
        <h1 className="mt-4 font-display text-4xl">Your lock is on the bridge</h1>
        <p className="mt-2 text-sm text-ivory/60">Hanging on span {Math.floor(done.lock.slot / (BRIDGE.sides * BRIDGE.rows * BRIDGE.colsPerSpan)) + 1}. Its story stays sealed until someone solves your puzzle.</p>
        {done.invitation ? (
          <Card className="mt-6 text-left">
            <h2 className="mb-3 font-display text-2xl text-brass-300">Send the key</h2>
            <SharePanel path={done.invitation.path} title={done.lock.title || 'A lock for you'} />
            {done.lock.visibility === 'invite_only' && <p className="mt-3 text-xs text-ivory/50">This link works for one person. Create more links from the lock’s page.</p>}
          </Card>
        ) : <p className="mt-6 text-sm text-ivory/60">This lock is private — only you can see it.</p>}
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="ghost" onClick={() => navigate(`/bridge?lock=${done.lock.id}`)}>See it on the bridge</Button>
          <Button variant="quiet" onClick={() => { setDone(null); setD({ ...EMPTY, lockDate: today() }); setStep(0); }}>Make another</Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl pb-nav lg:grid lg:grid-cols-2 lg:gap-6 lg:px-4 lg:pt-6">
      <div className="sticky top-0 z-10 h-[38vh] bg-gradient-to-b from-night-800 to-night-950 lg:h-[70vh] lg:rounded-3xl">
        {no3d
          ? <div className="flex h-full items-center justify-center"><LockArt lock={appearance} size={200} /></div>
          : <LockPreviewCanvas appearance={appearance} onUnsupported={() => setNo3d(true)} />}
        <p className="absolute bottom-2 left-0 right-0 text-center text-[11px] text-ivory/40">{no3d ? '' : 'Drag to turn your lock'}</p>
      </div>

      <div className="px-4 pt-4 lg:px-0">
        <ol className="no-scrollbar mb-4 flex gap-1.5 overflow-x-auto" aria-label="Workshop steps">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button onClick={() => (i < step || validateStep(step)) && setStep(i)} aria-current={i === step ? 'step' : undefined}
                className={`rounded-full px-3 py-1.5 text-xs ${i === step ? 'bg-brass-400 text-night-950' : i < step ? 'bg-brass-400/20 text-brass-300' : 'bg-white/5 text-ivory/50'}`}>
                {i + 1}. {s}
              </button>
            </li>
          ))}
        </ol>

        <Card className="space-y-5">
          {step === 0 && (
            <>
              <h2 className="font-display text-3xl">{editId ? 'Restyle your lock' : 'Shape your lock'}</h2>
              <Field label="Shape">
                <div className="grid grid-cols-4 gap-2">
                  {LOCK_SHAPES.map((s) => (
                    <button key={s} onClick={() => set('shape', s as LockShape)} aria-pressed={d.shape === s}
                      className={`flex flex-col items-center rounded-2xl border p-2 text-[11px] ${d.shape === s ? 'border-brass-400 bg-brass-400/10' : 'border-white/10'}`}>
                      <LockArt lock={{ ...appearance, shape: s as LockShape, engraving: '' }} size={48} showText={false} animate={false} />
                      {SHAPE_LABELS[s as LockShape]}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Material" error={errors.material}>
                <div className="flex flex-wrap gap-2">
                  {MATERIALS.map((m) => {
                    const locked = m.requiredLevel > level;
                    return (
                      <button key={m.id} disabled={locked} onClick={() => { set('material', m.id); set('color', m.baseColor); }} aria-pressed={d.material === m.id}
                        className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm disabled:opacity-40 ${d.material === m.id ? 'border-brass-400 bg-brass-400/10' : 'border-white/10'}`}>
                        <span className="h-4 w-4 rounded-full" style={{ background: m.baseColor }} />
                        {m.label}{m.seasonal ? ' ❄' : ''}{locked ? ` · Lv ${m.requiredLevel}` : ''}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <Field label="Color">
                <div className="flex flex-wrap gap-2">
                  {LOCK_COLORS.map((c) => (
                    <button key={c} onClick={() => set('color', c)} aria-label={`Color ${c}`} aria-pressed={d.color === c}
                      className={`h-9 w-9 rounded-full border-2 ${d.color === c ? 'border-ivory' : 'border-transparent'}`} style={{ background: c }} />
                  ))}
                  <input type="color" value={d.color} onChange={(e) => set('color', e.target.value)} aria-label="Custom color" className="h-9 w-9 cursor-pointer rounded-full bg-transparent" />
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Decoration">
                  <select className={inputCls} value={d.decoration} onChange={(e) => set('decoration', e.target.value)}>
                    {DECORATIONS.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </Field>
                <Field label="Effect">
                  <select className={inputCls} value={d.effect} onChange={(e) => set('effect', e.target.value)}>
                    {EFFECTS.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </Field>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h2 className="font-display text-3xl">Engrave it</h2>
              <Field label={`Engraving (${d.engraving.length}/${LIMITS.engraving})`} error={errors.engraving} hint="Initials, a name, a word that matters.">
                <input className={inputCls} value={d.engraving} maxLength={LIMITS.engraving} onChange={(e) => set('engraving', e.target.value)} placeholder="A + M" autoFocus />
              </Field>
              <Field label="Engraving style">
                <div className="flex flex-wrap gap-2">
                  {ENGRAVING_STYLES.map((s) => (
                    <Chip key={s.id} active={d.engravingStyle === s.id} onClick={() => s.requiredLevel <= level && set('engravingStyle', s.id)}>
                      <span style={{ font: s.font.replace(/\d+px/, '15px') }}>{s.label}</span>{s.requiredLevel > level ? ` · Lv ${s.requiredLevel}` : ''}
                    </Chip>
                  ))}
                </div>
              </Field>
              <Field label="Date on the lock">
                <input type="date" className={inputCls} value={d.lockDate} onChange={(e) => set('lockDate', e.target.value)} />
              </Field>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="font-display text-3xl">The story inside</h2>
              <p className="text-sm text-ivory/60">Only someone who solves your puzzle will ever read this. It is never shown on the bridge.</p>
              <Field label="Title (optional, public)" error={errors.title}>
                <input className={inputCls} value={d.title} maxLength={LIMITS.title} onChange={(e) => set('title', e.target.value)} placeholder="The night we missed the last metro" />
              </Field>
              <Field label="Category">
                <div className="flex flex-wrap gap-2">{CATEGORIES.map((c) => <Chip key={c} active={d.category === c} onClick={() => set('category', c)}>{c}</Chip>)}</div>
              </Field>
              <Field label={`Your story (${d.story.length}/${LIMITS.story})`} error={errors.story}>
                <textarea className={`${inputCls} min-h-[180px] font-display text-lg leading-relaxed`} maxLength={LIMITS.story} value={d.story}
                  onChange={(e) => set('story', e.target.value)} placeholder="Write the memory, the promise, the thank-you…" />
              </Field>
              <Field label="Signed as (optional)">
                <input className={inputCls} value={d.signature} maxLength={LIMITS.signature} onChange={(e) => set('signature', e.target.value)} placeholder="Forever yours, M." />
              </Field>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="font-display text-3xl">Choose the key</h2>
              {editId && (
                <label className="flex items-center gap-2 text-sm text-ivory/80">
                  <input type="checkbox" checked={d.keepPuzzle} onChange={(e) => set('keepPuzzle', e.target.checked)} /> Keep the current puzzle
                </label>
              )}
              {!d.keepPuzzle && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {(['pin', 'riddle'] as const).map((t) => (
                      <button key={t} onClick={() => set('puzzleType', t)} aria-pressed={d.puzzleType === t}
                        className={`rounded-2xl border p-4 text-left ${d.puzzleType === t ? 'border-brass-400 bg-brass-400/10' : 'border-white/10'}`}>
                        <span className="text-2xl">{t === 'pin' ? '🔢' : '🧩'}</span>
                        <span className="mt-1 block font-semibold">{t === 'pin' ? 'Secret PIN' : 'Riddle'}</span>
                        <span className="text-xs text-ivory/60">{t === 'pin' ? 'A date or number only they would know.' : 'A question only they can answer.'}</span>
                      </button>
                    ))}
                  </div>
                  {d.puzzleType === 'pin' ? (
                    <Field label={`PIN (${LIMITS.pinMin}–${LIMITS.pinMax} digits)`} error={errors['puzzle.pin']} hint="e.g. the day you met: 1402 for 14 February.">
                      <input className={`${inputCls} tracking-[0.5em]`} inputMode="numeric" autoComplete="off" value={d.pin} maxLength={LIMITS.pinMax}
                        onChange={(e) => set('pin', e.target.value.replace(/\D/g, ''))} placeholder="••••" />
                    </Field>
                  ) : (
                    <>
                      <Field label="Question" error={errors['puzzle.question']}>
                        <input className={inputCls} value={d.question} maxLength={LIMITS.riddleQuestion} onChange={(e) => set('question', e.target.value)} placeholder="What did I order at our first dinner?" />
                      </Field>
                      <Field label="Accepted answers" error={errors['puzzle.answers']} hint="Not case-sensitive. Accents and punctuation are ignored.">
                        <div className="space-y-2">
                          {d.answers.map((a, i) => (
                            <div key={i} className="flex gap-2">
                              <input className={inputCls} value={a} maxLength={LIMITS.riddleAnswer} autoComplete="off"
                                onChange={(e) => set('answers', d.answers.map((x, j) => (j === i ? e.target.value : x)))} placeholder={i === 0 ? 'crème brûlée' : 'another accepted spelling'} />
                              {d.answers.length > 1 && <Button variant="quiet" onClick={() => set('answers', d.answers.filter((_, j) => j !== i))} aria-label="Remove answer">✕</Button>}
                            </div>
                          ))}
                          {d.answers.length < LIMITS.riddleAnswers && <Button variant="quiet" onClick={() => set('answers', [...d.answers, ''])}>+ Add alternative answer</Button>}
                        </div>
                      </Field>
                    </>
                  )}
                  <Field label="Hints (optional)">
                    <div className="space-y-2">
                      {d.hints.map((h, i) => (
                        <div key={i} className="flex gap-2">
                          <input className={inputCls} value={h} maxLength={LIMITS.hint} onChange={(e) => set('hints', d.hints.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Hint ${i + 1}`} />
                          <Button variant="quiet" onClick={() => set('hints', d.hints.filter((_, j) => j !== i))} aria-label="Remove hint">✕</Button>
                        </div>
                      ))}
                      {d.hints.length < LIMITS.hints && <Button variant="quiet" onClick={() => set('hints', [...d.hints, ''])}>+ Add hint</Button>}
                    </div>
                  </Field>
                  <Field label={`Attempts per person per day: ${d.maxAttempts}`}>
                    <input type="range" min={3} max={50} value={d.maxAttempts} onChange={(e) => set('maxAttempts', Number(e.target.value))} className="w-full accent-brass-400" />
                  </Field>
                </>
              )}
            </>
          )}

          {step === 4 && (
            <>
              <h2 className="font-display text-3xl">Who can open it?</h2>
              <div className="space-y-2">
                {VISIBILITIES.map((v) => (
                  <button key={v} onClick={() => set('visibility', v)} aria-pressed={d.visibility === v}
                    className={`block w-full rounded-2xl border p-3 text-left ${d.visibility === v ? 'border-brass-400 bg-brass-400/10' : 'border-white/10'}`}>
                    <span className="font-semibold">{VISIBILITY_INFO[v].label}</span>
                    <span className="block text-xs text-ivory/60">{VISIBILITY_INFO[v].help}</span>
                  </button>
                ))}
              </div>
              {d.visibility === 'scheduled' && (
                <Field label="Opens on" error={errors.availableAt}>
                  <input type="date" className={inputCls} min={today()} value={d.availableAt} onChange={(e) => set('availableAt', e.target.value)} />
                </Field>
              )}
              <Field label="Remove from the bridge on (optional)" error={errors.expiresAt}>
                <input type="date" className={inputCls} min={today()} value={d.expiresAt} onChange={(e) => set('expiresAt', e.target.value)} />
              </Field>
              {!editId && (
                <Field label="Where on the bridge?">
                  <div className="flex flex-wrap gap-2">
                    <Chip active={d.preferredSpan === null} onClick={() => set('preferredSpan', null)}>Anywhere</Chip>
                    {Array.from({ length: BRIDGE.spans }).map((_, i) => <Chip key={i} active={d.preferredSpan === i} onClick={() => set('preferredSpan', i)}>Span {i + 1}</Chip>)}
                  </div>
                </Field>
              )}
            </>
          )}

          {step === 5 && (
            <>
              <h2 className="font-display text-3xl">Ready to attach?</h2>
              <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-ivory/50">Lock</dt><dd>{SHAPE_LABELS[d.shape]} · {MATERIALS.find((m) => m.id === d.material)?.label} · “{d.engraving}”</dd>
                <dt className="text-ivory/50">Story</dt><dd>{d.story.length} characters{d.title ? ` · “${d.title}”` : ''}</dd>
                <dt className="text-ivory/50">Puzzle</dt><dd>{d.keepPuzzle ? 'Unchanged' : d.puzzleType === 'pin' ? `${d.pin.length}-digit PIN` : `Riddle · ${d.answers.filter(Boolean).length} answer(s)`}{d.hints.length ? ` · ${d.hints.length} hint(s)` : ''}</dd>
                <dt className="text-ivory/50">Visibility</dt><dd>{VISIBILITY_INFO[d.visibility].label}{d.visibility === 'scheduled' ? ` · opens ${d.availableAt}` : ''}</dd>
              </dl>
              {Object.keys(errors).length > 0 && (
                <ul className="rounded-2xl bg-rose-500/10 p-3 text-sm text-rose-300">{Object.values(errors).map((e) => <li key={e}>{e}</li>)}</ul>
              )}
              <p className="text-xs text-ivory/50">By publishing you agree to the <Link to="/community" className="underline">community guidelines</Link>. Never include someone else’s private information.</p>
            </>
          )}

          <div className="flex justify-between pt-2">
            <Button variant="quiet" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Back</Button>
            {step < STEPS.length - 1
              ? <Button onClick={next}>Continue</Button>
              : <Button onClick={publish} disabled={busy}>{busy ? 'Attaching…' : editId ? 'Save changes' : '🔒 Attach to the bridge'}</Button>}
          </div>
        </Card>
      </div>
    </main>
  );
}
