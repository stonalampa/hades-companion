import { useEffect, useState } from 'react'
import { dataset } from '../data'
import { extractFacts, type SaveFacts } from './facts'
import { readSave } from './sgb'

/** What the app keeps from an imported save: facts only, never the file. */
export interface SaveSnapshot {
  importedAt: string
  facts: SaveFacts
}

const KEY = 'hades-companion:save:hades1'

function load(): SaveSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as SaveSnapshot
  } catch {
    // storage blocked or corrupt — no save
  }
  return null
}

/** Save file import: parsed in the browser, facts kept in localStorage (and on the server, see useServerSync). */
export function useSave() {
  const [snapshot, setSnapshot] = useState<SaveSnapshot | null>(load)
  const [error, setError] = useState<string>()

  useEffect(() => {
    try {
      if (snapshot) localStorage.setItem(KEY, JSON.stringify(snapshot))
      else localStorage.removeItem(KEY)
    } catch {
      // not fatal: re-import after reload
    }
  }, [snapshot])

  return {
    snapshot,
    error,
    importFile: async (file: File) => {
      try {
        const { header, lua } = readSave(new Uint8Array(await file.arrayBuffer()))
        setSnapshot({ importedAt: new Date().toISOString(), facts: extractFacts(header, lua, dataset) })
        setError(undefined)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    /** Replace with the server's copy. */
    replace: (s: SaveSnapshot) => setSnapshot(s),
    clear: () => setSnapshot(null),
  }
}
