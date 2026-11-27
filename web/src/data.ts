import rawDataset from '../../data/hades1/dataset.json'
import { buildUnlocks } from './core/graph'
import type { Boon, BoonId, BoonText, Dataset } from './core/types'

export const dataset = rawDataset as Dataset
export const byId: ReadonlyMap<BoonId, Boon> = new Map(dataset.boons.map((b) => [b.id, b]))
export const unlocks = buildUnlocks(dataset.boons)

export type TextMap = Record<BoonId, BoonText>

/**
 * Game text is not bundled. `npm run game-assets` copies it (and icons) from the local import
 * into public/local/ (gitignored); without it the app falls back to IDs.
 */
export async function loadText(): Promise<TextMap> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}local/text.en.json`)
    return res.ok ? ((await res.json()) as TextMap) : {}
  } catch {
    return {}
  }
}

const splitCamel = (s: string) => s.replace(/([a-z])([A-Z0-9])/g, '$1 $2')

/** Text for a boon, following aspect renames (Flood Shot is "Flood Flare" under Beowulf). */
export function textFor(id: BoonId, text: TextMap, owned?: ReadonlySet<BoonId>): BoonText | undefined {
  const overrides = byId.get(id)?.textOverrides
  const alt = overrides && owned && Object.entries(overrides).find(([aspect]) => owned.has(aspect))?.[1]
  return (alt && text[alt]) || text[id]
}

export function boonName(id: BoonId, text: TextMap, owned?: ReadonlySet<BoonId>): string {
  return textFor(id, text, owned)?.name ?? splitCamel(id.replace(/Trait$/, '').replace(/_/g, ' '))
}

/** Steam achievement text (tools/steamschema), local only; empty when not fetched. */
export async function loadAchievementText(): Promise<TextMap> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}local/achievements.en.json`)
    return res.ok ? ((await res.json()) as TextMap) : {}
  } catch {
    return {}
  }
}

/** "AchClearTartarus" -> "Clear Tartarus" until Steam names are fetched. */
export function achievementName(id: string, text: TextMap): string {
  return text[id]?.name ?? splitCamel(id.replace(/^Ac[ht]/, ''))
}

/** Strips game formatting tokens; numeric tooltip values become "…". */
export function cleanDescription(raw: string | undefined): string {
  if (!raw) return ''
  return raw
    .replace(/\{\$Keywords\.(\w+)\}/g, (_, k: string) =>
      k.endsWith('Plural') ? `${splitCamel(k.slice(0, -6))}s` : splitCamel(k.replace(/Alt$/, '')),
    )
    .replace(/\{!Icons\.Bullet\}/g, '•')
    .replace(/\{\$TooltipData[^}]*\}/g, '…')
    .replace(/\{[#$!][^}]*\}/g, '')
    .replace(/\\Column \d+/g, '')
    .replace(/\\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
}
