import { useEffect, useState } from 'react'
import { migrateRun } from './core/run'
import type { BoonId, Run } from './core/types'
import { byId } from './data'

// Current run is small and per-device; localStorage is enough for now.
// Lifetime progress (achievements) will go to IndexedDB / the backend.
const KEY = 'hades-companion:run:hades1'

const newRun = (keep: Pick<Run, 'targets' | 'aspect' | 'keepsake'> = {}): Run => ({
  game: 'hades1',
  startedAt: new Date().toISOString(),
  boons: [],
  targets: keep.targets ?? [],
  aspect: keep.aspect,
  keepsake: keep.keepsake,
})

function load(): Run {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return migrateRun(JSON.parse(raw) as Run, byId)
  } catch {
    // storage blocked or corrupt — start fresh
  }
  return newRun()
}

export function useRun() {
  const [run, setRun] = useState<Run>(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(run))
    } catch {
      // not fatal: the run just won't survive a reload
    }
  }, [run])

  return {
    run,
    /** Change the run with a pure function (see core/run.ts). */
    update: (change: (r: Run) => Run) => setRun(change),
    toggleTarget: (id: BoonId) =>
      setRun((r) => {
        const t = r.targets ?? []
        return { ...r, targets: t.includes(id) ? t.filter((x) => x !== id) : [...t, id] }
      }),
    setAspect: (aspect: BoonId | undefined) => setRun((r) => ({ ...r, aspect })),
    setKeepsake: (keepsake: BoonId | undefined) => setRun((r) => ({ ...r, keepsake })),
    /** Replace the whole run, e.g. with the server's copy. */
    replace: (r: Run) => setRun(migrateRun(r, byId)),
    reset: () => setRun((r) => newRun({ targets: r.targets, aspect: r.aspect, keepsake: r.keepsake })),
  }
}
