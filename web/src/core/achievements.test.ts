import { describe, expect, it } from 'vitest'
import rawDataset from '../../../data/hades1/dataset.json'
import { countingTraits } from './achievements'
import type { Dataset } from './types'

const dataset = rawDataset as Dataset
const ach = (id: string) => dataset.achievements.find((a) => a.id === id)!

describe('achievements', () => {
  it('has 49, 12 of them earned in a run', () => {
    expect(dataset.achievements).toHaveLength(49)
    expect(dataset.achievements.filter((a) => a.scope === 'run')).toHaveLength(12)
  })

  it('a 4th aspect counts for AchClearRun4thAspect', () => {
    expect(countingTraits(ach('AchClearRun4thAspect'), new Set(['ShieldLoadAmmoTrait']))).toEqual(['ShieldLoadAmmoTrait'])
    expect(countingTraits(ach('AchClearRun4thAspect'), new Set(['ShieldBaseUpgradeTrait']))).toEqual([])
  })
})
