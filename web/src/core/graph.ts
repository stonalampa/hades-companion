import type { Boon, BoonId } from './types'

/**
 * Fewest boons still to pick up before `id` becomes eligible, following
 * prerequisites of prerequisites. Ignores slot replacement and offer luck;
 * options shared between sets may be counted twice (upper bound).
 */
export function boonsNeeded(
  id: BoonId,
  owned: ReadonlySet<BoonId>,
  byId: ReadonlyMap<BoonId, Boon>,
  trail: readonly BoonId[] = [],
): number {
  const boon = byId.get(id)
  if (boon?.excludedBy?.some((x) => owned.has(x))) return Infinity
  const sets = boon?.requires ?? []
  let total = 0
  for (const set of sets) {
    if (set.some((o) => owned.has(o))) continue
    let best = Infinity
    for (const opt of set) {
      if (trail.includes(opt) || opt === id || byId.get(opt)?.kind === 'aspect') continue
      best = Math.min(best, 1 + boonsNeeded(opt, owned, byId, [...trail, id]))
    }
    total += best
  }
  return total
}

/** Reverse prerequisite index: boon -> boons it helps unlock. */
export function buildUnlocks(boons: readonly Boon[]): Map<BoonId, BoonId[]> {
  const out = new Map<BoonId, BoonId[]>()
  for (const b of boons) {
    for (const id of new Set((b.requires ?? []).flat())) {
      const list = out.get(id) ?? []
      list.push(b.id)
      out.set(id, list)
    }
  }
  return out
}
