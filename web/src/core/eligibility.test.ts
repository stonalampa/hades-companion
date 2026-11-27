import { describe, expect, it } from 'vitest'
import rawDataset from '../../../data/hades1/dataset.json'
import { addBoon, evaluate, needsOtherAspect, possible, replacementCost } from './eligibility'
import { boonsNeeded, buildUnlocks } from './graph'
import type { Boon, Dataset } from './types'

const dataset = rawDataset as Dataset
const byId = new Map<string, Boon>(dataset.boons.map((b) => [b.id, b]))
const boon = (id: string) => {
  const b = byId.get(id)
  if (!b) throw new Error(`unknown boon ${id}`)
  return b
}

describe('Merciful End (Ares + Athena)', () => {
  const merciful = boon('TriggerCurseTrait')

  it('needs Ares and Athena attack/special', () => {
    expect(evaluate(merciful, new Set(['AresWeaponTrait', 'AthenaSecondaryTrait']))).toEqual({ kind: 'eligible' })
  })

  it('does not count Divine Dash', () => {
    expect(evaluate(merciful, new Set(['AresWeaponTrait', 'AthenaRushTrait']))).toEqual({
      kind: 'oneAway',
      missing: ['AthenaWeaponTrait', 'AthenaSecondaryTrait'],
    })
  })

  it('is far with nothing relevant', () => {
    expect(evaluate(merciful, new Set())).toEqual({ kind: 'far', unsatisfied: 2 })
  })
})

describe('two-of-three legendary (Fully Loaded)', () => {
  const fullyLoaded = boon('MoreAmmoTrait')

  it('is one away with one of three', () => {
    const s = evaluate(fullyLoaded, new Set(['CritBonusTrait']))
    expect(s.kind).toBe('oneAway')
  })

  it('is eligible with any two', () => {
    expect(evaluate(fullyLoaded, new Set(['CritBonusTrait', 'ArtemisSupportingFireTrait'])).kind).toBe('eligible')
  })
})

describe('slots', () => {
  it('a new attack boon replaces the old one', () => {
    const build = addBoon(['AresWeaponTrait', 'AthenaRushTrait'], boon('ZeusWeaponTrait'), byId)
    expect(build).toEqual(['AthenaRushTrait', 'ZeusWeaponTrait'])
  })

  it('reports duos broken by a replacement', () => {
    const build = ['AresWeaponTrait', 'AthenaSecondaryTrait', 'TriggerCurseTrait']
    expect(replacementCost(boon('ZeusWeaponTrait'), build, byId)).toEqual({
      replaces: 'AresWeaponTrait',
      breaks: ['TriggerCurseTrait'],
    })
  })
})

describe('dataset integrity', () => {
  it('has unique ids and no dangling prerequisites', () => {
    expect(byId.size).toBe(dataset.boons.length)
    const missing = dataset.boons.flatMap((b) => (b.requires ?? []).flat().filter((id) => !byId.has(id)))
    expect(missing).toEqual([])
  })

  it('counts match the game', () => {
    const count = (kind: string) => dataset.boons.filter((b) => b.kind === kind).length
    expect(count('duo')).toBe(28)
    expect(count('legendary')).toBe(11)
  })

  it('takes slots from the game, not from id suffixes', () => {
    // Swift Strike / Swift Flourish stack with the Attack/Special boon; Heaven's Vengeance is a revenge boon.
    for (const id of ['HermesWeaponTrait', 'HermesSecondaryTrait', 'RetaliateWeaponTrait']) {
      expect(byId.get(id)?.slot).toBeUndefined()
    }
    expect(byId.get('DionysusWeaponTrait')?.slot).toBe('attack')
    expect(dataset.boons.filter((b) => b.kind === 'slot').length).toBe(46)
  })
})

describe('unlocks index', () => {
  const unlocks = buildUnlocks(dataset.boons)

  it('Ares attack leads to Merciful End', () => {
    expect(unlocks.get('AresWeaponTrait')).toContain('TriggerCurseTrait')
  })

  it('lists each target once even if a boon appears in several sets', () => {
    const fully = dataset.boons.filter((b) => b.id === 'MoreAmmoTrait')
    expect(buildUnlocks(fully).get('CritBonusTrait')).toEqual(['MoreAmmoTrait'])
  })
})

describe('boonsNeeded', () => {
  it('counts nested prerequisites', () => {
    // Splitting Bolt <- Storm Lightning <- Zeus attack/cast
    expect(boonsNeeded('ZeusChargedBoltTrait', new Set(), byId)).toBe(2)
    expect(boonsNeeded('ZeusChargedBoltTrait', new Set(['ZeusWeaponTrait']), byId)).toBe(1)
  })

  it('is 0 when eligible', () => {
    expect(boonsNeeded('TriggerCurseTrait', new Set(['AresWeaponTrait', 'AthenaSecondaryTrait']), byId)).toBe(0)
  })
})

describe('aspects', () => {
  const beowulf = 'ShieldLoadAmmoTrait'

  it('has 6 weapons with 4 aspects each', () => {
    expect(dataset.weapons.map((w) => w.aspects.length)).toEqual([4, 4, 4, 4, 4, 4])
  })

  it('Beowulf blocks the normal cast and unlocks the Flare variant', () => {
    const owned = new Set([beowulf])
    expect(evaluate(boon('AthenaRangedTrait'), owned)).toEqual({ kind: 'blocked', by: beowulf })
    expect(possible(boon('ShieldLoadAmmo_AthenaRangedTrait'), owned, byId)).toBe(true)
  })

  it('Flare variants are impossible without Beowulf', () => {
    expect(needsOtherAspect(boon('ShieldLoadAmmo_AthenaRangedTrait'), new Set(), byId)).toBe(true)
    expect(possible(boon('AthenaRangedTrait'), new Set(), byId)).toBe(true)
  })

  it('a blocked target is unreachable', () => {
    expect(boonsNeeded('AthenaRangedTrait', new Set([beowulf]), byId)).toBe(Infinity)
  })
})

describe('keepsakes as prerequisites', () => {
  it('Lambent Plume qualifies Greater Recall', () => {
    expect(evaluate(boon('MagnetismTrait'), new Set(['FastClearDodgeBonusTrait'])).kind).toBe('eligible')
  })
})
