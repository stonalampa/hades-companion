// Shared schema. Mirrors data/<game>/dataset.json written by tools/importer.

export type GameId = 'hades1' | 'hades2'

export type BoonId = string

export type Slot = 'attack' | 'special' | 'cast' | 'dash' | 'call'

/**
 * slot: Attack/Special/Cast/Dash/Call boon; standard: anything else from a god;
 * keepsake: an equipped keepsake that counts as a prerequisite (e.g. Conch Shell);
 * aspect: a weapon aspect — chosen per run, it can satisfy or block boons.
 */
export type BoonKind = 'slot' | 'standard' | 'duo' | 'legendary' | 'keepsake' | 'aspect'

/**
 * Prerequisites in conjunctive normal form: every inner set must contain
 * at least one boon the player owns. Empty or missing = no prerequisites.
 */
export type Requirement = BoonId[][]

export interface Boon {
  id: BoonId
  gods: string[]
  kind: BoonKind
  slot?: Slot
  /** Game icon name, not an image. Icons are not distributed. */
  icon?: string
  requires?: Requirement
  /** Never offered while any of these is held (boons or the aspect). */
  excludedBy?: BoonId[]
  /** Mirror of Night choice the boon needs, e.g. AmmoMetaUpgrade (Infernal Soul). Not evaluated. */
  mirror?: string
  /** Set for aspects. */
  weapon?: string
  /** While holding the key (an aspect) the game shows this boon under another text entry. */
  textOverrides?: Record<BoonId, string>
}

export interface Weapon {
  id: string
  /** Aspect boon IDs in game order; the first is Aspect of Zagreus. */
  aspects: BoonId[]
}

export interface Achievement {
  /** Steam API name, e.g. AchClearTartarus. */
  id: string
  /** run: earned during a run, so the current run can advance it; meta: long-term progress. */
  scope: 'run' | 'meta'
  /** data: `requirements` describe it; code: checked in game code, no requirements. */
  rule: 'data' | 'code'
  requirements?: Record<string, unknown>
}

export interface Dataset {
  game: GameId
  /** Source file name -> sha256, for provenance. */
  sources: Record<string, string>
  weapons: Weapon[]
  boons: Boon[]
  /** Keepsake IDs in the game's rack order (each is also a boon of kind keepsake). */
  keepsakes: BoonId[]
  achievements: Achievement[]
}

/** Game text, loaded locally from the player's install; never bundled. */
export interface BoonText {
  name?: string
  description?: string
}

export interface Run {
  game: GameId
  startedAt: string
  boons: BoonId[]
  /** Pinned goals; kept when a new run starts. */
  targets?: BoonId[]
  /** Chosen aspect (its weapon follows from it); kept for the next run. */
  aspect?: BoonId
  /** Equipped keepsake; swappable between biomes, kept for the next run. */
  keepsake?: BoonId
  /**
   * Olympians a boon was taken from this run, Hermes excluded. The game counts
   * them toward the four-god limit even after their boon is replaced.
   */
  gods?: string[]
}
