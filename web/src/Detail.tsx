import { useEffect, useRef } from 'react'
import { evaluate, needsOtherAspect } from './core/eligibility'
import { boonsNeeded } from './core/graph'
import type { Boon, BoonId } from './core/types'
import { byId, cleanDescription, textFor, unlocks } from './data'
import { statusText, useRunCtx } from './runContext'
import { BoonIcon, BoonLabel, CostNote, Kind, StatusMark } from './ui'

const MAX_DEPTH = 3

/** "How to get it" for one boon: prerequisite tree plus what it leads to. */
export function Detail({ id, onClose }: { id: BoonId; onClose: () => void }) {
  const { owned, text, name, add, targets, toggleTarget } = useRunCtx()
  const ref = useRef<HTMLElement>(null)
  const boon = byId.get(id)

  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id, onClose])

  if (!boon) return null
  const status = evaluate(boon, owned)
  const leads = [...(unlocks.get(id) ?? [])].sort((a, b) => name(a).localeCompare(name(b)))
  const pinned = targets.includes(id)

  return (
    <section className="panel detail" ref={ref}>
      <div className="detail-head">
        <BoonIcon key={id} id={id} gods={boon.gods} size={72} />
        <Kind kind={boon.kind} />
        <h2 className="title">{name(id)}</h2>
        <span className="muted">
          {[boon.gods.join(' × '), boon.slot].filter(Boolean).join(' · ')} —{' '}
          {status.kind === 'blocked'
            ? `not offered while you have ${name(status.by)}`
            : statusText(status, boonsNeeded(id, owned, byId))}
        </span>
        <span className="actions">
          {status.kind !== 'owned' && status.kind !== 'blocked' && boon.kind !== 'aspect' && (
            <button className="ghost" onClick={() => add(id)}>
              I took it
            </button>
          )}
          <button className={`ghost ${pinned ? 'active' : ''}`} onClick={() => toggleTarget(id)}>
            {pinned ? '📌 Target' : 'Pin as target'}
          </button>
          <button className="ghost" onClick={onClose} title="Close (Esc)">
            ×
          </button>
        </span>
      </div>
      {textFor(id, text, owned)?.description && (
        <p className="desc">{cleanDescription(textFor(id, text, owned)?.description)}</p>
      )}
      {(boon.mirror || boon.excludedBy?.length) && (
        <ul className="notes">
          {boon.mirror && (
            <li>
              Needs <strong>{name(boon.mirror)}</strong> selected in the Mirror of Night (not checked here).
            </li>
          )}
          {boon.excludedBy?.length ? (
            <li>
              Never offered while you have:{' '}
              {boon.excludedBy.map((x, i) => (
                <span key={x}>
                  {i > 0 && ', '}
                  <span className={owned.has(x) ? 'warn' : ''}>{name(x)}</span>
                </span>
              ))}
            </li>
          ) : null}
        </ul>
      )}

      <h3>How to get it</h3>
      {boon.requires?.length ? (
        <ReqTree boon={boon} depth={0} trail={[id]} />
      ) : (
        <p className="muted">
          {boon.kind === 'aspect'
            ? 'Aspect — pick it above, before the run.'
            : boon.kind === 'keepsake'
            ? 'Keepsake — equip it before the encounter.'
            : `No prerequisites — any ${boon.gods.join(' / ')} offer can include it.`}
        </p>
      )}

      {leads.length > 0 && (
        <>
          <h3>Leads to</h3>
          <ul className="leads">
            {leads.map((l) => (
              <li key={l}>
                <StatusMark status={evaluate(byId.get(l)!, owned)} />
                <Kind kind={byId.get(l)!.kind} />
                <BoonLabel id={l} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/**
 * Requirement sets are ANDed; boons inside a set are ORed. Options that are
 * themselves blocked expand into their own requirements.
 */
function ReqTree({ boon, depth, trail }: { boon: Boon; depth: number; trail: BoonId[] }) {
  const { owned } = useRunCtx()
  const sets = boon.requires ?? []
  return (
    <div className="req">
      {sets.map((set, i) => {
        const done = set.some((id) => owned.has(id))
        return (
          <div key={i} className={`req-set ${done ? 'done' : ''}`}>
            <div className="req-head">
              {sets.length > 1 && <span className="step">{i + 1}</span>}
              one of {done && <span className="mark owned">✓</span>}
            </div>
            <ul>
              {set.map((id) => {
                const opt = byId.get(id)
                // Options tied to an aspect you didn't pick are noise in this run.
                if (!opt || needsOtherAspect(opt, owned, byId)) return null
                const s = evaluate(opt, owned)
                const expand =
                  !done && (s.kind === 'oneAway' || s.kind === 'far') && depth < MAX_DEPTH && !trail.includes(id)
                return (
                  <li key={id}>
                    <div className="row">
                      <StatusMark status={s} />
                      <BoonLabel id={id} />
                      {opt.slot && <span className="tag">{opt.slot}</span>}
                      {!done && <CostNote boon={opt} />}
                    </div>
                    {expand && <ReqTree boon={opt} depth={depth + 1} trail={[...trail, id]} />}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
