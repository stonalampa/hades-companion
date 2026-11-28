import { describe, expect, it } from 'vitest'
import { serverWins } from './useServerSync'

describe('pull vs local changes', () => {
  it('server wins on first load and when nothing is pending', () => {
    expect(serverWins('{"a":1}', null)).toBe(true)
    expect(serverWins('{"a":1}', '{"a":1}')).toBe(true)
  })

  it('keeps an unpushed local change (New run, then focus after the confirm dialog)', () => {
    expect(serverWins('{"run":"new"}', '{"run":"old"}')).toBe(false)
  })
})
