// API contract types shared by the client and the local API server.
import type { Category, LockShape, PuzzleType, Reaction, Visibility } from './catalog.ts';

export interface Profile {
  id: string;
  displayName: string;
  avatar: string;
  isGuest: boolean;
  email?: string | null;
  xp: number;
  level: number;
  showNameOnLocks: boolean;
  isAdmin?: boolean;
  createdAt: string;
}

export interface LockAppearance {
  shape: LockShape;
  material: string;
  color: string;
  engraving: string;
  engravingStyle: string;
  decoration: string;
  effect: string;
  lockDate: string;
}

/** Public, non-sensitive lock metadata. Never includes the story or puzzle secrets. */
export interface LockSummary extends LockAppearance {
  id: string;
  title: string;
  category: Category;
  visibility: Visibility;
  slot: number;
  creatorName: string | null;
  creatorId: string | null; // only set when creator chose to show name (used for blocking)
  createdAt: string;
  availableAt: string | null;
  status: 'active' | 'hidden' | 'expired';
  unlockCount: number;
  reactions: Partial<Record<Reaction, number>>;
  isOwn: boolean;
  isDemo: boolean;
  solvedByMe: boolean;
}

/** Placement record for rendering the bridge (minimal fields). */
export interface BridgeLock {
  id: string;
  slot: number;
  shape: LockShape;
  material: string;
  color: string;
  effect: string;
  visibility: Visibility;
  isOwn: boolean;
}

export interface PuzzlePublic {
  type: PuzzleType;
  pinLength?: number;
  question?: string;
  hintCount: number;
  maxAttempts: number;
}

export interface LockDetail extends LockSummary {
  puzzle: PuzzlePublic;
  canAttempt: boolean;
  attemptBlockedReason: string | null;
  attemptsRemaining: number | null;
}

export interface Story {
  title: string;
  body: string;
  signature: string;
  creatorName: string | null;
  createdAt: string;
}

export interface UnlockResult {
  success: boolean;
  story?: Story;
  attemptsRemaining?: number | null;
  retryAfterSeconds?: number;
  message?: string;
  xpAwarded?: number;
  newAchievements?: string[];
}

export interface OwnLock extends LockSummary {
  invitationCount: number;
  attemptCount: number;
}

export interface ProfileStats {
  locksCreated: number;
  locksSolved: number;
  locksInspected: number;
  storiesWritten: number;
  challengesCompleted: number;
}

export interface MeResponse {
  profile: Profile;
  stats: ProfileStats;
  achievements: { id: string; unlockedAt: string }[];
  nextLevelXp: number;
  currentLevelXp: number;
}

export interface ChallengeProgress {
  id: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
}

export interface ApiError {
  error: string;
  details?: Record<string, string>;
  retryAfterSeconds?: number;
}
