import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addBoon, evaluate, needsOtherAspect, possible, type Status } from './core/eligibility'
import { boonsNeeded } from './core/graph'
import type { Boon, BoonId, Slot } from './core/types'
import { Detail } from './Detail'
import { achievementName, boonName, byId, dataset, loadAchievementText, loadText, type TextMap } from './data'
import { BoonIcon, BoonLabel, CostNote, Kind, OptionChip, RemoveButton, StatusMark } from './ui'
import { RunContext, statusText, useRunCtx, type RunCtx } from './runContext'
import { useRun } from './useRun'
import { useAchievements } from './useAchievements'
import { useServerSync } from './useServerSync'
import { Achievements } from './Achievements'
import { countingTraits } from './core/achievements'

const SLOTS: Slot[] = ['attack', 'special', 'cast', 'dash', 'call']
const KIND_ORDER: Record<Boon['kind'], number> = { legendary: 0, duo: 1, standard: 2, slot: 3, keepsake: 4, aspect: 5 }

type Evaluated = { boon: Boon; status: Status }
const byKind = (a: Evaluated, b: Evaluated) => KIND_ORDER[a.boon.kind] - KIND_ORDER[b.boon.kind]

export default function App() {
  const { run, setBoons, toggleTarget, setAspect, reset, replace } = useRun()
  const [text, setText] = useState<TextMap>({})
  const [focused, setFocused] = useState<BoonId | null>(null)
  const [view, setView] = useView()
  const achievements = useAchievements()
  const { status: sync, steam } = useServerSync(run, achievements.list, replace, achievements.replace)
  // Done = manual marks + Steam (server edition).
  const done = useMemo(() => new Set([...achievements.list, ...steam.achieved]), [achievements.list, steam.achieved])
  const [achText, setAchText] = useState<TextMap>({})
  useEffect(() => {
    loadAchievementText().then(setAchText)
  }, [])
  useEffect(() => {
    loadText().then(setText)
  }, [])

  // The chosen aspect counts as held: it satisfies Beowulf casts and blocks others.
  const owned = useMemo(() => new Set(run.aspect ? [...run.boons, run.aspect] : run.boons), [run.boons, run.aspect])
  const targets = run.targets ?? []
  const ctx: RunCtx = {
    text,
    build: run.boons,
    owned,
    targets,
    name: (id) => boonName(id, text, owned),
    add: (id) => {
      const b = byId.get(id)
      if (b) setBoons(addBoon(run.boons, b, byId))
    },
    focus: setFocused,
    toggleTarget,
  }
  const remove = (id: BoonId) => setBoons(run.boons.filter((x) => x !== id))
  const closeDetail = useCallback(() => setFocused(null), [])

  const evaluated = useMemo(
    () =>
      dataset.boons
        // Aspect-only requirements (Beowulf casts) are not interesting prerequisites.
        .filter((b) => b.requires?.some((set) => set.some((id) => byId.get(id)?.kind !== 'aspect')))
        .filter((b) => possible(b, owned, byId))
        .map((boon) => ({ boon, status: evaluate(boon, owned) })),
    [owned],
  )
  const eligible = evaluated.filter((e) => e.status.kind === 'eligible').sort(byKind)
  // Only targets you've started on: a god you already have in the build.
  const ownedGods = new Set(run.boons.flatMap((id) => byId.get(id)?.gods ?? []))
  const oneAway = evaluated
    .filter(
      (e) =>
        e.status.kind === 'oneAway' &&
        (e.boon.kind === 'duo' || e.boon.kind === 'legendary') &&
        e.boon.gods.some((g) => ownedGods.has(g)) &&
        !targets.includes(e.boon.id) &&
        e.status.missing.some((id) => possible(byId.get(id)!, owned, byId)),
    )
    .sort(byKind)
  const otherBoons = run.boons.filter((id) => !byId.get(id)?.slot)
  const runAchievements = dataset.achievements
    .filter((a) => a.scope === 'run' && !done.has(a.id))
    .map((a) => ({ a, counts: countingTraits(a, owned) }))
    .filter((x) => x.counts.length > 0)

  return (
    <RunContext.Provider value={ctx}>
      <div className="app">
        <header>
          <nav className="tabs">
            <button className={view === 'run' ? 'active' : ''} onClick={() => setView('run')}>
              Current run <span className="muted">{run.boons.length}</span>
            </button>
            <button className={view === 'achievements' ? 'active' : ''} onClick={() => setView('achievements')}>
              Achievements{' '}
              <span className="muted">
                {done.size}/{dataset.achievements.length}
              </span>
            </button>
          </nav>
          {sync !== 'local' && (
            <span
              className={`sync ${sync}`}
              title={sync === 'synced' ? 'Saved on the server (visible to MCP)' : 'Server unreachable'}
            >
              {sync === 'synced' ? '● synced' : '● offline'}
            </span>
          )}
          {view === 'run' && (
            <button
              className="ghost"
              onClick={() => (run.boons.length === 0 || confirm('Start a new run? Targets are kept.')) && reset()}
            >
              New run
            </button>
          )}
        </header>

        {view === 'achievements' ? (
          <Achievements manual={achievements.done} steam={steam} toggle={achievements.toggle} text={achText} />
        ) : (
          <>
            <AspectPicker aspect={run.aspect} onChange={setAspect} />

            <Search onPick={ctx.add} onShow={setFocused} />

            {focused && <Detail id={focused} onClose={closeDetail} />}

            <main>
              <section className="panel">
                <h2>Build</h2>
                <ul className="slots">
                  {SLOTS.map((slot) => {
                    const id = run.boons.find((b) => byId.get(b)?.slot === slot)
                    return (
                      <li key={slot}>
                        <span className="slot-name">{slot}</span>
                        {id ? (
                          <>
                            <BoonLabel id={id} />
                            <RemoveButton onClick={() => remove(id)} />
                          </>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </li>
                    )
                  })}
                </ul>
                {otherBoons.length > 0 && (
                  <ul className="list">
                    {otherBoons.map((id) => (
                      <li key={id}>
                        <Kind kind={byId.get(id)!.kind} />
                        <BoonLabel id={id} />
                        <RemoveButton onClick={() => remove(id)} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="panel">
                {runAchievements.length > 0 && (
                  <>
                    <h2>Achievements this run counts for</h2>
                    <ul className="list">
                      {runAchievements.map(({ a, counts }) => (
                        <li key={a.id}>
                          <span className="mark eligible">★</span>
                          {achievementName(a.id, achText)}
                          <span className="muted small">via {counts.map(ctx.name).join(', ')}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {targets.length > 0 && (
                  <>
                    <h2>
                      Targets <span className="muted">{targets.length}</span>
                    </h2>
                    <ul className="list">
                      {targets.map((id) => {
                        const b = byId.get(id)
                        if (!b) return null
                        const s = evaluate(b, owned)
                        return (
                          <li key={id} className="stacked target">
                            <div className="row">
                              <StatusMark status={s} />
                              <Kind kind={b.kind} />
                              <BoonLabel id={id} />
                              <span className="muted small">{statusText(s, boonsNeeded(id, owned, byId))}</span>
                              <RemoveButton onClick={() => toggleTarget(id)} />
                            </div>
                            {s.kind === 'oneAway' && (
                              <div className="options">
                                <span className="muted">take one:</span>
                                {s.missing.map((m) => (
                                  <OptionChip key={m} id={m} />
                                ))}
                              </div>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </>
                )}

                <h2>
                  Eligible now <span className="muted">{eligible.length}</span>
                </h2>
                {eligible.length === 0 ? (
                  <p className="muted">Nothing with prerequisites yet.</p>
                ) : (
                  <ul className="list">
                    {eligible.map(({ boon }) => (
                      <li key={boon.id}>
                        <Kind kind={boon.kind} />
                        <BoonLabel id={boon.id} />
                        <button className="ghost small" onClick={() => ctx.add(boon.id)} title="I took it">
                          +
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <h2>
                  One boon away <span className="muted">{oneAway.length}</span>
                </h2>
                {oneAway.length === 0 ? (
                  <p className="muted">Pick up some boons first.</p>
                ) : (
                  <ul className="list">
                    {oneAway.map(({ boon, status }) => (
                      <li key={boon.id} className="stacked">
                        <div className="row">
                          <Kind kind={boon.kind} />
                          <BoonLabel id={boon.id} />
                        </div>
                        <div className="options">
                          <span className="muted">take one:</span>
                          {status.kind === 'oneAway' && status.missing.map((id) => <OptionChip key={id} id={id} />)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </main>
          </>
        )}

        <footer className="muted">
          Eligible means the game <em>can</em> offer it, not that it will. Click any boon to see how to get it.
          {Object.keys(text).length === 0 && (
            <>
              {' '}
              · Game text and icons not loaded — run <code>npm run game-assets</code>.
            </>
          )}
        </footer>
      </div>
    </RunContext.Provider>
  )
}

/** Enter adds the boon, Shift+Enter shows how to get it. */
function Search({ onPick, onShow }: { onPick: (id: BoonId) => void; onShow: (id: BoonId) => void }) {
  const { text, owned } = useRunCtx()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== ref.current) {
        e.preventDefault()
        ref.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Owned boons stay searchable so you can still look up how they work.
  const results = useMemo(() => {
    const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return []
    return dataset.boons
      .filter((b) => b.kind !== 'aspect' && !needsOtherAspect(b, owned, byId))
      .map((b) => {
        const n = boonName(b.id, text, owned).toLowerCase()
        const hay = `${n} ${b.gods.join(' ')} ${b.slot ?? ''} ${b.kind}`.toLowerCase()
        return { b, n, ok: tokens.every((t) => hay.includes(t)) }
      })
      .filter((r) => r.ok)
      .sort((x, y) => Number(!x.n.startsWith(tokens[0])) - Number(!y.n.startsWith(tokens[0])) || x.n.localeCompare(y.n))
      .slice(0, 8)
      .map((r) => r.b)
  }, [q, text, owned])

  const done = () => {
    setQ('')
    setSel(0)
  }

  return (
    <div className="search">
      <input
        ref={ref}
        autoFocus
        value={q}
        placeholder="Boon, god or slot — Enter adds · Shift+Enter shows how to get it · / focuses"
        onChange={(e) => {
          setQ(e.target.value)
          setSel(0)
        }}
        onKeyDown={(e) => {
          const hit = results[sel]
          if (e.key === 'ArrowDown') setSel((s) => Math.min(s + 1, results.length - 1))
          else if (e.key === 'ArrowUp') setSel((s) => Math.max(s - 1, 0))
          else if (e.key === 'Enter' && hit) {
            if (e.shiftKey || owned.has(hit.id) || evaluate(hit, owned).kind === 'blocked') onShow(hit.id)
            else onPick(hit.id)
            done()
          } else if (e.key === 'Escape') setQ('')
          else return
          e.preventDefault()
        }}
      />
      {results.length > 0 && (
        <ul className="results">
          {results.map((b, i) => (
            <li key={b.id} className={i === sel ? 'selected' : ''}>
              <button
                className="result-main"
                onMouseDown={() => {
                  if (owned.has(b.id) || evaluate(b, owned).kind === 'blocked') onShow(b.id)
                  else onPick(b.id)
                  done()
                }}
              >
                <Kind kind={b.kind} />
                <BoonLabel id={b.id} plain />
                <span className="tag">{b.slot ?? b.kind}</span>
                {owned.has(b.id) ? (
                  <span className="mark owned">✓</span>
                ) : evaluate(b, owned).kind === 'blocked' ? (
                  <span className="warn">not offered with your build</span>
                ) : (
                  <CostNote boon={b} />
                )}
              </button>
              <button
                className="ghost small"
                title="How to get it"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onShow(b.id)
                  done()
                }}
              >
                how?
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Weapon, then aspect. The aspect is what matters for eligibility. */
function AspectPicker({ aspect, onChange }: { aspect?: BoonId; onChange: (a: BoonId | undefined) => void }) {
  const { name } = useRunCtx()
  const weapon = dataset.weapons.find((w) => aspect && w.aspects.includes(aspect))
  return (
    <div className="aspect-picker">
      <select
        value={weapon?.id ?? ''}
        onChange={(e) => onChange(dataset.weapons.find((w) => w.id === e.target.value)?.aspects[0])}
      >
        <option value="">Weapon…</option>
        {dataset.weapons.map((w) => (
          <option key={w.id} value={w.id}>
            {name(w.id)}
          </option>
        ))}
      </select>
      {weapon?.aspects.map((a) => (
        <button key={a} className={`aspect ${a === aspect ? 'active' : ''}`} onClick={() => onChange(a)}>
          <BoonIcon id={a} gods={[]} size={28} />
          {name(a).replace(/^Aspect of /, '')}
        </button>
      ))}
    </div>
  )
}

type View = 'run' | 'achievements'

/** Current tab, remembered per browser. */
function useView(): [View, (v: View) => void] {
  const [view, setView] = useState<View>(() => {
    try {
      return localStorage.getItem('hades-companion:view') === 'achievements' ? 'achievements' : 'run'
    } catch {
      return 'run'
    }
  })
  return [
    view,
    (v) => {
      setView(v)
      try {
        localStorage.setItem('hades-companion:view', v)
      } catch {
        // ignore
      }
    },
  ]
}
