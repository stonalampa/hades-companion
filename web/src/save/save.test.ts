import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import rawDataset from '../../../data/hades1/dataset.json'
import { completeBySave, progress } from '../core/progress'
import type { Dataset } from '../core/types'
import { extractFacts } from './facts'
import { decodeLuabins } from './luabins'
import { lz4Block } from './lz4'
import { readSave } from './sgb'

const ds = rawDataset as Dataset

describe('lz4 block', () => {
  it('copies literals and overlapping matches', () => {
    // "abc" literal, then a 6-byte match at offset 3 -> "abcabcabc", then literal "!"
    const block = new Uint8Array([0x32, 0x61, 0x62, 0x63, 0x03, 0x00, 0x10, 0x21])
    expect(new TextDecoder().decode(lz4Block(block))).toBe('abcabcabc!')
  })
})

describe('luabins', () => {
  it('decodes tables, strings, numbers and booleans', () => {
    const enc = new TextEncoder()
    const bytes: number[] = [1, 0x54, ...i32(0), ...i32(2)]
    bytes.push(0x53, ...i32(1), ...enc.encode('a'), 0x4e, ...f64(2.5))
    bytes.push(0x4e, ...f64(1), 0x31)
    expect(decodeLuabins(new Uint8Array(bytes))).toEqual([{ a: 2.5, '1': true }])
  })
})

// The maintainer's own save, if present locally (game-files/ is gitignored).
const SAVE = '../game-files/Profile1.sav'
describe.skipIf(!existsSync(SAVE))('real save', () => {
  const { header, lua } = readSave(new Uint8Array(readFileSync(SAVE)))
  const facts = extractFacts(header, lua, ds)

  it('reads header and facts', () => {
    expect(header.version).toBeGreaterThanOrEqual(16)
    expect(facts.traits.length).toBeGreaterThan(0)
    expect(Object.keys(facts.quests).length).toBeGreaterThan(0)
  })

  it('agrees with Steam where the save decides', () => {
    const statePath = '../state/state.json'
    if (!existsSync(statePath)) return
    const steam = new Set<string>(JSON.parse(readFileSync(statePath, 'utf8')).steamAchievements ?? [])
    if (steam.size === 0) return
    const bySave = ds.achievements.filter((a) => completeBySave(progress(a.requirements, facts, ds))).map((a) => a.id)
    // Done by save => unlocked on Steam (Steam may know more: code-checked, in-run ones).
    expect(bySave.filter((id) => !steam.has(id))).toEqual([])
  })
})

function i32(n: number) {
  const b = new Uint8Array(4)
  new DataView(b.buffer).setInt32(0, n, true)
  return [...b]
}
function f64(n: number) {
  const b = new Uint8Array(8)
  new DataView(b.buffer).setFloat64(0, n, true)
  return [...b]
}
