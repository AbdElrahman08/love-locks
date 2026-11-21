// Product analytics. Events go to the first-party /api/analytics endpoint (no third parties by default).
// If VITE_POSTHOG_KEY is configured, the same events can be forwarded to PostHog (see CONNECTORS.md).
import { getToken } from './api.ts';

export type AnalyticsEvent =
  | 'app_open' | 'landing_cta' | 'tutorial_start' | 'tutorial_complete' | 'workshop_open' | 'workshop_step'
  | 'lock_published' | 'invite_shared' | 'invite_opened' | 'puzzle_attempt' | 'puzzle_solved' | 'story_revealed'
  | 'register_start' | 'register_complete' | 'guest_converted' | 'report_submitted' | 'reaction_added' | 'quality_changed';

export function track(name: AnalyticsEvent, props: Record<string, string | number | boolean> = {}) {
  try {
    const token = getToken();
    void fetch('/api/analytics', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ name, props }),
    }).catch(() => undefined);
  } catch {
    /* analytics must never break the experience */
  }
}
