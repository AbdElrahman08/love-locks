import { describe, it, expect } from 'vitest';
import { normalizeAnswer, validatePuzzle, validateCreateLock } from '../shared/validation.ts';
import { challengesForDate, levelFromXp, xpForLevel } from '../shared/progression.ts';

describe('normalizeAnswer', () => {
  it('ignores case, accents, punctuation and extra spaces by default', () => {
    expect(normalizeAnswer('  Crème   Brûlée!! ')).toBe('creme brulee');
  });
  it('can keep accents and punctuation when configured', () => {
    expect(normalizeAnswer('Crème!', { ignoreAccents: false, ignorePunctuation: false })).toBe('crème!');
  });
});

describe('validatePuzzle', () => {
  it('requires digits-only PINs within length bounds', () => {
    expect(validatePuzzle({ type: 'pin', pin: '12a4' }).ok).toBe(false);
    expect(validatePuzzle({ type: 'pin', pin: '123' }).ok).toBe(false);
    expect(validatePuzzle({ type: 'pin', pin: '123456789' }).ok).toBe(false);
    expect(validatePuzzle({ type: 'pin', pin: '1234' }).ok).toBe(true);
  });
  it('requires a riddle question and at least one answer, clamps attempts', () => {
    expect(validatePuzzle({ type: 'riddle', question: 'Why?', answers: ['  '] }).ok).toBe(false);
    const r = validatePuzzle({ type: 'riddle', question: 'Why?', answers: ['Because'], maxAttempts: 999 });
    expect(r.ok && r.value.maxAttempts).toBe(50);
  });
});

describe('validateCreateLock', () => {
  const now = new Date('2026-11-21T00:00:00Z');
  const ok = {
    shape: 'heart', material: 'gold', color: '#AABBCC', engraving: 'J+K', category: 'love', story: 'Hi',
    visibility: 'public', puzzle: { type: 'pin', pin: '1234' },
  };
  it('accepts a minimal valid lock and lowercases colors', () => {
    const r = validateCreateLock(ok, now);
    expect(r.ok && r.value.color).toBe('#aabbcc');
  });
  it('rejects links in engravings and past scheduled dates', () => {
    expect(validateCreateLock({ ...ok, engraving: 'www.spam.com' }, now).ok).toBe(false);
    expect(validateCreateLock({ ...ok, visibility: 'scheduled', availableAt: '2020-01-01' }, now).ok).toBe(false);
    expect(validateCreateLock({ ...ok, visibility: 'scheduled', availableAt: '2027-01-01' }, now).ok).toBe(true);
  });
  it('strips control characters', () => {
    const r = validateCreateLock({ ...ok, engraving: 'A\u0000B' }, now);
    expect(r.ok && r.value.engraving).toBe('AB');
  });
});

describe('progression', () => {
  it('maps XP to levels', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(99)).toBe(1);
    expect(levelFromXp(100)).toBe(2);
    expect(levelFromXp(400)).toBe(3);
    expect(xpForLevel(3)).toBe(400);
  });
  it('picks 3 distinct, deterministic daily challenges', () => {
    const a = challengesForDate('2026-11-21');
    expect(a).toHaveLength(3);
    expect(new Set(a.map((c) => c.id)).size).toBe(3);
    expect(challengesForDate('2026-11-21')).toEqual(a);
  });
});
