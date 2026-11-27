import type { Dataset } from '../core/types'
import type { LuaTable, LuaValue } from './luabins'
import type { SaveHeader } from './sgb'

/**
 * The few facts from a save that progress needs. Extracted in the browser;
 * the save itself is never stored or uploaded. Big records (text lines, voice
 * lines, rooms, cosmetics) keep only IDs the dataset's requirements mention.
 */
export interface SaveFacts {
  /** ISO time the game wrote the save. */
  savedAt: string
  runs: number
  runsCleared: number
  /** GameState.TraitsTaken: every boon/hammer/keepsake trait ever taken. */
  traits: string[]
  /** GameState.QuestStatus: Unlocked | Complete | CashedOut. */
  quests: Record<string, string>
  textLines: string[]
  speech: string[]
  rooms: string[]
  cosmetics: string[]
  cosmeticsAdded: number
  fish: string[]
  weaponsUnlocked: string[]
  /** Weapon -> aspect levels in game order (index 0 = Aspect of Zagreus). */
  aspectLevels: Record<string, number[]>
  /** Codex entry -> entries unlocked in a row from the first. */
  codex: Record<string, number>
  codexEntries: number
  npc: Record<string, number>
  items: Record<string, number>
  kills: Record<string, number>
  eliteKills: Record<string, number>
  clearsWithWeapon: Record<string, number>
  weaponShrinePoints: Record<string, number>
  clearedWithMeta: Record<string, number>
  keepsakeChambers: Record<string, number>
  /** Numeric GameState fields (NumCerberusPettings, MarketSales, ...). */
  values: Record<string, number>
}

const table = (v: LuaValue | undefined): LuaTable => (v && typeof v === 'object' ? v : {})
const truthy = (t: LuaTable) => Object.keys(t).filter((k) => t[k] !== null && t[k] !== false && t[k] !== 0)
const numbers = (t: LuaTable) =>
  Object.fromEntries(Object.entries(t).filter(([, v]) => typeof v === 'number')) as Record<string, number>
const strings = (t: LuaTable) =>
  Object.fromEntries(Object.entries(t).filter(([, v]) => typeof v === 'string')) as Record<string, string>

/** Every string a quest or achievement requirement mentions (keys and values). */
export function referencedIds(ds: Dataset): Set<string> {
  const out = new Set<string>()
  const walk = (v: unknown) => {
    if (typeof v === 'string') out.add(v)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v)) {
        out.add(k)
        walk(x)
      }
  }
  for (const x of [...ds.achievements, ...ds.quests]) walk(x.requirements)
  return out
}

export function extractFacts(header: SaveHeader, lua: LuaTable, ds: Dataset): SaveFacts {
  const gs = table(lua.GameState)
  const ref = referencedIds(ds)
  const only = (ids: string[]) => ids.filter((id) => ref.has(id))

  const history = Object.values(table(gs.RunHistory)).map(table)
  const runsCleared = history.filter((r) => r.Cleared === true).length + (table(lua.CurrentRun).Cleared === true ? 1 : 0)

  const unlocks = table(gs.WeaponUnlocks)
  const aspectLevels = Object.fromEntries(
    ds.weapons.map((w) => {
      const levels = table(unlocks[w.id])
      return [w.id, w.aspects.map((_, i) => Number(levels[String(i + 1)] ?? 0))]
    }),
  )

  // CodexStatus[chapter][entry][i].Unlocked; an entry still marked New isn't "found" yet.
  const codex: Record<string, number> = {}
  let codexEntries = 0
  for (const chapter of Object.values(table(lua.CodexStatus)).map(table)) {
    for (const [entry, raw] of Object.entries(chapter)) {
      const e = table(raw)
      if (table(e['1']).Unlocked === true) codexEntries++
      let n = 0
      while (table(e[String(n + 1)]).Unlocked === true) n++
      codex[entry] = e.New === true ? 0 : n
    }
  }

  return {
    savedAt: new Date(header.timestamp * 1000).toISOString(),
    runs: header.runs,
    runsCleared,
    traits: truthy(table(gs.TraitsTaken)).sort(),
    quests: strings(table(gs.QuestStatus)),
    textLines: only(truthy(table(lua.TextLinesRecord))),
    speech: only(truthy(table(lua.SpeechRecord))),
    rooms: only(Object.entries(numbers(table(gs.RoomCountCache))).filter(([, n]) => n > 0).map(([r]) => r)),
    cosmetics: only(truthy(table(gs.Cosmetics))),
    cosmeticsAdded: Object.keys(table(gs.CosmeticsAdded)).length,
    fish: truthy(table(gs.TotalCaughtFish)),
    weaponsUnlocked: truthy(table(gs.WeaponsUnlocked)),
    aspectLevels,
    codex,
    codexEntries,
    npc: numbers(table(gs.NPCInteractions)),
    items: numbers(table(gs.ItemInteractions)),
    kills: numbers(table(gs.EnemyKills)),
    eliteKills: numbers(table(gs.EnemyEliteAttributeKills)),
    clearsWithWeapon: numbers(table(gs.TimesClearedWeapon)),
    weaponShrinePoints: numbers(table(gs.WeaponRecordsShrinePoints)),
    clearedWithMeta: numbers(table(gs.ClearedWithMetaUpgrades)),
    keepsakeChambers: numbers(table(gs.KeepsakeChambers)),
    values: numbers(gs),
  }
}
