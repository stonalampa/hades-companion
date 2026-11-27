import { useState } from 'react'
import { evaluate, possible, replacementCost, type Status } from './core/eligibility'
import { STATUS_MARKS, useRunCtx } from './runContext'
import type { Boon, BoonId } from './core/types'
import { byId, cleanDescription, textFor } from './data'

/** Boon name with god colours. Clicking opens "how to get it" unless `plain`. */
export function BoonLabel({ id, plain }: { id: BoonId; plain?: boolean }) {
  const { name, text, owned, focus } = useRunCtx()
  const boon = byId.get(id)
  const title = cleanDescription(textFor(id, text, owned)?.description) || undefined
  const inner = (
    <>
      <BoonIcon id={id} gods={boon?.gods ?? []} />
      {name(id)}
    </>
  )
  if (plain)
    return (
      <span className="boon" title={title}>
        {inner}
      </span>
    )
  return (
    <button className="boon link" title={title} onClick={() => focus(id)}>
      {inner}
    </button>
  )
}

/**
 * Game icon from public/local/icons (local only, see `npm run game-assets`).
 * Falls back to god colour dots when the icon isn't there.
 * `size` is in px at the base 15px font; it scales with the root font size.
 */
export function BoonIcon({ id, gods, size = 32 }: { id: BoonId; gods: string[]; size?: number }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <GodDots gods={gods} />
  const rem = `${size / 15}rem`
  return (
    <img
      className="icon"
      src={`${import.meta.env.BASE_URL}local/icons/${id}.png`}
      style={{ width: rem, height: rem }}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

export function GodDots({ gods }: { gods: string[] }) {
  return (
    <span className="dots">
      {gods.map((g) => (
        <span key={g} className={`dot god-${g.toLowerCase()}`} title={g} />
      ))}
    </span>
  )
}

export function Kind({ kind }: { kind: Boon['kind'] }) {
  const labels: Partial<Record<Boon['kind'], string>> = {
    duo: 'Duo',
    legendary: 'Legendary',
    keepsake: 'Keepsake',
    aspect: 'Aspect',
  }
  return labels[kind] ? <span className={`kind ${kind}`}>{labels[kind]}</span> : null
}

export function StatusMark({ status }: { status: Status }) {
  const [mark, title] = STATUS_MARKS[status.kind]
  return (
    <span className={`mark ${status.kind}`} title={title}>
      {mark}
    </span>
  )
}

/** What taking a slot boon would replace and which owned boons it would break. */
export function CostNote({ boon }: { boon: Boon }) {
  const { build, name } = useRunCtx()
  const { replaces, breaks } = replacementCost(boon, build, byId)
  if (!replaces) return null
  return (
    <span className="warn">
      replaces {name(replaces)}
      {breaks.length > 0 && <> · breaks {breaks.map(name).join(', ')}</>}
    </span>
  )
}

/** A boon you can take right now to make progress; click = "I took it". */
export function OptionChip({ id }: { id: BoonId }) {
  const { owned, name, add } = useRunCtx()
  const opt = byId.get(id)
  if (!opt || !possible(opt, owned, byId)) return null
  const blocked = ['far', 'oneAway'].includes(evaluate(opt, owned).kind)
  return (
    <button
      className={`option ${blocked ? 'blocked' : ''}`}
      onClick={() => add(id)}
      title={blocked ? 'Has its own prerequisites' : 'I took it'}
    >
      <BoonIcon id={id} gods={opt.gods} size={26} />
      {name(id)}
      <CostNote boon={opt} />
    </button>
  )
}

export function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="ghost small" onClick={onClick} title="Remove">
      ×
    </button>
  )
}
