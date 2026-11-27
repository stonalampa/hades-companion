import { useState, type ReactNode } from 'react'
import { countingTraits } from './core/achievements'
import type { Part } from './core/progress'
import { Parts } from './Progress'
import type { Achievement } from './core/types'
import { achievementName, dataset, type TextMap } from './data'
import { useRunCtx } from './runContext'
import type { SteamSync } from './useServerSync'

type Filter = 'missing' | 'done' | 'all'

/** Achievement checklist: manual marks, plus which ones the current run can advance. */
export function Achievements(props: {
  manual: ReadonlySet<string>
  steam: SteamSync
  /** Achievements the imported save proves done. */
  saveDone: ReadonlySet<string>
  progress: ReadonlyMap<string, Part[]>
  toggle: (id: string) => void
  /** Steam achievement text. */
  text: TextMap
  /** Game text, for names in progress lines. */
  gameText: TextMap
  saveBar: ReactNode
}) {
  const { manual, steam, saveDone, progress, toggle, text, gameText, saveBar } = props
  const fromSteam = new Set(steam.achieved)
  const done = new Set([...manual, ...fromSteam, ...saveDone])
  const { owned, name } = useRunCtx()
  const [filter, setFilter] = useState<Filter>('missing')
  const [runOnly, setRunOnly] = useState(false)

  const total = dataset.achievements.length
  const shown = dataset.achievements
    .filter((a) => (filter === 'all' ? true : filter === 'done' ? done.has(a.id) : !done.has(a.id)))
    .filter((a) => !runOnly || a.scope === 'run')
    .sort((a, b) => achievementName(a.id, text).localeCompare(achievementName(b.id, text)))

  return (
    <section className="panel achievements">
      <div className="ach-head">
        <h2>Achievements</h2>
        <progress value={done.size} max={total} />
        <span className="muted">
          {done.size} / {total}
        </span>
        <span className="segmented">
          {(['missing', 'done', 'all'] as const).map((f) => (
            <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </span>
        <label className="check">
          <input type="checkbox" checked={runOnly} onChange={(e) => setRunOnly(e.target.checked)} />
          earned in a run
        </label>
      </div>

      {steam.enabled && (
        <p className="steam-line small">
          <span className="muted">
            Steam:{' '}
            {steam.syncing
              ? 'syncing…'
              : steam.syncedAt
                ? `${steam.achieved.length} unlocked, synced ${new Date(steam.syncedAt).toLocaleTimeString()}`
                : 'not synced yet'}
          </span>
          <button className="ghost small-btn" onClick={steam.sync} disabled={steam.syncing}>
            Sync now
          </button>
          {steam.error && <span className="warn">{steam.error}</span>}
        </p>
      )}

      {saveBar}

      {Object.keys(text).length === 0 && (
        <p className="muted small">
          Names and descriptions come from Steam: run <code>STEAM_API_KEY=… go run ./tools/steamschema</code>, then{' '}
          <code>npm run game-assets</code>.
        </p>
      )}

      {shown.length === 0 ? (
        <p className="muted">{filter === 'missing' ? 'All done here.' : 'Nothing to show.'}</p>
      ) : (
        <ul className="ach-list">
          {shown.map((a) => (
            <Row
              key={a.id}
              a={a}
              text={text}
              done={done.has(a.id)}
              steam={fromSteam.has(a.id)}
              bySave={saveDone.has(a.id)}
              toggle={toggle}
              counts={countingTraits(a, owned).map(name)}
              progress={<Parts parts={progress.get(a.id) ?? []} text={gameText} />}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function Row(props: {
  a: Achievement
  text: TextMap
  done: boolean
  steam: boolean
  bySave: boolean
  toggle: (id: string) => void
  counts: string[]
  progress: ReactNode
}) {
  const { a, text, done, steam, bySave, toggle, counts, progress } = props
  return (
    <li className={done ? 'done' : ''}>
      <label>
        {/* Steam- and save-proven ones can't be unmarked here; their source is the truth. */}
        <input type="checkbox" checked={done} disabled={steam || bySave} onChange={() => toggle(a.id)} />
        <AchievementIcon id={a.id} />
        <span className="ach-body">
          <span className="ach-name">
            {achievementName(a.id, text)}
            {a.scope === 'run' && <span className="tag">in a run</span>}
            {steam && <span className="tag steam">Steam</span>}
            {bySave && !steam && <span className="tag steam">save</span>}
            {counts.length > 0 && !done && <span className="good">this run counts: {counts.join(', ')}</span>}
          </span>
          {text[a.id]?.description && <span className="muted small">{text[a.id].description}</span>}
          {!done && progress}
        </span>
      </label>
    </li>
  )
}

function AchievementIcon({ id }: { id: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <span className="ach-icon placeholder">🏆</span>
  return (
    <img
      className="ach-icon"
      src={`${import.meta.env.BASE_URL}local/achievement-icons/${id}.jpg`}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}
