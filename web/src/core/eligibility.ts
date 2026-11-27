import type { Boon, BoonId, Requirement, Slot } from './types'

/**
 * Eligibility only: the game may still never offer an eligible boon.
 * - free: no prerequisites
 * - eligible: all prerequisite sets satisfied
 * - oneAway: exactly one set unsatisfied; any boon in `missing` completes it
 * - far: two or more sets unsatisfied
 * - blocked: never offered while `by` is held, or `god` can't join the run (four-god limit)
 */
export type Status =
  | { kind: 'owned' }
  | { kind: 'blocked'; by: BoonId; god?: undefined }
  | { kind: 'blocked'; god: string; by?: undefined }
  | { kind: 'free' }
  | { kind: 'eligible' }
  | { kind: 'oneAway'; missing: BoonId[] }
  | { kind: 'far'; unsatisfied: number }

export function unsatisfiedSets(req: Requirement | undefined, owned: ReadonlySet<BoonId>): BoonId[][] {
  return (req ?? []).filter((set) => !set.some((id) => owned.has(id)))
}

/** Gods outside the god limit (they don't count toward it and can always come). */
export const UNLIMITED_GODS: ReadonlySet<string> = new Set(['Hermes'])
const MAX_GODS = 4

/**
 * The game offers boons from at most four Olympians per run (ReachedMaxGods in
 * RunManager.lua); Hermes doesn't count. `gods` = those taken this run.
 * Returns the gods that can still be offered, or undefined while any can.
 */
export function godPool(gods: Iterable<string>): ReadonlySet<string> | undefined {
  const limited = new Set([...gods].filter((g) => !UNLIMITED_GODS.has(g)))
  return limited.size >= MAX_GODS ? limited : undefined
}

/** A god of this boon that can no longer join the run, if any. */
export function outOfPool(boon: Boon, pool?: ReadonlySet<string>): string | undefined {
  return pool && boon.gods.find((g) => !UNLIMITED_GODS.has(g) && !pool.has(g))
}

export function evaluate(boon: Boon, owned: ReadonlySet<BoonId>, pool?: ReadonlySet<string>): Status {
  if (owned.has(boon.id)) return { kind: 'owned' }
  const by = boon.excludedBy?.find((id) => owned.has(id))
  if (by) return { kind: 'blocked', by }
  const god = outOfPool(boon, pool)
  if (god) return { kind: 'blocked', god }
  if (!boon.requires?.length) return { kind: 'free' }
  const open = unsatisfiedSets(boon.requires, owned)
  if (open.length === 0) return { kind: 'eligible' }
  if (open.length === 1) return { kind: 'oneAway', missing: open[0] }
  return { kind: 'far', unsatisfied: open.length }
}

/**
 * Adds a boon to a build. A slot boon replaces whatever occupies that slot,
 * as in the game.
 */
export function addBoon(build: BoonId[], boon: Boon, byId: ReadonlyMap<BoonId, Boon>): BoonId[] {
  if (build.includes(boon.id)) return build
  const kept = boon.slot ? build.filter((id) => byId.get(id)?.slot !== boon.slot) : build
  return [...kept, boon.id]
}

/** Current occupant of each slot. */
export function slotOwners(build: BoonId[], byId: ReadonlyMap<BoonId, Boon>): Map<Slot, BoonId> {
  const out = new Map<Slot, BoonId>()
  for (const id of build) {
    const slot = byId.get(id)?.slot
    if (slot) out.set(slot, id)
  }
  return out
}

/**
 * Boons in the build that taking `candidate` would remove, and the owned
 * duo/legendary/other boons whose prerequisites would then break.
 */
export function replacementCost(
  candidate: Boon,
  build: BoonId[],
  byId: ReadonlyMap<BoonId, Boon>,
): { replaces?: BoonId; breaks: BoonId[] } {
  if (!candidate.slot) return { breaks: [] }
  const replaces = slotOwners(build, byId).get(candidate.slot)
  if (!replaces || replaces === candidate.id) return { breaks: [] }
  const after = new Set(addBoon(build, candidate, byId))
  const breaks = build.filter((id) => {
    const b = byId.get(id)
    return id !== replaces && b?.requires?.length && unsatisfiedSets(b.requires, after).length > 0
  })
  return { replaces, breaks }
}

/**
 * True when a prerequisite set consists only of aspects and none is held:
 * e.g. Beowulf-only casts. Such boons can't happen this run at all.
 */
export function needsOtherAspect(boon: Boon, owned: ReadonlySet<BoonId>, byId: ReadonlyMap<BoonId, Boon>): boolean {
  return (boon.requires ?? []).some(
    (set) => set.every((id) => byId.get(id)?.kind === 'aspect') && !set.some((id) => owned.has(id)),
  )
}

/** Can this boon still show up this run? False if blocked, past the god limit or tied to another aspect. */
export function possible(
  boon: Boon,
  owned: ReadonlySet<BoonId>,
  byId: ReadonlyMap<BoonId, Boon>,
  pool?: ReadonlySet<string>,
): boolean {
  return evaluate(boon, owned, pool).kind !== 'blocked' && !needsOtherAspect(boon, owned, byId)
}
