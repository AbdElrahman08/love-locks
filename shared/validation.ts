// Input validation shared by client (for instant feedback) and server (authoritative).
import {
  CATEGORIES, DECORATIONS, EFFECTS, ENGRAVING_STYLE_IDS, LOCK_SHAPES, MATERIAL_IDS,
  PUZZLE_TYPES, VISIBILITIES, type Category, type LockShape, type PuzzleType, type Visibility,
} from './catalog.ts';

export const LIMITS = {
  engraving: 24,
  title: 60,
  story: 4000,
  signature: 40,
  riddleQuestion: 200,
  riddleAnswer: 60,
  riddleAnswers: 5,
  hints: 3,
  hint: 140,
  pinMin: 4,
  pinMax: 8,
  displayName: 32,
} as const;

export interface PuzzleInput {
  type: PuzzleType;
  pin?: string;
  question?: string;
  answers?: string[];
  hints?: string[];
  maxAttempts?: number;
  normalization?: { ignorePunctuation?: boolean; ignoreAccents?: boolean };
}

export interface CreateLockInput {
  shape: LockShape;
  material: string;
  color: string;
  engraving: string;
  engravingStyle: string;
  decoration: string;
  effect: string;
  lockDate: string; // YYYY-MM-DD shown on the lock
  title: string;
  category: Category;
  story: string;
  signature: string; // how the creator signs the story
  visibility: Visibility;
  availableAt?: string | null; // ISO, required for scheduled
  expiresAt?: string | null; // ISO, optional
  puzzle: PuzzleInput;
  preferredSpan?: number | null;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

const HEX = /^#[0-9a-fA-F]{6}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const URL_LIKE = /(https?:\/\/|www\.)/i;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function cleanText(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.replace(CONTROL, '').trim().slice(0, max);
}

function oneOf<T extends string>(v: unknown, list: readonly T[], fallback?: T): T | undefined {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback;
}

/**
 * Normalize a riddle answer. Case-insensitive always; whitespace collapsed;
 * accents and punctuation optionally ignored (default: both ignored).
 */
export function normalizeAnswer(
  raw: string,
  opts: { ignorePunctuation?: boolean; ignoreAccents?: boolean } = {},
): string {
  const { ignorePunctuation = true, ignoreAccents = true } = opts;
  let s = String(raw ?? '').normalize('NFKC').toLowerCase();
  if (ignoreAccents) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (ignorePunctuation) s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

export function validatePuzzle(p: unknown): ValidationResult<PuzzleInput> {
  const errors: Record<string, string> = {};
  const src = (p ?? {}) as Record<string, unknown>;
  const type = oneOf(src.type, PUZZLE_TYPES);
  if (!type) return { ok: false, errors: { 'puzzle.type': 'Choose a puzzle type.' } };
  const maxAttemptsRaw = Number(src.maxAttempts ?? 10);
  const maxAttempts = Number.isFinite(maxAttemptsRaw) ? Math.min(50, Math.max(3, Math.round(maxAttemptsRaw))) : 10;
  const hints = Array.isArray(src.hints)
    ? src.hints.map((h) => cleanText(h, LIMITS.hint)).filter(Boolean).slice(0, LIMITS.hints)
    : [];

  if (type === 'pin') {
    const pin = typeof src.pin === 'string' ? src.pin.trim() : '';
    if (!/^\d+$/.test(pin)) errors['puzzle.pin'] = 'The PIN must contain digits only.';
    else if (pin.length < LIMITS.pinMin || pin.length > LIMITS.pinMax)
      errors['puzzle.pin'] = `The PIN must be ${LIMITS.pinMin}–${LIMITS.pinMax} digits.`;
    if (Object.keys(errors).length) return { ok: false, errors };
    return { ok: true, value: { type, pin, hints, maxAttempts } };
  }

  const question = cleanText(src.question, LIMITS.riddleQuestion);
  if (question.length < 3) errors['puzzle.question'] = 'Write a question for your riddle.';
  const normalization = {
    ignorePunctuation: (src.normalization as any)?.ignorePunctuation !== false,
    ignoreAccents: (src.normalization as any)?.ignoreAccents !== false,
  };
  const answers = (Array.isArray(src.answers) ? src.answers : [])
    .map((a) => cleanText(a, LIMITS.riddleAnswer))
    .filter((a) => normalizeAnswer(a, normalization).length > 0)
    .slice(0, LIMITS.riddleAnswers);
  if (answers.length === 0) errors['puzzle.answers'] = 'Add at least one accepted answer.';
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { type, question, answers, hints, maxAttempts, normalization } };
}

export function validateCreateLock(input: unknown, now = new Date()): ValidationResult<CreateLockInput> {
  const src = (input ?? {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};

  const shape = oneOf(src.shape, LOCK_SHAPES);
  if (!shape) errors.shape = 'Choose a lock shape.';
  const material = oneOf(src.material, MATERIAL_IDS);
  if (!material) errors.material = 'Choose a material.';
  const color = typeof src.color === 'string' && HEX.test(src.color) ? src.color.toLowerCase() : '';
  if (!color) errors.color = 'Choose a color.';
  const engraving = cleanText(src.engraving, LIMITS.engraving);
  if (!engraving) errors.engraving = 'Add an engraving (initials, a word, a date…).';
  if (URL_LIKE.test(engraving)) errors.engraving = 'Links are not allowed in engravings.';
  const engravingStyle = oneOf(src.engravingStyle, ENGRAVING_STYLE_IDS, 'serif')!;
  const decoration = oneOf(src.decoration, DECORATIONS, 'none')!;
  const effect = oneOf(src.effect, EFFECTS, 'none')!;
  const lockDate = typeof src.lockDate === 'string' && DATE.test(src.lockDate) ? src.lockDate : now.toISOString().slice(0, 10);
  const title = cleanText(src.title, LIMITS.title);
  if (URL_LIKE.test(title)) errors.title = 'Links are not allowed in titles.';
  const category = oneOf(src.category, CATEGORIES, 'love')!;
  const story = typeof src.story === 'string' ? src.story.replace(CONTROL, '').trim().slice(0, LIMITS.story) : '';
  if (story.length < 1) errors.story = 'Write the story or message hidden inside your lock.';
  const signature = cleanText(src.signature, LIMITS.signature);
  const visibility = oneOf(src.visibility, VISIBILITIES);
  if (!visibility) errors.visibility = 'Choose who can see your lock.';

  let availableAt: string | null = null;
  if (visibility === 'scheduled') {
    const d = new Date(String(src.availableAt ?? ''));
    if (Number.isNaN(d.getTime())) errors.availableAt = 'Pick the date your lock opens to the public.';
    else if (d.getTime() <= now.getTime()) errors.availableAt = 'The scheduled date must be in the future.';
    else availableAt = d.toISOString();
  }
  let expiresAt: string | null = null;
  if (src.expiresAt) {
    const d = new Date(String(src.expiresAt));
    if (Number.isNaN(d.getTime()) || d.getTime() <= now.getTime()) errors.expiresAt = 'Expiry must be a future date.';
    else expiresAt = d.toISOString();
  }

  const puzzle = validatePuzzle(src.puzzle);
  if (!puzzle.ok) Object.assign(errors, puzzle.errors);

  const span = Number(src.preferredSpan);
  const preferredSpan = Number.isInteger(span) && span >= 0 && span < 7 ? span : null;

  if (Object.keys(errors).length || !puzzle.ok) return { ok: false, errors };
  return {
    ok: true,
    value: {
      shape: shape!, material: material!, color, engraving, engravingStyle, decoration, effect, lockDate,
      title, category, story, signature, visibility: visibility!, availableAt, expiresAt,
      puzzle: puzzle.value, preferredSpan,
    },
  };
}
