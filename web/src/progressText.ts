import { PART_LABELS, type Part } from './core/progress'
import type { TextMap } from './data'

export const splitCamel = (s: string) => s.replace(/([a-z])([A-Z0-9])/g, '$1 $2')

/** Name for anything a requirement lists: game text, else a tidied ID. */
export function progressName(id: string, text: TextMap): string {
  const name = text[id]?.name
  if (name) return name
  if (id.startsWith('/VO/')) return 'a voice line'
  return splitCamel(id.replace(/^NPC_/, '').replace(/_0?1$/, '').replace(/_/g, ' '))
}

/** One line per achievement/prophecy for the server (MCP reads it as text). */
export function summary(parts: Part[], text: TextMap): string {
  return parts
    .filter((p) => !p.untracked)
    .map((p) => {
      const label = `${p.have}/${p.need} ${PART_LABELS[p.key] ?? p.key}`
      if (p.have >= p.need || p.missing.length === 0) return label
      const names = p.missing.map((id) => progressName(id, text))
      return `${label}, missing: ${names.slice(0, 30).join(', ')}${names.length > 30 ? ` (+${names.length - 30} more)` : ''}`
    })
    .join('; ')
}
