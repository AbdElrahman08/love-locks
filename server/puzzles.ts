// Puzzle engine. Each puzzle type is a self-contained handler; add new types by
// registering another handler — the unlock pipeline (rate limits, logging, reveal) is shared.
import type { PuzzleType } from '../shared/catalog.ts';
import type { PuzzleInput } from '../shared/validation.ts';
import { normalizeAnswer } from '../shared/validation.ts';
import type { PuzzlePublic } from '../shared/types.ts';
import { hashSecret, verifySecret } from './security.ts';

export interface StoredPuzzle {
  type: PuzzleType;
  publicConfig: Record<string, unknown>;
  secretConfig: Record<string, unknown>;
  hints: string[];
  maxAttempts: number;
}

interface PuzzleHandler {
  /** Turn validated creator input into public + secret config. Secrets must be hashed here. */
  build(input: PuzzleInput, pepper: string): Promise<Omit<StoredPuzzle, 'hints' | 'maxAttempts'>>;
  /** Check a player's answer against the secret config. */
  check(answer: string, stored: StoredPuzzle, pepper: string): Promise<boolean>;
  /** What the player is allowed to see before solving. */
  publicView(stored: StoredPuzzle): Omit<PuzzlePublic, 'hintCount' | 'maxAttempts' | 'type'>;
  /** Cheap pre-check to reject malformed answers without counting heavy work. */
  isWellFormed(answer: string, stored: StoredPuzzle): boolean;
}

const pin: PuzzleHandler = {
  async build(input, pepper) {
    const value = input.pin!;
    return {
      type: 'pin',
      publicConfig: { pinLength: value.length },
      secretConfig: { hash: await hashSecret(value, pepper) },
    };
  },
  async check(answer, stored, pepper) {
    return verifySecret(answer.trim(), String(stored.secretConfig.hash), pepper);
  },
  publicView(stored) {
    return { pinLength: Number(stored.publicConfig.pinLength) };
  },
  isWellFormed(answer, stored) {
    return /^\d+$/.test(answer.trim()) && answer.trim().length === Number(stored.publicConfig.pinLength);
  },
};

const riddle: PuzzleHandler = {
  async build(input, pepper) {
    const norm = input.normalization ?? {};
    const hashes = await Promise.all(
      [...new Set(input.answers!.map((a) => normalizeAnswer(a, norm)))].map((a) => hashSecret(a, pepper)),
    );
    return {
      type: 'riddle',
      publicConfig: { question: input.question },
      secretConfig: { hashes, normalization: norm },
    };
  },
  async check(answer, stored, pepper) {
    const norm = (stored.secretConfig.normalization ?? {}) as { ignorePunctuation?: boolean; ignoreAccents?: boolean };
    const candidate = normalizeAnswer(answer, norm);
    if (!candidate) return false;
    // Check every hash (no early exit) so timing does not reveal which answer matched.
    const results = await Promise.all(
      (stored.secretConfig.hashes as string[]).map((h) => verifySecret(candidate, h, pepper)),
    );
    return results.some(Boolean);
  },
  publicView(stored) {
    return { question: String(stored.publicConfig.question) };
  },
  isWellFormed(answer) {
    return answer.trim().length > 0 && answer.length <= 200;
  },
};

export const PUZZLE_HANDLERS: Record<PuzzleType, PuzzleHandler> = { pin, riddle };

export async function buildPuzzle(input: PuzzleInput, pepper: string): Promise<StoredPuzzle> {
  const built = await PUZZLE_HANDLERS[input.type].build(input, pepper);
  return { ...built, hints: input.hints ?? [], maxAttempts: input.maxAttempts ?? 10 };
}

export function publicPuzzle(stored: StoredPuzzle): PuzzlePublic {
  return {
    type: stored.type,
    hintCount: stored.hints.length,
    maxAttempts: stored.maxAttempts,
    ...PUZZLE_HANDLERS[stored.type].publicView(stored),
  };
}
