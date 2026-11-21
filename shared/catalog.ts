// Single source of truth for lock customization options, shared by client and server.

export const LOCK_SHAPES = ['heart', 'classic', 'round', 'shield'] as const;
export type LockShape = (typeof LOCK_SHAPES)[number];

export const SHAPE_LABELS: Record<LockShape, string> = {
  heart: 'Heart',
  classic: 'Classic Padlock',
  round: 'Round Disc',
  shield: 'Shield',
};

export interface MaterialDef {
  id: string;
  label: string;
  baseColor: string;
  metallic: number;
  roughness: number;
  alpha: number;
  /** Player level required (cosmetic progression only — never gates core features). */
  requiredLevel: number;
  seasonal?: boolean;
}

export const MATERIALS: MaterialDef[] = [
  { id: 'gold', label: 'Gold', baseColor: '#e8c27a', metallic: 1, roughness: 0.25, alpha: 1, requiredLevel: 1 },
  { id: 'silver', label: 'Silver', baseColor: '#d9dde3', metallic: 1, roughness: 0.2, alpha: 1, requiredLevel: 1 },
  { id: 'bronze', label: 'Bronze', baseColor: '#b9773f', metallic: 1, roughness: 0.4, alpha: 1, requiredLevel: 1 },
  { id: 'steel', label: 'Steel', baseColor: '#8a929c', metallic: 0.9, roughness: 0.5, alpha: 1, requiredLevel: 1 },
  { id: 'enamel', label: 'Enamel', baseColor: '#d9607d', metallic: 0.1, roughness: 0.3, alpha: 1, requiredLevel: 1 },
  { id: 'frost', label: 'Winter Frost', baseColor: '#e6f4ff', metallic: 0.6, roughness: 0.15, alpha: 0.85, requiredLevel: 2, seasonal: true },
  { id: 'crystal', label: 'Crystal', baseColor: '#bfe3ff', metallic: 0.1, roughness: 0.05, alpha: 0.6, requiredLevel: 3 },
];
export const MATERIAL_IDS = MATERIALS.map((m) => m.id);
export const materialById = (id: string): MaterialDef => MATERIALS.find((m) => m.id === id) ?? MATERIALS[0];

export const LOCK_COLORS = [
  '#e8c27a', '#d4a14f', '#f3d9a4', '#d9dde3', '#8a929c', '#b9773f',
  '#d9607d', '#ec8fa3', '#9b2f4a', '#6c4bb4', '#3d6a8c', '#5fb3a1',
  '#2e8b57', '#f08a4b', '#1b1f3a', '#fbf6ec',
];

export const ENGRAVING_STYLES = [
  { id: 'serif', label: 'Classic Serif', font: '600 64px "Cormorant Garamond", Georgia, serif', requiredLevel: 1 },
  { id: 'script', label: 'Script', font: 'italic 600 64px "Cormorant Garamond", Georgia, serif', requiredLevel: 1 },
  { id: 'block', label: 'Block Capitals', font: '700 56px Inter, Arial, sans-serif', requiredLevel: 1 },
  { id: 'deco', label: 'Art Deco', font: '500 58px "Futura", "Trebuchet MS", sans-serif', requiredLevel: 2 },
];
export const ENGRAVING_STYLE_IDS = ENGRAVING_STYLES.map((s) => s.id);

export const DECORATIONS = ['none', 'hearts', 'stars', 'vines', 'ribbon'];
export const EFFECTS = ['none', 'glow', 'sparkle'];

export const CATEGORIES = ['love', 'friendship', 'family', 'memory', 'gratitude', 'adventure', 'puzzle'] as const;
export type Category = (typeof CATEGORIES)[number];

export const VISIBILITIES = ['public', 'unlisted', 'invite_only', 'scheduled', 'private'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const VISIBILITY_INFO: Record<Visibility, { label: string; help: string }> = {
  public: { label: 'Public', help: 'Shown on the bridge and in Explore. Anyone can try the puzzle.' },
  unlisted: { label: 'Unlisted', help: 'Hangs on the bridge without details. Only people with your link can try.' },
  invite_only: { label: 'Invitation only', help: 'Only people holding one of your invitation links can try.' },
  scheduled: { label: 'Scheduled', help: 'Becomes public and solvable on the date you choose.' },
  private: { label: 'Private', help: 'Only you can see it. Nobody else can try the puzzle.' },
};

export const PUZZLE_TYPES = ['pin', 'riddle'] as const;
export type PuzzleType = (typeof PUZZLE_TYPES)[number];

export const REACTIONS = ['heart', 'tears', 'smile', 'sparkle'] as const;
export type Reaction = (typeof REACTIONS)[number];
export const REACTION_EMOJI: Record<Reaction, string> = { heart: '❤️', tears: '😢', smile: '😊', sparkle: '✨' };

export const REPORT_REASONS = ['harassment', 'hate', 'sexual', 'personal_info', 'spam', 'other'] as const;

/** Bridge layout: spans × sides × rows × columns of railing attachment points. */
export const BRIDGE = { spans: 7, sides: 2, rows: 5, colsPerSpan: 24 } as const;
export const BRIDGE_SLOTS = BRIDGE.spans * BRIDGE.sides * BRIDGE.rows * BRIDGE.colsPerSpan;
