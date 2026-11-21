// Product decisions that are still provisional live here so they can change without code surgery.
export const GAME_CONFIG = {
  camera: {
    /** 'orbit' = third-person orbit around the bridge; 'free' = first-person walk (WASD / drag). */
    defaultMode: 'orbit' as 'orbit' | 'free',
    allowFreeCamera: true,
  },
  world: {
    /** 'hybrid' = shared public bridge + private locks only their owner sees. */
    mode: 'hybrid' as 'shared' | 'hybrid',
    showDecorativeLocks: true,
  },
  unlocking: {
    /** Which visibilities can be attempted straight from the bridge (others need an invitation link). */
    attemptableFromBridge: ['public', 'scheduled'] as string[],
  },
  accounts: {
    /** Guest-first: everyone gets a guest session; registering is optional and keeps progress. */
    guestAllowed: true,
    requireAccountToPublish: false,
    socialLogin: false, // enabled when the Supabase backend is connected (see CONNECTORS.md)
  },
} as const;
