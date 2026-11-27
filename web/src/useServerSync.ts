import { useCallback, useEffect, useRef, useState } from 'react'
import type { Run } from './core/types'
import type { SaveSnapshot } from './save/useSave'

/** Shape of GET/PUT /api/state on the Go server (server/store.go). */
interface ServerState {
  run: Run
  achievements: string[]
  steamAchievements?: string[]
  steamSyncedAt?: string
  updatedAt?: string
  save?: SaveSnapshot
}

/** Imported save, synced through PUT /api/save; `progress` is text for MCP. */
export interface SaveSync {
  snapshot: SaveSnapshot | null
  replace: (s: SaveSnapshot) => void
  progress: () => Record<string, { done: boolean; summary: string }>
}

export type SyncStatus = 'local' | 'synced' | 'error'

export interface SteamSync {
  enabled: boolean
  /** Achievements Steam says are unlocked; shown as done, separate from manual marks. */
  achieved: string[]
  syncedAt?: string
  error?: string
  syncing: boolean
  sync: () => void
}

/**
 * Server edition only: when /api/capabilities answers, the server's copy of the
 * run and achievements wins on load and window focus, and local changes are
 * pushed back. With Steam configured, Steam achievements are pulled at the same
 * moments (the server throttles to once a minute). The newer imported save wins
 * too. Without a server this does nothing.
 */
export function useServerSync(
  run: Run,
  achievements: string[],
  replaceRun: (r: Run) => void,
  replaceAchievements: (a: string[]) => void,
  save: SaveSync,
): { status: SyncStatus; steam: SteamSync } {
  const [status, setStatus] = useState<SyncStatus>('local')
  const [steamEnabled, setSteamEnabled] = useState(false)
  const [steamState, setSteamState] = useState<Pick<SteamSync, 'achieved' | 'syncedAt' | 'error' | 'syncing'>>({
    achieved: [],
    syncing: false,
  })
  const last = useRef<string | null>(null) // last state known to match the server
  const lastSave = useRef<string | undefined>(undefined) // importedAt known to the server
  const localSave = useRef(save.snapshot)
  useEffect(() => {
    localSave.current = save.snapshot
  }, [save.snapshot])

  const applySteam = (st: ServerState, error?: string) =>
    setSteamState({ achieved: st.steamAchievements ?? [], syncedAt: st.steamSyncedAt, error, syncing: false })

  const syncSteam = useCallback(async () => {
    setSteamState((s) => ({ ...s, syncing: true }))
    const res = await fetch('/api/steam/sync', { method: 'POST' })
    if (res.ok) {
      applySteam((await res.json()) as ServerState)
    } else {
      const msg = (await res.text()).trim() || res.statusText
      setSteamState((s) => ({ ...s, error: msg, syncing: false }))
    }
  }, [])

  useEffect(() => {
    let alive = true
    let steamOn = false
    const pull = async () => {
      const res = await fetch('/api/state')
      if (!res.ok) throw new Error(res.statusText)
      const st = (await res.json()) as ServerState
      if (!alive) return
      if (st.updatedAt) {
        last.current = JSON.stringify({ run: st.run, achievements: st.achievements })
        replaceRun(st.run)
        replaceAchievements(st.achievements)
        applySteam(st)
      }
      if (st.save) {
        lastSave.current = st.save.importedAt
        const mine = localSave.current?.importedAt
        if (!mine || mine < st.save.importedAt) save.replace(st.save)
      }
      setStatus('synced')
      if (steamOn) await syncSteam()
    }
    const onFocus = () => void pull().catch(() => alive && setStatus('error'))
    fetch('/api/capabilities')
      .then((r) => (r.ok ? r.json() : null))
      .then((cap: { edition?: string; steam?: boolean } | null) => {
        if (cap?.edition !== 'server' || !alive) return
        steamOn = !!cap.steam
        setSteamEnabled(steamOn)
        onFocus()
        window.addEventListener('focus', onFocus)
      })
      .catch(() => {
        // static site: no server
      })
    return () => {
      alive = false
      window.removeEventListener('focus', onFocus)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once; setters are stable
  }, [])

  useEffect(() => {
    if (status === 'local') return
    const body = JSON.stringify({ run, achievements })
    if (body === last.current) return
    const t = setTimeout(() => {
      fetch('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body })
        .then((r) => {
          if (!r.ok) throw new Error(r.statusText)
          last.current = body
          setStatus('synced')
        })
        .catch(() => setStatus('error'))
    }, 300)
    return () => clearTimeout(t)
  }, [run, achievements, status])

  useEffect(() => {
    const snap = save.snapshot
    if (status === 'local' || !snap || snap.importedAt === lastSave.current) return
    const body = JSON.stringify({ ...snap, progress: save.progress() })
    fetch('/api/save', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body })
      .then((r) => {
        if (!r.ok) throw new Error(r.statusText)
        lastSave.current = snap.importedAt
      })
      .catch(() => setStatus('error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- push once per import
  }, [save.snapshot, status])

  return {
    status,
    steam: { enabled: steamEnabled, ...steamState, sync: () => void syncSteam().catch(() => undefined) },
  }
}
