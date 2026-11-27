import type { SaveFacts } from '../save/facts'
import type { BoonId, Dataset } from './types'

/**
 * Progress toward one requirement key, from a save file. `missing` lists IDs
 * (or biome names for fish) still needed; empty when only a count matters.
 * Keys checked only during a run (RequiresRunCleared, RequiredTrait, ...) or
 * not tracked here are `untracked`.
 */
export interface Part {
  key: string
  have: number
  need: number
  missing: string[]
  untracked?: boolean
}

type Facts = SaveFacts
type Check = (value: unknown, f: Facts, ds: Dataset) => Omit<Part, 'key'> | undefined

const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' ? [v] : []
const record = (v: unknown): Record<string, number> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, number>) : {}
const count = (n: unknown) => (typeof n === 'number' ? n : 0)

/** All of `ids` must satisfy `has`. */
const allOf = (ids: string[], has: (id: string) => boolean) => {
  const missing = ids.filter((id) => !has(id))
  return { have: ids.length - missing.length, need: ids.length, missing }
}
/** At least one of `ids`. */
const anyOf = (ids: string[], has: (id: string) => boolean) => {
  const ok = ids.some(has)
  return { have: ok ? 1 : 0, need: 1, missing: ok ? [] : ids }
}
/** Each key needs at least its number; a single key shows the raw count (Skelly 12/15). */
const minMap = (req: Record<string, number>, got: Record<string, number>) => {
  const keys = Object.keys(req)
  if (keys.length === 1) {
    const [k] = keys
    const have = Math.min(got[k] ?? 0, req[k])
    return { have, need: req[k], missing: have < req[k] ? [k] : [] }
  }
  return allOf(keys, (k) => (got[k] ?? 0) >= req[k])
}
const atLeast = (have: number, need: number, missing: string[] = []) => ({
  have: Math.min(have, need),
  need,
  missing: have >= need ? [] : missing,
})

/** God boons for "unique boons taken" (IsGodTrait with ForShop: Olympians and Hermes). */
const godBoons = (ds: Dataset) =>
  ds.boons.filter((b) => b.gods.length > 0 && b.kind !== 'keepsake' && b.kind !== 'aspect').map((b) => b.id)

// Same semantics as IsGameStateEligible in the game's RunManager.lua.
const CHECKS: Record<string, Check> = {
  RequiredTraitsTaken: (v, f) => allOf(list(v), (id) => f.traits.includes(id)),
  RequiredAnyTraitsTaken: (v, f) => anyOf(list(v), (id) => f.traits.includes(id)),
  RequiredTextLines: (v, f) => allOf(list(v), (id) => f.textLines.includes(id)),
  RequiredAnyTextLines: (v, f) => anyOf(list(v), (id) => f.textLines.includes(id)),
  RequiredAnyOtherTextLines: (v, f) => anyOf(list(v), (id) => f.textLines.includes(id)),
  RequiredPlayed: (v, f) => allOf(list(v), (id) => f.speech.includes(id)),
  RequireQuestsComplete: (v, f) => allOf(list(v), (id) => f.quests[id] === 'CashedOut'),
  RequireAnyQuestsComplete: (v, f) => anyOf(list(v), (id) => f.quests[id] === 'CashedOut'),
  RequiredMinQuestsComplete: (v, f) => atLeast(Object.values(f.quests).filter((s) => s === 'CashedOut').length, count(v)),
  RequiredMinRunsCleared: (v, f) => atLeast(f.runsCleared, count(v)),
  RequiredSeenRooms: (v, f) => allOf(list(v), (id) => f.rooms.includes(id)),
  RequiredWeaponsUnlocked: (v, f) => allOf(list(v), (id) => f.weaponsUnlocked.includes(id)),
  RequiredCosmetics: (v, f) => allOf(list(v), (id) => f.cosmetics.includes(id)),
  RequiredNumCosmeticsMin: (v, f) => atLeast(f.cosmeticsAdded, count(v)),
  RequiredKills: (v, f) => minMap(record(v), f.kills),
  RequiredEliteAttributeKills: (v, f) => minMap(record(v), f.eliteKills),
  RequiredMinNPCInteractions: (v, f) => minMap(record(v), f.npc),
  RequiredMinItemInteractions: (v, f) => minMap(record(v), f.items),
  RequiredMinValues: (v, f) => minMap(record(v), f.values),
  RequiredClearedWithMetaUpgrades: (v, f) => allOf(list(v), (id) => (f.clearedWithMeta[id] ?? 0) > 0),
  RequiredClearsWithWeapons: (v, f) => {
    const r = v as { Names?: unknown; ShrinePoints?: number }
    return allOf(
      list(r?.Names),
      (w) =>
        (f.clearsWithWeapon[w] ?? 0) > 0 &&
        (r.ShrinePoints === undefined || (f.weaponShrinePoints[w] ?? 0) > r.ShrinePoints),
    )
  },
  RequiredCodexEntries: (v, f) => {
    const r = record(v)
    return allOf(Object.keys(r), (e) => (f.codex[e] ?? 0) >= r[e])
  },
  RequiredCodexEntriesMin: (v, f) => atLeast(f.codexEntries, count(v)),
  RequiresMaxKeepsakes: (v, f, ds) => {
    const max = (id: BoonId) => ds.boons.find((b) => b.id === id)?.maxChambers ?? 75
    return allOf(list(v), (id) => (f.keepsakeChambers[id] ?? 0) >= max(id))
  },
  RequiredAnyCaughtFishTypesOfEach: (v, f) => {
    const groups = Array.isArray(v) ? v.map(list) : []
    // Fish_Tartarus_Common_01 -> Tartarus
    const missing = groups.filter((g) => !g.some((id) => f.fish.includes(id))).map((g) => g[0]?.split('_')[1] ?? '?')
    return { have: groups.length - missing.length, need: groups.length, missing }
  },
  RequiredUniqueGodTraitsTaken: (v, f, ds) => {
    const all = godBoons(ds)
    return atLeast(
      all.filter((id) => f.traits.includes(id)).length,
      count(v),
      all.filter((id) => !f.traits.includes(id)),
    )
  },
  RequiredUniqueWeaponUpgradesTaken: (v, f, ds) =>
    atLeast(
      ds.hammers.filter((id) => f.traits.includes(id)).length,
      count(v),
      ds.hammers.filter((id) => !f.traits.includes(id)),
    ),
  // Aspects past the first (Zagreus starts unlocked); a level above 0 means unlocked.
  RequiredMinUnlockedWeaponEnchantments: (v, f, ds) => {
    const locked = ds.weapons.flatMap((w) => w.aspects.slice(1).filter((_, i) => !(f.aspectLevels[w.id]?.[i + 1] > 0)))
    const total = ds.weapons.reduce((n, w) => n + w.aspects.length - 1, 0)
    return atLeast(total - locked.length, count(v), locked)
  },
  RequiredMinMaxedWeaponEnchantments: (v, f) =>
    atLeast(Object.values(f.aspectLevels).flat().filter((l) => l >= 5).length, count(v)),
}

export function progress(req: Record<string, unknown> | undefined, facts: Facts, ds: Dataset): Part[] {
  return Object.entries(req ?? {}).map(([key, value]) => {
    const r = CHECKS[key]?.(value, facts, ds)
    return r ? { key, ...r } : { key, have: 0, need: 0, missing: [], untracked: true }
  })
}

/** Done by the save alone: has requirements and every one is tracked and met. */
export function completeBySave(parts: Part[]): boolean {
  return parts.length > 0 && parts.every((p) => !p.untracked && p.have >= p.need)
}

/** Short English label per requirement key, for the UI and MCP. */
export const PART_LABELS: Record<string, string> = {
  RequiredTraitsTaken: 'Boons / upgrades taken',
  RequiredAnyTraitsTaken: 'Any of these taken',
  RequiredTextLines: 'Story events',
  RequiredAnyTextLines: 'Story event (any)',
  RequiredAnyOtherTextLines: 'Story event (any)',
  RequiredPlayed: 'Voice line heard',
  RequireQuestsComplete: 'Prophecies fulfilled',
  RequireAnyQuestsComplete: 'Prophecy fulfilled (any)',
  RequiredMinQuestsComplete: 'Prophecies fulfilled',
  RequiredMinRunsCleared: 'Escapes',
  RequiredSeenRooms: 'Places reached',
  RequiredWeaponsUnlocked: 'Weapons unlocked',
  RequiredCosmetics: 'House contractor items',
  RequiredNumCosmeticsMin: 'House contractor items',
  RequiredKills: 'Foes slain',
  RequiredEliteAttributeKills: 'Armored foe perks slain',
  RequiredMinNPCInteractions: 'Characters met',
  RequiredMinItemInteractions: 'Well of Charon items bought',
  RequiredMinValues: 'Count',
  RequiredClearedWithMetaUpgrades: 'Escaped with',
  RequiredClearsWithWeapons: 'Escaped with weapon',
  RequiredCodexEntries: 'Codex entries',
  RequiredCodexEntriesMin: 'Codex entries',
  RequiresMaxKeepsakes: 'Keepsakes at max level',
  RequiredAnyCaughtFishTypesOfEach: 'A fish from each region',
  RequiredUniqueGodTraitsTaken: 'Different boons taken',
  RequiredUniqueWeaponUpgradesTaken: 'Different hammers taken',
  RequiredMinUnlockedWeaponEnchantments: 'Aspects unlocked',
  RequiredMinMaxedWeaponEnchantments: 'Aspects at max level',
}
