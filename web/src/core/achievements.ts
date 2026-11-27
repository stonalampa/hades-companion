import type { Achievement, BoonId } from './types'

/**
 * Traits from the current build/aspect that count toward an achievement,
 * e.g. a 4th aspect for AchClearRun4thAspect. Empty when nothing applies.
 */
export function countingTraits(a: Achievement, owned: ReadonlySet<BoonId>): BoonId[] {
  const req = a.requirements ?? {}
  const ids = [
    ...(Array.isArray(req.RequiredOneOfTraits) ? (req.RequiredOneOfTraits as string[]) : []),
    ...(typeof req.RequiredTrait === 'string' ? [req.RequiredTrait] : []),
  ]
  return ids.filter((id) => owned.has(id))
}
