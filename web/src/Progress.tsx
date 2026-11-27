import { useRef, useState } from 'react'
import { PART_LABELS, type Part } from './core/progress'
import { progressName, splitCamel } from './progressText'
import { dataset, type TextMap } from './data'
import type { SaveSnapshot } from './save/useSave'

const SHOWN = 12

/** Progress lines for one achievement or prophecy; in-game-only checks are left out. */
export function Parts({ parts, text }: { parts: Part[]; text: TextMap }) {
  const tracked = parts.filter((p) => !p.untracked)
  if (tracked.length === 0) return null
  return (
    <ul className="parts">
      {tracked.map((p) => (
        <PartLine key={p.key} part={p} text={text} />
      ))}
    </ul>
  )
}

function PartLine({ part, text }: { part: Part; text: TextMap }) {
  const [all, setAll] = useState(false)
  const done = part.have >= part.need
  const names = part.missing.map((id) => progressName(id, text))
  const shown = all ? names : names.slice(0, SHOWN)
  return (
    <li className={done ? 'done' : ''}>
      <progress value={part.have} max={part.need || 1} />
      <span className="muted small">
        {part.have}/{part.need} {PART_LABELS[part.key] ?? splitCamel(part.key)}
      </span>
      {!done && names.length > 0 && (
        <span className="small">
          {' '}
          — missing: {shown.join(', ')}
          {names.length > SHOWN && (
            <button className="ghost small-btn" onClick={() => setAll(!all)}>
              {all ? 'less' : `+${names.length - SHOWN} more`}
            </button>
          )}
        </span>
      )}
    </li>
  )
}

/** "Load save" button plus drop target, with where the file lives. */
export function SaveBar({
  snapshot,
  error,
  onFile,
  onClear,
}: {
  snapshot: SaveSnapshot | null
  error?: string
  onFile: (f: File) => void
  onClear: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <div
      className={`save-bar small ${over ? 'over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const f = e.dataTransfer.files[0]
        if (f) onFile(f)
      }}
    >
      <span className="muted">
        {snapshot
          ? `Save: ${snapshot.facts.runs} runs, saved ${new Date(snapshot.facts.savedAt).toLocaleString()}`
          : 'No save loaded — drop Profile1.sav here to see what each achievement and prophecy is missing.'}
      </span>
      <button className="ghost small-btn" onClick={() => input.current?.click()}>
        {snapshot ? 'Load newer save' : 'Load save'}
      </button>
      {snapshot && (
        <button className="ghost small-btn" onClick={onClear} title="Forget the imported save">
          Clear
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept=".sav"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
      />
      {!snapshot && (
        <span className="muted">
          Windows: <code>Documents\Saved Games\Hades\Profile1.sav</code> (Profile1–4 = save slots). Read in your browser;
          only progress facts are kept.
        </span>
      )}
      {error && <span className="warn">{error}</span>}
    </div>
  )
}

type Filter = 'missing' | 'done' | 'all'

const STATUS: Record<string, [string, string]> = {
  CashedOut: ['✓', 'fulfilled'],
  Complete: ['★', 'fulfilled — collect the reward in the Fated List'],
  Unlocked: ['◐', 'in progress'],
}

/** The Fated List from the save: status and what each prophecy still needs. */
export function Prophecies({
  snapshot,
  progress,
  text,
  saveBar,
}: {
  snapshot: SaveSnapshot | null
  progress: ReadonlyMap<string, Part[]>
  text: TextMap
  saveBar: React.ReactNode
}) {
  const [filter, setFilter] = useState<Filter>('missing')
  const quests = snapshot?.facts.quests ?? {}
  const done = (id: string) => quests[id] === 'CashedOut'
  const total = dataset.quests.length
  const doneCount = dataset.quests.filter((q) => done(q.id)).length
  const shown = dataset.quests.filter((q) =>
    filter === 'all' ? true : filter === 'done' ? done(q.id) : !done(q.id),
  )

  return (
    <section className="panel achievements">
      <div className="ach-head">
        <h2>Fated List</h2>
        {snapshot && (
          <>
            <progress value={doneCount} max={total} />
            <span className="muted">
              {doneCount} / {total}
            </span>
            <span className="segmented">
              {(['missing', 'done', 'all'] as const).map((f) => (
                <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
                  {f}
                </button>
              ))}
            </span>
          </>
        )}
      </div>
      {saveBar}
      {snapshot && (
        <ul className="ach-list">
          {shown.map((q) => {
            const [mark, label] = STATUS[quests[q.id]] ?? ['○', 'not revealed yet']
            return (
              <li key={q.id} className={done(q.id) ? 'done' : ''}>
                <div className="quest">
                  <span className="mark" title={label}>
                    {mark}
                  </span>
                  <span className="ach-body">
                    <span className="ach-name">
                      {progressName(q.id, text)}
                      <span className="tag">{label}</span>
                    </span>
                    {text[q.id]?.description && <span className="muted small">{text[q.id].description}</span>}
                    {!done(q.id) && <Parts parts={progress.get(q.id) ?? []} text={text} />}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
