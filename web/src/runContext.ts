import { createContext, useContext } from 'react'
import type { Status } from './core/eligibility'
import type { BoonId } from './core/types'
import type { TextMap } from './data'

/** Run state and actions shared by every boon widget. */
export interface RunCtx {
  text: TextMap
  build: BoonId[]
  owned: ReadonlySet<BoonId>
  targets: BoonId[]
  name: (id: BoonId) => string
  add: (id: BoonId) => void
  focus: (id: BoonId) => void
  toggleTarget: (id: BoonId) => void
}

export const RunContext = createContext<RunCtx | null>(null)

export function useRunCtx(): RunCtx {
  const ctx = useContext(RunContext)
  if (!ctx) throw new Error('useRunCtx outside RunContext')
  return ctx
}

export const STATUS_MARKS: Record<Status['kind'], [string, string]> = {
  owned: ['✓', 'In build'],
  blocked: ['✕', 'Not offered with your build'],
  free: ['●', 'Available'],
  eligible: ['●', 'Eligible now'],
  oneAway: ['◐', 'One requirement missing'],
  far: ['○', 'Several requirements missing'],
}

/** Status line; `needed` = boons still to pick up (see boonsNeeded). */
export function statusText(s: Status, needed?: number): string {
  if ((s.kind === 'oneAway' || s.kind === 'far') && needed !== undefined && Number.isFinite(needed))
    return needed === 1 ? '1 boon away' : `${needed} boons away`
  if (s.kind === 'far') return `${s.unsatisfied} requirements missing`
  return STATUS_MARKS[s.kind][1]
}
