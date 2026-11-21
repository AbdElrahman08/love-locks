// XP, levels, achievements and daily challenges. Enforced server-side; the client only displays them.

export const XP_RULES = {
  create_lock: { xp: 50, dailyCap: 5 },
  solve_lock: { xp: 30, dailyCap: 20 },
  inspect_lock: { xp: 5, dailyCap: 10 },
  daily_challenge: { xp: 40, dailyCap: 3 },
  receive_unlock: { xp: 10, dailyCap: 10 },
} as const;
export type XpReason = keyof typeof XP_RULES;

export function levelFromXp(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
}
export function xpForLevel(level: number): number {
  return (level - 1) ** 2 * 100;
}

export type AchievementMetric =
  | 'locks_created'
  | 'locks_solved'
  | 'locks_inspected'
  | 'stories_written'
  | 'challenges_completed';

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  metric: AchievementMetric;
  threshold: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_lock', title: 'First Lock', description: 'Attach your first lock to the bridge.', icon: '🔒', metric: 'locks_created', threshold: 1 },
  { id: 'first_unlock', title: 'First Unlock', description: "Solve someone else's lock.", icon: '🗝️', metric: 'locks_solved', threshold: 1 },
  { id: 'storyteller', title: 'Storyteller', description: 'Hide 5 stories of 100+ characters behind your locks.', icon: '📜', metric: 'stories_written', threshold: 5 },
  { id: 'puzzle_solver', title: 'Puzzle Solver', description: 'Solve 5 locks.', icon: '🧩', metric: 'locks_solved', threshold: 5 },
  { id: 'explorer', title: 'Explorer', description: 'Inspect 20 different locks on the bridge.', icon: '🧭', metric: 'locks_inspected', threshold: 20 },
  { id: 'memory_collector', title: 'Memory Collector', description: 'Unlock 15 stories.', icon: '💌', metric: 'locks_solved', threshold: 15 },
  { id: 'daily_devotee', title: 'Daily Devotee', description: 'Complete 7 daily challenges.', icon: '🌅', metric: 'challenges_completed', threshold: 7 },
];

export interface DailyChallengeDef {
  id: string;
  title: string;
  description: string;
  metric: 'create' | 'solve' | 'inspect';
  target: number;
}

export const DAILY_CHALLENGE_POOL: DailyChallengeDef[] = [
  { id: 'inspect_5', title: 'Evening Stroll', description: 'Inspect 5 locks on the bridge.', metric: 'inspect', target: 5 },
  { id: 'solve_1', title: 'Curious Heart', description: "Solve any lock that isn't yours.", metric: 'solve', target: 1 },
  { id: 'create_1', title: 'Leave a Mark', description: 'Attach a new lock to the bridge.', metric: 'create', target: 1 },
  { id: 'inspect_10', title: 'Flaneur', description: 'Inspect 10 locks on the bridge.', metric: 'inspect', target: 10 },
  { id: 'solve_2', title: 'Locksmith', description: "Solve 2 locks that aren't yours.", metric: 'solve', target: 2 },
];

/** Deterministic set of 3 challenges for a UTC date (YYYY-MM-DD). */
export function challengesForDate(date: string): DailyChallengeDef[] {
  let h = 0;
  for (const c of date) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const pool = [...DAILY_CHALLENGE_POOL];
  const out: DailyChallengeDef[] = [];
  while (out.length < 3 && pool.length) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    out.push(pool.splice(h % pool.length, 1)[0]);
  }
  return out;
}
