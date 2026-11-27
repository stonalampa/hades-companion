import { useEffect, useState } from 'react'

// Lifetime progress, separate from the current run. localStorage for now;
// the Docker edition will sync it from Steam.
const KEY = 'hades-companion:achievements:hades1'

function load(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as string[]
  } catch {
    // storage blocked or corrupt — start empty
  }
  return []
}

export function useAchievements() {
  const [done, setDone] = useState<string[]>(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(done))
    } catch {
      // not fatal
    }
  }, [done])

  return {
    done: new Set(done),
    /** Same marks as a stable array (changes only when marks change). */
    list: done,
    toggle: (id: string) => setDone((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id])),
    /** Replace all marks, e.g. with the server's copy. */
    replace: setDone,
  }
}
