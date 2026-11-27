import { addBoon, UNLIMITED_GODS } from './eligibility'
import type { Boon, BoonId, Run } from './types'

/** What counts as held: the build plus the chosen aspect and equipped keepsake. */
export function heldIds(run: Run): Set<BoonId> {
  return new Set([...run.boons, ...[run.aspect, run.keepsake].filter((x): x is BoonId => !!x)])
}

/**
 * Older runs kept keepsakes (Lambent Plume, Conch Shell) in the build.
 * Moves the last one into the keepsake slot.
 */
export function migrateRun(run: Run, byId: ReadonlyMap<BoonId, Boon>): Run {
  const isKeepsake = (id: BoonId) => byId.get(id)?.kind === 'keepsake'
  const old = run.boons.filter(isKeepsake)
  if (old.length === 0) return run
  return { ...run, boons: run.boons.filter((id) => !isKeepsake(id)), keepsake: run.keepsake ?? old[old.length - 1] }
}

const limitedGods = (ids: Iterable<BoonId>, byId: ReadonlyMap<BoonId, Boon>) =>
  [...ids].flatMap((id) => byId.get(id)?.gods ?? []).filter((g) => !UNLIMITED_GODS.has(g))

/** Olympians taken this run: history (kept after a boon is replaced) plus the build. */
export function runGods(run: Run, byId: ReadonlyMap<BoonId, Boon>): Set<string> {
  return new Set([...(run.gods ?? []), ...limitedGods(run.boons, byId)])
}

/** Takes a boon: adds it to the build (replacing its slot) and remembers its gods. */
export function takeBoon(run: Run, boon: Boon, byId: ReadonlyMap<BoonId, Boon>): Run {
  const gods = runGods(run, byId)
  for (const g of limitedGods([boon.id], byId)) gods.add(g)
  return { ...run, boons: addBoon(run.boons, boon, byId), gods: [...gods] }
}

/**
 * Removes a boon by hand — usually a correction, so its gods are forgotten
 * unless another boon in the build still has them.
 */
export function dropBoon(run: Run, id: BoonId, byId: ReadonlyMap<BoonId, Boon>): Run {
  const boons = run.boons.filter((x) => x !== id)
  const forget = new Set(byId.get(id)?.gods ?? [])
  const kept = (run.gods ?? []).filter((g) => !forget.has(g))
  return { ...run, boons, gods: [...new Set([...kept, ...limitedGods(boons, byId)])] }
}
