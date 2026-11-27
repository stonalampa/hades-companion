import { describe, expect, it } from 'vitest'
import { achievementName, boonName } from './data'

describe('aspect renames', () => {
  const text = {
    PoseidonRangedTrait: { name: 'Flood Shot' },
    ShieldLoadAmmo_PoseidonRangedTrait: { name: 'Flood Flare' },
  }

  it('Flood Shot is Flood Flare under Beowulf', () => {
    expect(boonName('PoseidonRangedTrait', text)).toBe('Flood Shot')
    expect(boonName('PoseidonRangedTrait', text, new Set(['ShieldLoadAmmoTrait']))).toBe('Flood Flare')
  })
})

describe('fallback names', () => {
  it('splits words and digits', () => {
    expect(achievementName('AchClearRun4thAspect', {})).toBe('Clear Run 4th Aspect')
    expect(achievementName('AchClearTartarus', {})).toBe('Clear Tartarus')
  })
})
