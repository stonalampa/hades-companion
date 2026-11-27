import { describe, expect, it } from 'vitest'
import { evaluate, godPool, possible } from './eligibility'
import { boonsNeeded } from './graph'
import { dropBoon, heldIds, migrateRun, runGods, takeBoon } from './run'
import rawDataset from '../../../data/hades1/dataset.json'
import type { Boon, Dataset, Run } from './types'

const byId = new Map<string, Boon>((rawDataset as Dataset).boons.map((b) => [b.id, b]))

const run = (r: Partial<Run>): Run => ({ game: 'hades1', startedAt: '', boons: [], ...r })

describe('keepsake', () => {
  it('counts as held: Lambent Plume unlocks Bad News', () => {
    const badNews = byId.get('UnstoredAmmoDamageTrait')!
    expect(evaluate(badNews, heldIds(run({}))).kind).toBe('oneAway')
    expect(evaluate(badNews, heldIds(run({ keepsake: 'FastClearDodgeBonusTrait' }))).kind).toBe('eligible')
  })

  it('moves keepsakes out of old builds', () => {
    const r = migrateRun(run({ boons: ['HermesWeaponTrait', 'FastClearDodgeBonusTrait'] }), byId)
    expect(r.boons).toEqual(['HermesWeaponTrait'])
    expect(r.keepsake).toBe('FastClearDodgeBonusTrait')
  })

  it('lists every rack keepsake, no companions', () => {
    const ks = [...byId.values()].filter((b) => b.kind === 'keepsake')
    expect(ks).toHaveLength(25)
    expect(ks.some((b) => b.id.endsWith('AssistTrait'))).toBe(false)
  })
})

describe('four-god limit', () => {
  const take = (r: Run, ...ids: string[]) => ids.reduce((acc, id) => takeBoon(acc, byId.get(id)!, byId), r)
  // Artemis, Poseidon, Athena, Dionysus: the run is full.
  const full = take(run({}), 'ArtemisWeaponTrait', 'PoseidonSecondaryTrait', 'AthenaRushTrait', 'DionysusShoutTrait')
  const pool = godPool(runGods(full, byId))

  it('no limit until four gods', () => {
    expect(godPool(runGods(take(run({}), 'ArtemisWeaponTrait', 'HermesWeaponTrait'), byId))).toBeUndefined()
  })

  it('a fifth god is blocked, Hermes is not', () => {
    expect(evaluate(byId.get('ZeusLightningDebuff')!, heldIds(full), pool)).toEqual({ kind: 'blocked', god: 'Zeus' })
    expect(possible(byId.get('HermesWeaponTrait')!, heldIds(full), byId, pool)).toBe(true)
    // Duo with a god outside the run: gone. Duo of two run gods: still possible.
    expect(possible(byId.get('TriggerCurseTrait')!, heldIds(full), byId, pool)).toBe(false) // Ares × Athena
    expect(possible(byId.get('ArtemisBonusProjectileTrait')!, heldIds(full), byId, pool)).toBe(true) // Poseidon × Artemis
    expect(boonsNeeded('TriggerCurseTrait', heldIds(full), byId, pool)).toBe(Infinity)
  })

  it('a replaced boon still counts toward the limit', () => {
    const r = take(run({}), 'ZeusWeaponTrait', 'AresWeaponTrait')
    expect(r.boons).toEqual(['AresWeaponTrait'])
    expect([...runGods(r, byId)].sort()).toEqual(['Ares', 'Zeus'])
  })

  it('removing by hand forgets the god', () => {
    const r = dropBoon(take(run({}), 'ZeusWeaponTrait', 'AthenaRushTrait'), 'ZeusWeaponTrait', byId)
    expect([...runGods(r, byId)]).toEqual(['Athena'])
  })
})
