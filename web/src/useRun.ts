import { useEffect, useState } from 'react'
import type { BoonId, Run } from './core/types'

// Current run is small and per-device; localStorage is enough for now.
// Lifetime progress (achievements) will go to IndexedDB / the backend.
const KEY = 'hades-companion:run:hades1'

const newRun = (keep: Pick<Run, 'targets' | 'aspect'> = {}): Run => ({
  game: 'hades1',
  startedAt: new Date().toISOString(),
  boons: [],
  targets: keep.targets ?? [],
  aspect: keep.aspect,
})

function load(): Run {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Run
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
    setBoons: (boons: BoonId[]) => setRun((r) => ({ ...r, boons })),
    toggleTarget: (id: BoonId) =>
      setRun((r) => {
        const t = r.targets ?? []
        return { ...r, targets: t.includes(id) ? t.filter((x) => x !== id) : [...t, id] }
      }),
    setAspect: (aspect: BoonId | undefined) => setRun((r) => ({ ...r, aspect })),
    /** Replace the whole run, e.g. with the server's copy. */
    replace: setRun,
    reset: () => setRun((r) => newRun({ targets: r.targets, aspect: r.aspect })),
  }
}
